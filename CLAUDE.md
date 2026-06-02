# Friday — Support Analytics Dashboard

Single-screen analytics for the Friday support agent: RCA + first-response coverage,
reliability, and quality, sliceable by org, severity, cohort, pod, stage, and channel
over an exact date range.

- Frontend: Vite + React (`src/App.jsx`). `npm run dev` to start, `npm run build` for a
  static bundle. Loads `src/data/friday-dataset.json` when it has rows ("Live · DevRev"
  badge); otherwise falls back to the built-in sample generator (`SAMPLE_TICKETS`).
- Data pipeline (static): `npm run data` runs `scripts/build-dataset.mjs`, which pulls
  DevRev tickets (REST + `DEVREV_TOKEN`), classifies each ticket's Friday outcome from its
  comments, normalises fields into the dashboard vocabulary, and writes the dataset JSON.
  Window is configurable: `WINDOW_DAYS=90 npm run data` (default 30); `MAX_TICKETS`,
  `CONCURRENCY` also supported. Re-run to refresh — there is no live server.
  Classification rules + known gaps: `.claude/rules/devrev-friday.md`.

## DevRev

DevRev is the **source of truth** for all ticket / SLA / sentiment / cohort data.

- MCP server is defined in [`.mcp.json`](.mcp.json) (`devrev` → https://mcp.devrev.ai/mcp).
  Run `/mcp` to connect/authenticate. Org: `dvrv-us-1`, `devo/xXjPo9nF`.
- Org field reference (DONs, stages, custom fields, cohorts, pods, groups, SLA) lives in
  [`.claude/rules/devrev-api.md`](.claude/rules/devrev-api.md).
- Analysis conventions (pagination, status mapping, breakdown dimensions) live in
  [`.claude/rules/devrev-analysis.md`](.claude/rules/devrev-analysis.md).
- `DEVREV_TOKEN` (in gitignored `.env`) is a PAT for scripts hitting the DevRev REST API.
- **No-fabrication rule:** only report what the DevRev API actually returns. Never
  estimate or invent ticket data; if a field is empty or missing, say so explicitly.
