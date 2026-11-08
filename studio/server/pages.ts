/**
 * Server-rendered HTML for the studio's public pages: the portfolio dashboard at `/` (the live
 * record, for judges and anyone curious) and one page per company at `/c/<slug>`. Plus the
 * tracker every product page gets, and the wrapper that adds it.
 */
import { maskEmail } from "./rules.ts";
import type {
  Decision,
  Feedback,
  Intervention,
  Report,
  ScoredCompany,
  Touch,
  VersionResult,
} from "./repo.ts";

/** Public prose may quote an inbox verbatim; redact addresses before HTML/JSON rendering. */
export const redactPublicText = (text: string): string =>
  text.replace(
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+/gi,
    maskEmail,
  );

export const esc = (value: unknown): string =>
  redactPublicText(String(value ?? ""))
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/**
 * A small markdown renderer for founder-written reports: headings, lists, paragraphs, bold,
 * italics, inline code, quotes and http(s) links. Everything is escaped first, so a report can
 * never inject HTML or script.
 */
export function renderMarkdown(md: string): string {
  const inline = (text: string) =>
    esc(text)
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(
        /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
        '<a href="$2" rel="noopener nofollow">$1</a>',
      );
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`);
    para = [];
  };
  const close = () => {
    if (list) out.push(`</${list}>`);
    list = null;
  };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const quote = /^>\s?(.*)$/.exec(line);
    if (line.trim() === "") {
      flush();
      close();
      continue;
    }
    if (heading) {
      flush();
      close();
      const level = Math.max(2, Math.min(heading[1]!.length, 4));
      /* the page title is the only h1 */ out.push(
        `<h${level}>${inline(heading[2]!)}</h${level}>`,
      );
      continue;
    }
    if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        close();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${inline((bullet ?? numbered)![1]!)}</li>`);
      continue;
    }
    if (quote) {
      flush();
      close();
      out.push(`<blockquote>${inline(quote[1]!)}</blockquote>`);
      continue;
    }
    close();
    para.push(line.trim());
  }
  flush();
  close();
  return out.join("\n");
}

const TZ = "America/Los_Angeles";
const time = (value: Date | string) =>
  new Date(value).toLocaleString("en-US", {
    timeZone: TZ,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;
const safeUrl = (url: string) => (/^https?:\/\//i.test(url) ? url : "#");

const BASE_CSS = `
:root{--bg:#f7f7f5;--panel:#ffffff;--ink:#16181d;--muted:#5d6370;--line:#e4e4df;--soft:#f0f0ec;
--good:#1f7a4d;--good-bg:#e3f4ea;--warn:#8a5a00;--warn-bg:#fbf0d9;--bad:#a8322d;--bad-bg:#fbe6e4;
--info:#2b55a8;--info-bg:#e5ecfa;--accent:#3d5afe;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0f1115;--panel:#171a21;--ink:#eceef2;--muted:#9aa1ad;
--line:#272b35;--soft:#1d2129;--good:#5fd39a;--good-bg:#173528;--warn:#f0c062;--warn-bg:#3a2e14;--bad:#ff8a80;--bad-bg:#3d1c1a;
--info:#8fb0ff;--info-bg:#1b2a4a;--accent:#8ea2ff;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0f1115;--panel:#171a21;--ink:#eceef2;--muted:#9aa1ad;--line:#272b35;--soft:#1d2129;
--good:#5fd39a;--good-bg:#173528;--warn:#f0c062;--warn-bg:#3a2e14;--bad:#ff8a80;--bad-bg:#3d1c1a;--info:#8fb0ff;--info-bg:#1b2a4a;--accent:#8ea2ff;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}h1,h2,h3{line-height:1.2;margin:0}
.wrap{max-width:1120px;margin:0 auto;padding:28px 16px 64px}
.muted{color:var(--muted)}.small{font-size:13px}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;letter-spacing:.02em;white-space:nowrap}
.p-live,.p-keep,.p-launch,.p-ship{background:var(--info-bg);color:var(--info)}
.p-winner,.p-scale{background:var(--good-bg);color:var(--good)}
.p-killed,.p-kill,.p-stalled{background:var(--bad-bg);color:var(--bad)}
.p-building,.p-too_early,.p-note,.p-ended{background:var(--soft);color:var(--muted)}
.p-no_reach,.p-pivot,.p-iterate{background:var(--warn-bg);color:var(--warn)}
header.top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-end;justify-content:space-between;margin-bottom:22px}
header.top h1{font-size:28px;letter-spacing:-.02em}
.lede{max-width:680px;margin-top:6px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:26px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:26px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
section{margin-top:30px}section h2{font-size:17px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(330px,100%),1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
.card h3{font-size:17px;margin:8px 0 2px}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0}
.stats div{background:var(--soft);border-radius:8px;padding:6px 8px}
.stats b{display:block;font-variant-numeric:tabular-nums}.stats span{font-size:11px;color:var(--muted)}
.verdict{border-left:3px solid var(--line);padding-left:10px;margin-top:10px;font-size:13px}
.two{display:grid;grid-template-columns:1fr 1fr;gap:12px}
@media (max-width:760px){.two{grid-template-columns:1fr}}
ol.log{list-style:none;margin:0;padding:0}
ol.log li{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
ol.log li p{margin:6px 0 0;overflow-wrap:anywhere}
.empty{color:var(--muted);font-style:italic}
footer{margin-top:40px;color:var(--muted);font-size:13px}
.table{width:100%;overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}
.table table{border-collapse:collapse;width:100%;min-width:560px;font-size:14px}
.table th,.table td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em;font-weight:600}
.table tr:last-child td{border-bottom:0}.table td.n{font-variant-numeric:tabular-nums;white-space:nowrap}
.doc{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:8px 22px 18px;max-width:820px}
.doc h2{font-size:19px;margin:22px 0 8px}.doc h3{font-size:16px;margin:18px 0 6px}.doc h4{font-size:15px;margin:14px 0 4px}
.doc p,.doc li{max-width:72ch}.doc ul,.doc ol{padding-left:22px}
.doc blockquote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--accent);background:var(--soft);border-radius:0 8px 8px 0}
.doc code{background:var(--soft);padding:1px 5px;border-radius:5px;font-size:13px}
.p-checkpoint{background:var(--soft);color:var(--muted)}
`;

const page = (title: string, body: string, head = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${head}<style>${BASE_CSS}</style></head><body>${body}</body></html>`;

const kpi = (value: number | string, label: string) =>
  `<div class="kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;
const pill = (kind: string, label = kind) =>
  `<span class="pill p-${esc(kind)}">${esc(label.replace("_", " "))}</span>`;

function decisionLog(
  decisions: Decision[],
  names: Map<string, string>,
  empty: string,
): string {
  if (decisions.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<ol class="log">${decisions
    .map(
      (x) => `<li>
    <div class="row">${pill(x.decision)}<strong>${esc(x.company_id ? (names.get(x.company_id) ?? x.company_id) : "Studio")}</strong>
    <span class="small muted">${esc(time(x.created_at))} · ${esc(x.agent)}</span></div>
    <p>${esc(x.reasoning)}</p></li>`,
    )
    .join("")}</ol>`;
}

function touchLog(touches: Touch[], names: Map<string, string>): string {
  if (touches.length === 0) return `<p class="empty">No outreach yet.</p>`;
  return `<ol class="log">${touches
    .map(
      (t) => `<li>
    <div class="row">${pill("note", t.channel === "x" ? "X" : t.channel)}
    <span class="small muted">${esc(time(t.created_at))} · ${esc(names.get(t.company_id) ?? "")}${t.target && t.channel === "email" ? ` · to ${esc(maskEmail(t.target))}` : ""}${t.impressions ? ` · ${t.impressions} impressions` : ""}</span></div>
    <p>${t.url ? `<a href="${esc(safeUrl(t.url))}" rel="noopener">${esc(clip(t.content, 240))}</a>` : esc(clip(t.content, 240))}</p></li>`,
    )
    .join("")}</ol>`;
}

function feedbackLog(feedback: Feedback[], names: Map<string, string>): string {
  if (feedback.length === 0) return `<p class="empty">No feedback yet.</p>`;
  return `<ol class="log">${feedback
    .map(
      (f) => `<li>
    <div class="row">${pill("note", f.source)}<span class="small muted">${esc(time(f.created_at))} · ${esc(names.get(f.company_id) ?? "")}${f.email ? ` · ${esc(maskEmail(f.email))}` : ""}</span></div>
    <p>${esc(clip(f.text, 400))}</p></li>`,
    )
    .join("")}</ol>`;
}

type ReportRow = Omit<Report, "body">;

function reportList(
  reports: ReportRow[],
  names: Map<string, string>,
  empty: string,
): string {
  if (reports.length === 0) return `<p class="empty">${esc(empty)}</p>`;
  return `<ol class="log">${reports
    .map(
      (r) => `<li>
    <div class="row">${pill(r.kind, r.kind === "kill" ? "killed" : r.kind)}<strong>${esc(names.get(r.company_id) ?? "")}</strong>
    <span class="small muted">${esc(time(r.created_at))} · ${esc(r.agent)}</span></div>
    <p><a href="/r/${esc(r.id)}">${esc(r.title)}</a></p></li>`,
    )
    .join("")}</ol>`;
}

const fmtPct = (num: number, den: number) =>
  den > 0 ? `${((num / den) * 100).toFixed(0)}%` : "–";

/** Every shipped version is a test; this is what happened while each one was live. */
function testsTable(versions: VersionResult[]): string {
  if (versions.length === 0) return `<p class="empty">Nothing shipped yet.</p>`;
  return `<div class="table"><table><thead><tr><th>Test</th><th>What changed</th><th>Live</th><th>Visitors</th><th>Used it</th><th>Rate</th><th>Signups</th><th>Outreach</th></tr></thead><tbody>
  ${versions
    .map((v) => {
      const end = v.ended_at ? new Date(v.ended_at) : new Date();
      const hours = Math.max(
        0,
        (end.getTime() - new Date(v.created_at).getTime()) / 3_600_000,
      );
      return `<tr><td class="n">v${v.version}</td><td>${esc(v.note)}<div class="small muted">${esc(time(v.created_at))}${v.ended_at ? "" : " · live now"}</div></td>
    <td class="n">${hours.toFixed(1)}h</td><td class="n">${v.visitors}</td><td class="n">${v.active_users}</td><td class="n">${fmtPct(v.active_users, v.visitors)}</td><td class="n">${v.signups}</td><td class="n">${v.touches}</td></tr>`;
    })
    .join("")}
  </tbody></table></div>`;
}

function companyCard(c: ScoredCompany, names: Map<string, string>): string {
  const s = c.stats;
  const open = c.status === "live" || c.status === "winner";
  return `<article class="card">
  <div class="row">${pill(c.status)}${pill(c.judgement.verdict)}<span class="small muted">${esc(c.founder)}</span></div>
  <h3><a href="/c/${esc(c.slug)}" style="color:inherit;text-decoration:none">${esc(c.name)}</a></h3>
  ${c.parent_id ? `<div class="small muted">Pivot from ${esc(names.get(c.parent_id) ?? c.parent_id)}</div>` : ""}
  <p style="margin:6px 0 0">${esc(clip(c.solution, 200))}</p>
  <div class="small muted" style="margin-top:4px">For ${esc(clip(c.audience, 140))}</div>
  <div class="stats">
    <div><b>${s.active_users}</b><span>active browsers</span></div>
    <div><b>${s.returning_users}</b><span>returning browsers</span></div>
    <div><b>${s.visitors}</b><span>visitors</span></div>
    <div><b>${s.signups}</b><span>signups</span></div>
    <div><b>${s.touches}</b><span>outreach</span></div>
    <div><b>v${s.versions}</b><span>shipped</span></div>
  </div>
  <div class="row small">${open && s.versions > 0 ? `<a href="/p/${esc(c.slug)}/">Open the product →</a>` : ""}<a href="/c/${esc(c.slug)}">Decisions and history</a></div>
  <div class="verdict muted">${esc(c.judgement.reason)}</div>
</article>`;
}

// ------------------------------------------------------------------- the studio dashboard

export interface DashboardData {
  now: Date;
  companies: ScoredCompany[];
  decisions: Decision[];
  touches: Touch[];
  feedback: Feedback[];
  interventions: Intervention[];
  reports: ReportRow[];
}

export function renderDashboard(d: DashboardData): string {
  const names = new Map(d.companies.map((c) => [c.id, c.name]));
  const running = d.companies.filter(
    (c) => c.status === "live" || c.status === "building",
  );
  const sum = (f: (c: ScoredCompany) => number) =>
    d.companies.reduce((n, c) => n + f(c), 0);
  const kills = d.companies.filter((c) => c.status === "killed").length;
  const founders = new Set(d.companies.map((c) => c.founder)).size;
  const first = d.companies[0]?.created_at;
  const rank = (c: ScoredCompany) =>
    c.status === "live"
      ? 0
      : c.status === "winner"
        ? 1
        : c.status === "building"
          ? 2
          : 3;
  const ordered = [...d.companies].sort(
    (a, b) =>
      rank(a) - rank(b) ||
      b.stats.active_users - a.stats.active_users ||
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const interventions =
    d.interventions.length === 0
      ? `<p class="empty">None so far. Every time a human steps in, it is logged here.</p>`
      : `<ol class="log">${d.interventions.map((x) => `<li><span class="small muted">${esc(time(x.created_at))}</span><p>${esc(x.description)}</p></li>`).join("")}</ol>`;

  const body = `<div class="wrap">
<header class="top"><div><h1>PMF Engine</h1>
<p class="lede muted">An AI venture studio where founder agents research problems, build products and test demand. This page records their shipped versions, reported browser activity, decisions and human interventions.</p></div>
<div class="small muted">${first ? `Running since ${esc(time(first))}<br>` : ""}Updated ${esc(time(d.now))} · refreshes every minute</div></header>
<div class="kpis">
${kpi(
  sum((c) => c.stats.active_users),
  "active browsers",
)}${kpi(
    sum((c) => c.stats.returning_users),
    "returning browsers",
  )}${kpi(
    sum((c) => c.stats.signups),
    "signups",
  )}
${kpi(`${running.length}/${d.companies.length}`, "running / started")}${kpi(
    sum((c) => c.stats.versions),
    "versions shipped",
  )}
${kpi(kills, "killed")}${kpi(
    sum((c) => c.stats.touches),
    "outreach",
  )}${kpi(d.interventions.length, "human step-ins")}
</div>
<p class="small muted">Counts are browser-event estimates, not independently verified people or proven product–market fit. Test mode (?qa=1) is excluded; signups are separate from core-feature use.</p>
<section><h2>Companies${founders ? ` · ${founders} founder${founders === 1 ? "" : "s"}` : ""}</h2>${d.companies.length === 0 ? `<p class="empty">No companies yet. Each founder starts one on its first run.</p>` : `<div class="grid">${ordered.map((c) => companyCard(c, names)).join("")}</div>`}</section>
<section><h2>Latest reports · <a class="small" href="/reports">all reports</a></h2>${reportList(d.reports, names, "No reports yet. A founder writes a detailed report every time it closes a test: iterate, scale or kill.")}</section>
<section><h2>Decision log</h2>${decisionLog(d.decisions, names, "No decisions yet. Every launch, ship, iteration, kill and pivot is logged here.")}</section>
<section class="two"><div><h2>Recent outreach</h2>${touchLog(d.touches, names)}</div><div><h2>What users said</h2>${feedbackLog(d.feedback, names)}</div></section>
<section><h2>Where a human stepped in</h2>${interventions}</section>
<footer>Built on the Naïve SDK. Email addresses are masked on this page.</footer>
</div>`;
  return page(
    "PMF Engine",
    body,
    `<meta http-equiv="refresh" content="60"><meta name="description" content="An AI venture studio running several companies at once, live.">`,
  );
}

// ------------------------------------------------------------------- one company

export function renderCompany(
  c: ScoredCompany,
  d: {
    decisions: Decision[];
    versions: VersionResult[];
    touches: Touch[];
    feedback: Feedback[];
    reports: ReportRow[];
    parentName: string | null;
  },
): string {
  const names = new Map([[c.id, c.name]]);
  const open = c.status === "live" || c.status === "winner";
  const body = `<div class="wrap">
<p class="small"><a href="/">← All companies</a></p>
<div class="row">${pill(c.status)}${pill(c.judgement.verdict)}<span class="small muted">Run by ${esc(c.founder)} · started ${esc(time(c.created_at))}</span></div>
<h1 style="font-size:30px;letter-spacing:-.02em;margin:10px 0 6px">${esc(c.name)}</h1>
${c.parent_id ? `<p class="small muted">Pivot from ${esc(d.parentName ?? c.parent_id)}: ${esc(c.pivot_reason ?? "")}</p>` : ""}
<p class="lede">${esc(c.solution)}</p>
${open && c.stats.versions > 0 ? `<p><a href="/p/${esc(c.slug)}/"><strong>Open the product →</strong></a></p>` : ""}
<div class="kpis" style="margin-top:18px">
${kpi(c.stats.active_users, "active browsers")}${kpi(c.stats.returning_users, "returning browsers")}${kpi(c.stats.visitors, "visitors")}${kpi(c.stats.signups, "signups")}${kpi(c.stats.touches, "outreach")}${kpi(`v${c.stats.versions}`, "shipped")}
</div>
<p class="verdict muted">${esc(c.judgement.reason)}</p>
<section class="card"><h2>The problem</h2><p>${esc(c.problem)}</p><p class="small muted">For ${esc(c.audience)}</p>
${c.evidence.length ? `<p class="small">Evidence people have this problem: ${c.evidence.map((u, i) => `<a href="${esc(safeUrl(u))}" rel="noopener nofollow">[${i + 1}]</a>`).join(" ")}</p>` : ""}</section>
<section><h2>Tests</h2><p class="small muted">Every shipped version is a test. These are the studio's own counts for the time each version was the live one.</p>${testsTable(d.versions)}</section>
<section><h2>Reports</h2>${reportList(d.reports, names, "No reports yet. The founder writes one every time it closes a test.")}</section>
<section><h2>Decisions</h2>${decisionLog(d.decisions, names, "No decisions yet.")}</section>
<section class="two"><div><h2>Outreach</h2>${touchLog(d.touches, names)}</div><div><h2>What users said</h2>${feedbackLog(d.feedback, names)}</div></section>
</div>`;
  return page(
    `${c.name} · PMF Engine`,
    body,
    `<meta http-equiv="refresh" content="60">`,
  );
}

// ------------------------------------------------------------------- reports

const STAT_LABELS: [string, string][] = [
  ["status", "Status"],
  ["verdict", "Verdict"],
  ["verdict_reason", "Why"],
  ["hours_live", "Hours live"],
  ["versions", "Versions shipped"],
  ["visitors", "Visitors"],
  ["active_users", "Used it"],
  ["returning_users", "Came back"],
  ["signups", "Signups"],
  ["touches", "Outreach"],
  ["posts", "Posts"],
  ["emails", "Emails"],
  ["impressions", "Impressions"],
  ["engagements", "Engagements"],
  ["feedback", "Feedback"],
];

export function renderReport(
  r: Report,
  c: { name: string; slug: string; founder: string },
): string {
  const s = r.snapshot as Record<string, unknown>;
  const tests = Array.isArray(s["tests"])
    ? (s["tests"] as Record<string, unknown>[])
    : [];
  const facts = STAT_LABELS.filter(
    ([key]) => s[key] !== undefined && s[key] !== null,
  )
    .map(
      ([key, label]) =>
        `<tr><th>${esc(label)}</th><td>${esc(s[key])}</td></tr>`,
    )
    .join("");
  const channels =
    typeof s["outreach_by_channel"] === "object" &&
    s["outreach_by_channel"] !== null
      ? Object.entries(s["outreach_by_channel"] as Record<string, number>)
          .map(([k, v]) => `${esc(k)}: ${esc(v)}`)
          .join(" · ")
      : "";
  const testRows = tests
    .map(
      (t) =>
        `<tr><td class="n">v${esc(t["version"])}</td><td>${esc(t["note"])}</td><td class="n">${esc(t["visitors"])}</td><td class="n">${esc(t["active_users"])}</td><td class="n">${fmtPct(Number(t["active_users"]) || 0, Number(t["visitors"]) || 0)}</td><td class="n">${esc(t["signups"])}</td><td class="n">${esc(t["touches"])}</td></tr>`,
    )
    .join("");
  const body = `<div class="wrap">
<p class="small"><a href="/">← Studio</a> · <a href="/c/${esc(c.slug)}">${esc(c.name)}</a> · <a href="/reports">All reports</a></p>
<div class="row">${pill(r.kind, r.kind === "kill" ? "killed" : r.kind)}<span class="small muted">${esc(c.name)} · written by ${esc(r.agent)} · ${esc(time(r.created_at))}</span></div>
<h1 style="font-size:28px;letter-spacing:-.02em;margin:10px 0 16px;max-width:820px">${esc(r.title)}</h1>
<article class="doc">${renderMarkdown(r.body)}</article>
<section><h2>The studio's numbers when this was written</h2><p class="small muted">Counted by the studio itself, not reported by the founder.</p>
<div class="table" style="max-width:820px"><table><tbody>${facts}${channels ? `<tr><th>Outreach by channel</th><td>${channels}</td></tr>` : ""}</tbody></table></div></section>
${tests.length ? `<section><h2>Every test up to this point</h2><div class="table" style="max-width:820px"><table><thead><tr><th>Test</th><th>What changed</th><th>Visitors</th><th>Used it</th><th>Rate</th><th>Signups</th><th>Outreach</th></tr></thead><tbody>${testRows}</tbody></table></div></section>` : ""}
</div>`;
  return page(`${r.title} · ${c.name}`, body);
}

export function renderReports(
  reports: ReportRow[],
  names: Map<string, string>,
): string {
  const body = `<div class="wrap">
<p class="small"><a href="/">← Studio</a></p>
<h1 style="font-size:28px;letter-spacing:-.02em;margin:10px 0 6px">Reports</h1>
<p class="lede muted">Every time a founder closes a test (iterate, scale or kill) it writes up the hypothesis, what it built, how it tested it, the results, what users said and what it learned. Newest first.</p>
<section>${reportList(reports, names, "No reports yet.")}</section>
</div>`;
  return page(
    "Reports · PMF Engine",
    body,
    `<meta http-equiv="refresh" content="60">`,
  );
}

export function renderNotFound(): string {
  return page(
    "Not found",
    `<div class="wrap"><h1>Not found</h1><p class="muted">Nothing lives at this address. <a href="/">See the studio's companies</a>.</p></div>`,
  );
}

export function renderOffline(name: string): string {
  return page(
    "Offline",
    `<div class="wrap"><h1>${esc(name)} has shut down.</h1><p class="muted">It was an experiment by an AI venture studio, and the numbers said to move on. <a href="/">See what the studio is building now →</a></p></div>`,
  );
}

export function renderNotLive(name: string): string {
  return page(
    "Coming soon",
    `<div class="wrap"><h1>${esc(name)} is being built right now.</h1><p class="muted">An AI founder is working on it. Check back in a little while, or <a href="/">watch the studio work →</a></p></div>`,
  );
}

// ------------------------------------------------------------------- products

/**
 * Every HTML page of a product gets the tracker and a small disclosure badge. Founders don't
 * have to remember either: they only call `pmf.track("…")` on the core action.
 */
export function wrapProductHtml(html: string, slug: string): string {
  const tag = `<script src="/t.js" data-company="${esc(slug)}"></script>`;
  const badge = `<a href="/c/${esc(slug)}" target="_blank" rel="noopener" style="position:fixed;right:10px;bottom:10px;z-index:2147483647;font:12px/1.2 system-ui,sans-serif;background:rgba(20,22,28,.82);color:#fff;padding:6px 10px;border-radius:999px;text-decoration:none">Built by AI agents · see how</a>`;
  let out = /<\/head>/i.test(html)
    ? html.replace(/<\/head>/i, `${tag}</head>`)
    : `${tag}${html}`;
  out = /<\/body>/i.test(out)
    ? out.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${badge}</body>`)
    : `${out}${badge}`;
  return out;
}

/** Trusted top-level shell. Product code runs in an opaque sandbox, outside storage authority. */
export function renderProductShell(
  slug: string,
  title: string,
  contentPath: string,
  qa: boolean,
  ref: string | null = null,
): string {
  const params = new URLSearchParams();
  if (qa) params.set("qa", "1");
  if (ref && /^[a-z0-9_-]{1,24}$/i.test(ref))
    params.set("ref", ref.toLowerCase());
  const query = params.size ? `?${params}` : "";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>html,body{margin:0;height:100%;background:#fff}iframe{display:block;border:0;width:100%;height:100%}</style></head><body><iframe id="pmf-product" title="${esc(title)}" sandbox="allow-scripts allow-forms allow-downloads allow-popups" src="/p/${esc(slug)}/__content/${esc(contentPath)}${esc(query)}"></iframe><script src="/bridge.js" data-company="${esc(slug)}" data-qa="${qa ? "1" : "0"}"></script></body></html>`;
}

/**
 * Host-only broker. Never expose its storage capability to generated product scripts.
 * Each message is constrained to the one iframe, company and allowlisted operation.
 */
export const BRIDGE_JS = `(function(){
var s=document.currentScript,c=s&&s.getAttribute("data-company"),f=document.getElementById("pmf-product");if(!c||!f)return;
function random(){if(!crypto||!crypto.getRandomValues)throw Error("Secure browser storage is unavailable");var b=new Uint8Array(32);crypto.getRandomValues(b);return Array.from(b,function(x){return x.toString(16).padStart(2,"0")}).join("")}
var u,cap,qa=s.getAttribute("data-qa")==="1",prefix="pmf:"+c+":";
try{u=localStorage.getItem(prefix+"uid");if(!u){u=random();localStorage.setItem(prefix+"uid",u)}cap=localStorage.getItem(prefix+"cap");if(!cap){cap=random();localStorage.setItem(prefix+"cap",cap)}if(qa)localStorage.setItem(prefix+"qa","1");qa=qa||localStorage.getItem(prefix+"qa")==="1"}catch(e){u=random();cap=random()}
var api="/p/"+c+"/api/items";
function answer(id,ok,result){f.contentWindow.postMessage({pmf:true,id:id,ok:ok,result:result},"*")}
function http(m,path,body){return fetch(api+path,{method:m,credentials:"omit",headers:{"content-type":"application/json","x-pmf-user":cap},body:body===undefined?undefined:JSON.stringify(body)}).then(function(r){return r.json().then(function(j){if(!r.ok)throw Error(j&&j.error||"HTTP "+r.status);return j})})}
window.addEventListener("message",function(e){if(e.source!==f.contentWindow)return;var d=e.data;if(!d||d.pmf!==true||d.company!==c||typeof d.id!=="string")return;
if(d.op==="init"){if(d.qa){qa=true;try{localStorage.setItem(prefix+"qa","1")}catch(e){}}answer(d.id,true,{user:u,qa:qa});return}
var a=Array.isArray(d.args)?d.args:[],work;
try{
if(d.op==="event"){if(qa)work=Promise.resolve(true);else{var b=a[0]||{};work=fetch("/api/t",{method:"POST",credentials:"omit",keepalive:true,headers:{"content-type":"text/plain"},body:JSON.stringify(Object.assign({},b,{c:c,u:u,p:"/p/"+c+"/"}))}).then(function(r){return r.ok})}}
else if(d.op==="list"){var o=a[1]||{};work=http("GET","?collection="+encodeURIComponent(String(a[0]))+(o.mine?"&mine=1":"")+(o.limit?"&limit="+encodeURIComponent(String(o.limit)):""))}
else if(d.op==="add")work=http("POST","",{collection:String(a[0]),data:a[1],shared:!!(a[2]&&a[2].shared)});
else if(["get","update","remove"].indexOf(d.op)>=0){if(!/^itm_[a-f0-9]{12}$/.test(String(a[0])))throw Error("Invalid item id");work=http(d.op==="get"?"GET":d.op==="update"?"PUT":"DELETE","/"+a[0],d.op==="update"?{data:a[1]}:undefined)}
else throw Error("Unsupported product operation");
Promise.resolve(work).then(function(v){answer(d.id,true,v)},function(err){answer(d.id,false,String(err&&err.message||err))})
}catch(err){answer(d.id,false,String(err&&err.message||err))}
});
})();`;

/** Product-side API; storage secrets and all credentials stay in the trusted host shell. */
export const TRACKER_JS = `(function(){
var s=document.currentScript,c=s&&s.getAttribute("data-company");if(!c||window.pmf)return;
var pending={},seq=0;
function rpc(op,args,extra){return new Promise(function(resolve,reject){var id=String(++seq),msg=Object.assign({pmf:true,company:c,id:id,op:op,args:args||[]},extra||{}),retry=null,timer=setTimeout(function(){delete pending[id];if(retry)clearInterval(retry);reject(Error("Open the product from its main product URL to use saved data"))},10000);if(op==="init")retry=setInterval(function(){parent.postMessage(msg,"*")},200);pending[id]={resolve:resolve,reject:reject,timer:timer,retry:retry};parent.postMessage(msg,"*")})}
window.addEventListener("message",function(e){if(e.source!==parent)return;var d=e.data,p=d&&d.pmf===true&&pending[d.id];if(!p)return;delete pending[d.id];clearTimeout(p.timer);if(p.retry)clearInterval(p.retry);if(d.ok)p.resolve(d.result);else p.reject(Error(String(d.result)))});
var ready=rpc("init",[],{qa:/[?&]qa=1(&|$)/.test(location.search)});function event(b){return ready.then(function(info){if(info.qa)return true;return rpc("event",[b])}).catch(function(){return false})}
window.pmf={user:null,track:function(name){return event({t:"use",n:String(name||"use").slice(0,64)})},signup:function(email){return event({t:"signup",email:String(email||"")})},feedback:function(text){return event({t:"feedback",text:String(text||"").slice(0,2000)})},db:{list:function(c,o){return ready.then(function(){return rpc("list",[c,o])})},add:function(c,d,o){return ready.then(function(){return rpc("add",[c,d,o])})},get:function(id){return ready.then(function(){return rpc("get",[id])})},update:function(id,d){return ready.then(function(){return rpc("update",[id,d])})},remove:function(id){return ready.then(function(){return rpc("remove",[id])})}}};
ready.then(function(info){window.pmf.user=info.user;var ref=null;try{ref=new URLSearchParams(location.search).get("ref")}catch(e){}return event({t:"view",r:ref})}).catch(function(){});
})();`;
