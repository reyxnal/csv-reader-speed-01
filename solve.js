// Fast drop-in for csv-reader 1.0.0 (make.fun csv-reader-speed-01).
// Single-pass exact scanner: bulk delimiter jumps (regex / C++ indexOf) + slice,
// no per-character loop, no per-character string concat. Semantics mirror
// vendor/csv-reader/index.js exactly (BOM, stray_cr, quote_junk,
// unterminated_quote, short_row / long_row, blank-line skipping, header rules).

const DELIM = /[,\r\n]/g;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  if (len > 0 && text.charCodeAt(0) === 0xfeff) pos = 1;

  while (true) {
    // Skip lines left with no characters (LF or CRLF only).
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended = 0; // 0 = comma (continue), 1 = line break, 2 = end
    let lastQuoted = false;

    while (true) {
      // ---- one field ----
      let value;
      let quoted = false;
      if (text.charCodeAt(pos) === 34) {
        // ---- quoted field ----
        quoted = true;
        const open = pos;
        const openLine = line;
        // Find the closing quote: first '"' not doubled.
        let q = text.indexOf('"', pos + 1);
        let doubled = false;
        while (q !== -1 && q + 1 < len && text.charCodeAt(q + 1) === 34) {
          doubled = true;
          q = text.indexOf('"', q + 2);
        }
        if (q === -1) {
          // Unterminated: the quote is a literal; rescan as unquoted from open+1.
          errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
          pos = open + 1;
          line = openLine;
          // Rescan as unquoted from open+1, the field starting with a literal '"'.
          const r = scanUnquoted('"');
          value = r.value;
          ended = r.ended;
        } else {
          // Span (pos+1, q). Fast path when no "" pairs and no line breaks inside.
          let hasBreak = false;
          if (!doubled) {
            const ni = text.indexOf('\n', pos + 1);
            if (ni !== -1 && ni < q) hasBreak = true;
            else {
              const ri = text.indexOf('\r', pos + 1);
              if (ri !== -1 && ri < q) hasBreak = true;
            }
          }
          if (!doubled && !hasBreak) {
            value = text.slice(pos + 1, q);
          } else {
            // Rebuild: "" -> ", CRLF / CR / LF -> LF; count line breaks.
            let v = '';
            let i = pos + 1;
            while (i < q) {
              const ch = text.charCodeAt(i);
              if (ch === 34) {
                // "" pair (guaranteed: a lone " here cannot be the closer).
                v += '"';
                i += 2;
              } else if (ch === 13) {
                v += '\n';
                line += 1;
                i += i + 1 < len && text.charCodeAt(i + 1) === 10 ? 2 : 1;
              } else if (ch === 10) {
                v += '\n';
                line += 1;
                i += 1;
              } else {
                // Copy a run up to the next special char.
                let j = i + 1;
                while (j < q) {
                  const d = text.charCodeAt(j);
                  if (d === 34 || d === 13 || d === 10) break;
                  j += 1;
                }
                v += text.slice(i, j);
                i = j;
              }
            }
            value = v;
          }
          pos = q + 1;
          if (pos >= len) {
            ended = 2;
          } else {
            const c = text.charCodeAt(pos);
            if (c === 44) {
              pos += 1;
              ended = 0;
            } else if (c === 10) {
              pos += 1;
              line += 1;
              ended = 1;
            } else if (c === 13 && pos + 1 < len && text.charCodeAt(pos + 1) === 10) {
              pos += 2;
              line += 1;
              ended = 1;
            } else {
              // Junk after the closing quote: scan unquoted from pos, appending.
              const r = scanUnquoted(value);
              if (r.added > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
              value = r.value;
              ended = r.ended;
            }
          }
        }
      } else {
        // ---- unquoted field ----
        const r = scanUnquoted('');
        value = r.value;
        ended = r.ended;
      }
      lastQuoted = quoted;
      fields.push(value);
      if (ended !== 0) break;
    }

    // A line that held only stray CRs is left with no characters: no record.
    if (fields.length === 1 && fields[0] === '' && !lastQuoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };

  // Scans an unquoted field from `pos`, starting with `value`.
  // Returns {value, ended, added} where added counts characters appended here.
  // ended: 0 = comma, 1 = line break, 2 = end of text.
  // Side effects: pos, line, and stray_cr errors.
  function scanUnquoted(value) {
    let added = 0;
    while (true) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      let m = -1;
      let ch = 0;
      if (ci !== -1 && (ni === -1 || ci < ni)) { m = ci; ch = 44; }
      else if (ni !== -1) { m = ni; ch = 10; }
      if (m === -1) {
        // Rest of the text: may hold stray CRs.
        if (pos >= len) return { value, ended: 2, added };
        const rest = text.slice(pos);
        const ri = rest.indexOf('\r');
        if (ri === -1) {
          value += rest;
          added += rest.length;
          pos = len;
          return { value, ended: 2, added };
        }
        let v = value;
        let a = added;
        let i = 0;
        while (true) {
          const r2 = rest.indexOf('\r', i);
          if (r2 === -1) { v += rest.slice(i); a += rest.length - i; break; }
          if (r2 > i) { v += rest.slice(i, r2); a += r2 - i; }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          i = r2 + 1;
        }
        pos = len;
        return { value: v, ended: 2, added: a };
      }
      const seg = text.slice(pos, m);
      const ri = seg.indexOf('\r');
      if (ri === -1) {
        value += seg;
        added += seg.length;
        if (ch === 44) { pos = m + 1; return { value, ended: 0, added }; }
        pos = m + 1;
        line += 1;
        return { value, ended: 1, added };
      }
      // A CR is in the segment: trailing (CRLF or stray before a comma) or mid-segment (stray).
      let end = seg.length;
      let trailingErr = false;
      if (seg.charCodeAt(seg.length - 1) === 13) {
        end = seg.length - 1;
        if (ch === 44) trailingErr = true;
      }
      let v = value;
      let a = added;
      let i = 0;
      while (true) {
        const r2 = seg.indexOf('\r', i);
        if (r2 === -1 || r2 >= end) { v += seg.slice(i, end); a += end - i; break; }
        if (r2 > i) { v += seg.slice(i, r2); a += r2 - i; }
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        i = r2 + 1;
      }
      if (trailingErr) errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
      if (ch === 44) { pos = m + 1; return { value: v, ended: 0, added: a }; }
      pos = m + 1;
      line += 1;
      return { value: v, ended: 1, added: a };
    }
  }
}
