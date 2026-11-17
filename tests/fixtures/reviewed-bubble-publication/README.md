# Reviewed Bubble publication fixture

This is a complete, byte-for-byte test-only copy of the public `data/bubble-watch.json`
at commit `285369840194fa4367088238d77fe51f8659e311`, with observation date
`2026-11-10`. It belongs to the reviewed-publication test's fixed
`2026-11-12` evidence clock, not the current production issue.

- SHA-256: `8ca06be8d958343fd714de5205664ac68544e4bc7e5db71f8d9c32cbdb821fa1`
- Consumer: `tests/unit/reviewed-bubble-publication.test.mjs`
- No runtime import, network call, credential, publication, or production data
  replacement is enabled by this fixture.
- Keep all snapshot fields and source dates together. Do not make these tests
  read a moving production file or refresh only its top-level date. New scenario
  fixtures must carry their own coherent evidence clocks and provenance.

The regression supplies a synthetic future or missing production snapshot through
a test-local read interception. Both scenarios must leave the prepared request
identical and make zero production snapshot reads. Existing production admission,
freshness, source rebuild, approval, and failure assertions are unchanged.
