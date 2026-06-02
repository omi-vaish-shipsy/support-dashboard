# DevRev — how to analyze tickets

Working conventions for all ticket analysis. Field/stage/cohort reference lives in
[`devrev-api.md`](./devrev-api.md).

- To pull tickets, use `list_objects` (type=ticket) with filters on stage, group,
  sla_summary; use `hybrid_search` (namespace=ticket) for semantic/keyword lookups.
- Paginate fully — never stop at the first page when the task is "all tickets."
  Loop on the cursor until exhausted and report the total count actually fetched.
- For status, map via the Stage table above (Open / In Progress / Closed) rather
  than raw stage IDs. SLA-paused = Awaiting Customer Response.
- Standard breakdown dimensions for analysis: cohort, pod, group, owner, severity,
  sentiment, ticket_type, resolved_by, sla hit/miss, work_duration.
- Resolution time = use tnt__work_duration / SLA timestamps, not wall-clock created→closed
  (the SLA clock pauses on Awaiting Customer Response).
- NEVER fabricate or estimate DevRev data — only report what the API returns. If a field
  is empty/missing, say so explicitly.
- Always render ticket references as clickable DevRev links using the ticket DON.
- When counting by cohort, treat TBD as "needs triage," not as a real segment.
