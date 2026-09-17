# ACLED paired commit preparation

`prepareAcledPairCommit` in `scripts/world-order/acled-pair-commit.mjs` prepares
one local Git commit object containing the complete reviewed weekly/monthly pair.
This is the next `artifact_sanitizer_layer` step after
[configuration comparison](ACLED_CONFIG_PAIR_REVIEW.md), not a production writer.
There is no CLI, workflow, remote fetch, ref update, push or dispatch entry point.

## Input and invariants

The caller supplies a repository `root`, exact 40-character `expectedHead`, both
original `expectedBaselineSha256` values, both `reviewedCandidateSha256` values,
and the two normalized candidate JSON strings (`weekly`, `monthly`). Hashes pin
bytes, not permissions: the caller still needs separate source and publication
approval. Only the existing manual-normalized schema is supported; automated
provenance must not be invented by relabelling it.

Under the existing Git-common-directory `acled-publish-auto.lock`, preparation:

1. Requires HEAD and the **local** origin/main tracking ref to match expectedHead;
   worktree/index must be clean, with no unfinished Git operation. Other GIT_*
   overrides are rejected (the harmless desktop GIT_PAGER default is not forwarded).
2. Reads both baseline blobs from that commit and repeats the exact byte-pin and
   date-regression comparison. Candidate hashes must match the reviewed bytes.
   Semantic no-op returns without new objects or a commit.
3. Copies all tracked source surfaces scanned by the existing checker from the
   pinned commit to a unique private temporary directory. Copies use raw Git blobs,
   not clean/smudge filters; symlinks, unusual paths, >3000 files, >2 MiB/file or
   >32 MiB combined source are rejected. Candidate JSON is written only there.
4. Runs both unchanged checkers in strict mode, without `--runtime-history`, with
   a credential-free environment and 30-second limit per command. Source scan is
   complete for the pinned commit, not a miniature fake-import exemption.
5. Rechecks candidate bytes and repository state; uses a private index initialized
   from the complete parent tree. Both reviewed blobs enter the same tree. Only the
   two allowed config paths may differ; one unchanged track remains in the pair.
6. Creates a commit object, verifies its parent/tree and both exact candidate blob
   hashes, then rechecks HEAD, local tracking ref, worktree and real index fingerprint.
   Cleans only this invocation's temporary directory and releases its own lock.

Every subprocess is bounded and captures output; reports expose fixed status
codes and Git/hash identifiers, not raw exceptions, paths or candidate contents.
Any validation, concurrent change or cleanup failure withholds the commit result.
Existing concurrent edits/commits are not reverted. A failed cleanup leaves the
temporary directory in the OS temp area for operator inspection; do not delete
unrelated directories or an existing lock to retry.

## Exact write and trust boundary

This operation **does write temporary files and local Git objects**. Dangling
objects may remain after failure and are not manually removed. It does not modify
the original configs, real index, worktree, refs or remote repository. A crash may
leave its lock/private directory; there is no automatic stale-lock reclamation.

The shared lock coordinates cooperating local tools only. HEAD/tracking checks
are observations, not a remote lease. No remote freshness, complete country
coverage, source rights or production publication is inferred. A later publisher
must revalidate against remote main, recheck source/publication gates, and perform
one non-forced update based on the expected parent. Conflict or ambiguous push
must stop rather than retry/rebase. Refresh/deployment and published-data evidence
remain separate steps. The once-only ACLED download budget remains spent.
