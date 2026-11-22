# makefun-csv-reader-2026-11

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rio-M666/makefun-csv-reader-2026-11/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Rio-M666/makefun-csv-reader-2026-11/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: `run(input)` returns exactly csv-reader's `{columns, rows, errors}` for every input — same broken-row policy, same error codes in the same order — but it jumps delimiter to delimiter with `indexOf` and takes each field as one slice of the text instead of building it character by character, so it runs several times faster than the reference reader. Only the broken rows (a stray CR, a quoted field with escapes or CRs, junk after a closing quote, an unterminated quote) leave the fast path.

## Run it

```sh
MAKEFUN_INPUT_DIR=<dir holding cases.json> MAKEFUN_OUTPUT_DIR=<dir for answers.json> node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=sgbyxs83&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
