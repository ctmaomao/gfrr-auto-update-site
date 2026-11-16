# Frozen public r5 observation-migration baseline

`bubble-r5-observation-migration.json.gz` is a gzip-compressed JSON object with
`before` and `history`, copied from the public repository at commit
`836296cae8aee69389658594308d9d60f97f73c3` after editorial quarantine PR #529.
It contains no current or previous AI article and no credentials. Compression
avoids a second 330 KiB text copy; Node's built-in `gunzipSync` reads it in tests.

- Original `data/bubble-watch.json` bytes SHA-256:
  `d91021987cf40ef049fc9f8abf1d00aa728586780279db13c7e01badee9c7ff9`
- Canonical parsed `before` (`JSON.stringify`) SHA-256:
  `d46ee9366eac41057704a188f988308a70a62ddd70281747b623a8160dcb1589`
- Canonical parsed `history` SHA-256:
  `57a2693711ef44848c58cd8bd6e65238b3c2b69ff2b0b944e085bbcc4c15432b`

This snapshot is historical test evidence, not a current source or a refresh.
The migration rejects different source/history digests and a checking date other
than the original issue date. Existing r5 score regressions use this frozen epoch
instead of reading the newer r6 production file.

The three reviewed observation entries are separately frozen in
`bubble-observation-config-20261110.json`, copied without changes from
`config/bubble-watch-curated.json` at
`ffd414b379e744a0b993d5667797d7b463454fad` (r6 migration). Unit and browser
regressions use this dated config, not the live config that scheduled builds
legitimately update. Production validation still checks the current evidence.
