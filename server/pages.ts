/**
 * Server-rendered HTML: the public dashboard at `/` (the company's live record, for judges and
 * anyone curious) and one landing page per experiment at `/x/:slug`. No client framework: every
 * page is one request, readable without JavaScript, and fast on a phone.
 */
import { maskEmail } from "./rules.ts";
import type { Decision, Delivery, Experiment, Intervention, ScoredExperiment, Touch } from "./repo.ts";

export const esc = (value: unknown): string =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const TZ = "America/Los_Angeles";
const time = (value: Date | string) =>
  new Date(value).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** A small, stable hue per experiment so each landing page looks like its own product. */
const hueOf = (slug: string) => [...slug].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

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
.p-live,.p-keep,.p-launch{background:var(--info-bg);color:var(--info)}
.p-winner,.p-scale,.p-delivered{background:var(--good-bg);color:var(--good)}
.p-killed,.p-kill,.p-failed{background:var(--bad-bg);color:var(--bad)}
.p-paused,.p-too_early,.p-note,.p-new,.p-working{background:var(--soft);color:var(--muted)}
.p-no_reach,.p-pivot{background:var(--warn-bg);color:var(--warn)}
`;

const page = (title: string, body: string, extraCss = "", head = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>${head}<style>${BASE_CSS}${extraCss}</style></head><body>${body}</body></html>`;

// ------------------------------------------------------------------- dashboard

export interface DashboardData {
  now: Date;
  experiments: ScoredExperiment[];
  decisions: Decision[];
  touches: Touch[];
  deliveries: (Delivery & { experiment_id: string; email: string })[];
  interventions: Intervention[];
  signupsTotal: number;
}

const DASH_CSS = `
header.top{display:flex;flex-wrap:wrap;gap:12px 24px;align-items:flex-end;justify-content:space-between;margin-bottom:22px}
header.top h1{font-size:28px;letter-spacing:-.02em}
.lede{max-width:640px;margin-top:6px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:26px}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:26px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
section{margin-top:30px}section>h2{font-size:17px;margin-bottom:12px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:16px;min-width:0}
.card h3{font-size:16px;margin-bottom:4px}
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
`;

const kpi = (value: number | string, label: string) => `<div class="kpi"><b>${esc(value)}</b><span>${esc(label)}</span></div>`;

function experimentCard(e: ScoredExperiment, names: Map<string, string>): string {
  const s = e.stats;
  const parent = e.parent_id ? `<div class="small muted">Pivot from ${esc(names.get(e.parent_id) ?? e.parent_id)}</div>` : "";
  return `<article class="card">
  <div class="row"><span class="pill p-${esc(e.status)}">${esc(e.status)}</span><span class="pill p-${esc(e.judgement.verdict)}">${esc(e.judgement.verdict.replace("_", " "))}</span></div>
  <h3 style="margin-top:8px">${esc(e.name)}</h3>${parent}
  <div class="small muted">${esc(clip(e.audience, 140))}</div>
  <p style="margin:8px 0 0">${esc(e.offer)}</p>
  <div class="stats">
    <div><b>${s.age_hours}h</b><span>running</span></div>
    <div><b>${s.touches}</b><span>outreach</span></div>
    <div><b>${s.impressions}</b><span>impressions</span></div>
    <div><b>${s.views}</b><span>visitors</span></div>
    <div><b>${s.signups}</b><span>signups</span></div>
    <div><b>${s.delivered}</b><span>delivered</span></div>
  </div>
  <a class="small" href="/x/${esc(e.slug)}">Landing page →</a>
  <div class="verdict muted">${esc(e.judgement.reason)}</div>
</article>`;
}

export function renderDashboard(d: DashboardData): string {
  const names = new Map(d.experiments.map((e) => [e.id, e.name]));
  const live = d.experiments.filter((e) => e.status === "live").length;
  const pivots = d.decisions.filter((x) => x.decision === "pivot" || x.decision === "kill").length;
  const outreach = d.experiments.reduce((n, e) => n + e.stats.touches, 0);
  const views = d.experiments.reduce((n, e) => n + e.stats.views, 0);
  const delivered = d.experiments.reduce((n, e) => n + e.stats.delivered, 0);
  const firstStart = d.experiments[0]?.created_at;

  const ordered = [...d.experiments].sort((a, b) => {
    const rank = (e: ScoredExperiment) => (e.status === "live" ? 0 : e.status === "winner" ? 1 : e.status === "paused" ? 2 : 3);
    return rank(a) - rank(b) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const decisions = d.decisions.length === 0
    ? `<p class="empty">No decisions yet. The strategist logs every launch, kill and pivot here.</p>`
    : `<ol class="log">${d.decisions.map((x) => `<li>
        <div class="row"><span class="pill p-${esc(x.decision)}">${esc(x.decision)}</span>
        <strong>${esc(x.experiment_id ? names.get(x.experiment_id) ?? x.experiment_id : "Company")}</strong>
        <span class="small muted">${esc(time(x.created_at))} · ${esc(x.agent)}</span></div>
        <p>${esc(x.reasoning)}</p></li>`).join("")}</ol>`;

  const touches = d.touches.length === 0
    ? `<p class="empty">No outreach yet.</p>`
    : `<ol class="log">${d.touches.map((t) => `<li>
        <div class="row"><span class="pill p-note">${esc(t.channel === "x" ? "X" : t.channel)}</span>
        <span class="small muted">${esc(time(t.created_at))} · ${esc(names.get(t.experiment_id) ?? "")}${t.target && t.channel === "email" ? ` · to ${esc(maskEmail(t.target))}` : ""}</span>
        ${t.impressions ? `<span class="small muted">· ${t.impressions} impressions</span>` : ""}</div>
        <p>${t.url ? `<a href="${esc(t.url)}" rel="noopener">${esc(clip(t.content, 220))}</a>` : esc(clip(t.content, 220))}</p></li>`).join("")}</ol>`;

  const deliveries = d.deliveries.length === 0
    ? `<p class="empty">Nothing delivered yet.</p>`
    : `<ol class="log">${d.deliveries.map((x) => `<li>
        <div class="row"><span class="pill p-delivered">delivered</span>
        <span class="small muted">${esc(time(x.created_at))} · ${esc(maskEmail(x.email))} · ${esc(names.get(x.experiment_id) ?? "")}</span></div>
        <p>${esc(x.summary)}</p></li>`).join("")}</ol>`;

  const interventions = d.interventions.length === 0
    ? `<p class="empty">None so far. Every time a human steps in, it is logged here.</p>`
    : `<ol class="log">${d.interventions.map((x) => `<li><span class="small muted">${esc(time(x.created_at))}</span><p>${esc(x.description)}</p></li>`).join("")}</ol>`;

  const body = `<div class="wrap">
<header class="top"><div><h1>PMF Engine</h1>
<p class="lede muted">An autonomous company searching for product–market fit. Its agents launch offers, find customers on X and by email, deliver the work, and kill or pivot whatever the numbers say is not working. This page is its live record.</p></div>
<div class="small muted">${firstStart ? `Running since ${esc(time(firstStart))}<br>` : ""}Updated ${esc(time(d.now))} · refreshes every minute</div></header>
<div class="kpis">
${kpi(`${live}/${d.experiments.length}`, "live / tried")}${kpi(pivots, "kills & pivots")}${kpi(outreach, "outreach sent")}
${kpi(views, "visitors")}${kpi(d.signupsTotal, "signups")}${kpi(delivered, "delivered")}${kpi(d.interventions.length, "human step-ins")}
</div>
<section><h2>Experiments</h2>${d.experiments.length === 0 ? `<p class="empty">No experiments yet. The strategist launches the first ones on its first run.</p>` : `<div class="grid">${ordered.map((e) => experimentCard(e, names)).join("")}</div>`}</section>
<section><h2>Decision log</h2>${decisions}</section>
<section class="two"><div><h2 style="font-size:17px;margin-bottom:12px">Recent outreach</h2>${touches}</div><div><h2 style="font-size:17px;margin-bottom:12px">Recent deliveries</h2>${deliveries}</div></section>
<section><h2>Where a human stepped in</h2>${interventions}</section>
<footer>Built on the Naïve SDK. Email addresses are masked on this page.</footer>
</div>`;
  return page("PMF Engine", body, DASH_CSS, `<meta http-equiv="refresh" content="60"><meta name="description" content="An autonomous company searching for product-market fit, live.">`);
}

// ------------------------------------------------------------------- landing pages

const LANDING_CSS = (hue: number) => `
:root{--brand:hsl(${hue} 70% 45%);--brand-soft:hsl(${hue} 70% 95%)}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--brand:hsl(${hue} 80% 68%);--brand-soft:hsl(${hue} 40% 16%)}}
:root[data-theme="dark"]{--brand:hsl(${hue} 80% 68%);--brand-soft:hsl(${hue} 40% 16%)}
main{max-width:620px;margin:0 auto;padding:48px 16px 56px}
.tag{display:inline-block;background:var(--brand-soft);color:var(--brand);font-weight:600;font-size:12px;padding:4px 10px;border-radius:999px;letter-spacing:.04em;text-transform:uppercase}
h1{font-size:clamp(28px,6vw,42px);letter-spacing:-.025em;margin:16px 0 12px}
.sub{font-size:18px;color:var(--muted);margin:0 0 22px}
ul.points{list-style:none;padding:0;margin:0 0 28px}
ul.points li{padding:8px 0 8px 30px;position:relative;border-bottom:1px solid var(--line)}
ul.points li:before{content:"";position:absolute;left:4px;top:15px;width:12px;height:7px;border-left:2px solid var(--brand);border-bottom:2px solid var(--brand);transform:rotate(-45deg)}
form{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;display:grid;gap:12px}
label{font-weight:600;font-size:14px;display:grid;gap:6px}
input,textarea{font:inherit;color:var(--ink);background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%}
textarea{min-height:96px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--brand);outline-offset:1px}
button{font:inherit;font-weight:700;background:var(--brand);color:#fff;border:0;border-radius:10px;padding:12px 16px;cursor:pointer}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]) button{color:#0f1115}}
:root[data-theme="dark"] button{color:#0f1115}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.fine{font-size:13px;color:var(--muted);margin-top:18px}
.error{background:var(--bad-bg);color:var(--bad);border-radius:10px;padding:10px 12px}
`;

export function renderLanding(e: Experiment, opts: { source: string | null; error?: string; values?: Record<string, string> }): string {
  const v = opts.values ?? {};
  const body = `<main>
<span class="tag">Free while we test it</span>
<h1>${esc(e.headline)}</h1>
<p class="sub">${esc(e.subhead)}</p>
<ul class="points">${e.bullets.map((b) => `<li>${esc(b)}</li>`).join("")}</ul>
<form method="post" action="/x/${esc(e.slug)}">
  ${opts.error ? `<div class="error" role="alert">${esc(opts.error)}</div>` : ""}
  <label>Email<input type="email" name="email" required maxlength="254" autocomplete="email" value="${esc(v["email"])}"></label>
  <label>Name <span class="muted small">(optional)</span><input type="text" name="name" maxlength="120" autocomplete="name" value="${esc(v["name"])}"></label>
  <label>${esc(e.ask_label)}<textarea name="need" required maxlength="4000">${esc(v["need"])}</textarea></label>
  <label>Link <span class="muted small">(optional: your site, app or listing)</span><input type="url" name="link" maxlength="500" placeholder="https://" value="${esc(v["link"])}"></label>
  <div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
  <input type="hidden" name="src" value="${esc(opts.source ?? "")}">
  <button type="submit">${esc(e.cta)}</button>
</form>
<p class="fine">This offer is run by an AI-operated company. Agents do the work and email it to you, usually within 30 minutes. We use your email only to send it and never share it. <a href="/">See everything the company does →</a></p>
</main>`;
  return page(e.headline, body, LANDING_CSS(hueOf(e.slug)), `<meta name="description" content="${esc(e.subhead)}"><meta property="og:title" content="${esc(e.headline)}"><meta property="og:description" content="${esc(e.subhead)}">`);
}

export function renderThanks(e: Experiment): string {
  const body = `<main>
<span class="tag">You're in</span>
<h1>Thanks. We're on it.</h1>
<p class="sub">We'll email it to you, usually within 30 minutes. Reply to that email with any questions.</p>
<p class="fine"><a href="/x/${esc(e.slug)}">← Back</a> · <a href="/">See what the company is doing right now</a></p>
</main>`;
  return page("Thanks", body, LANDING_CSS(hueOf(e.slug)));
}

export function renderClosed(e: Experiment): string {
  const body = `<main>
<span class="tag">Closed</span>
<h1>This offer has closed.</h1>
<p class="sub">We ran "${esc(e.name)}" as an experiment and have moved on to other offers.</p>
<p class="fine"><a href="/">See what the company is offering now →</a></p>
</main>`;
  return page("Offer closed", body, LANDING_CSS(hueOf(e.slug)));
}

export function renderNotFound(): string {
  return page("Not found", `<main style="max-width:620px;margin:0 auto;padding:64px 16px"><h1>Not found</h1><p class="muted">Nothing lives at this address. <a href="/">Go to the dashboard</a>.</p></main>`);
}
