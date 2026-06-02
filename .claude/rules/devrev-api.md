# DevRev API — org field reference

Source of truth for all ticket analysis. Org verified live via `get_self`:
`dvrv-us-1`, `devo/xXjPo9nF`.

## Org & DON formats
- Org DON: dvrv-us-1, devo/xXjPo9nF
- Ticket:  don:core:dvrv-us-1:devo/xXjPo9nF:ticket/{id}
- User:    don:identity:dvrv-us-1:devo/xXjPo9nF:devu/{id}
- Group:   don:identity:dvrv-us-1:devo/xXjPo9nF:group/{id}

## Stage IDs
| Stage | ID | State | SLA |
| Queued | ordinal 500 | Open | Running |
| Reopen | custom_stage/90 | Open | Running |
| In Progress | custom_stage/4 | In Progress | Running |
| Awaiting Development | custom_stage/7 | In Progress | Running |
| Awaiting Customer Response | custom_stage/5 | In Progress | Paused |
| Resolved | custom_stage/1 | Closed | Stopped |
| Closed | custom_stage/81 | Closed | Stopped |

## Key custom fields (on Ticket)
- tnt__customer_cohort_dropdown (dropdown) — primary customer/account segment (see Cohorts)
- tnt__pod (string) — sub-team routing (see Pods)
- tnt__assignee (dev_user ref) — designated support person
- tnt__resolution (string) — how it was resolved
- tnt__resolved_by (string) — Support / Engineering / Product
- tnt__work_duration (string) — time spent (e.g. "1.07 days")
- tnt__ticket_type (string) — Support / Event / NCO / Retention
- owned_by — ticket owner
- group — DevRev group
- sentiment.label — Happy / Neutral / Unhappy / Frustrated
- sla_summary — hit / miss for First Response + Resolution Time
- severity — blocker / high / medium / low

## SLA
- Single policy: "Support Ticket SLA Default" (sla-28)
- Schedule: Mon–Fri 10AM–8PM IST (org_schedule-13)
- Metrics: First Response + Resolution Time → hit / miss

## Pod values
AI Agents, Alpha, Analytics, Brahmos, EXIM, Finance, Infra, Logistics Intelligence Team, Logistics Lighthouse, MCM, Mobile mad
max, On Demand, POD, Platformization, Texas, WB, WMS, WMS Inbound, WMS Outbound

## Cohorts (tnt__customer_cohort_dropdown)
Tier 1 — Dedicated Enterprise:
  1-Reliance (RIL, Jio, reliancepbg, Reliance Grocery, [WMS] Reliance)
  1-DTDC (DTDC, dtdc.in, dtdc.co)
Tier 2 — Strategic:
  2-Aramex (Aramex Global/VW/Move/SDD/Freight/Oceania/RO)
  2-HNK (Heineken, HNK-BR1-Primary/Secondary, heineken-br1)
Tier 3 — On Demand:
  3A-On Demand (Flipkart, Swiggy, Box, Myntra, healthkart)
  3B-S (On Demand) — smaller on-demand
Tier 4 — B2C / 3PL:
  4A-B2C Shipper (Rozana, healthkart, Kama Ayurveda, Sugarcosmetics, Wakefit)
  4A-B2C LSP, 4B-S (B2C Shipper), 4B-S (B2C LSP)
Tier 5 — B2B:
  5A-B2B LSP (proconnect, SBT, Kerry Logistics, Fmlogistic)
  5A-B2B Shipper, 5B-S (B2B LSP), 5B-S (B2B Shipper)
Special: WMS, Exim, Platform, AI, Roadmap, TBD (unclassified)

Email-domain → cohort fallback:
  @ril.com→1-Reliance; @dtdc.com/.in→1-DTDC; @aramex.com→2-Aramex;
  @ibm.com→2-HNK; @flipkart.com→3A-On Demand; @rozana.in→4A-B2C Shipper;
  @proconnectlogistics.com→5A-B2B LSP

## DevRev Groups (for ownership/routing analysis)
- Reliance Support (group-14)
- DTDC Support (group-388)
- aramex projects (group-251)
- Support Team (group-400) — default/triage
- On demand POD (group-269)
- WMS (group-289)
