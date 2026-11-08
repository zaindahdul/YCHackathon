/**
 * Launchpad's HTML: the landing page, the launch form, the founder's private kit, the boost page
 * squad founders get, the public ops log and reports. Server-rendered, no framework.
 *
 * Design: an editorial, quiet look. Paper background, near-black type, hairline rules instead
 * of boxes, black primary buttons, and one green reserved for "live". No emoji, no gradients.
 * The landing page shows the product (a real kit) instead of describing it.
 */
import { CHANNEL_NAMES, CHANNELS, maskEmail, share, utm, withLink, type Channel } from "./rules.ts";
import type { Decision, Launch, LaunchStats, RadarItem, Report, Touch } from "./repo.ts";

export const esc = (value: unknown): string =>
  String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const TZ = "America/Los_Angeles";
const time = (v: Date | string) => new Date(v).toLocaleString("en-US", { timeZone: TZ, weekday: "short", hour: "numeric", minute: "2-digit" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

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
:root{--paper:#fafaf7;--panel:#ffffff;--ink:#141413;--ink-2:#3d3d3a;--muted:#73726c;--rule:#e6e4dd;--soft:#f2f1ec;
--btn:#141413;--btn-ink:#fafaf7;--live:#0f7a4c;--live-soft:#e5f3ec;--focus:#2f6fe4;color-scheme:light}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--paper:#121211;--panel:#1a1a19;--ink:#eeede8;--ink-2:#cfcec8;--muted:#9a9993;--rule:#2b2b29;--soft:#202020;
--btn:#eeede8;--btn-ink:#121211;--live:#4fd197;--live-soft:#16301f;--focus:#7aa7ff;color-scheme:dark}}
:root[data-theme="dark"]{--paper:#121211;--panel:#1a1a19;--ink:#eeede8;--ink-2:#cfcec8;--muted:#9a9993;--rule:#2b2b29;--soft:#202020;--btn:#eeede8;--btn-ink:#121211;--live:#4fd197;--live-soft:#16301f;--focus:#7aa7ff;color-scheme:dark}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.6 "Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:3px}
h1,h2,h3{margin:0;font-weight:600;letter-spacing:-.02em;line-height:1.15}
p{margin:0}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.wrap{max-width:1080px;margin:0 auto;padding:0 20px}
.narrow{max-width:640px}
.muted{color:var(--muted)}.small{font-size:13px}.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12.5px}
.eyebrow{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500}
header.top{display:flex;justify-content:space-between;align-items:center;height:68px;border-bottom:1px solid var(--rule)}
.mark{display:inline-flex;align-items:center;gap:9px;font-weight:650;letter-spacing:-.01em;text-decoration:none}
.mark i{width:14px;height:14px;border-radius:3px;background:var(--ink);display:inline-block;transform:rotate(45deg) scale(.82)}
header.top nav{display:flex;gap:20px;align-items:center;font-size:14px}
header.top nav a.link{text-decoration:none;color:var(--ink-2)}header.top nav a.link:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;gap:8px;background:var(--btn);color:var(--btn-ink);border:1px solid var(--btn);border-radius:8px;padding:10px 16px;font:inherit;font-weight:550;font-size:14px;text-decoration:none;cursor:pointer;white-space:nowrap}
.btn:hover{opacity:.88}
.btn.quiet{background:transparent;color:var(--ink);border-color:var(--rule)}.btn.quiet:hover{border-color:var(--muted);opacity:1}
.btn.sm{padding:6px 11px;font-size:13px;border-radius:7px}
.copy{background:none;border:0;padding:4px 6px;margin:-4px -6px;font:inherit;font-size:12.5px;color:var(--muted);cursor:pointer;border-radius:5px}
.copy:hover{color:var(--ink);background:var(--soft)}
.status{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:550;color:var(--ink-2)}
.status::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--muted)}
.status.live{color:var(--live)}.status.live::before{background:var(--live);box-shadow:0 0 0 3px var(--live-soft)}
hr.rule{border:0;border-top:1px solid var(--rule);margin:0}
/* landing */
.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:56px;align-items:center;padding:72px 0 64px}
.hero h1{font-size:clamp(38px,5vw,56px);letter-spacing:-.035em;line-height:1.04;font-weight:650;text-wrap:balance;max-width:10em}
.hero .lede{font-size:18px;line-height:1.55;color:var(--ink-2);margin:20px 0 28px;max-width:30em}
.hero .ctas{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.preview{background:var(--panel);border:1px solid var(--rule);border-radius:14px;box-shadow:0 1px 0 rgba(0,0,0,.02),0 18px 40px -24px rgba(20,20,19,.18);overflow:hidden}
.preview .bar{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid var(--rule);font-size:13px}
.preview .slot{display:grid;grid-template-columns:96px 1fr;gap:12px;padding:10px 16px;border-bottom:1px solid var(--rule);font-size:13.5px}
.preview .slot:last-of-type{border-bottom:0}
.preview .slot b{font-weight:550}
.preview .tweet{margin:14px 16px 16px;padding:14px;border:1px solid var(--rule);border-radius:12px;font-size:14px;line-height:1.5}
.preview .tweet .who{display:flex;gap:8px;align-items:center;margin-bottom:6px;font-size:13px}
.preview .tweet .who i{width:22px;height:22px;border-radius:50%;background:var(--soft);display:inline-block}
.points{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--rule)}
.points div{padding:28px 28px 32px 0}
.points div+div{padding-left:28px;border-left:1px solid var(--rule)}
.points h3{font-size:16px;margin-bottom:8px}
.points p{color:var(--ink-2);font-size:14.5px}
.numbers{display:flex;gap:28px;flex-wrap:wrap;padding:22px 0;border-top:1px solid var(--rule);font-size:14px;color:var(--ink-2)}
.numbers b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.list{border-top:1px solid var(--rule)}
.list .item{display:grid;grid-template-columns:220px 1fr auto;gap:20px;padding:16px 0;border-bottom:1px solid var(--rule);align-items:baseline}
.section{padding:56px 0 0}
.section>h2{font-size:20px;margin-bottom:18px}
footer.wrap{margin:88px auto 0;padding:22px 20px 40px;border-top:1px solid var(--rule);font-size:13px;color:var(--muted)}footer p{max-width:72ch}
/* form */
.form{padding:48px 0}
.form h1{font-size:34px;letter-spacing:-.03em}
.form .lede{color:var(--ink-2);margin:10px 0 32px}
fieldset{border:0;padding:0;margin:0 0 30px}
legend{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);font-weight:500;margin-bottom:14px;padding:0}
.field{display:grid;gap:6px;margin-bottom:16px}
.field>span{font-size:14px;font-weight:550}
.field>span em{font-style:normal;font-weight:400;color:var(--muted)}
input[type=text],input[type=url],input[type=email],textarea{font:inherit;font-size:15px;color:var(--ink);background:var(--panel);border:1px solid var(--rule);border-radius:8px;padding:10px 12px;width:100%}
input:focus,textarea:focus{outline:2px solid var(--focus);outline-offset:-1px;border-color:transparent}
textarea{min-height:104px;resize:vertical}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.chips{display:flex;flex-wrap:wrap;gap:8px}
.chips label{position:relative}
.chips input{position:absolute;opacity:0;inset:0;cursor:pointer}
.chips span{display:inline-block;padding:7px 13px;border:1px solid var(--rule);border-radius:999px;font-size:13.5px;background:var(--panel);color:var(--muted)}
.chips input:checked+span{color:var(--ink);border-color:var(--ink);font-weight:550}
.chips input:checked+span::before{content:"\\2713";margin-right:6px;font-weight:600}
.chips input:focus-visible+span{outline:2px solid var(--focus);outline-offset:2px}
.check{display:grid;grid-template-columns:18px 1fr;gap:10px;align-items:start;font-size:14px;color:var(--ink-2);margin-bottom:12px}
.check input{width:16px;height:16px;margin:3px 0 0;accent-color:var(--ink)}
.error{border-left:2px solid #c2410c;padding:8px 12px;margin-bottom:22px;font-size:14px;color:var(--ink)}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
/* kit */
.kithead{display:flex;justify-content:space-between;align-items:flex-end;gap:24px;flex-wrap:wrap;padding:40px 0 28px;border-bottom:1px solid var(--rule)}
.kithead h1{font-size:36px;letter-spacing:-.03em;margin:8px 0 6px}
.kit{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:48px;padding-top:32px;align-items:start}
.side{position:sticky;top:20px;display:grid;gap:22px}
.panel{background:var(--panel);border:1px solid var(--rule);border-radius:12px;padding:18px}
.panel h3{font-size:15px;margin-bottom:6px}
.panel p{font-size:14px;color:var(--ink-2)}
.panel .btn{width:100%;justify-content:center;margin-top:14px;padding:11px 16px}
.timeline{list-style:none;margin:0;padding:0}
.timeline li{display:grid;grid-template-columns:1fr;gap:1px;padding:10px 0;border-bottom:1px solid var(--rule);font-size:13.5px}
.timeline li:last-child{border-bottom:0}
.timeline .t{font-weight:550}.timeline .c{color:var(--muted)}
.timeline a{text-decoration:none}
.todo{list-style:none;margin:0;padding:0;font-size:13.5px;color:var(--ink-2)}
.todo li{padding:7px 0 7px 22px;position:relative;border-bottom:1px solid var(--rule)}.todo li:last-child{border-bottom:0}
.todo li::before{content:"";position:absolute;left:0;top:12px;width:11px;height:11px;border:1.5px solid var(--muted);border-radius:3px}
.prose{max-width:62ch;color:var(--ink-2);font-size:15px}
.prose p+p{margin-top:12px}.prose strong{color:var(--ink);font-weight:600}
.prose h2{font-size:17px;color:var(--ink);margin:26px 0 8px}.prose h3{font-size:15px;color:var(--ink);margin:18px 0 6px}
.prose ul,.prose ol{padding-left:20px;margin:8px 0}.prose li{margin:4px 0}
.prose blockquote{margin:12px 0;padding:2px 0 2px 14px;border-left:2px solid var(--rule);color:var(--ink)}
.prose code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:var(--soft);padding:1px 5px;border-radius:4px}
.jump{display:flex;gap:6px;flex-wrap:wrap;margin:6px 0 4px}
.jump a{font-size:13px;text-decoration:none;color:var(--ink-2);padding:5px 10px;border:1px solid var(--rule);border-radius:999px;background:var(--panel)}
.jump a:hover{border-color:var(--muted);color:var(--ink)}
.channel{padding:30px 0;border-top:1px solid var(--rule);scroll-margin-top:16px}
.channel>.head{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}
.channel>.head h2{font-size:18px}
.channel>.head .when{font-size:13px;color:var(--muted);margin-top:2px}
.post{position:relative;background:var(--panel);border:1px solid var(--rule);border-radius:12px;padding:14px 16px 12px;margin-bottom:10px}
.post .body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:14.5px;line-height:1.55}
.post .foot{display:flex;justify-content:space-between;align-items:center;margin-top:10px;font-size:12.5px;color:var(--muted)}
.post .label{font-size:12px;color:var(--muted);margin-bottom:6px}
.thread .post{margin-bottom:0;border-radius:0;border-bottom-width:0}
.thread .post:first-child{border-radius:12px 12px 0 0}.thread .post:last-child{border-radius:0 0 12px 12px;border-bottom-width:1px}
.thread .post:only-child{border-radius:12px}
.note{font-size:13px;color:var(--muted);margin-top:8px}
.results{padding:0 0 28px}
.big{display:flex;gap:36px;flex-wrap:wrap;margin:6px 0 20px}
.big div b{display:block;font-size:34px;font-weight:600;letter-spacing:-.03em;font-variant-numeric:tabular-nums;line-height:1.1}
.big div span{font-size:13px;color:var(--muted)}
.bars{display:grid;gap:8px;max-width:520px}
.bars .row{display:grid;grid-template-columns:170px 1fr 40px;gap:12px;align-items:center;font-size:13.5px}
.bars .track{height:6px;background:var(--soft);border-radius:3px;overflow:hidden}
.bars .fill{height:100%;background:var(--ink);border-radius:3px}
.bars .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.writing{padding:120px 0;text-align:left}
.writing h1{font-size:32px;letter-spacing:-.03em;margin:14px 0 12px}
.pulse{width:180px;height:2px;background:var(--rule);overflow:hidden;border-radius:2px;margin-top:28px}
.pulse::after{content:"";display:block;width:40%;height:100%;background:var(--ink);animation:slide 1.4s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){.pulse::after{animation:none;width:100%}}
/* ops */
table.t{width:100%;border-collapse:collapse;font-size:14px}
table.t th{text-align:left;font-weight:500;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted);padding:0 12px 10px 0;border-bottom:1px solid var(--rule)}
table.t td{padding:12px 12px 12px 0;border-bottom:1px solid var(--rule);vertical-align:top}
.tablewrap{overflow-x:auto}
.feed{list-style:none;margin:0;padding:0}
.feed li{padding:14px 0;border-bottom:1px solid var(--rule)}
.feed .meta{font-size:12.5px;color:var(--muted);margin-bottom:4px}
.feed .meta b{color:var(--ink);font-weight:550}
.feed p{font-size:14.5px;color:var(--ink-2);overflow-wrap:anywhere}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:48px}
.empty{color:var(--muted);font-size:14px;padding:14px 0;border-top:1px solid var(--rule)}
@media (min-width:861px){.mobile-only{display:none}}
@media (max-width:860px){
  .side .launch{display:none}.kithead .right{text-align:left!important}
  .hero{grid-template-columns:1fr;gap:36px;padding:44px 0 40px}
  .points{grid-template-columns:1fr}.points div,.points div+div{padding:20px 0;border-left:0;border-top:1px solid var(--rule)}.points div:first-child{border-top:0}
  .kit{grid-template-columns:1fr;gap:8px}.side{position:static;margin-top:24px}
  .cols{grid-template-columns:1fr;gap:20px}
  .list .item{grid-template-columns:1fr;gap:4px}
  .two{grid-template-columns:1fr}
  header.top nav a.link{display:none}
}
`;

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;550;600;650&display=swap" rel="stylesheet">`;
const COPY_JS = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o},1400)})});</script>`;

const page = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${FONT}${head}<style>${CSS}</style></head><body>${body}</body></html>`;

const header = (cta = true) => `<header class="top wrap"><a class="mark" href="/"><i></i>Launchpad</a><nav><a class="link" href="/ops">How it runs</a>${cta ? `<a class="btn sm" href="/new">Plan a launch</a>` : ""}</nav></header>`;
const footer = `<footer class="wrap"><p>Launchpad is run by AI agents and is not affiliated with Y Combinator. No bots or fake engagement: every boost is a real founder choosing to share. <a href="/ops">See what the agents do</a>.</p></footer>`;
const copyBtn = (text: string, label = "Copy") => `<button class="copy" type="button" data-copy="${esc(text)}">${esc(label)}</button>`;

// ------------------------------------------------------------------- landing

type Overview = { launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number };

export function renderHome(d: { overview: Overview; launches: Launch[] }): string {
  const listed = d.launches.filter((l) => l.listed && (l.status === "launched" || l.status === "reported"));
  const o = d.overview;
  const numbers = o.launched > 0
    ? `<div class="numbers wrap" style="padding-left:0;padding-right:0"><span><b>${o.launched}</b> launched</span><span><b>${o.clicks}</b> people clicked through</span><span><b>${o.boosts_shared}</b> ${o.boosts_shared === 1 ? "boost" : "boosts"} shared by founders</span><span><b>${o.squad}</b> founders in the squad</span></div>`
    : "";
  return page("Launchpad — launch everywhere at once", `${header()}
<main class="wrap">
<section class="hero">
  <div>
    <p class="eyebrow">For YC founders</p>
    <h1 style="margin-top:14px">Launch everywhere at once.</h1>
    <p class="lede">Tell us what you're launching. Agents time each channel around what else is launching, write every post in that channel's voice, and line up founders who share it.</p>
    <div class="ctas"><a class="btn" href="/new">Plan my launch</a><span class="small muted">Free. Your kit arrives in about ten minutes.</span></div>
  </div>
  <div class="preview" aria-label="A sample launch kit">
    <div class="bar"><span><b style="font-weight:600">Ledgerline</b> <span class="muted">· launch kit</span></span><span class="status live">Live</span></div>
    <div class="slot"><span class="muted">Sun 7:00 AM</span><span><b>X</b> — a quiet morning: no other YC launches scheduled</span></div>
    <div class="slot"><span class="muted">Sun 8:00 AM</span><span><b>Launch YC</b> — while the thread is still fresh</span></div>
    <div class="slot"><span class="muted">Mon 7:30 ET</span><span><b>Show HN</b> — weekday mornings, when HN peaks</span></div>
    <div class="slot"><span class="muted">Tue 12:01 AM</span><span><b>Product Hunt</b> — the whole day on the front page</span></div>
    <div class="tweet"><div class="who"><i></i><b style="font-weight:600">Ledgerline</b><span class="muted">· 7:00 AM</span></div>Today we're launching Ledgerline: agents that file your small-business taxes, with a human CPA signing every return.</div>
  </div>
</section>
<section class="points">
  <div><h3>Timing, not guesswork</h3><p>Each channel gets a time and a reason. We check Launch YC, Show HN and Product Hunt so you don't land on the same morning as everyone else.</p></div>
  <div><h3>Every post, written for its channel</h3><p>An X thread, a LinkedIn post, a plain Show HN, a Product Hunt listing, a Launch YC post and a note to your network. Each one opens ready to post in one click.</p></div>
  <div><h3>Founders who actually share</h3><p>Press Launch now and founders in the squad get a one-tap request to share it. You do the same for them. No bots and no upvote rings: those get launches buried.</p></div>
</section>
${numbers}
${listed.length ? `<section class="section"><h2>Recent launches</h2><div class="list">${listed.map((l) => `<div class="item"><b style="font-weight:600">${esc(l.company)}</b><span class="muted">${esc(l.one_liner)}</span><a class="small" href="${esc(l.url)}" rel="noopener">${esc(l.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a></div>`).join("")}</div></section>` : ""}
</main>${footer}`, `<meta name="description" content="Launch everywhere at once: timing for every channel, every post written, and founders who share it. For YC founders.">`);
}

// ------------------------------------------------------------------- the form

export function renderNew(error?: string, v: Record<string, string> = {}): string {
  const posted = Boolean(v["_posted"]);
  const on = (name: string) => (posted ? Boolean(v[name]) : true);
  const field = (name: string, label: string, opts: { type?: string; hint?: string; required?: boolean; max?: number; placeholder?: string } = {}) =>
    `<label class="field"><span>${esc(label)}${opts.hint ? ` <em>${esc(opts.hint)}</em>` : ""}</span><input type="${opts.type ?? "text"}" name="${name}" ${opts.required ? "required" : ""} maxlength="${opts.max ?? 200}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ""} value="${esc(v[name])}"></label>`;
  return page("Plan a launch · Launchpad", `${header(false)}
<main class="wrap narrow form">
<h1>Plan a launch</h1>
<p class="lede">Takes about two minutes. Your kit, with timing for each channel and every post written, arrives by email in about ten.</p>
<form method="post" action="/new">
${error ? `<div class="error" role="alert">${esc(error)}</div>` : ""}
<fieldset><legend>What you're launching</legend>
${field("company", "Company", { required: true, max: 80 })}
${field("one_liner", "One-liner", { hint: "what it does, for whom", required: true, max: 160 })}
<label class="field"><span>The launch <em>the problem, what's new, anything we should know</em></span><textarea name="description" required maxlength="3000">${esc(v["description"])}</textarea></label>
<div class="two">${field("url", "Link", { type: "url", required: true, max: 500, placeholder: "https://" })}${field("video_url", "Launch video", { type: "url", hint: "optional", max: 500, placeholder: "https://" })}</div>
<div class="two">${field("launch_when", "When", { hint: "e.g. Sunday morning", max: 120 })}${field("batch", "YC batch", { hint: "optional", max: 10, placeholder: "F25" })}</div>
</fieldset>
<fieldset><legend>Channels</legend><div class="chips">${CHANNELS.map((c) => `<label><input type="checkbox" name="ch_${c}" value="1" ${on(`ch_${c}`) ? "checked" : ""}><span>${esc(CHANNEL_NAMES[c])}</span></label>`).join("")}</div></fieldset>
<fieldset><legend>You</legend>
<div class="two">${field("email", "Email", { type: "email", hint: "your kit goes here", required: true, max: 254 })}${field("x_handle", "X handle", { hint: "optional", max: 40, placeholder: "@" })}</div>
<label class="check"><input type="checkbox" name="join_squad" value="1" ${on("join_squad") ? "checked" : ""}><span>Join the boost squad. You'll get a one-tap request when another founder launches, at most three a day, and they'll boost yours.</span></label>
<label class="check"><input type="checkbox" name="listed" value="1" ${on("listed") ? "checked" : ""}><span>Show my launch on Launchpad's front page once it's live.</span></label>
</fieldset>
<input type="hidden" name="timezone" id="tz"><script>try{document.getElementById("tz").value=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}</script>
<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap"><button class="btn" type="submit">Write my kit</button><span class="small muted">We only email you your kit, your results and squad requests. Reply "stop" anytime.</span></div>
</form>
</main>${footer}`);
}

// ------------------------------------------------------------------- the founder's kit

export function renderKit(l: Launch, d: { links: Record<string, string>; origin: string; stats: LaunchStats; squad: number; reports: Omit<Report, "body">[]; reciprocity: { given: number; received: number } }): string {
  const t = `?t=${l.token}`;
  if (!l.kit) {
    return page(`${l.company} launch kit · Launchpad`, `${header(false)}<main class="wrap narrow writing">
<p class="eyebrow">Launch kit · ${esc(l.company)}</p>
<h1>Writing your launch kit…</h1>
<p class="muted" style="font-size:16px;max-width:34em">The producer is reading your site, checking what else is launching this week, and writing every post. This usually takes about ten minutes. We'll email ${esc(maskEmail(l.email))} when it's ready, and this page refreshes on its own.</p>
<div class="pulse" role="progressbar" aria-label="Writing"></div>
<p class="small muted" style="margin-top:28px">Bookmark this page. It's your private kit.</p>
</main>${footer}`, `<meta http-equiv="refresh" content="20"><meta name="robots" content="noindex">`);
  }

  const kit = l.kit;
  const tracked = (c: string) => (d.links[c] ? `${d.origin}/l/${d.links[c]}` : l.url);
  const whenOf = (c: Channel) => kit.timing.find((x) => x.channel === c);
  const chosen = CHANNELS.filter((c) => kit.posts[c as keyof typeof kit.posts]);
  const post = (body: string, foot: string, raw = body, label = "") =>
    `<div class="post">${label ? `<div class="label">${esc(label)}</div>` : ""}<div class="body">${body}</div><div class="foot"><span>${foot}</span>${copyBtn(raw)}</div></div>`;
  const section = (c: Channel, action: string, inner: string, note = "") => {
    const w = whenOf(c);
    return `<section class="channel" id="ch-${c}"><div class="head"><div><h2>${esc(CHANNEL_NAMES[c])}</h2>${w ? `<div class="when">${esc(w.when)} — ${esc(w.why)}</div>` : ""}</div>${action}</div>${inner}${note ? `<p class="note">${note}</p>` : ""}</section>`;
  };

  const sections: string[] = [];
  if (kit.posts.x) {
    const thread = kit.posts.x.map((p) => withLink(p, tracked("x")));
    sections.push(section("x", `<a class="btn sm" href="${esc(share.x(thread[0]!))}" target="_blank" rel="noopener">Post on X</a>`,
      `<div class="thread">${thread.map((p, i) => post(esc(p), `${i + 1}/${thread.length} · ${p.length} characters`, p)).join("")}</div>`,
      thread.length > 1 ? "The button opens the first post. Reply to it with the rest, in order." : ""));
  }
  if (kit.posts.linkedin) {
    const text = withLink(kit.posts.linkedin, tracked("linkedin"));
    sections.push(section("linkedin", `<a class="btn sm" href="${esc(share.linkedin(text))}" target="_blank" rel="noopener">Post on LinkedIn</a>`, post(esc(text), `${text.length} characters`, text)));
  }
  if (kit.posts.show_hn) {
    const hn = kit.posts.show_hn;
    sections.push(section("show_hn", `<a class="btn sm" href="${esc(share.show_hn(utm(l.url, "hn"), hn.title))}" target="_blank" rel="noopener">Submit to HN</a>`,
      post(esc(hn.title), "Title", hn.title) + post(esc(hn.text), "First comment", hn.text), "HN expects the real URL, so this one isn't redirected. It's tagged <span class=\"mono\">?ref=hn</span> instead."));
  }
  if (kit.posts.product_hunt) {
    const ph = kit.posts.product_hunt;
    sections.push(section("product_hunt", `<a class="btn sm quiet" href="${esc(share.product_hunt())}" target="_blank" rel="noopener">Open Product Hunt</a>`,
      post(esc(ph.tagline), "Tagline", ph.tagline) + post(esc(ph.description), "Description", ph.description) + post(esc(ph.first_comment), "Maker's first comment", ph.first_comment),
      `Website field: <span class="mono">${esc(utm(l.url, "producthunt"))}</span>`));
  }
  if (kit.posts.launch_yc) {
    const body = withLink(kit.posts.launch_yc.body, tracked("launch_yc"));
    sections.push(section("launch_yc", `<a class="btn sm quiet" href="${esc(share.launch_yc())}" target="_blank" rel="noopener">Open Launch YC</a>`,
      post(esc(kit.posts.launch_yc.title), "Title", kit.posts.launch_yc.title) + `<div class="post"><div class="body prose" style="white-space:normal;color:var(--ink)">${renderMarkdown(body)}</div><div class="foot"><span>Post body · copies as Markdown</span>${copyBtn(body)}</div></div>`));
  }
  if (kit.posts.email) {
    const body = withLink(kit.posts.email.body, tracked("email"));
    sections.push(section("email", `<a class="btn sm quiet" href="${esc(share.email(kit.posts.email.subject, body))}">Open in email</a>`,
      post(esc(kit.posts.email.subject), "Subject", kit.posts.email.subject) + post(esc(body), "Body", body)));
  }

  const s = d.stats;
  const launched = l.status === "launched" || l.status === "reported";
  const channelsForBars = [...(["x", "linkedin", "launch_yc", "email"] as const).filter((c) => chosen.includes(c)), "boost" as const];
  const max = Math.max(1, ...channelsForBars.map((c) => s.clicks_by_channel[c] ?? 0));
  const results = launched ? `<section class="results">
<p class="eyebrow">Results so far</p>
<div class="big"><div><b>${s.clicks_total}</b><span>people clicked through</span></div><div><b>${s.boosts.shared}</b><span>founders shared it</span></div><div><b>${s.boosts.sent}</b><span>founders asked</span></div></div>
<div class="bars">${channelsForBars.map((c) => { const n = s.clicks_by_channel[c] ?? 0; return `<div class="row"><span>${esc(c === "boost" ? "Squad shares" : CHANNEL_NAMES[c])}</span><div class="track"><div class="fill" style="width:${Math.round((n / max) * 100)}%"></div></div><span class="n">${n}</span></div>`; }).join("")}</div>
<p class="note">Counts unique people per tracked link. Bots and refreshes are ignored. Show HN and Product Hunt use your real URL, so check those in your own analytics.</p>
${d.reports.length ? `<div style="margin-top:18px">${d.reports.map((r) => `<p><a href="/r/${esc(r.id)}${esc(t)}">${esc(r.title)}</a> <span class="small muted">· report · ${esc(time(r.created_at))}</span></p>`).join("")}</div>` : ""}
</section><hr class="rule">` : "";

  const launchPanel = launched
    ? `<div class="panel"><span class="status live">You're live</span><p style="margin-top:8px">${esc(plural(s.boosts.sent, "squad founder was", "squad founders were"))} asked to share it, and ${esc(plural(s.boosts.shared, "has", "have"))} so far.</p></div>`
    : `<div class="panel"><h3>When your first post is up</h3><p>${d.squad > 0 ? `Press Launch now and ${esc(plural(d.squad, "founder", "founders"))} in the squad get a one-tap request to share it.` : "Press Launch now. You're the first in the squad, so every founder who joins after you will be asked to share it."}</p><form method="post" action="/k/${esc(l.slug)}/go${esc(t)}"><button class="btn" type="submit">Launch now</button></form></div>`;

  return page(`${l.company} launch kit · Launchpad`, `${header(false)}
<main class="wrap">
<div class="kithead"><div><p class="eyebrow">Launch kit</p><h1>${esc(l.company)}</h1><p class="muted">${esc(l.one_liner)}</p></div>
<div class="right" style="text-align:right">${launched ? `<span class="status live">Live</span>` : `<span class="status">Ready to launch</span>`}<p class="small muted" style="margin-top:6px">Private link. Bookmark it.</p></div></div>
<div class="kit">
<div>
<div class="mobile-only" style="margin-bottom:24px">${launchPanel}</div>
${results}
<section style="padding:${launched ? "28px" : "0"} 0 30px"><p class="eyebrow" style="margin-bottom:10px">The plan</p><div class="prose">${renderMarkdown(kit.strategy)}</div>
<nav class="jump" aria-label="Channels" style="margin-top:22px">${chosen.map((c) => `<a href="#ch-${c}">${esc(CHANNEL_NAMES[c])}</a>`).join("")}</nav></section>
${sections.join("")}
</div>
<aside class="side">
<div class="launch">${launchPanel}</div>
<div><p class="eyebrow" style="margin-bottom:6px">When to post</p><ul class="timeline">${[...kit.timing].map((x) => `<li><a href="#ch-${esc(x.channel)}"><span class="t">${esc(x.when)}</span></a><span class="c">${esc(CHANNEL_NAMES[x.channel])}</span></li>`).join("")}</ul></div>
${kit.checklist.length ? `<div><p class="eyebrow" style="margin-bottom:6px">Launch day</p><ul class="todo">${kit.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
</aside>
</div>
</main>${footer}${COPY_JS}`, `<meta name="robots" content="noindex">${launched ? `<meta http-equiv="refresh" content="120">` : ""}`);
}

// ------------------------------------------------------------------- boost page

export function renderBoost(d: { company: string; one_liner: string; url: string; video_url: string | null; booster: string; code: string; status: string; boostText: string }): string {
  const done = d.status === "shared";
  return page(`Boost ${d.company} · Launchpad`, `${header(false)}
<main class="wrap narrow" style="padding:56px 20px">
<p class="eyebrow">Boost squad</p>
<h1 style="font-size:34px;letter-spacing:-.03em;margin:12px 0 10px">${esc(d.company)} just launched</h1>
<p style="font-size:17px;color:var(--ink-2)">${esc(d.one_liner)}${d.video_url ? ` <a class="small" href="${esc(d.video_url)}" rel="noopener" target="_blank" style="margin-left:6px">Watch the video</a>` : ""}</p>
<div class="post" style="margin:28px 0 16px"><div class="body">${esc(d.boostText)}</div><div class="foot"><span>Your post. Edit it however you like.</span>${copyBtn(d.boostText)}</div></div>
<div style="display:flex;gap:10px;flex-wrap:wrap"><a class="btn" href="/b/${esc(d.code)}/go?to=x" target="_blank" rel="noopener">Share on X</a><a class="btn quiet" href="/b/${esc(d.code)}/go?to=linkedin" target="_blank" rel="noopener">Share on LinkedIn</a></div>
${done ? `<p class="status live" style="margin-top:18px">Thanks for boosting. The squad returns the favour when you launch.</p>` : ""}
<p class="small muted" style="margin-top:36px">You're getting this because ${esc(d.booster)} is in the Launchpad boost squad. Only share it if you'd recommend it. <a href="/b/${esc(d.code)}/skip">Skip this one</a> · <a href="/b/${esc(d.code)}/stop">Leave the squad</a></p>
</main>${footer}${COPY_JS}`, `<meta name="robots" content="noindex">`);
}

export const renderMessage = (title: string, text: string) =>
  page(`${title} · Launchpad`, `${header()}<main class="wrap narrow" style="padding:80px 20px"><h1 style="font-size:30px;letter-spacing:-.03em">${esc(title)}</h1><p class="muted" style="margin-top:10px;font-size:16px">${esc(text)}</p></main>${footer}`);

const SOURCE_NAMES: Record<string, string> = { launch_yc: "Launch YC", show_hn: "Show HN", product_hunt: "Product Hunt", x: "X", other: "Other" };

// ------------------------------------------------------------------- ops log

export function renderOps(d: { overview: Overview; launches: Launch[]; decisions: Decision[]; touches: Touch[]; radar: RadarItem[]; reports: (Omit<Report, "body"> & { listed: boolean })[]; interventions: { description: string; created_at: Date }[]; now: Date }): string {
  const byId = new Map(d.launches.map((l) => [l.id, l]));
  const name = (launchId: string | null) => { if (!launchId) return "Launchpad"; const l = byId.get(launchId); return l ? (l.listed ? l.company : "An unlisted launch") : ""; };
  const feed = <T>(rows: T[], empty: string, f: (r: T) => string) => (rows.length ? `<ul class="feed">${rows.map(f).join("")}</ul>` : `<p class="empty">${esc(empty)}</p>`);
  const o = d.overview;
  const reports = d.reports.filter((r) => r.listed);
  return page("How it runs · Launchpad", `${header()}
<main class="wrap">
<section style="padding:48px 0 8px"><p class="eyebrow">The live record</p><h1 style="font-size:36px;letter-spacing:-.03em;margin:12px 0 12px">How Launchpad runs</h1>
<p class="prose" style="font-size:16px">No human staff. A <b>producer</b> writes each kit and the report afterwards. A <b>booster</b> asks squad founders to share each launch. A <b>scout</b> finds YC founders who are launching and offers them a kit. A <b>concierge</b> answers the inbox. Everything they do lands here. Updated ${esc(time(d.now))}.</p></section>
<div class="numbers"><span><b>${o.launches}</b> launches planned</span><span><b>${o.launched}</b> launched</span><span><b>${o.clicks}</b> people clicked through</span><span><b>${o.boosts_sent}</b> ${o.boosts_sent === 1 ? "boost" : "boosts"} asked</span><span><b>${o.boosts_shared}</b> shared</span><span><b>${o.squad}</b> in the squad</span><span><b>${d.interventions.length}</b> human step-ins</span></div>
<section class="section"><h2>Launches</h2>${d.launches.length === 0 ? `<p class="empty">None yet.</p>` : `<div class="tablewrap"><table class="t"><thead><tr><th>Company</th><th>Status</th><th>Asked</th><th>Kit ready</th><th>Launched</th></tr></thead><tbody>${[...d.launches].reverse().map((l) => `<tr><td>${esc(l.listed ? l.company : "Unlisted launch")}</td><td><span class="status ${l.status === "launched" || l.status === "reported" ? "live" : ""}">${esc(l.status)}</span></td><td class="muted">${esc(time(l.created_at))}</td><td class="muted">${l.ready_at ? esc(time(l.ready_at)) : "—"}</td><td class="muted">${l.launched_at ? esc(time(l.launched_at)) : "—"}</td></tr>`).join("")}</tbody></table></div>`}</section>
<section class="section"><h2>Reports</h2>${feed(reports, "None yet. The producer writes one about two hours after each launch.", (r) => `<li><div class="meta"><b>${esc(name(r.launch_id))}</b> · ${esc(time(r.created_at))}</div><p><a href="/r/${esc(r.id)}">${esc(r.title)}</a></p></li>`)}</section>
<section class="section"><h2>Decisions</h2>${feed(d.decisions, "None yet.", (x) => `<li><div class="meta"><b>${esc(name(x.launch_id))}</b> · ${esc(x.decision)} · ${esc(x.agent)} · ${esc(time(x.created_at))}</div><p>${esc(x.reasoning)}</p></li>`)}</section>
<section class="section cols">
<div><h2 style="font-size:20px;margin-bottom:18px">Outreach</h2>${feed(d.touches, "None yet.", (x) => `<li><div class="meta"><b>${esc(x.channel)}</b>${x.target ? ` · to ${esc(maskEmail(x.target))}` : ""} · ${esc(time(x.created_at))}</div><p>${esc(x.content.slice(0, 240))}</p></li>`)}</div>
<div><h2 style="font-size:20px;margin-bottom:18px">Launch radar</h2>${feed(d.radar, "Nothing yet.", (r) => `<li><div class="meta"><b>${esc(SOURCE_NAMES[r.source] ?? r.source)}</b>${r.batch ? ` · ${esc(r.batch)}` : ""}</div><p><a href="${esc(r.url)}" rel="noopener nofollow">${esc(r.title)}</a></p></li>`)}</div>
</section>
<section class="section"><h2>Where a human stepped in</h2>${feed(d.interventions, "None so far.", (x) => `<li><div class="meta">${esc(time(x.created_at))}</div><p>${esc(x.description)}</p></li>`)}</section>
</main>${footer}`, `<meta http-equiv="refresh" content="60">`);
}

export function renderReport(r: Report, company: string, stats: LaunchStats | null): string {
  return page(`${r.title} · Launchpad`, `${header()}<main class="wrap narrow" style="padding:48px 20px">
<p class="eyebrow">Launch report · ${esc(company)} · ${esc(time(r.created_at))}</p>
<h1 style="font-size:32px;letter-spacing:-.03em;margin:12px 0 24px">${esc(r.title)}</h1>
${stats ? `<div class="big" style="margin-bottom:28px"><div><b>${stats.clicks_total}</b><span>people clicked through</span></div><div><b>${stats.boosts.shared}</b><span>founders shared it</span></div><div><b>${stats.boost_clicks}</b><span>clicks from shares</span></div></div><hr class="rule" style="margin-bottom:24px">` : ""}
<article class="prose" style="font-size:15.5px">${renderMarkdown(r.body)}</article>
<p class="small muted" style="margin-top:28px">Numbers are counted by Launchpad, not reported by the agent.</p>
</main>${footer}`, `<meta name="robots" content="noindex">`);
}
