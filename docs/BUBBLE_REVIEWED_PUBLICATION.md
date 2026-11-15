# Reviewed Bubble publication preparation

## Narrow scope and approval boundary

This is local preparation for the owner-requested single Bubble article under
`editorial-bubble-receipt-20261112-v1`, after [ADR-0112](ADR/0112-bubble-receipt-one-call.md)
candidate staging. It is not autonomous publication authorization. The exported
`prepareReviewedBubblePublication` pure function returns `prepared_not_authorized`.
It performs no network, filesystem, provider, ledger, Git or production writes.
There is no CLI and no environment-based bypass. The original writer CLI and its
original Actions run assertion are unchanged. Never forge `GITHUB_RUN_ID`.

The coordinator and independent reviewer must authenticate evidence using trusted
GitHub tools, not fields asserted by a candidate, artifact or arbitrary local JSON:

1. Read the actual completed successful first-attempt manual Bubble workflow run
   in `ctmaomao/gfrr-auto-update-site`, its exact workflow revision, job/step outcomes,
   checkout/source commit and main provenance. Verify the paid selection was the
   fixed grant, provider/review/candidate upload succeeded, and writer/push skipped.
2. Read the complete run artifact inventory, including pagination. Require one
   candidate artifact, not a chosen member among alternate candidates. Download
   its exact artifact ID. Verify GitHub's archive SHA-256 against downloaded bytes.
   Reject archives with extra entries, symlinks, duplicate names or traversal.
   Independently extract the single regular `receipt-review-candidate.json` entry;
   bind its exact byte hash to that archive. The helper does not parse ZIPs or
   authenticate the relationship between caller-supplied archive/content bytes.
3. Under [ADR-0113](ADR/0113-private-bubble-claim.md), authenticate the fixed opaque consumed marker against the expected claim identifier from the independently approved private envelope. Read its actual ref, parentless commit, tree and blob. Require the fixed generic message and sole regular `claim.json` with the exact constant consumed schema. Independently authenticate the original job and successful provider/review/projection/package/upload steps; writer/save must be skipped. No public token receipt or exact monetary settlement is required or inferred. Retain private review provenance without publishing the private envelope.
4. Independently review the exact candidate: claims, numerical units, dates, source
   URLs, quotations, all narrative claims and tracked source files at sourceCommit.
   Do not edit the article or its timestamps. Produce an immutable review report
   and the approval manifest below. A schema-valid manifest is not proof that this
   independent review happened. Coordinator must authenticate the reviewer and
   exact approved manifest/report outside this pure helper.

## Inputs and hashing

`candidateBytes`, `archiveBytes` and `currentBubbleBytes` are Buffers. `now` is the
actual publication-check UTC time, not the generation time. `expectedMain` and
`observedMain` are full current main commit hashes obtained independently.
`expectedClaimId` comes from the approved private envelope, never from candidate content.
`radarData` and `oilNewsWatch` are parsed current tracked files at that same head;
never omit a present context file. Source and target must be verified clean reads.

`evidence` contains the authenticated run REST object (`run`), complete artifact
array (`artifacts`), original `jobs`, authenticated marker `claim` (ref/commit/tree/file), `archiveEntry` and
`extractedContentSha256`. `run.repository` and `run.head_repository` must identify
the target repository; if a REST response omits a field, retain a separate
verified repository lookup rather than inventing it. The coordinator records
source URLs/IDs and marker provenance in the review report.

Approval schema: `schemaVersion=bubble-independent-factual-approval-v1`,
`decision=approve_exact_candidate`, `reviewedAt`, `reviewReportSha256`, `bindings`.
The exact binding object, in this order, is:

- selection, repository, runId (string), runAttempt (1), sourceCommit, artifactId
- archiveSha256, candidateSha256, outputSha256, inputSha256
- sourceSnapshotSha256, claimRef, claimHead, evidenceSha256

All SHA-256 values are lowercase hex. Archive/candidate/report hashes cover exact
bytes. Output/input/evidence and approval hashes use UTF-8 `JSON.stringify(value)`
with insertion order preserved, not the budget module's sorted canonical hash.
The candidate's `originalProjectionDigest` identifies the original projection;
it need not equal the allowlisted projection's serialization after repackaging.
Its immutable value is covered by candidateSha256.

## Final preparation and commit

The helper checks these bindings and existing ledger validation, reconstructs the
complete input from CURRENT Bubble/radar/oil data, repeats the original automated
review, and invokes unchanged `buildWeeklyEditorialWriteResult` at `now`.
It never rewrites clocks, repairs text, refreshes inputs or retries generation.
Source drift, stale evidence, failed review, ambiguous provenance or conflicts
HOLD publication. A successful return contains only the proposed Bubble file
content, before/after byte digests, approval digest and expected main head.

After independent exact-diff review and required repository checks, the coordinator
must commit ONLY `data/bubble-watch.json` with its parent equal to expectedMain.
Immediately re-read current main and target bytes, compare both pins, re-run this
preparer at actual commit time, and use an atomic expected-head ref update.
Any main movement or uncertain result HOLDs; inspect an uncertain result before
another action. Do not force-push, silently rebase, auto retry, refresh sources or
regenerate. Other paths, deterministic fields, source clocks and scores stay
unchanged. Verify exact-head CI and deployments before reporting the article live.
This document does not itself authorize any write; the separate coordinator
publication review is the narrowly scoped exception to the ordinary workflow-only
writer path, and applies only to this authenticated candidate.
