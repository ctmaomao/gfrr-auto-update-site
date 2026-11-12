# ADR-0113: Private Bubble evidence and opaque one-use claim

## Authorization and narrow replacement

For this fixed Bubble selection, the initialization instructions under OPERATIONS.md → Transitional Bubble receipt grant are withdrawn. Do not create its public full-record ledger or configure its former ledger pins. Only the private environment-secret authority and opaque one-use marker described in this ADR may be used. Offline preparation output must remain private.

The owner explicitly approved storing this call's budget reconciliation record in the project's private GitHub production-environment Secrets, with only an opaque one-use marker in the public repository. The attempted full public ledger initialization was denied before execution and was not retried. This is a different, reviewed storage design, not encryption or encoding of the denied payload in public storage.

Based on main `95a5681c`, this ADR supersedes ADR-0112's whole-ledger branch initialization and outcome retention for the same fixed Bubble selection only. It does not create a second call allowance. Legacy monthly and one-shot records, consumed slots, prices, accounting arithmetic and all factual/source checks remain unchanged. Current source validators and synthetic tests no longer embed actual account amounts, receipt token counts or early run identifiers: the private approval digest pins those values, while generic strict schema, uniqueness, date, token-bound and exact ceiling-arithmetic checks remain mandatory. This cleanup does not rewrite repository history. No old grant is reset or refunded. This implementation performs no real provider call, secret installation or remote state mutation.

## Private authority and public state

The immutable private envelope contains its schema, one opaque claim identifier, expected reviewed source commit, existing reviewed grant and price review. Three production-environment Secrets hold the envelope, its independently approved canonical digest and the price-review digest. They are exposed only to preflight and provider steps. No private snapshot, amount, token count, key identity, request digest or evidence digest belongs in public Git objects, logs, step summaries or artifacts.

The public marker contains exactly `schemaVersion=opaque-one-use-v1` and `state=consumed`. Its parentless commit has a fixed generic message and exactly one regular `claim.json` blob. Its identifier is random and not derived from a key, account, request or evidence. The fixed one-call marker cannot silently rotate through changed secret values. There is no public genesis containing private data, no encrypted receipt blob and no new encryption credential.

Before the paid POST, the existing repository token atomically creates the marker ref. Only a confirmed successful create may admit the provider. Existing ref, contention, unknown transport outcome, failed acknowledgement or clock uncertainty holds. No update, reset, delete, force-write or retry operation exists. The full reservation stays consumed after any outcome, including pre-dispatch failure after claim, timeout, article rejection or publication failure. A response may be validated in memory, but no public token receipt is written. Missing private token history is not invented as zero cost or actual settlement.

The private envelope retains reviewed historical accounting and runtime key binding. Runtime checks the reviewed source commit against `GITHUB_SHA`; workflow additionally checks the actual checkout SHA. Trusted clock, price expiry, exact CNY balance, supported model/payload, fresh historical refs, absent monthly ledger and concurrent-run checks remain mandatory. Existing source dates and freshness are not altered, and no new source or paid refresh is authorized.

## Privacy and publication

New-route preflight output is limited to admission/hold and zero-side-effect flags. On this route, the ordinary diagnostic artifact omits provider diagnostics, token usage and private-derived file hashes/byte counts, retaining only safe step/file states. Default routes retain their previous behavior. The approved successful candidate bundle contains only validated public-source article/replay evidence and remains subject to its exact byte cap, secret scanning and short retention. It never includes the private budget envelope.

The offline reviewed-publication helper authenticates the original successful run, its provider/review/projection/packaging/upload steps, skipped writer/save steps, downloaded artifact and independently approved candidate digest. It also checks the exact consumed marker against the expected private claim identifier, including ref, parentless commit, sole file/tree and Git blob hash. It no longer requires unavailable public monetary/token receipts. The coordinator still authenticates the supplied API records and independent approval; the pure helper does not turn untrusted JSON into proof.

Publication still invokes the unchanged final-writer calculation with current source/freshness binding. No `GITHUB_RUN_ID` is forged and no second provider call occurs. Source drift, stale evidence, failed factual review or uncertain Git CAS holds publication.

## Verification and operations

Offline tests must cover secret size/schema/pin failures, source/key changes, existing and racing claims, uncertain writes, full reservation consumption, no retries, constant public payloads, error/log privacy, private-route artifact suppression and authenticated publication failures. Existing budget and article assertions remain; narrowly changed wiring assertions enforce the new secret scopes and marker evidence. Full checks and independent actual-diff review precede integration. Secret installation and actual execution require the separately verified approved envelope, current source commit and absence of the fixed marker. Never upload the envelope through the ordinary offline plan output or any Git blob/tree operation.
