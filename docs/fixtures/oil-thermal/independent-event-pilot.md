# Independent event labels: limited Texas Gulf Coast pilot

Review date 2026-11-19. Offline source evidence only, not a detector dataset or release.
Base c67cb7605264d4e17411a966a6e223362855c2c0; two historical refinery identities
already appear in the repository's Gulf Coast whitelist. No new facility geometry,
coordinate, layout, vulnerability or unit-level operating detail is stored.

This companion to [the JSON fixture](independent-event-pilot.json) records the
source evidence, not a detector evaluation. To reproduce, open each cited
record, locate the listed entry, and verify the ledger's occurrence date,
publication date, origin and classification. Parse locally with
`python3 -m json.tool docs/fixtures/oil-thermal/independent-event-pilot.json`.
No script consumes this fixture.

## Dated documentary evidence

- Texas City fire: official [CSB Volume II, printed p. 35](https://www.csb.gov/assets/1/6/Incident_Reports_Volume_2_2025-03-12.pdf), with [publication announcement](https://www.csb.gov/us-chemical-safety-board-releases-volume-2-of-chemical-incident-reports/?F_All=y&INV_ID=58&folder=current_investigations&page=info). The report says fire at 09:32 local on 2023-05-15, one fatality. It relies on operator investigative evidence; an operator's source copied into a government document is not two independently originated observations. The publication day denotes that report's public release, not the earliest date on which any party knew the event occurred. PDF item numbering differs between the contents and body, so cite printed page and named entry.
- Deer Park release: [2024-11-20 preliminary CSB investigation update](https://www.csb.gov/us-chemical-safety-board-releases-investigation-update-into-fatal-hydrogen-sulfide-release-at-pemex-deer-park-refinery-in-deer-park-texas/), then [2026-02-23 dated final announcement](https://www.csb.gov/us-chemical-safety-board-releases-investigation-report-on-fatal-hydrogen-sulfide-release-at-the-pemex-deer-park-refinery-in-texas/) and [final report](https://www.csb.gov/assets/1/6/pemex_investigation_report_final.pdf). Date and approximately 16:23 local come from those dated versions; the undated landing-page body gives inconsistent time/year. Keep one event ID and separate evidence versions; don't overwrite the historical vintage. The incident was unplanned although it occurred during maintenance; confirmed severe chemical release is not confirmed fire or a measured loss of crude/product throughput. Hospital transfers are not identical to admissions. Cessation of release is not resumption of refining.
- Planned comparison category (not a true negative): [Marathon's 2014-05-01 published first-quarter exhibit](https://www.sec.gov/Archives/edgar/data/1510295/000119312514174495/d720324dex991.htm) documents completed Galveston Bay turnaround, but only completion quarter, not facility-day onset, end or complete operating exposure. Historical example only; it cannot be paired with today's thermal receipt cohort. A more precise broad-US example, outside the current pilot whitelist, is [Cenovus's Lima turnaround](https://www.sec.gov/Archives/edgar/data/1475260/000147526025000006/a2024managementsdiscussion.htm), described as early September to late October 2024 and filed [2025-02-20](https://www.sec.gov/Archives/edgar/data/1475260/000147526025000006/0001475260-25-000006-index.htm); still no invented day.
- Routine refinery flaring: unverified. [Texas RRC Form PR scope](https://www.rrc.texas.gov/about-us/faqs/oil-gas-faq/flaring-regulation/) is actual monthly upstream lease-level gas volumes, not a refinery's dated routine-only operations. A permit reflects permission, not an observed flare. Emissions-event entries can depict startup/shutdown or upsets; a flare entry alone does not establish routine status. Require dated affirmative operating documentation classified only at its own time/asset granularity without inferring no other incident.
- No documented event: not sampled. Even a completed query with no report means 'not documented in that named source/scope/version', never 'no event', never a true negative. No monthly totals or empty FIRMS results fill this gap.

## Scope, rights and next gate

[CSB](https://www.csb.gov/about-the-csb/) is an independent federal investigator,
not a regulator. Its [accidental release roster](https://www.csb.gov/news/incident-report-rule-form-/)
is operator-reported, federally scoped (death, serious injury or substantial
damage), revised quarterly and potentially late. It does not enumerate all
normal operations, flares, maintenance or outages. This local inventory retains
short normalized factual metadata and links, not PDF copies, photos, diagrams,
agency marks, extensive wording or SEC-hosted private exhibits. It claims no
blanket re-use license for third-party material.

[TCEQ's public portal documentation](https://www.tceq.texas.gov/airquality/emission-events/eventreporting)
supports manual date/incident/regulated-entity filters and export, including
reportable emissions and maintenance/startup/shutdown. Its linked report-search
endpoint returned HTTP 401 via public web retrieval in this review; portal
availability and actual row/version semantics were not verified. No attempt to
bypass it. [TCEQ policy](https://www.tceq.texas.gov/help/policies/linking_policy.html)
says site content is public domain unless noted, with logo and external-material
exceptions. [RRC terms](https://www.rrc.texas.gov/site-policies/railroad-commission-of-texas-site-policies/)
limit its copying permission to unaltered noncommercial use unless individually
noted; use linked references only. SEC hosting is not federal authorship.
Neither emissions nor labor-safety severity substitutes for an operator-verified
throughput reduction. Unknown severity measures stay null, not zero.

Next: pre-register a closed Texas refinery scope and bounded historical dates
that overlap **already available** eligible thermal receipts (if any), then
manually freeze a dated official CSB roster vintage; confirm TCEQ's supported
manual export before any dated query. Document exact coverage, search dates,
selection rules, corrections/withdrawals and what wasn't reachable. Obtain
separate operator or independently adjudicated documentation for scheduled
turnarounds, routine cases and any measured reduction; record explicit onset and
publication precision. If a source only supplies the publication day, the
effective historical knowledge gate is no earlier than the end of that day in
the issuer's timezone, or a later independently evidenced time. Record
retrospective verification separately from historical system receipt; don't
backfill receipt with publication or occurrence time. Dates here are not joined
to any sensor window and cannot demonstrate coverage, recall, false positives,
negative accuracy, or generalize to non-US facilities. Do not adapt these
rows into the synthetic fixture acceptance helper as measured results or
promote them to production. No production changes or paid calls.
