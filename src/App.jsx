import React, { useState, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  AreaChart, Area, LineChart, Line, Cell,
} from "recharts";
import {
  Building2, Ticket, Calendar, Activity, Layers, Bot, Gauge, Star,
  Timer, AlertTriangle, Download, ExternalLink, RotateCw, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import DATASET from "./data/friday-dataset.json"; // live DevRev pull (npm run data); falls back to sample when empty

/* ================================================================== *
 *  THEME
 * ================================================================== */
const T = {
  bg: "#F4F1EA", panel: "#FFFFFF", ink: "#1A1A1C", muted: "#73716B",
  faint: "#A7A49C", line: "#E7E2D6", accent: "#1B5E5A",
};
const STATES = ["RanFull", "RanRCAOnly", "Skipped", "Failed", "NeverTriggered"];
const SLABEL = {
  RanFull: "Ran · RCA + FR", RanRCAOnly: "Ran · RCA only", Skipped: "Skipped",
  Failed: "Failed", NeverTriggered: "Never triggered",
};
const SCOLOR = {
  RanFull: "#2E7D5B", RanRCAOnly: "#C9A227", Skipped: "#6E8AA6",
  Failed: "#BF453B", NeverTriggered: "#B6B2A8",
};
const RAN = ["RanFull", "RanRCAOnly"];
const ATTEMPTED = ["RanFull", "RanRCAOnly", "Skipped", "Failed"];

/* ================================================================== *
 *  SAMPLE DATA  — replace generator with live DevRev + Friday log feed
 * ================================================================== */
const TODAY = new Date("2026-06-02T00:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const addDays = (base, n) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d; };
// When live DevRev data is loaded, bound the date controls to what we actually stored.
const REAL_WIN = Array.isArray(DATASET?.rows) && DATASET.rows.length && DATASET.window ? DATASET.window : null;
const DATA_MIN = REAL_WIN ? REAL_WIN.start : iso(addDays(TODAY, -90));
const DATA_MAX = REAL_WIN ? REAL_WIN.end : iso(TODAY);
const fmtLong = (s) => new Date(s + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const ORGS = [
  { n: "Delhivery", c: "Strategic", vol: 1.7, cov: 0.82 },
  { n: "Ecom Express", c: "Strategic", vol: 1.3, cov: 0.78 },
  { n: "Aramex", c: "Enterprise", vol: 1.0, cov: 0.74 },
  { n: "DTDC", c: "Enterprise", vol: 1.1, cov: 0.70 },
  { n: "Shadowfax", c: "Growth", vol: 0.9, cov: 0.66 },
  { n: "BlueDart", c: "Enterprise", vol: 0.8, cov: 0.72 },
  { n: "Xpressbees", c: "Growth", vol: 0.7, cov: 0.60 },
  { n: "Reliance", c: "Strategic", vol: 1.0, cov: 0.12 },
  { n: "Flipkart", c: "Strategic", vol: 1.1, cov: 0.18 },
];
const ORG_NAMES = ORGS.map(o => o.n);
const PODS = ["Last Mile", "FTL", "Cross Border", "3PL", "Returns", "Tracking"];
const COHORTS = ["Strategic", "Enterprise", "Growth", "SMB"];
// Real DevRev values (verbatim). severity enum + stage.name as DevRev stores them.
const SEVS = ["blocker", "high", "medium", "low"];
const STAGES = ["queued", "Reopen", "work_in_progress", "in_development", "scoping_in_progress", "awaiting_development", "awaiting_product_assist", "awaiting_customer_response", "need_inputs", "Pending Scope Approval", "Need Product Sprint Planning", "Need Governance", "Reassigned to Customer Support", "resolved", "Closed", "canceled", "TKT Backlog"];
const CHANNELS = ["email", "app", "slack", "portal"];
const CHAN_HEALTH = { email: 0.95, app: 0.9, slack: 0.85, portal: 0.55 }; // portal = ingestion gap
const FAIL_REASONS = ["Claude Code aborted", "Timeout", "Webhook 5xx"];
const STUCK_STAGES = ["Awaiting Dev", "Awaiting Product"];

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function wpick(rng, arr, w) {
  const tot = w.reduce((a, b) => a + b, 0); let r = rng() * tot;
  for (let i = 0; i < arr.length; i++) { r -= w[i]; if (r <= 0) return arr[i]; } return arr[arr.length - 1];
}
const ln = (rng, med, sig) => Math.max(0.2, med * Math.exp(sig * (rng() + rng() + rng() - 1.5)));

const SAMPLE_TICKETS = (() => {
  const rng = mulberry32(20260602);
  const rows = []; let id = 4200;
  for (let d = 90; d >= 0; d--) {
    const day = new Date(TODAY); day.setUTCDate(day.getUTCDate() - d);
    const n = 18 + Math.floor(rng() * 10);
    for (let i = 0; i < n; i++) {
      const org = wpick(rng, ORGS, ORGS.map(o => o.vol));
      const sev = wpick(rng, SEVS, [1, 3, 6, 5]);
      const pod = wpick(rng, PODS, [5, 3, 2, 3, 2, 4]);
      const stage = wpick(rng, ["queued", "work_in_progress", "awaiting_customer_response", "awaiting_development", "awaiting_product_assist", "resolved", "canceled", "TKT Backlog"], [3, 4, 5, 2, 2, 7, 3, 2]);
      const channel = wpick(rng, CHANNELS, [5, 4, 2, 3]);
      const hour = wpick(rng, [...Array(24).keys()],
        [...Array(24).keys()].map(h => (h >= 9 && h <= 20 ? (h === 15 ? 0.4 : 3) : 0.6)));

      // eligibility
      let excludeReason = null;
      const er = rng();
      if (er < 0.05) excludeReason = "Spam";
      else if (er < 0.11) excludeReason = "Auto-notification";
      else if (er < 0.16) excludeReason = "Internal (no workspace)";
      else if (er < 0.20) excludeReason = "WMS / Exim line";
      const eligible = !excludeReason;

      // outcome
      let outcome, failReason = null;
      const triggered = rng() < org.cov * CHAN_HEALTH[channel] * (eligible ? 1 : 0.15) + 0.02;
      if (!triggered) outcome = "NeverTriggered";
      else {
        const r = rng();
        const hard = (sev === "blocker" || sev === "high" ? 0.05 : 0) + (pod === "Cross Border" ? 0.03 : 0);
        if (r < 0.06) outcome = "Skipped";
        else if (r < 0.06 + 0.10 + hard) { outcome = "Failed"; failReason = wpick(rng, FAIL_REASONS, [6, 2, 2]); }
        else outcome = rng() < 0.76 ? "RanFull" : "RanRCAOnly";
      }
      const ran = RAN.includes(outcome);
      const triggerLag = (ran || outcome === "Failed") ? ln(rng, 1.4, 0.6) : null;
      const runtime = (ran || outcome === "Failed") ? ln(rng, 4.4, 0.45) : null;
      const score = ran ? Math.min(10, Math.max(0, Math.round((outcome === "RanFull" ? 7.6 : 5.8) + (rng() - 0.5) * 4))) : null;
      const touched = ran;

      rows.push({
        id: `TKT-${id++}`, org: org.n, cohort: org.c, sev, pod, stage, channel, hour,
        date: day.toISOString().slice(0, 10), daysAgo: d,
        eligible, excludeReason, outcome, failReason,
        triggerLag, runtime, total: triggerLag != null ? triggerLag + runtime : null,
        score, frUsable: outcome === "RanFull",
        sentAsIs: outcome === "RanFull" && rng() < 0.46,
        reopened: rng() < (touched ? 0.07 : 0.14),
        resolvedBy: stage === "resolved" ? wpick(rng, ["Support", "Product", "Engineering"], touched ? [6, 2, 2] : [4, 3, 3]) : null,
        slaFR: rng() < (touched ? 0.88 : 0.72), slaRes: rng() < (touched ? 0.8 : 0.66),
        sentiment: wpick(rng, ["positive", "neutral", "negative"], touched ? [4, 4, 2] : [3, 4, 3]),
        ageDays: stage === "resolved" ? 0 : Math.floor(ln(rng, 4, 0.8)),
        assigned: rng() > 0.08,
      });
    }
  }
  return rows;
})();

/* ---- Use live DevRev data when the pipeline has produced rows; else the sample ---- */
const REAL_ROWS = Array.isArray(DATASET?.rows) ? DATASET.rows : [];
const USING_REAL = REAL_ROWS.length > 0;
const TICKETS = USING_REAL ? REAL_ROWS : SAMPLE_TICKETS;

// Dropdown / breakdown dimension lists, derived from whatever data is loaded.
// Canonical order is honoured when known; unknown real values are appended alphabetically.
const uniqOrdered = (key, order) => {
  const present = [...new Set(TICKETS.map((r) => r[key]).filter((v) => v != null && v !== ""))];
  const ord = order || [];
  return [
    ...ord.filter((v) => present.includes(v)),
    ...present.filter((v) => !ord.includes(v)).sort((a, b) => String(a).localeCompare(String(b))),
  ];
};
const D_ORGS = uniqOrdered("org", USING_REAL ? null : ORG_NAMES);
const D_COHORTS = uniqOrdered("cohort", COHORTS);
const D_PODS = uniqOrdered("pod", PODS);
const D_SEVS = uniqOrdered("sev", SEVS);
const D_STAGES = uniqOrdered("stage", STAGES);
const D_CHANNELS = uniqOrdered("channel", CHANNELS);

/* ================================================================== *
 *  HELPERS
 * ================================================================== */
const fmt = (n) => Math.round(n).toLocaleString("en-IN");
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const countWhere = (rows, fn) => rows.reduce((a, r) => a + (fn(r) ? 1 : 0), 0);
const median = (a) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const perc = (a, p) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };

function applyFilters(rows, f, win) {
  const lo = win ? win[0] : f.start, hi = win ? win[1] : f.end;
  return rows.filter(r =>
    r.date >= lo && r.date <= hi &&
    (f.org === "All" || r.org === f.org) &&
    (f.cohort === "All" || r.cohort === f.cohort) &&
    (f.pod === "All" || r.pod === f.pod) &&
    (f.sev === "All" || r.sev === f.sev) &&
    (f.stage === "All" || r.stage === f.stage) &&
    (f.channel === "All" || r.channel === f.channel) &&
    (f.state === "All" || r.outcome === f.state) &&
    (!f.eligibleOnly || r.eligible)
  );
}
function colorScale(v) { // 0..1  red -> gold -> green
  const lerp = (a, b, t) => Math.round(a + (b - a) * t);
  const hex = (c) => c.map(x => x.toString(16).padStart(2, "0")).join("");
  if (v < 0.5) { const t = v / 0.5; return "#" + hex([lerp(0xBF, 0xC9, t), lerp(0x45, 0xA2, t), lerp(0x3B, 0x27, t)]); }
  const t = (v - 0.5) / 0.5; return "#" + hex([lerp(0xC9, 0x2E, t), lerp(0xA2, 0x7D, t), lerp(0x27, 0x5B, t)]);
}
const spanDaysOf = (start, end) => Math.max(0, Math.round((new Date(end) - new Date(start)) / 86400000));
function daily(rows, startISO, endISO, fn) {
  const start = new Date(startISO + "T00:00:00Z");
  const n = spanDaysOf(startISO, endISO) + 1;
  const arr = Array.from({ length: n }, (_, i) => {
    const dt = addDays(start, i);
    return { iso: iso(dt), label: dt.toLocaleDateString("en-US", { day: "numeric", month: "short", timeZone: "UTC" }), RanFull: 0, RanRCAOnly: 0, Skipped: 0, Failed: 0, NeverTriggered: 0, Created: 0, Resolved: 0, score: [] };
  });
  const idx = {}; arr.forEach((b, i) => { idx[b.iso] = i; });
  rows.forEach(r => { const i = idx[r.date]; if (i != null) fn(arr[i], r); });
  return arr;
}
const tickStep = (points) => Math.max(0, Math.ceil(points / 9) - 1);

/* ================================================================== *
 *  UI PRIMITIVES
 * ================================================================== */
const card = { background: T.panel, border: `1px solid ${T.line}`, borderRadius: 14, padding: 18 };
const mono = "'IBM Plex Mono', monospace";

function KPI({ icon: Icon, label, value, sub, delta, deltaGood = "up", color }) {
  const showDelta = delta !== undefined && delta !== null && isFinite(delta);
  const positive = delta > 0;
  const good = (deltaGood === "up" && positive) || (deltaGood === "down" && !positive);
  const dColor = delta === 0 ? T.faint : good ? "#2E7D5B" : "#BF453B";
  const DIcon = positive ? ArrowUpRight : ArrowDownRight;
  return (
    <div style={{ ...card, display: "flex", flexDirection: "column", gap: 6, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, color: T.muted, fontSize: 11.5, letterSpacing: 0.3, textTransform: "uppercase" }}>
        <Icon size={14} color={color || T.accent} /> {label}
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: mono, fontSize: 26, fontWeight: 600, lineHeight: 1 }}>{value}</span>
        {showDelta && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 1, fontSize: 12, fontWeight: 600, color: dColor, fontFamily: mono }}>
            <DIcon size={13} />{Math.abs(delta)}{typeof delta === "number" && Number.isInteger(delta) ? "" : ""}
          </span>
        )}
      </div>
      {sub && <div style={{ fontSize: 12, color: T.muted }}>{sub}</div>}
    </div>
  );
}

function Panel({ title, icon: Icon, children, foot }) {
  return (
    <div style={{ ...card }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        {Icon && <Icon size={16} color={T.accent} />}
        <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, letterSpacing: 0.2 }}>{title}</h3>
        {foot && <span style={{ marginLeft: "auto", fontSize: 11, color: T.faint }}>{foot}</span>}
      </div>
      {children}
    </div>
  );
}

function Select({ label, value, onChange, options }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{ appearance: "none", background: T.panel, border: `1px solid ${T.line}`, borderRadius: 9, padding: "7px 11px", fontSize: 12.5, color: T.ink, cursor: "pointer", fontFamily: "inherit", minWidth: 104 }}>
        {options.map(o => <option key={o} value={o}>{o === "All" ? `All ${label.toLowerCase()}` : o}</option>)}
      </select>
    </label>
  );
}

function StateLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 10 }}>
      {STATES.map(s => (
        <span key={s} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.muted }}>
          <span style={{ width: 10, height: 10, borderRadius: 3, background: SCOLOR[s] }} /> {SLABEL[s]}
        </span>
      ))}
    </div>
  );
}

// horizontal stacked bar of the 5 states for one row
function StateBar({ counts, total }) {
  return (
    <div style={{ display: "flex", height: 20, width: "100%", borderRadius: 5, overflow: "hidden", background: "#EFEBE1" }}>
      {STATES.map(s => counts[s] > 0 && (
        <div key={s} title={`${SLABEL[s]}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: SCOLOR[s] }} />
      ))}
    </div>
  );
}

// per-dimension metric table: coverage / FR usability / failure / review for each value
function DimMetrics({ rows, dimKey, values, label }) {
  const data = values.map(v => {
    const sub = rows.filter(r => r[dimKey] === v);
    if (!sub.length) return null;
    const cc = stateCounts(sub); const ran = ranOf(cc);
    const sc = sub.filter(r => r.score != null);
    return {
      v, n: sub.length,
      coverage: pct(ran, sub.length),
      fr: pct(cc.RanFull, ran),
      fail: pct(cc.Failed, attemptedOf(cc)),
      score: sc.length ? Math.round(sc.reduce((a, r) => a + r.score, 0) / sc.length * 10) / 10 : 0,
    };
  }).filter(Boolean);
  if (!data.length) return <Empty />;
  const cell = (val, scale, label) => (
    <div style={{ display: "flex", alignItems: "center", gap: 6, justifyContent: "flex-end" }}>
      <div style={{ width: 46, height: 6, background: "#EEEAE0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${(val / scale) * 100}%`, height: "100%", background: colorScale(val / scale) }} />
      </div>
      <span style={{ width: 32, textAlign: "right" }}>{label}</span>
    </div>
  );
  const th = { padding: "8px 7px", fontSize: 10, fontWeight: 600, color: T.muted, textTransform: "uppercase", letterSpacing: 0.4, whiteSpace: "nowrap" };
  const td = { padding: "9px 7px", textAlign: "right", fontFamily: mono };
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
      <thead><tr style={{ borderBottom: `1.5px solid ${T.line}` }}>
        <th style={{ ...th, textAlign: "left" }}>{label}</th>
        <th style={{ ...th, textAlign: "right" }}>Tickets</th>
        <th style={{ ...th, textAlign: "right" }}>Coverage</th>
        <th style={{ ...th, textAlign: "right" }}>FR use</th>
        <th style={{ ...th, textAlign: "right" }}>Failure</th>
        <th style={{ ...th, textAlign: "right" }}>Review</th>
      </tr></thead>
      <tbody>
        {data.map((d, i) => (
          <tr key={d.v} style={{ borderBottom: `1px solid ${T.line}`, background: i % 2 ? "#FBFAF6" : "transparent" }}>
            <td style={{ padding: "9px 7px", fontWeight: 600 }}>{d.v}</td>
            <td style={td}>{fmt(d.n)}</td>
            <td style={td}>{cell(d.coverage, 100, `${d.coverage}%`)}</td>
            <td style={td}>{cell(d.fr, 100, `${d.fr}%`)}</td>
            <td style={{ ...td, color: d.fail > 15 ? "#BF453B" : T.ink }}>{d.fail}%</td>
            <td style={td}>{cell(d.score, 10, d.score || "—")}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function HBars({ data, color }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {data.map(d => (
        <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 96, fontSize: 12, color: T.muted, textAlign: "right", flexShrink: 0 }}>{d.name}</span>
          <div style={{ flex: 1, height: 20, background: "#F0EDE4", borderRadius: 5, overflow: "hidden" }}>
            <div style={{ width: `${(d.value / max) * 100}%`, height: "100%", background: d.color || color }} />
          </div>
          <span style={{ width: 42, fontSize: 12, fontFamily: mono, textAlign: "right" }}>{d.suffix ? `${d.value}${d.suffix}` : fmt(d.value)}</span>
        </div>
      ))}
    </div>
  );
}

function SortTable({ rows, cols, defaultSort, rowKey = "org" }) {
  const [sk, setSk] = useState(defaultSort || cols[1]?.k);
  const [dir, setDir] = useState("desc");
  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const av = a[sk], bv = b[sk];
    if (typeof av === "number" && typeof bv === "number") return dir === "desc" ? bv - av : av - bv;
    return dir === "desc" ? String(bv).localeCompare(String(av)) : String(av).localeCompare(String(bv));
  }), [rows, sk, dir]);
  const onSort = (k) => { if (k === sk) setDir(d => d === "desc" ? "asc" : "desc"); else { setSk(k); setDir("desc"); } };
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
        <thead><tr style={{ borderBottom: `1.5px solid ${T.line}` }}>
          {cols.map(c => (
            <th key={c.k} onClick={() => onSort(c.k)} style={{ textAlign: c.align || "right", padding: "9px 9px", fontSize: 10.5, fontWeight: 600, color: sk === c.k ? T.accent : T.muted, textTransform: "uppercase", letterSpacing: 0.4, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
              {c.l}{sk === c.k ? (dir === "desc" ? " ↓" : " ↑") : ""}
            </th>
          ))}
        </tr></thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r[rowKey]} style={{ borderBottom: `1px solid ${T.line}`, background: i % 2 ? "#FBFAF6" : "transparent" }}>
              {cols.map(c => (
                <td key={c.k} style={{ textAlign: c.align || "right", padding: "9px", fontFamily: c.k === rowKey ? "inherit" : mono, color: c.color ? c.color(r[c.k]) : T.ink, fontWeight: c.k === rowKey ? 600 : 500, whiteSpace: "nowrap" }}>
                  {c.render ? c.render(r) : (c.bar
                    ? <BarCell v={r[c.k]} benchmark={c.benchmark} />
                    : (c.k === rowKey ? r[c.k] : (c.suffix ? `${r[c.k]}${c.suffix}` : fmt(r[c.k]))))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function BarCell({ v, benchmark }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
      <div style={{ position: "relative", width: 64, height: 7, background: "#EEEAE0", borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${v}%`, height: "100%", background: colorScale(v / 100) }} />
        {benchmark != null && <div style={{ position: "absolute", left: `${benchmark}%`, top: -2, width: 2, height: 11, background: T.ink }} title={`benchmark ${benchmark}%`} />}
      </div>
      <span style={{ width: 34, textAlign: "right" }}>{v}%</span>
    </div>
  );
}
const devLink = (id) => `https://app.devrev.ai/shipsy/works/${id}`;

/* ================================================================== *
 *  APP
 * ================================================================== */
export default function App() {
  const [range, setRange] = useState({ start: REAL_WIN ? REAL_WIN.start : iso(addDays(TODAY, -30)), end: DATA_MAX });
  const [eligibleOnly, setEligibleOnly] = useState(true);
  const [s, setS] = useState({ org: "All", cohort: "All", pod: "All", sev: "All", stage: "All", channel: "All", state: "All" });
  const set = (k) => (v) => setS(p => ({ ...p, [k]: v }));

  const span = spanDaysOf(range.start, range.end);
  const f = { ...range, eligibleOnly, ...s };
  const cur = useMemo(() => applyFilters(TICKETS, f), [f]);
  const prevWin = useMemo(() => [iso(addDays(new Date(range.start + "T00:00:00Z"), -1 - span)), iso(addDays(new Date(range.start + "T00:00:00Z"), -1))], [range.start, span]);
  const prev = useMemo(() => applyFilters(TICKETS, f, prevWin), [f, prevWin]);
  const excluded = useMemo(() => countWhere(applyFilters(TICKETS, { ...f, eligibleOnly: false }), r => !r.eligible), [f]);

  const setPreset = (n) => setRange({ start: iso(addDays(TODAY, -n)), end: DATA_MAX });
  const isPreset = (n) => range.end === DATA_MAX && range.start === iso(addDays(TODAY, -n));
  const dateLabel = `${fmtLong(range.start)} → ${fmtLong(range.end)}`;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(cur, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `friday-snapshot-${range.start}_to_${range.end}.json`; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, color: T.ink, fontFamily: "'IBM Plex Sans', system-ui, sans-serif", padding: "20px 22px 60px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        select:focus{outline:2px solid ${T.accent}33;}
        ::-webkit-scrollbar{height:8px;width:8px;} ::-webkit-scrollbar-thumb{background:${T.line};border-radius:8px;}
        a{color:inherit;}
      `}</style>

      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: T.accent, display: "grid", placeItems: "center" }}><Bot size={19} color="#fff" /></div>
          <div>
            <h1 style={{ margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: -0.4 }}>Friday — Support Analytics</h1>
            <div style={{ fontSize: 12.5, color: T.muted }}>RCA + first-response coverage, reliability, quality &amp; ticket ops</div>
          </div>
          {USING_REAL
            ? <span title={`DevRev · ${DATASET.count} tickets · ${DATASET.window?.start}→${DATASET.window?.end}`} style={{ fontSize: 10, fontWeight: 600, color: "#2E7D5B", background: "#E7F1EA", border: "1px solid #C5DBCB", padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Live · DevRev</span>
            : <span style={{ fontSize: 10, fontWeight: 600, color: "#B5651D", background: "#FBEFDF", border: "1px solid #F0DBBE", padding: "3px 8px", borderRadius: 20, textTransform: "uppercase", letterSpacing: 0.5 }}>Sample data</span>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.muted, background: T.panel, border: `1px solid ${T.line}`, padding: "7px 12px", borderRadius: 10 }}><Calendar size={13} color={T.accent} /> {dateLabel}</span>
          <button onClick={exportJson} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.ink, background: T.panel, border: `1px solid ${T.line}`, padding: "8px 12px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit" }}><Download size={13} /> Snapshot</button>
        </div>
      </div>

      {/* CONTROLS */}
      <div style={{ ...card, display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 14, padding: 14 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontSize: 10, color: T.faint, textTransform: "uppercase", letterSpacing: 0.5 }}>Date range — exact</span>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <input type="date" value={range.start} min={DATA_MIN} max={range.end}
              onChange={e => e.target.value && setRange(r => ({ ...r, start: e.target.value }))}
              style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 9, padding: "6px 10px", fontSize: 12.5, color: T.ink, fontFamily: "inherit", cursor: "pointer" }} />
            <span style={{ color: T.faint }}>→</span>
            <input type="date" value={range.end} min={range.start} max={DATA_MAX}
              onChange={e => e.target.value && setRange(r => ({ ...r, end: e.target.value }))}
              style={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 9, padding: "6px 10px", fontSize: 12.5, color: T.ink, fontFamily: "inherit", cursor: "pointer" }} />
            <div style={{ display: "flex", gap: 3, marginLeft: 4 }}>
              {[{ l: "7d", v: 7 }, { l: "30d", v: 30 }, { l: "90d", v: 90 }].map(d => (
                <button key={d.v} onClick={() => setPreset(d.v)} style={{ border: `1px solid ${isPreset(d.v) ? T.accent : T.line}`, background: isPreset(d.v) ? T.accent : T.panel, color: isPreset(d.v) ? "#fff" : T.muted, borderRadius: 8, padding: "6px 10px", fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>{d.l}</button>
              ))}
            </div>
          </div>
        </div>
        <Select label="Org" value={s.org} onChange={set("org")} options={["All", ...D_ORGS]} />
        <Select label="Cohort" value={s.cohort} onChange={set("cohort")} options={["All", ...D_COHORTS]} />
        <Select label="Pod" value={s.pod} onChange={set("pod")} options={["All", ...D_PODS]} />
        <Select label="Severity" value={s.sev} onChange={set("sev")} options={["All", ...D_SEVS]} />
        <Select label="Stage" value={s.stage} onChange={set("stage")} options={["All", ...D_STAGES]} />
        <Select label="Channel" value={s.channel} onChange={set("channel")} options={["All", ...D_CHANNELS]} />
        <Select label="Outcome" value={s.state} onChange={set("state")} options={["All", ...STATES]} />
        <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: T.muted, cursor: "pointer", paddingBottom: 4 }}>
          <input type="checkbox" checked={eligibleOnly} onChange={e => setEligibleOnly(e.target.checked)} />
          Eligible only <span style={{ fontFamily: mono, color: T.faint }}>({fmt(excluded)} excluded)</span>
        </label>
      </div>

      <Overview cur={cur} prev={prev} range={range} span={span} eligibleOnly={eligibleOnly} />

      <p style={{ marginTop: 26, fontSize: 11.5, color: T.faint, textAlign: "center" }}>
        {USING_REAL
          ? `Live DevRev data · ${DATASET.count} tickets · ${DATASET.window?.start}→${DATASET.window?.end} · generated ${DATASET.generatedAt?.slice(0, 10)}. Outcome states reconstructed from Friday's ticket comments; score = Friday confidence/quality (no separate human-review feed yet).`
          : "Illustrative sample data."}{" "}
        Coverage = (Ran · RCA+FR + Ran · RCA only) ÷ {eligibleOnly ? "eligible" : "all"} tickets. Deltas compare the selected window to the immediately preceding one.
      </p>
    </div>
  );
}

/* ----- shared outcome counting ----- */
function stateCounts(rows) {
  const c = { RanFull: 0, RanRCAOnly: 0, Skipped: 0, Failed: 0, NeverTriggered: 0 };
  rows.forEach(r => { c[r.outcome]++; }); return c;
}
const ranOf = (c) => c.RanFull + c.RanRCAOnly;
const attemptedOf = (c) => c.RanFull + c.RanRCAOnly + c.Skipped + c.Failed;

/* ================================================================== *
 *  TAB — OVERVIEW
 * ================================================================== */
function Overview({ cur, prev, range, span }) {
  const c = stateCounts(cur), pc = stateCounts(prev);
  const cov = pct(ranOf(c), cur.length), covPrev = pct(ranOf(pc), prev.length);
  const frUse = pct(c.RanFull, ranOf(c)), frPrev = pct(pc.RanFull, ranOf(pc));
  const failRate = pct(c.Failed, attemptedOf(c)), failPrev = pct(pc.Failed, attemptedOf(pc));
  const score = cur.filter(r => r.score != null); const avg = score.length ? Math.round(score.reduce((a, r) => a + r.score, 0) / score.length * 10) / 10 : 0;
  const orgsRun = new Set(cur.filter(r => RAN.includes(r.outcome)).map(r => r.org)).size;

  const trend = daily(cur, range.start, range.end, (b, r) => { b[r.outcome]++; });

  const leaderboard = D_ORGS.map(o => {
    const sub = cur.filter(r => r.org === o); const cc = stateCounts(sub);
    const sc = sub.filter(r => r.score != null);
    return {
      org: o, n: sub.length, coverage: pct(ranOf(cc), sub.length),
      full: pct(cc.RanFull, sub.length), fail: pct(cc.Failed, attemptedOf(cc) || 1),
      score: sc.length ? Math.round(sc.reduce((a, r) => a + r.score, 0) / sc.length * 10) / 10 : 0,
    };
  }).filter(r => r.n > 0);


  return (
    <>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 16 }}>
        <KPI icon={Building2} label="Orgs run on" value={orgsRun} sub={`of ${D_ORGS.length}`} />
        <KPI icon={Gauge} label="Coverage" value={`${cov}%`} delta={Math.round((cov - covPrev) * 10) / 10} deltaGood="up" sub="ran ÷ eligible" />
        <KPI icon={Ticket} label="FR usability" value={`${frUse}%`} delta={Math.round((frUse - frPrev) * 10) / 10} deltaGood="up" sub="RCA+FR ÷ ran" color="#2E7D5B" />
        <KPI icon={AlertTriangle} label="Failure rate" value={`${failRate}%`} delta={Math.round((failRate - failPrev) * 10) / 10} deltaGood="down" sub="failed ÷ attempted" color="#BF453B" />
        <KPI icon={Star} label="Avg review" value={avg || "—"} sub="human score /10" color="#C9A227" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
        <Panel title="Outcome mix" icon={Activity} foot={`${fmt(cur.length)} tickets`}>
          <div style={{ display: "flex", height: 14, borderRadius: 6, overflow: "hidden", gap: 2, marginBottom: 18 }}>
            {STATES.map(st => c[st] > 0 && (
              <div key={st} title={`${SLABEL[st]}: ${pct(c[st], cur.length)}%`} style={{ width: `${pct(c[st], cur.length)}%`, background: SCOLOR[st] }} />
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {STATES.map(st => {
              const v = c[st], p = pct(v, cur.length);
              return (
                <div key={st} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, width: 128, flexShrink: 0 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 3, background: SCOLOR[st], flexShrink: 0 }} />
                    <span style={{ fontSize: 12.5, color: T.muted }}>{SLABEL[st]}</span>
                  </div>
                  <div style={{ flex: 1, height: 22, background: "#F0EDE4", borderRadius: 6, overflow: "hidden" }}>
                    <div style={{ width: `${p}%`, height: "100%", background: SCOLOR[st], borderRadius: 6 }} />
                  </div>
                  <span style={{ width: 40, fontFamily: mono, fontSize: 13.5, fontWeight: 600, textAlign: "right" }}>{fmt(v)}</span>
                  <span style={{ width: 44, fontFamily: mono, fontSize: 12, color: T.faint, textAlign: "right" }}>{p}%</span>
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Outcomes over time" icon={Activity}>
          <div style={{ height: 230 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trend} margin={{ top: 6, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={T.line} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: T.muted, fontFamily: mono }} axisLine={{ stroke: T.line }} tickLine={false} interval={tickStep(span + 1)} minTickGap={6} />
                <YAxis tick={{ fontSize: 11, fill: T.muted, fontFamily: mono }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: T.panel, border: `1px solid ${T.line}`, borderRadius: 8, fontSize: 12 }} />
                {STATES.map(st => <Area key={st} type="monotone" dataKey={st} name={SLABEL[st]} stackId="1" stroke={SCOLOR[st]} fill={SCOLOR[st]} fillOpacity={0.85} />)}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <StateLegend />
        </Panel>
      </div>

      <Panel title="Org leaderboard" icon={Building2} foot={`benchmark tick = overall ${cov}%`}>
        <SortTable rows={leaderboard} defaultSort="n" cols={[
          { k: "org", l: "Organisation", align: "left" },
          { k: "n", l: "Tickets" },
          { k: "coverage", l: "Coverage", bar: true, benchmark: cov },
          { k: "full", l: "RCA+FR %", suffix: "%" },
          { k: "fail", l: "Fail %", suffix: "%", color: (v) => v > 15 ? "#BF453B" : T.ink },
          { k: "score", l: "Avg score /10", render: (r) => (
            <div style={{ display: "flex", alignItems: "center", gap: 7, justifyContent: "flex-end" }}>
              <div style={{ width: 60, height: 7, background: "#EEEAE0", borderRadius: 4, overflow: "hidden" }}>
                <div style={{ width: `${r.score * 10}%`, height: "100%", background: colorScale(r.score / 10) }} />
              </div>
              <span style={{ width: 26, textAlign: "right" }}>{r.score || "—"}</span>
            </div>
          ) },
        ]} />
      </Panel>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 16 }}>
        <Panel title="By severity" icon={AlertTriangle}>
          <DimMetrics rows={cur} dimKey="sev" values={D_SEVS} label="Severity" />
        </Panel>
        <Panel title="By cohort" icon={Building2}>
          <DimMetrics rows={cur} dimKey="cohort" values={D_COHORTS} label="Cohort" />
        </Panel>
      </div>

      <div style={{ height: 14 }} />
      <Panel title="By stage" icon={Layers} foot="coverage · FR use · failure colour at >15% · review /10">
        <DimMetrics rows={cur} dimKey="stage" values={D_STAGES} label="Stage" />
      </Panel>
    </>
  );
}

const Empty = () => <div style={{ color: T.faint, fontSize: 12.5, padding: "8px 0" }}>No records in this window.</div>;
