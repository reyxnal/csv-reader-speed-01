# csv-reader-speed-01

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/reyxnal/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/reyxnal/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0. `solve.js` answers
exactly as csv-reader 1.0.0 does on every case — same `{columns, rows, errors}`
for every `{text, header}` input, including its broken-row policy (BOM,
stray CR, quote junk, unterminated quotes, short/long rows) — in roughly a
third of the CPU time.

## How it works

The reference reader walks its input one character at a time, building every
field a character at a time. This one is a single-pass exact scanner:

- Unquoted fields are found with bulk `indexOf` jumps for the next delimiter
  (`,`, LF, CR) and taken as slices — no per-character loop, no per-character
  concatenation. Stray CRs are dropped with a `stray_cr` error exactly as the
  reference does.
- Quoted fields find their closing quote with `indexOf`, skipping `""`
  escapes, and take the span as a slice when it holds no escapes or line
  breaks; only spans that do are rebuilt, with `""` → `"` and CR/LF/CRLF → LF,
  counting line breaks exactly as the reference does.
- What follows a closing quote is scanned as unquoted text appended to the
  field (`quote_junk` when anything is appended); a quote that never closes
  is treated as a literal and the rest rescanned as unquoted
  (`unterminated_quote`).
- Records are padded (`short_row`) or cut (`long_row`) to the first record's
  width, blank lines are skipped, and the header is the first record when
  `header` is true.

Verified against the reference on the kit's practice set and on hundreds of
freshly drawn generated sets plus hand-built edge cases: identical answers
on every case.

## Layout

- `solve.js` — the entry: `run(input)` returns csv-reader 1.0.0's answer.
- `main.ts` — the house driver (unchanged): reads every case from
  `/input/cases.json` and writes `/output/answers.json`.

## License

MIT — see [LICENSE](LICENSE).
