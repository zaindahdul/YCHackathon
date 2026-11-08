/**
 * Launchpad's HTML: the public landing page and ops log, the launch form, the founder's private
 * kit page, and the one-tap boost page squad members get. Server-rendered, no framework.
 */
import { CHANNEL_NAMES, CHANNELS, maskEmail, share, utm, withLink, type Channel, type Kit } from "./rules.ts";
import type { Decision, Launch, LaunchStats, RadarItem, Report, Touch } from "./repo.ts";

export const esc = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const TZ = "America/Los_Angeles";
const time = (v: Date | string) => new Date(v).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });

/** Headings, lists, paragraphs, bold, italics, code, quotes, http(s) links; everything escaped first. */
export function renderMarkdown(md: string): string {
  const inline = (t: string) => esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>").replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" rel="noopener nofollow">$1</a>');
  const out: string[] = [];
  let list: "ul" | "ol" | null = null;
  let para: string[] = [];
  const flush = () => { if (para.length) out.push(`<p>${inline(para.join(" "))}</p>`); para = []; };
  const close = () => { if (list) out.push(`</${list}>`); list = null; };
  for (const raw of md.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    const b = /^\s*[-*]\s+(.*)$/.exec(line);
    const n = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    const q = /^>\s?(.*)$/.exec(line);
    if (line.trim() === "") { flush(); close(); continue; }
    if (h) { flush(); close(); const lv = Math.max(2, Math.min(h[1]!.length, 4)); /* the page title is the only h1 */ out.push(`<h${lv}>${inline(h[2]!)}</h${lv}>`); continue; }
    if (b || n) { flush(); const kind = b ? "ul" : "ol"; if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; } out.push(`<li>${inline((b ?? n)![1]!)}</li>`); continue; }
    if (q) { flush(); close(); out.push(`<blockquote>${inline(q[1]!)}</blockquote>`); continue; }
    close();
    para.push(line.trim());
  }
  flush();
  close();
  return out.join("\n");
}

const CSS = `
:root{--bg:#f7f7fb;--panel:#fff;--ink:#14151f;--muted:#5b5f72;--line:#e3e4ee;--soft:#f0f1f8;--accent:#4f46e5;--accent-ink:#fff;--good:#157f4f;--good-bg:#e2f5ea;--warn:#8a5a00;--warn-bg:#fbf0d9;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#0e0f17;--panel:#171927;--ink:#ecedf6;--muted:#9da1b8;--line:#272a3c;--soft:#1d2031;--accent:#8b85ff;--accent-ink:#0e0f17;--good:#5fd39a;--good-bg:#173528;--warn:#f0c062;--warn-bg:#3a2e14;color-scheme:dark}}
:root[data-theme="dark"]{--bg:#0e0f17;--panel:#171927;--ink:#ecedf6;--muted:#9da1b8;--line:#272a3c;--soft:#1d2031;--accent:#8b85ff;--accent-ink:#0e0f17;--good:#5fd39a;--good-bg:#173528;--warn:#f0c062;--warn-bg:#3a2e14;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif}
a{color:var(--accent)}h1,h2,h3{line-height:1.2;margin:0}
.wrap{max-width:980px;margin:0 auto;padding:28px 16px 64px}
.narrow{max-width:680px}
.muted{color:var(--muted)}.small{font-size:13px}
.brand{font-weight:800;letter-spacing:-.02em;text-decoration:none;color:var(--ink)}
nav.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:34px}
.hero h1{font-size:clamp(32px,6vw,52px);letter-spacing:-.035em;margin:0 0 14px}
.hero p{font-size:19px;color:var(--muted);max-width:640px;margin:0 0 24px}
.btn{display:inline-block;background:var(--accent);color:var(--accent-ink);font-weight:700;border:0;border-radius:10px;padding:12px 18px;text-decoration:none;cursor:pointer;font:inherit;font-weight:700}
.btn.ghost{background:var(--soft);color:var(--ink)}
.btn.small{padding:7px 12px;font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:18px;min-width:0}
.card h3{font-size:16px;margin-bottom:6px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:22px 0}
.kpi{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:12px 14px}
.kpi b{display:block;font-size:26px;letter-spacing:-.02em;font-variant-numeric:tabular-nums}.kpi span{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
section{margin-top:34px}section>h2{font-size:18px;margin-bottom:12px}
form.stack{display:grid;gap:14px}
label{font-weight:600;font-size:14px;display:grid;gap:6px}
input,textarea,select{font:inherit;color:var(--ink);background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;width:100%}
textarea{min-height:90px;resize:vertical}
input:focus,textarea:focus{outline:2px solid var(--accent);outline-offset:1px}
.checks{display:flex;flex-wrap:wrap;gap:8px 14px;font-weight:400}.checks label{display:flex;gap:6px;align-items:center;font-weight:400}.checks input{width:auto}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
.pill{display:inline-block;padding:2px 9px;border-radius:999px;font-size:12px;font-weight:600;background:var(--soft);color:var(--muted)}
.pill.good{background:var(--good-bg);color:var(--good)}.pill.warn{background:var(--warn-bg);color:var(--warn)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
pre.copy{white-space:pre-wrap;background:var(--soft);border-radius:10px;padding:12px;margin:10px 0;font:14px/1.5 ui-sans-serif,system-ui,sans-serif;overflow-wrap:anywhere}
.table{overflow-x:auto;background:var(--panel);border:1px solid var(--line);border-radius:12px}
.table table{border-collapse:collapse;width:100%;min-width:520px;font-size:14px}
.table th,.table td{text-align:left;padding:9px 12px;border-bottom:1px solid var(--line);vertical-align:top}
.table th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.05em}
.table tr:last-child td{border-bottom:0}
ol.log{list-style:none;margin:0;padding:0}ol.log li{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px;margin-bottom:8px}
ol.log li p{margin:6px 0 0;overflow-wrap:anywhere}
.doc{background:var(--panel);border:1px solid var(--line);border-radius:14px;padding:6px 22px 18px}
.doc h2{font-size:18px;margin:20px 0 8px}.doc h3{font-size:16px;margin:16px 0 6px}
.doc blockquote{margin:10px 0;padding:6px 12px;border-left:3px solid var(--accent);background:var(--soft);border-radius:0 8px 8px 0}
.launchbox{background:linear-gradient(135deg,var(--accent),#7c3aed);color:#fff;border-radius:16px;padding:22px}
.launchbox .btn{background:#fff;color:#1e1b4b}
.empty{color:var(--muted);font-style:italic}
footer{margin-top:44px;color:var(--muted);font-size:13px}
`;

const COPY_JS = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;var t=document.getElementById(b.getAttribute("data-copy"));if(!t)return;navigator.clipboard.writeText(t.innerText).then(function(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o},1400)})});</script>`;

const page = (title: string, body: string, head = "") => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${head}<style>${CSS}</style></head><body>${body}</body></html>`;
const nav = `<nav class="top"><a class="brand" href="/">🚀 Launchpad</a><a class="small" href="/ops">How it runs</a></nav>`;
const footer = `<footer>Launchpad is run by AI agents and is not affiliated with Y Combinator. No bots, no fake engagement: every boost is a real founder choosing to share. <a href="/ops">See everything the agents do →</a></footer>`;
const kpi = (v: number | string, l: string) => `<div class="kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;

// ------------------------------------------------------------------- landing

export function renderHome(d: { overview: { launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number }; launches: Launch[] }): string {
  const listed = d.launches.filter((l) => l.listed && (l.status === "launched" || l.status === "reported"));
  return page("Launchpad: launch everywhere in one click", `<div class="wrap">${nav}
<div class="hero"><h1>Launch everywhere.<br>One click.</h1>
<p>For YC founders. Tell us what you're launching. Agents pick the right time on each channel, write every post (X, LinkedIn, Show HN, Product Hunt, Launch YC), and rally a squad of founders who really share it. Free.</p>
<a class="btn" href="/new">Plan my launch →</a> <span class="muted small" style="margin-left:10px">Your kit is ready in about 10 minutes.</span></div>
<div class="kpis">${kpi(d.overview.launches, "launches planned")}${kpi(d.overview.launched, "launched")}${kpi(d.overview.clicks, "clicks driven")}${kpi(d.overview.boosts_shared, "boosts shared")}${kpi(d.overview.squad, "founders in the squad")}</div>
<section><h2>How it works</h2><div class="grid">
<div class="card"><h3>1. Tell us once</h3><p class="muted">Your product, your link, your video. Two minutes.</p></div>
<div class="card"><h3>2. Get your kit</h3><p class="muted">The best time for each channel given what else is launching, every post written in that channel's style, and a one-click button for each.</p></div>
<div class="card"><h3>3. Press Launch now</h3><p class="muted">Squad founders get a one-tap request to boost you. You boost others when it's their turn. Real people, so no platform rules broken.</p></div>
<div class="card"><h3>4. See what worked</h3><p class="muted">Clicks per channel, boosts shared, and a written report with what to do next time.</p></div>
</div></section>
<section><h2>Launches we ran</h2>${listed.length === 0 ? `<p class="empty">None yet. Yours could be first.</p>` : `<div class="grid">${listed.map((l) => `<div class="card"><h3>${esc(l.company)}</h3><p class="muted">${esc(l.one_liner)}</p><a class="small" href="${esc(l.url)}" rel="noopener">${esc(l.url.replace(/^https?:\/\//, ""))}</a></div>`).join("")}</div>`}</section>
${footer}</div>`, `<meta name="description" content="One-click launches for YC founders: timing, every post, and a real boost squad.">`);
}

// ------------------------------------------------------------------- the form

export function renderNew(error?: string, v: Record<string, string> = {}): string {
  const checked = (c: string) => (v["_posted"] ? (v[`ch_${c}`] ? "checked" : "") : "checked");
  return page("Plan my launch · Launchpad", `<div class="wrap narrow">${nav}
<h1 style="font-size:32px;letter-spacing:-.02em;margin-bottom:6px">Plan my launch</h1>
<p class="muted">Two minutes. Agents write your kit and email it to you, usually within 10 minutes.</p>
<form class="stack" method="post" action="/new">
${error ? `<div class="pill warn" role="alert" style="padding:10px 12px;border-radius:10px">${esc(error)}</div>` : ""}
<label>Company<input name="company" required maxlength="80" value="${esc(v["company"])}"></label>
<label>One-liner <span class="muted small">(what it does, for whom)</span><input name="one_liner" required maxlength="160" value="${esc(v["one_liner"])}"></label>
<label>What are you launching? <span class="muted small">(the problem, what is new, anything we should know)</span><textarea name="description" required maxlength="3000">${esc(v["description"])}</textarea></label>
<label>Link to launch<input name="url" type="url" required placeholder="https://" maxlength="500" value="${esc(v["url"])}"></label>
<label>Launch video <span class="muted small">(optional link)</span><input name="video_url" type="url" placeholder="https://" maxlength="500" value="${esc(v["video_url"])}"></label>
<label>When do you want to launch? <span class="muted small">(e.g. "Sunday morning", "Tuesday", "asap")</span><input name="launch_when" maxlength="120" value="${esc(v["launch_when"])}"></label>
<label>YC batch <span class="muted small">(optional)</span><input name="batch" maxlength="10" placeholder="W26" value="${esc(v["batch"])}"></label>
<label>Your email <span class="muted small">(where your kit goes)</span><input name="email" type="email" required maxlength="254" value="${esc(v["email"])}"></label>
<label>Your X handle <span class="muted small">(optional)</span><input name="x_handle" maxlength="40" placeholder="@" value="${esc(v["x_handle"])}"></label>
<div><div style="font-weight:600;font-size:14px;margin-bottom:6px">Channels</div><div class="checks">${CHANNELS.map((c) => `<label><input type="checkbox" name="ch_${c}" value="1" ${checked(c)}>${esc(CHANNEL_NAMES[c])}</label>`).join("")}</div></div>
<div class="checks"><label><input type="checkbox" name="join_squad" value="1" ${v["_posted"] && !v["join_squad"] ? "" : "checked"}>Join the boost squad: I'll get a one-tap request when another founder launches, and they'll boost mine</label></div>
<div class="checks"><label><input type="checkbox" name="listed" value="1" ${v["_posted"] && !v["listed"] ? "" : "checked"}>List my launch on Launchpad once it's live</label></div>
<input type="hidden" name="timezone" id="tz"><script>try{document.getElementById("tz").value=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}</script>
<div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
<button class="btn" type="submit">Write my launch kit →</button>
<p class="muted small">We use your email only to send your kit, your results and boost requests (if you join the squad). Reply "stop" anytime.</p>
</form>${footer}</div>`);
}

// ------------------------------------------------------------------- the founder's kit

export function renderKit(l: Launch, d: { links: Record<string, string>; origin: string; stats: LaunchStats; squad: number; reports: Omit<Report, "body">[]; reciprocity: { given: number; received: number } }): string {
  const t = `?t=${l.token}`;
  if (!l.kit) {
    return page(`${l.company} · launch kit`, `<div class="wrap narrow">${nav}<h1 style="font-size:30px">Writing your launch kit…</h1>
<p class="muted">Our producer agent is researching what else is launching and writing every post for <strong>${esc(l.company)}</strong>. Usually about 10 minutes. This page refreshes on its own, and we'll email ${esc(maskEmail(l.email))} when it's ready.</p>
<p class="small muted">Bookmark this page: it is your private launch kit.</p>${footer}</div>`, `<meta http-equiv="refresh" content="20"><meta name="robots" content="noindex">`);
  }
  const kit = l.kit;
  const tracked = (c: string) => (d.links[c] ? `${d.origin}/l/${d.links[c]}` : l.url);
  const card = (c: Channel, title: string, body: string, button: string) => `<div class="card" id="ch-${c}"><div class="row" style="justify-content:space-between"><h3>${esc(title)}</h3>${button}</div>${body}</div>`;
  const block = (idv: string, text: string) => `<pre class="copy" id="${idv}">${esc(text)}</pre><button class="btn ghost small" data-copy="${idv}">Copy</button>`;
  const cards: string[] = [];
  if (kit.posts.x) {
    const thread = kit.posts.x.map((p) => withLink(p, tracked("x")));
    cards.push(card("x", "X thread", thread.map((p, i) => block(`x${i}`, p)).join(""), `<a class="btn small" href="${esc(share.x(thread[0]!))}" target="_blank" rel="noopener">Post on X</a>`));
  }
  if (kit.posts.linkedin) {
    const text = withLink(kit.posts.linkedin, tracked("linkedin"));
    cards.push(card("linkedin", "LinkedIn", block("li", text), `<a class="btn small" href="${esc(share.linkedin(text))}" target="_blank" rel="noopener">Post on LinkedIn</a>`));
  }
  if (kit.posts.show_hn) {
    const u = utm(l.url, "hn");
    cards.push(card("show_hn", "Show HN", `${block("hnt", kit.posts.show_hn.title)}${block("hnx", kit.posts.show_hn.text)}<p class="small muted">Post the text as your first comment. HN wants the real URL, so this one has no redirect.</p>`, `<a class="btn small" href="${esc(share.show_hn(u, kit.posts.show_hn.title))}" target="_blank" rel="noopener">Submit to HN</a>`));
  }
  if (kit.posts.product_hunt) {
    const ph = kit.posts.product_hunt;
    cards.push(card("product_hunt", "Product Hunt", `${block("pht", ph.tagline)}${block("phd", ph.description)}${block("phc", ph.first_comment)}<p class="small muted">Website: <code>${esc(utm(l.url, "producthunt"))}</code></p>`, `<a class="btn small" href="${esc(share.product_hunt())}" target="_blank" rel="noopener">Open Product Hunt</a>`));
  }
  if (kit.posts.launch_yc) {
    const body = withLink(kit.posts.launch_yc.body, tracked("launch_yc"));
    cards.push(card("launch_yc", "Launch YC / Bookface", `${block("yct", kit.posts.launch_yc.title)}${block("ycb", body)}`, `<a class="btn small" href="${esc(share.launch_yc())}" target="_blank" rel="noopener">Open Launch YC</a>`));
  }
  if (kit.posts.email) {
    const body = withLink(kit.posts.email.body, tracked("email"));
    cards.push(card("email", "Email your network", `${block("ems", kit.posts.email.subject)}${block("emb", body)}`, `<a class="btn small" href="${esc(share.email(kit.posts.email.subject, body))}">Open in email</a>`));
  }
  const s = d.stats;
  const launched = l.status === "launched" || l.status === "reported";
  const statsRows = (["x", "linkedin", "launch_yc", "email", "boost"] as const).map((c) => `<tr><td>${esc(c === "boost" ? "Squad boosts" : CHANNEL_NAMES[c])}</td><td>${s.clicks_by_channel[c] ?? 0}</td></tr>`).join("");
  return page(`${l.company} · launch kit`, `<div class="wrap">${nav}
<div class="row"><span class="pill ${launched ? "good" : ""}">${esc(l.status)}</span><span class="small muted">Private kit for ${esc(l.company)} · bookmark this page</span></div>
<h1 style="font-size:32px;letter-spacing:-.02em;margin:10px 0 4px">${esc(l.company)} launch kit</h1>
<p class="muted">${esc(l.one_liner)}</p>
${launched
    ? `<div class="launchbox"><h2 style="font-size:20px">🚀 You're live</h2><p>${s.boosts.sent} squad founders were asked to boost you, and ${s.boosts.shared} have shared. ${s.clicks_total} people clicked your links so far.</p></div>`
    : `<div class="launchbox"><h2 style="font-size:20px">Ready when you are</h2><p>Post on your channels with the buttons below at the times we suggest. When your first post is up, press Launch now: ${d.squad > 0 ? `${d.squad} squad founder${d.squad === 1 ? "" : "s"} get a one-tap request to boost you.` : "you'll be the first in the squad, and every founder who joins after you gets asked to boost you."}</p><form method="post" action="/k/${esc(l.slug)}/go${esc(t)}"><button class="btn" type="submit">Launch now →</button></form></div>`}
<section><h2>The plan</h2><div class="doc">${renderMarkdown(kit.strategy)}</div></section>
<section><h2>When to post</h2><div class="table"><table><thead><tr><th>Channel</th><th>When</th><th>Why</th></tr></thead><tbody>${kit.timing.map((x) => `<tr><td><a href="#ch-${esc(x.channel)}">${esc(CHANNEL_NAMES[x.channel])}</a></td><td style="white-space:nowrap">${esc(x.when)}</td><td>${esc(x.why)}</td></tr>`).join("")}</tbody></table></div></section>
<section><h2>Your posts</h2><div class="grid" style="grid-template-columns:1fr">${cards.join("")}</div></section>
${kit.checklist.length ? `<section><h2>Launch-day checklist</h2><div class="doc"><ul>${kit.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div></section>` : ""}
<section><h2>Results</h2><div class="kpis">${kpi(s.clicks_total, "people clicked")}${kpi(s.boosts.sent, "boosts asked")}${kpi(s.boosts.shared, "boosts shared")}${kpi(`${d.reciprocity.given}`, "you boosted others")}</div>
<div class="table"><table><thead><tr><th>Channel</th><th>People who clicked</th></tr></thead><tbody>${statsRows}</tbody></table></div>
<p class="small muted">Show HN and Product Hunt use your real URL with ?ref=hn and ?ref=producthunt, so check those in your own analytics.</p>
${d.reports.length ? `<h3 style="margin-top:16px">Reports</h3><ol class="log">${d.reports.map((r) => `<li><a href="/r/${esc(r.id)}${esc(t)}">${esc(r.title)}</a> <span class="small muted">${esc(time(r.created_at))}</span></li>`).join("")}</ol>` : ""}</section>
${footer}</div>${COPY_JS}`, `<meta name="robots" content="noindex">${launched ? `<meta http-equiv="refresh" content="120">` : ""}`);
}

// ------------------------------------------------------------------- boost page

export function renderBoost(d: { company: string; one_liner: string; url: string; video_url: string | null; booster: string; code: string; status: string; boostText: string }): string {
  const done = d.status === "shared";
  return page(`Boost ${d.company}`, `<div class="wrap narrow">${nav}
<span class="pill good">Boost squad</span>
<h1 style="font-size:32px;letter-spacing:-.02em;margin:12px 0 8px">${esc(d.company)} just launched</h1>
<p style="font-size:18px" class="muted">${esc(d.one_liner)}</p>
${d.video_url ? `<p><a href="${esc(d.video_url)}" rel="noopener" target="_blank">▶ Watch their launch video</a></p>` : ""}
<div class="card"><p class="small muted" style="margin-top:0">The post (edit it however you like):</p><pre class="copy" id="bt">${esc(d.boostText)}</pre>
<div class="row"><a class="btn" href="/b/${esc(d.code)}/go?to=x" target="_blank" rel="noopener">Boost on X</a><a class="btn ghost" href="/b/${esc(d.code)}/go?to=linkedin" target="_blank" rel="noopener">Share on LinkedIn</a><button class="btn ghost small" data-copy="bt">Copy</button></div>
${done ? `<p class="small" style="color:var(--good)">Thanks, you boosted them. Squad founders boost you back when you launch.</p>` : ""}</div>
<p class="small muted">You're getting this because ${esc(d.booster)} joined the Launchpad boost squad. Only share it if you'd actually recommend it. <a href="/b/${esc(d.code)}/skip">Not this one</a> · <a href="/b/${esc(d.code)}/stop">Leave the squad</a></p>
${footer}</div>${COPY_JS}`, `<meta name="robots" content="noindex">`);
}

export const renderMessage = (title: string, text: string) => page(title, `<div class="wrap narrow">${nav}<h1 style="font-size:28px">${esc(title)}</h1><p class="muted">${esc(text)}</p>${footer}</div>`);

// ------------------------------------------------------------------- ops log

export function renderOps(d: { overview: { launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number }; launches: Launch[]; decisions: Decision[]; touches: Touch[]; radar: RadarItem[]; reports: (Omit<Report, "body"> & { listed: boolean })[]; interventions: { description: string; created_at: Date }[]; now: Date }): string {
  const names = new Map(d.launches.map((l) => [l.id, l.company]));
  const log = <T>(rows: T[], empty: string, f: (r: T) => string) => (rows.length ? `<ol class="log">${rows.map(f).join("")}</ol>` : `<p class="empty">${esc(empty)}</p>`);
  return page("How it runs · Launchpad", `<div class="wrap">${nav}
<h1 style="font-size:30px;letter-spacing:-.02em">How Launchpad runs</h1>
<p class="muted" style="max-width:720px">There are no human staff. A producer agent writes each launch kit and the report afterwards. A booster agent asks squad founders to boost each launch. A scout agent finds YC founders who are launching and offers them a kit. A concierge answers the inbox. This page is the live record. Updated ${esc(time(d.now))}.</p>
<div class="kpis">${kpi(d.overview.launches, "launches planned")}${kpi(d.overview.launched, "launched")}${kpi(d.overview.clicks, "clicks driven")}${kpi(d.overview.boosts_sent, "boosts asked")}${kpi(d.overview.boosts_shared, "boosts shared")}${kpi(d.overview.squad, "squad")}${kpi(d.interventions.length, "human step-ins")}</div>
<section><h2>Launches</h2>${d.launches.length === 0 ? `<p class="empty">None yet.</p>` : `<div class="table"><table><thead><tr><th>Company</th><th>Status</th><th>Asked</th><th>Kit ready</th><th>Launched</th></tr></thead><tbody>${[...d.launches].reverse().map((l) => `<tr><td>${esc(l.listed ? l.company : "Unlisted launch")}</td><td><span class="pill">${esc(l.status)}</span></td><td>${esc(time(l.created_at))}</td><td>${l.ready_at ? esc(time(l.ready_at)) : "–"}</td><td>${l.launched_at ? esc(time(l.launched_at)) : "–"}</td></tr>`).join("")}</tbody></table></div>`}</section>
<section><h2>Reports</h2>${log(d.reports.filter((r) => r.listed), "No reports yet. The producer writes one about two hours after each launch.", (r) => `<li><a href="/r/${esc(r.id)}">${esc(r.title)}</a> <span class="small muted">${esc(names.get(r.launch_id) ?? "")} · ${esc(time(r.created_at))}</span></li>`)}</section>
<section><h2>Decisions</h2>${log(d.decisions, "No decisions yet.", (x) => `<li><div class="row"><span class="pill">${esc(x.decision)}</span><strong>${esc(x.launch_id ? (d.launches.find((l) => l.id === x.launch_id)?.listed ? names.get(x.launch_id) : "Unlisted launch") ?? "" : "Studio")}</strong><span class="small muted">${esc(x.agent)} · ${esc(time(x.created_at))}</span></div><p>${esc(x.reasoning)}</p></li>`)}</section>
<section class="grid" style="grid-template-columns:repeat(auto-fit,minmax(300px,1fr))">
<div><h2 style="font-size:18px;margin-bottom:12px">Outreach</h2>${log(d.touches, "No outreach yet.", (t) => `<li><div class="row"><span class="pill">${esc(t.channel)}</span><span class="small muted">${esc(time(t.created_at))}${t.target ? ` · to ${esc(maskEmail(t.target))}` : ""}</span></div><p>${esc(t.content.slice(0, 220))}</p></li>`)}</div>
<div><h2 style="font-size:18px;margin-bottom:12px">Launch radar</h2>${log(d.radar, "Nothing on the radar yet.", (r) => `<li><div class="row"><span class="pill">${esc(r.source)}</span><span class="small muted">${esc(r.batch ?? "")}</span></div><p><a href="${esc(r.url)}" rel="noopener nofollow">${esc(r.title)}</a></p></li>`)}</div>
</section>
<section><h2>Where a human stepped in</h2>${log(d.interventions, "None so far.", (x) => `<li><span class="small muted">${esc(time(x.created_at))}</span><p>${esc(x.description)}</p></li>`)}</section>
${footer}</div>`, `<meta http-equiv="refresh" content="60">`);
}

export function renderReport(r: Report, company: string, stats: LaunchStats | null): string {
  return page(`${r.title} · Launchpad`, `<div class="wrap narrow">${nav}<p class="small muted">${esc(company)} · launch report · ${esc(time(r.created_at))}</p>
<h1 style="font-size:28px;letter-spacing:-.02em;margin:6px 0 16px">${esc(r.title)}</h1><article class="doc">${renderMarkdown(r.body)}</article>
${stats ? `<section><h2>The numbers, counted by Launchpad</h2><div class="kpis">${kpi(stats.clicks_total, "people clicked")}${kpi(stats.boosts.sent, "boosts asked")}${kpi(stats.boosts.shared, "boosts shared")}${kpi(stats.boost_clicks, "clicks from boosts")}</div></section>` : ""}${footer}</div>`, `<meta name="robots" content="noindex">`);
}
