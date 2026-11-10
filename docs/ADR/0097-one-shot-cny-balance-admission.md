# ADR-0097: CNY-only one-shot balance admission

- Date: 2026-11-10.
- Status: authorized narrow implementation; exact-tree review pending.
- Baseline: main `b504c503`; [ADR-0094](0094-editorial-one-shot-additional-grant.md) remains the sole additional spending grant.

## Evidence and scope

The owner reports prior CNY billing and only CNY top-ups, requires CNY debit, and directs using the existing two-article authorization without support outreach. The completed [structure-only diagnosis](0096-deepseek-balance-shape-diagnostic.md) showed CNY and USD rows, but disclosed no amounts and established no debit priority. That retired diagnostic workflow must remain absent. This change performs no real balance read and grants no new credential access.

## Decision

Only the explicitly selected one-shot gate accepts one unique CNY row plus an optional unique USD row. Availability must be exactly true. Each row must contain exactly currency and the three documented amount fields. All amounts must be nonnegative decimal strings with at most eight fractional digits and at most 32 characters. Exact BigInt arithmetic requires total to equal granted plus topped-up balance. The CNY total must cover the full current worst-case reservation, CNY 2.161152. Every optional USD amount must be exactly zero. Unknown/duplicate currencies, nonzero USD, malformed or inconsistent amounts, insufficient CNY and unavailable accounts all HOLD before reservation and POST, with a fixed error that contains no balances.

Zero USD is a conservative restriction, not an asserted provider debit-priority rule. No FX conversion, USD spending authorization, balance-to-project-spend inference or historical spending reset is introduced. Actual provider account behavior remains outside the snapshot's proof; the scope relies on the owner's reported CNY billing and requires CNY funding without a positive alternative-currency balance.

The shared fixed-endpoint balance reader accepts an explicit validator for this one-shot path and retains all existing transport limits. Its default validator and the ordinary monthly gate remain unchanged, including strict single-CNY admission and missing-ledger HOLD. The one-shot gate revalidates returned data even with an injected reader.

## Invariants and verification

The grant/genesis, CNY 4.33 combined cap, one permanent worst-case reservation per consumer, no retry/refund, price expiry, CNY peak rates, request/usage protections, free-search and editorial quality gates are unchanged. No new workflow, key, setting or activation path is added. Tests cover row order, exact threshold and one hundred-millionth below it, zero/nonzero USD, malformed fields, duplicates, consistency, pre-reservation HOLD and the unchanged default monthly reader. Real reads and generation remain coordinator-controlled under the original authorization, never this offline validation.
