# ACLED paired remote publication

The `publishAcledPair` library adds a fixed-repository/main remote publication
step after [local paired commit preparation](ACLED_PAIR_COMMIT_PREPARATION.md).
It does not yet have a CLI or workflow and has not performed a real publication.

## Authorization and sequence

Default `execute=false` does no I/O. Execution additionally requires explicit
`publicationApproved=true` and `sourceUseApproved=true`, a GitHub token, and the
existing complete candidate/baseline byte pins. These caller assertions are not
proof of ACLED permission: a reviewed caller must establish and record the actual
authorization before calling. Hashes alone never grant source or publication rights.

The local checkout must be on main with origin exactly
`https://github.com/ctmaomao/gfrr-auto-update-site.git`. The library:

1. Queries that repository's remote main and holds if its head differs from the
   reviewed expected parent.
2. Runs the existing strict, locked local pair preparation. A semantic no-op does
   not commit. Preparation failure or incomplete cleanup prevents publication.
3. Calls GitHub `createCommitOnBranch` once, with `expectedHeadOid`, exactly two
   fixed configuration additions and no deletions. Content is Base64 of the same
   reviewed UTF-8 bytes. This is not a forced push or a rebase.
4. Confirms the returned commit has the expected single parent and complete tree,
   with a matching returned branch target. GitHub authors/signs its own commit, so
   its commit ID need not equal the locally prepared object's ID.

Protocol references: [GitHub commit mutation](https://docs.github.com/en/graphql/reference/commits#createcommitonbranch)
and [branch input](https://docs.github.com/en/graphql/reference/git#committablebranch).
Local main/index/worktree are not advanced by this library.

## Bounds and uncertain outcomes

At most two GitHub requests, 15 seconds each covering headers and body, no redirects
or retries. Each response is at most 64 KiB; request bodies at most 3 MiB cover the
two configurations' Base64 encoding. Credentials appear only in the request header,
never subprocess environments, command arguments or returned diagnostics.

Before the mutation, failure returns a hold with no configuration publication.
Once the mutation could have been sent, timeout, HTTP/GraphQL error, malformed or
oversized response, or mismatched parent/tree yields `publication_unknown` and
`configurationsPublished=null`. This is not evidence of no write; do not retry.
Use separate read-only reconciliation against the expected parent/tree.

Confirmed configuration publication returns `configurations_published_refresh_pending`.
It **never** marks `sitePublished=true`. GITHUB_TOKEN-generated commits cannot be
assumed to trigger follow-up workflows: reviewed refresh and deployment dispatch,
plus published-data verification, must be connected explicitly in the integration
step. Existing spent ACLED download budgets remain spent.
