#!/usr/bin/env node
/**
 * build-dataset.mjs — static data pipeline for the Friday Support Analytics dashboard.
 *
 * Pulls real tickets from DevRev (REST, using DEVREV_TOKEN), reads Friday's
 * (DEVU-2940) comments on each to classify the five outcome states, normalises
 * every field into the dashboard's vocabulary, and writes
 *   src/data/friday-dataset.json   { generatedAt, window, count, rows: [...] }
 * which src/App.jsx loads in place of the sample generator when rows is non-empty.
 *
 * Run:  npm run data                 (default window = last 30 days)
 *       WINDOW_DAYS=90 npm run data  (full range)
 *       WINDOW_DAYS=7 MAX_TICKETS=60 npm run data   (quick validation)
 *
 * Classification is reconstructed from DevRev alone (see .claude/rules/devrev-friday.md).
 * Failures that never touch DevRev (webhook 5xx) and a separate human-review score
 * live only in the #friday-tkt-runs Slack log — see the "Known gaps" note in that file.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const API = "https://api.devrev.ai";
const FRIDAY_DEVU = "don:identity:dvrv-us-1:devo/xXjPo9nF:devu/2940"; // Friday agent
const OUT = path.join(ROOT, "src", "data", "friday-dataset.json");

// ---- config ----
const WINDOW_DAYS = Number(process.env.WINDOW_DAYS || 30);
const MAX_TICKETS = Number(process.env.MAX_TICKETS || Infinity);
const CONCURRENCY = Number(process.env.CONCURRENCY || 6);

// ---- subtype filter ----
// Friday is a *support* agent; the DevRev "Friday" vista filters to subtype=Support,
// so non-Support ticket subtypes (e.g. "uat", "Project") are dropped before
// classification — they otherwise inflate the dashboard vs DevRev. Compared
// case-insensitively against the ticket's `subtype` field. Set TICKET_SUBTYPE=off
// to disable, or TICKET_SUBTYPE=<name> to filter to a different subtype.
const SUBTYPE_FILTER = String(process.env.TICKET_SUBTYPE || "support").toLowerCase();
const SUBTYPE_FILTER_ON = SUBTYPE_FILTER !== "off";
const subtypeAllowed = (t) =>
  !SUBTYPE_FILTER_ON || String(t.subtype || "").toLowerCase() === SUBTYPE_FILTER;

// ---- org allowlist ----
// Analyse ONLY these orgs (user-supplied canonical list). Each ticket's
// rev_org display_name is normalised (lowercased; "[WMS]" prefix and
// "Account"/"Default Workspace" suffixes stripped; punctuation/spaces removed)
// and matched against the aliases below — this absorbs DevRev's messy display
// variants (e.g. "SBT Account - Default Workspace", "[WMS] Meatigo",
// "xhawi.com - Default Workspace"). Real DevRev spellings resolved 2026-06-02
// via rev_org search are noted per entry where they differ from the label.
// Set ORG_FILTER=off to disable the filter and pull every org.
const ORG_FILTER_ON = String(process.env.ORG_FILTER || "on").toLowerCase() !== "off";
const ORG_ALLOWLIST = [
  { label: "NXLOGISTICS",     aliases: ["nxlogistics"] },
  { label: "SBT",             aliases: ["sbt"] },
  { label: "XHAWI",           aliases: ["xhawi"] },
  { label: "CHRONODIALY",     aliases: ["chronodial"] },          // DevRev: "chronodiali"
  { label: "PRO CONECT",      aliases: ["proconnect", "proconect"] },
  { label: "JEEBLY",          aliases: ["jeebly"] },
  { label: "FLOWPL",          aliases: ["flowpl"] },
  { label: "FLOWEXPRESS",     aliases: ["flowexpress"] },         // DevRev: "Flow Express" / "flowexpress"
  { label: "WAKEFIT",         aliases: ["wakefit"] },
  { label: "SWIGGYTMS",       aliases: ["swiggy"] },
  { label: "IWEXPRESS",       aliases: ["iwexpress"] },
  { label: "ASTER KSA",       aliases: ["aster"] },               // DevRev: "Aster Pharmacy"
  { label: "MEATGO",          aliases: ["meatigo", "meatgo"] },   // DevRev: "meatigo" / "[WMS] Meatigo"
  { label: "BURJEELPHARMACY", aliases: ["burjeel"] },
  { label: "KFG",             aliases: ["kfg"] },                 // DevRev: "KFG (Kout Food Group)"
  { label: "APPOLO",          aliases: ["apollo", "appolo"] },    // DevRev: "Apollo247"
];
const normOrg = (s) => String(s || "").toLowerCase()
  .replace(/\[wms\]/g, "")
  .replace(/default workspace|account/g, "")
  .replace(/[^a-z0-9]/g, "");
function orgAllowed(orgName) {
  if (!ORG_FILTER_ON) return true;
  const n = normOrg(orgName);
  return !!n && ORG_ALLOWLIST.some((o) => o.aliases.some((a) => n.includes(a)));
}

// ---- token (env or .env) ----
function loadToken() {
  if (process.env.DEVREV_TOKEN) return process.env.DEVREV_TOKEN;
  try {
    const env = fs.readFileSync(path.join(ROOT, ".env"), "utf8");
    const m = env.match(/^\s*(?:export\s+)?DEVREV_TOKEN=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error("DEVREV_TOKEN not found in env or .env");
}
const TOKEN = loadToken();

async function api(pathname, params = {}) {
  const url = new URL(API + pathname);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, v);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Authorization: TOKEN } });
    if (res.status === 429 && attempt < 5) { await sleep(1000 * (attempt + 1)); continue; }
    if (!res.ok) throw new Error(`${pathname} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const isoDay = (d) => new Date(d).toISOString().slice(0, 10);

// ================= field extraction — use DevRev's own values verbatim =================
// DevRev severity enum: blocker / high / medium / low (no SEV0–3).
function severityOf(t) { return t.severity || (t.severity_v2?.label || "").toLowerCase() || "unknown"; }

// DevRev's own stage name verbatim. works.list never populates display_name, so stage.name
// is the real field value (built-in stages are snake_case, custom stages are Title-Case).
function stageOf(t) {
  return t.stage?.name || t.stage?.stage?.name || "unknown";
}

function mapChannel(t) {
  const c = (t.source_channel || t.custom_fields?.tnt__source_channel || "").toLowerCase();
  if (c.includes("mail")) return "email";
  if (c.includes("portal") || c.includes("plug") || c.includes("web")) return "portal";
  if (c.includes("slack")) return "slack";
  if (c.includes("app") || c.includes("mobile")) return "app";
  return c || "unknown";
}

const orgOf = (t) => t.rev_org?.display_name || t.account?.display_name || "(no workspace)";
const cohortOf = (t) => t.custom_fields?.tnt__customer_cohort_dropdown || "TBD";
const podOf = (t) => t.custom_fields?.tnt__pod || "TBD";
const resolvedByOf = (t) => (t.custom_fields?.tnt__resolved_by || "").replace(/^Resolved by\s*/i, "") || null;
const sentimentOf = (t) => (t.sentiment?.label || t.sentiment || null);

// eligibility — see spec §4. Approximated from DevRev fields.
function eligibility(t) {
  const orgName = (t.rev_org?.display_name || "").toLowerCase();
  const title = (t.title || "").toLowerCase();
  const cohort = cohortOf(t);
  const pod = podOf(t);
  if (!t.rev_org) return "Internal (no workspace)";
  if (orgName.includes("service-now") || orgName.includes("servicenow")) return "Auto-notification";
  if (/comments have been added to the ticket|system notification/i.test(title)) return "Auto-notification";
  if (/\bspam\b/i.test(title)) return "Spam";
  if (/\bwms\b|exim/i.test(cohort) || /\bwms\b|exim/i.test(pod)) return "WMS / Exim line";
  return null; // eligible
}

// ================= Friday-comment classification =================
function parseScore(text) {
  // Prefer an explicit Quality Score (review); fall back to Friday's Confidence Score.
  let m = text.match(/Quality Score[:\s]*\[?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (m) return { score: Number(m[1]), scoreType: "quality" };
  m = text.match(/Confidence Score[^\[\d]*\[?\s*(\d+(?:\.\d+)?)\s*\/\s*10/i);
  if (m) return { score: Number(m[1]), scoreType: "confidence" };
  return { score: null, scoreType: null };
}

function classify(fridayBodies) {
  if (!fridayBodies.length) return { outcome: "NeverTriggered", failReason: null, ...parseScore("") };
  const all = fridayBodies.join("\n\n");
  if (/workspace is not mapped|not mapped to a shipsy org/i.test(all))
    return { outcome: "Skipped", failReason: null, ...parseScore(all) };
  if (/investigation failed|failed to (?:complete|run) (?:the )?investigation|unhandled (?:error|exception)/i.test(all))
    return { outcome: "Failed", failReason: "Investigation failed", ...parseScore(all) };

  const hasRCA = /\[Auto-Investigation\]|## Root Cause Analysis/i.test(all);
  // Did Friday produce a usable first response?
  const noFR = /No\s*"?Suggested First Response"?\s*section/i.test(all);
  const draft = fridayBodies.find((b) => /\[Auto-Investigation Draft Response\]/i.test(b)) || "";
  const draftIsReal = draft && !/No\s*"?Suggested First Response"?\s*section/i.test(draft) && draft.replace(/\[Auto-Investigation Draft Response\]/i, "").trim().length > 40;
  const rcaHasFRSection = /###?\s*Suggested First Response/i.test(all) && !noFR;

  if (hasRCA || draft) {
    const full = draftIsReal || rcaHasFRSection;
    return { outcome: full ? "RanFull" : "RanRCAOnly", failReason: null, ...parseScore(all) };
  }
  // Friday commented but no recognisable RCA — treat as a (weak) run.
  return { outcome: "RanRCAOnly", failReason: null, ...parseScore(all) };
}

async function fridayBodiesFor(ticketDon) {
  const bodies = [];
  let cursor = null, pages = 0;
  do {
    const r = await api("/timeline-entries.list", { object: ticketDon, limit: 50, cursor });
    for (const e of r.timeline_entries || []) {
      const au = e.created_by || {};
      const isFriday = au.id === FRIDAY_DEVU || au.display_id === "DEVU-2940" || /(^|\b)Friday(\b|$)/.test(au.display_name || au.full_name || "");
      if (isFriday && e.type === "timeline_comment" && e.body) bodies.push(e.body);
    }
    cursor = r.next_cursor; pages++;
  } while (cursor && pages < 6);
  return bodies;
}

// ================= ticket fetch =================
async function fetchTickets(afterISO, beforeISO) {
  const out = [];
  let cursor = null, pages = 0;
  while (out.length < MAX_TICKETS) {
    // GET works.list has no usable created_date filter — paginate newest-first
    // (sort_by is supported) and stop once we cross the window start.
    const r = await api("/works.list", {
      type: "ticket",
      limit: 100,
      cursor,
      "sort_by": "created_date:desc",
    });
    const works = r.works || [];
    for (const w of works) {
      const day = isoDay(w.created_date);
      if (day < afterISO || day > beforeISO) continue; // client-side guard if server ignores filter
      if (!subtypeAllowed(w)) continue;                // Support-only (matches DevRev Friday vista)
      if (!orgAllowed(orgOf(w))) continue;             // org allowlist (skip before Friday-comment fetch)
      out.push(w);
      if (out.length >= MAX_TICKETS) break;
    }
    cursor = r.next_cursor; pages++;
    // Stop early if sorted desc and we've passed the window start.
    const oldest = works.length ? isoDay(works[works.length - 1].created_date) : null;
    if (!cursor || (oldest && oldest < afterISO) || pages > 200) break;
    process.stdout.write(`\r  fetched ${out.length} tickets…`);
  }
  process.stdout.write("\n");
  return out;
}

// ================= concurrency pool =================
async function mapPool(items, n, fn) {
  const res = new Array(items.length);
  let i = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { res[idx] = await fn(items[idx], idx); }
      catch (e) { res[idx] = { __error: String(e.message || e) }; }
      done++;
      if (done % 10 === 0) process.stdout.write(`\r  classified ${done}/${items.length}…`);
    }
  }));
  process.stdout.write(`\r  classified ${items.length}/${items.length}.   \n`);
  return res;
}

// ================= main =================
const today = new Date();
const end = isoDay(today);
const start = isoDay(new Date(today.getTime() - WINDOW_DAYS * 86400000));

console.log(`Friday dataset build — window ${start} → ${end} (${WINDOW_DAYS}d), max ${MAX_TICKETS} tickets, concurrency ${CONCURRENCY}, subtype ${SUBTYPE_FILTER_ON ? SUBTYPE_FILTER : "off"}`);
console.log("Fetching tickets from DevRev…");
const tickets = await fetchTickets(start, end);
console.log(`→ ${tickets.length} tickets in window.`);

console.log("Reading Friday comments + classifying…");
const rows = await mapPool(tickets, CONCURRENCY, async (t) => {
  const don = `don:core:dvrv-us-1:devo/xXjPo9nF:ticket/${t.display_id.replace(/^TKT-/, "")}`;
  const bodies = await fridayBodiesFor(don);
  const { outcome, failReason, score, scoreType } = classify(bodies);
  const excludeReason = eligibility(t);
  const day = isoDay(t.created_date);
  return {
    id: t.display_id,
    don,
    date: day,
    daysAgo: Math.round((new Date(end) - new Date(day)) / 86400000),
    org: orgOf(t),
    cohort: cohortOf(t),
    pod: podOf(t),
    sev: severityOf(t),
    stage: stageOf(t),
    channel: mapChannel(t),
    eligible: !excludeReason,
    excludeReason,
    outcome,
    failReason,
    score,
    scoreType,
    frUsable: outcome === "RanFull",
    resolvedBy: resolvedByOf(t),
    sentiment: sentimentOf(t),
    slaFR: t.sla_summary?.stages ? undefined : undefined, // left for a future pass
  };
}).then((r) => r.filter((x) => x && !x.__error));

// distribution summary
const dist = rows.reduce((a, r) => ((a[r.outcome] = (a[r.outcome] || 0) + 1), a), {});
console.log("Outcome distribution:", dist);
const scored = rows.filter((r) => r.score != null);
console.log(`Scores parsed on ${scored.length}/${rows.length} rows.`);

if (ORG_FILTER_ON) {
  const matched = {}, missing = [];
  for (const o of ORG_ALLOWLIST) {
    const n = rows.filter((r) => o.aliases.some((a) => normOrg(r.org).includes(a))).length;
    if (n) matched[o.label] = n; else missing.push(o.label);
  }
  console.log("Org allowlist matches:", matched);
  if (missing.length) console.log(`⚠ allowlist orgs with 0 tickets in window (${start}→${end}):`, missing.join(", "));
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  source: "devrev",
  window: { start, end, days: WINDOW_DAYS },
  count: rows.length,
  rows,
}, null, 2));
console.log(`Wrote ${rows.length} rows → ${path.relative(ROOT, OUT)}`);
