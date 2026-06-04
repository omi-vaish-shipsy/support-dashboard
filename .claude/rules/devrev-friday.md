# Friday outcome reconstruction from DevRev

How the static pipeline (`scripts/build-dataset.mjs`) derives the dashboard's five
outcome states from DevRev alone. Friday is dev_user **DEVU-2940**
(`don:identity:dvrv-us-1:devo/xXjPo9nF:devu/2940`, `knowledge@shipsy.io`).

## Detection (from Friday's `timeline_comment`s on each ticket)
- **Ran · RCA + FR** — a `[Auto-Investigation]` comment (contains `## Root Cause Analysis`)
  AND a real `[Auto-Investigation Draft Response]` comment (or a `### Suggested First
  Response` section that is not the placeholder).
- **Ran · RCA only** — RCA present but the draft-response comment is the placeholder
  `_No "Suggested First Response" section in RCA._`
- **Skipped** — Friday comment matches `workspace is not mapped` / `not mapped to a Shipsy
  org` / `does not have a mapped org` / `skipping auto-investigation`. (Verified real
  marker, e.g. TKT-99716: `[Auto-Investigation] Workspace 'bdo - Default Workspace' does
  not have a mapped org_id. Skipping auto-investigation.`)
  NB: the bare `[Auto-Investigation]` tag prefixes EVERY Friday comment — skips and
  failures included — so it is NOT evidence of an RCA; only the `## Root Cause Analysis`
  heading is.
- **Failed** — Friday comment matches `Auto-investigation failed unexpectedly` /
  `investigation failed` / `unhandled error`. (Verified real marker:
  `[Auto-Investigation] Auto-investigation failed unexpectedly. Error logged for review.`)
- **Never triggered** — no Friday comment on the ticket at all.

## Score
`score` is parsed from Friday's comment: a `Quality Score: N/10` (review workflow) if
present, else Friday's own `Confidence Score [N/10]`. `scoreType` records which.

## Field values — DevRev's own attributes, verbatim (no invented vocabulary)
- severity: raw DevRev enum `blocker` / `high` / `medium` / `low` (NOT SEV0–3).
- stage: raw `stage.name` (works.list never populates display_name) — built-in stages
  are snake_case (`queued`, `awaiting_customer_response`, `resolved`, `canceled`), custom
  stages are Title-Case (`Reopen`, `Closed`, `TKT Backlog`). Stored as-is.
- org = rev_org.display_name; cohort = tnt__customer_cohort_dropdown (raw tier, e.g.
  `1-Reliance`); pod = tnt__pod; channel = source_channel (raw; missing → `unknown`).
- eligibility (spec §4) approximated: no rev_org → Internal; Service-now org / "comments
  have been added" title → Auto-notification; `spam` in title → Spam; WMS/Exim in
  cohort or pod → WMS/Exim line.

## Known gaps (NOT derivable from DevRev — would need the #friday-tkt-runs Slack log)
- **Failures that never reach DevRev** (webhook 5xx, timeouts before any comment) are
  invisible here — only Friday-comment failures are counted. Real failure rate ≥ shown.
- **Never-triggered vs Skipped**: a ticket with no Friday comment is counted Never
  triggered; a config-skip only shows as Skipped if Friday left the skip comment.
- **Human review score**: the `friday-review` human 0–10 flow is not in DevRev; the
  dashboard's score currently reflects Friday's self-confidence / quality score.

Per the no-fabrication rule, the dashboard footer and the "Live · DevRev" badge state
the source and these caveats. Do not paper over the gaps with estimates.
