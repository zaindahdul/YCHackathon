/**
 * Launchpad's HTML: the landing page, the launch form, the founder's private kit, the boost page
 * squad founders get, the public ops log and reports. Server-rendered, no framework.
 *
 * Design: quiet and roomy. Generous whitespace, a small type scale with one large display size,
 * surfaces instead of boxes, very few rules, sentence-case labels, one green reserved for "live".
 * No emoji, no gradients, no uppercase eyebrows. The landing page shows the product.
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

const LIGHT = `--bg:#fbfbf9;--surface:#f3f2ee;--raised:#ffffff;--ink:#111110;--ink-2:#4a4944;--muted:#8a8982;--line:#e8e6e0;
--btn:#111110;--btn-ink:#fbfbf9;--live:#0f7a4c;--live-soft:#e3f2ea;--focus:#2f6fe4;color-scheme:light`;
const DARK = `--bg:#0c0c0b;--surface:#151514;--raised:#1a1a19;--ink:#f1f0ec;--ink-2:#bdbcb6;--muted:#7f7e78;--line:#222220;
--btn:#f1f0ec;--btn-ink:#0c0c0b;--live:#5ad19d;--live-soft:#12291d;--focus:#7aa7ff;color-scheme:dark`;

const CSS = `
:root{${LIGHT}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){${DARK}}}
:root[data-theme="dark"]{${DARK}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.65 "Inter",ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;font-feature-settings:"cv11","ss01";-webkit-font-smoothing:antialiased}
a{color:inherit;text-decoration-thickness:1px;text-underline-offset:3px;text-decoration-color:var(--muted)}
a:hover{text-decoration-color:var(--ink)}
h1,h2,h3{margin:0;font-weight:500;letter-spacing:-.02em;line-height:1.15}
p{margin:0}
:focus-visible{outline:2px solid var(--focus);outline-offset:2px}
.wrap{max-width:1120px;margin:0 auto;padding:0 32px}
.narrow{max-width:640px;margin-left:auto;margin-right:auto}
.muted{color:var(--muted)}.small{font-size:13px}.mono{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;font-size:12.5px}
.label{font-size:13px;color:var(--muted)}
header.top{display:flex;justify-content:space-between;align-items:center;height:88px}
.mark{display:inline-flex;align-items:center;gap:10px;font-weight:550;letter-spacing:-.01em;text-decoration:none;font-size:15px}
.mark i{width:12px;height:12px;border-radius:2px;background:var(--ink);display:inline-block;transform:rotate(45deg) scale(.85)}
header.top nav{display:flex;gap:28px;align-items:center;font-size:14px}
header.top nav a.link{text-decoration:none;color:var(--muted)}header.top nav a.link:hover{color:var(--ink)}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:var(--btn);color:var(--btn-ink);border:1px solid var(--btn);border-radius:999px;padding:11px 20px;font:inherit;font-weight:500;font-size:14px;line-height:1.2;text-decoration:none;cursor:pointer;white-space:nowrap;transition:opacity .15s}
.btn:hover{opacity:.86}
.btn.quiet{background:transparent;color:var(--ink);border-color:var(--line)}.btn.quiet:hover{border-color:var(--muted);opacity:1}
.btn.sm{padding:8px 15px;font-size:13px}
.copy{background:none;border:0;padding:4px 8px;margin:-4px -8px;font:inherit;font-size:12.5px;color:var(--muted);cursor:pointer;border-radius:6px}
.copy:hover{color:var(--ink)}
.status{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--muted)}
.status::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--muted)}
.status.live{color:var(--live)}.status.live::before{background:var(--live);box-shadow:0 0 0 3px var(--live-soft)}
footer.wrap{margin:160px auto 0;padding:32px 32px 48px;font-size:13px;color:var(--muted)}
footer p{max-width:62ch}
footer .row{display:flex;justify-content:space-between;gap:32px;flex-wrap:wrap;border-top:1px solid var(--line);padding-top:28px}
/* landing */
.hero{padding:112px 0 0;max-width:760px}
.hero h1{font-size:clamp(44px,6.4vw,76px);letter-spacing:-.045em;line-height:1;font-weight:500;text-wrap:balance}
.hero .lede{font-size:19px;line-height:1.6;color:var(--ink-2);margin:32px 0 40px;max-width:31em}
.hero .ctas{display:flex;gap:20px;align-items:center;flex-wrap:wrap}
.showcase{margin-top:104px;background:var(--surface);border-radius:20px;padding:40px;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:40px;align-items:start}
.showcase .sched{display:grid;gap:4px}
.showcase .sched .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.showcase .sched .head b{font-weight:550}
.showcase .slot{display:grid;grid-template-columns:112px 1fr;gap:16px;padding:12px 0;font-size:14px}
.showcase .slot span:first-child{color:var(--muted);font-variant-numeric:tabular-nums}
.showcase .tweet{background:var(--raised);border-radius:14px;padding:24px;font-size:15px;line-height:1.6;box-shadow:0 1px 2px rgba(0,0,0,.04),0 12px 32px -20px rgba(0,0,0,.25)}
.showcase .tweet .who{display:flex;gap:10px;align-items:center;margin-bottom:12px;font-size:14px}
.showcase .tweet .who i{width:28px;height:28px;border-radius:50%;background:var(--surface);display:inline-block}
.showcase .tweet .who b{font-weight:550}
.showcase .tweet .foot{margin-top:16px;font-size:13px;color:var(--muted)}
.points{display:grid;grid-template-columns:repeat(3,1fr);gap:64px;padding:144px 0 0}
.points h3{font-size:17px;margin-bottom:12px;font-weight:550;letter-spacing:-.01em}
.points p{color:var(--ink-2);font-size:15px;max-width:30ch}
.numbers{display:flex;gap:64px;flex-wrap:wrap;padding:120px 0 0}
.numbers div b{display:block;font-size:40px;font-weight:500;letter-spacing:-.035em;line-height:1.1;font-variant-numeric:tabular-nums}
.numbers div span{font-size:13px;color:var(--muted)}
.recent{padding:120px 0 0}
.recent h2{font-size:22px;margin-bottom:24px}
.recent .item{display:grid;grid-template-columns:200px 1fr auto;gap:32px;padding:20px 0;border-top:1px solid var(--line);align-items:baseline}
.recent .item b{font-weight:550}
/* form */
.form{padding:72px 0 0}
.form h1{font-size:44px;letter-spacing:-.04em}
.form .lede{color:var(--ink-2);margin:16px 0 64px;font-size:17px}
fieldset{border:0;padding:0;margin:0 0 64px}
legend{font-size:18px;font-weight:500;letter-spacing:-.01em;margin-bottom:28px;padding:0}
.field{display:grid;gap:8px;margin-bottom:24px}
.field>span{font-size:14px;font-weight:500}
.field>span em{font-style:normal;font-weight:400;color:var(--muted);margin-left:4px}
input[type=text],input[type=url],input[type=email],textarea{font:inherit;font-size:15px;color:var(--ink);background:var(--surface);border:1px solid transparent;border-radius:10px;padding:12px 14px;width:100%;transition:border-color .15s,background .15s}
input:hover,textarea:hover{border-color:var(--line)}
input:focus,textarea:focus{outline:none;border-color:var(--ink);background:var(--raised)}
input::placeholder,textarea::placeholder{color:var(--muted)}
textarea{min-height:132px;resize:vertical}
.two{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.chips{display:flex;flex-wrap:wrap;gap:10px}
.chips label{position:relative}
.chips input{position:absolute;opacity:0;inset:0;cursor:pointer}
.chips span{display:inline-block;padding:9px 16px;border:1px solid var(--line);border-radius:999px;font-size:14px;color:var(--muted);transition:all .15s}
.chips input:checked+span{color:var(--ink);border-color:var(--ink)}
.chips input:focus-visible+span{outline:2px solid var(--focus);outline-offset:2px}
.check{display:grid;grid-template-columns:18px 1fr;gap:14px;align-items:start;font-size:14.5px;color:var(--ink-2);margin-bottom:16px}
.check input{width:16px;height:16px;margin:4px 0 0;accent-color:var(--ink)}
.submit{display:flex;gap:24px;align-items:center;flex-wrap:wrap;padding-top:8px}
.error{background:var(--surface);border-radius:10px;padding:14px 16px;margin-bottom:32px;font-size:14px;color:var(--ink)}
.error::before{content:"";display:inline-block;width:6px;height:6px;border-radius:50%;background:#d9541e;margin-right:10px;vertical-align:middle}
.hp{position:absolute;left:-10000px;width:1px;height:1px;overflow:hidden}
/* kit */
.kithead{display:flex;justify-content:space-between;align-items:flex-end;gap:32px;flex-wrap:wrap;padding:72px 0 0}
.kithead h1{font-size:48px;letter-spacing:-.04em;margin:10px 0 12px}
.kithead .sub{font-size:17px;color:var(--ink-2);max-width:40em}
.kit{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:96px;padding-top:80px;align-items:start}
.side{position:sticky;top:32px;display:grid;gap:48px}
.panel{background:var(--surface);border-radius:16px;padding:24px}
.panel h3{font-size:16px;margin-bottom:8px;font-weight:550;letter-spacing:-.01em}
.panel p{font-size:14px;color:var(--ink-2)}
.panel .btn{width:100%;margin-top:20px;padding:12px 16px}
.side .label{margin-bottom:16px}
.timeline{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.timeline a{display:grid;grid-template-columns:1fr auto;gap:12px;padding:8px 0;font-size:14px;text-decoration:none}
.timeline a .c{color:var(--ink)}.timeline a .t{color:var(--muted);font-variant-numeric:tabular-nums;font-size:13px}
.timeline a:hover .c{text-decoration:underline;text-underline-offset:3px}
.todo{list-style:none;margin:0;padding:0;font-size:14px;color:var(--ink-2);display:grid;gap:12px}
.todo li{line-height:1.5}
.todo label{display:grid;grid-template-columns:18px 1fr;gap:8px;align-items:start;cursor:pointer}
.todo input{width:14px;height:14px;margin:4px 0 0;accent-color:var(--ink)}
.todo input:checked+span{color:var(--muted);text-decoration:line-through}
.prose{max-width:62ch;color:var(--ink-2);font-size:16px;line-height:1.7}
.prose p+p{margin-top:16px}.prose strong{color:var(--ink);font-weight:550}
.prose h2{font-size:19px;color:var(--ink);margin:40px 0 12px}.prose h3{font-size:16px;color:var(--ink);margin:28px 0 8px;font-weight:550}
.prose ul,.prose ol{padding-left:20px;margin:12px 0}.prose li{margin:6px 0}
.prose blockquote{margin:16px 0;padding:2px 0 2px 16px;border-left:2px solid var(--line);color:var(--ink)}
.prose code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;background:var(--surface);padding:1px 5px;border-radius:4px}
.plan .label{margin-bottom:16px}
.channel{padding-top:96px;scroll-margin-top:24px}
.channel>.head{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;margin-bottom:24px}
.channel>.head h2{font-size:24px;letter-spacing:-.025em}
.channel>.head .when{font-size:14px;color:var(--muted);margin-top:6px}
.posts{display:grid;gap:12px}
.post{background:var(--surface);border-radius:14px;padding:20px 22px}
.post .top{display:flex;justify-content:space-between;align-items:center;gap:16px;margin-bottom:10px;font-size:12.5px;color:var(--muted)}
.post .body{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.65}
.thread{background:var(--surface);border-radius:14px}
.thread .post{background:none;border-radius:0}
.thread .post+.post{border-top:1px solid var(--line)}
.note{font-size:13px;color:var(--muted);margin-top:16px}
.results{padding-bottom:96px}
.results .label{margin-bottom:24px}
.big{display:flex;gap:64px;flex-wrap:wrap;margin:0 0 40px}
.big div b{display:block;font-size:44px;font-weight:500;letter-spacing:-.04em;font-variant-numeric:tabular-nums;line-height:1.05}
.big div span{font-size:13px;color:var(--muted)}
.bars{display:grid;gap:14px;max-width:520px}
.bars .row{display:grid;grid-template-columns:150px 1fr 40px;gap:16px;align-items:center;font-size:14px}
.bars .track{height:4px;background:var(--surface);border-radius:2px;overflow:hidden}
.bars .fill{height:100%;background:var(--ink);border-radius:2px}
.bars .n{text-align:right;font-variant-numeric:tabular-nums;color:var(--ink-2)}
.writing{padding:160px 0 0}
.writing h1{font-size:40px;letter-spacing:-.04em;margin:14px 0 20px}
.pulse{width:200px;height:2px;background:var(--line);overflow:hidden;border-radius:2px;margin-top:48px}
.pulse::after{content:"";display:block;width:40%;height:100%;background:var(--ink);animation:slide 1.4s ease-in-out infinite}
@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(260%)}}
@media (prefers-reduced-motion:reduce){.pulse::after{animation:none;width:100%}}
/* ops */
.opshead{padding:72px 0 0;max-width:720px}
.opshead h1{font-size:48px;letter-spacing:-.04em;margin-bottom:20px}
.opshead p{font-size:17px;color:var(--ink-2);line-height:1.65}
.opshead p.updated{font-size:13px;color:var(--muted);margin-top:20px}
.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.kpis div{background:var(--surface);border-radius:16px;padding:24px 24px 22px}
.kpis b{display:block;font-size:40px;font-weight:500;letter-spacing:-.04em;line-height:1.1;font-variant-numeric:tabular-nums;margin:10px 0 4px}
.kpis span{font-size:13px;color:var(--muted)}
.kpis em{font-style:normal;font-size:13px;color:var(--muted)}
.block{display:grid;grid-template-columns:240px minmax(0,1fr);gap:64px;padding:64px 0;border-top:1px solid var(--line)}
.blocks{padding-top:96px}
.blocks .block:last-child{border-bottom:1px solid var(--line)}
.block>header h2{font-size:18px;letter-spacing:-.015em}
.block>header p{font-size:13.5px;color:var(--muted);margin-top:8px;max-width:26ch;line-height:1.55}
.opshead .ctas{display:flex;gap:20px;align-items:center;flex-wrap:wrap;margin-top:36px}
.steps{list-style:none;margin:0;padding:96px 0 0;display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
.steps li{background:var(--surface);border-radius:16px;padding:28px 24px 30px}
.steps .n{display:inline-flex;width:28px;height:28px;border-radius:50%;border:1px solid var(--line);align-items:center;justify-content:center;font-size:13px;color:var(--muted);font-variant-numeric:tabular-nums}
.steps .who{font-size:13px;color:var(--muted);margin:28px 0 6px}
.steps h3{font-size:17px;font-weight:550;letter-spacing:-.01em;margin-bottom:10px}
.steps li>p:last-child{font-size:14.5px;color:var(--ink-2);line-height:1.6}
.behind{margin-top:28px;font-size:14px;color:var(--muted);max-width:70ch}
.live{padding-top:120px}
.livehead{display:flex;align-items:baseline;gap:16px;margin-bottom:24px}
.livehead h2{font-size:22px;letter-spacing:-.02em}
.livehead .updated{font-size:13px;color:var(--muted)}
.recentlog{list-style:none;margin:32px 0 0;padding:0}
.recentlog li{display:grid;grid-template-columns:110px minmax(0,1fr) auto;gap:24px;padding:14px 0;border-top:1px solid var(--line);font-size:14.5px;align-items:baseline}
.recentlog .who{color:var(--muted);font-size:13px;text-transform:capitalize}
.recentlog .what{color:var(--ink-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.recentlog .when{color:var(--muted);font-size:13px;white-space:nowrap}
.fulllog{margin-top:56px}
.fulllog summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:12px;font-size:14px;color:var(--ink-2);padding:10px 18px;border:1px solid var(--line);border-radius:999px}
.fulllog summary::-webkit-details-marker{display:none}
.fulllog summary::after{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:translateY(-2px) rotate(45deg);transition:transform .15s}
.fulllog[open] summary::after{transform:translateY(1px) rotate(-135deg)}
.fulllog summary:hover{border-color:var(--muted);color:var(--ink)}
.fulllog .blocks{padding-top:48px}
@media (max-width:1100px) and (min-width:901px){.steps{grid-template-columns:1fr 1fr}}
table.t{width:100%;border-collapse:collapse;font-size:14px}
table.t th{text-align:left;font-weight:400;font-size:13px;color:var(--muted);padding:0 16px 14px 0}
table.t td{padding:14px 16px 14px 0;border-top:1px solid var(--line);vertical-align:top}
table.t td:first-child{font-weight:500}
table.t td.muted,table.t th{white-space:nowrap}
.tablewrap{overflow-x:auto}
.feed{list-style:none;margin:0;padding:0;display:grid;gap:28px}
.feed .meta{font-size:13px;color:var(--muted);margin-bottom:6px}
.feed .meta b{color:var(--ink);font-weight:500}
.feed p{font-size:15px;color:var(--ink-2);overflow-wrap:anywhere;max-width:68ch}
.empty{color:var(--muted);font-size:14.5px}
.page{padding:72px 0 0}
.page h1{font-size:40px;letter-spacing:-.04em}
@media (min-width:901px){.mobile-only{display:none}}
@media (max-width:900px){
  .wrap{padding:0 20px}footer.wrap{padding:28px 20px 40px;margin-top:112px}
  header.top{height:72px}
  .side .launch{display:none}
  .hero{padding-top:56px}.hero .lede{font-size:17px;margin:24px 0 32px}
  .showcase{grid-template-columns:1fr;padding:24px;gap:28px;margin-top:64px;border-radius:16px}
  .showcase .slot{grid-template-columns:96px 1fr}
  .points{grid-template-columns:1fr;gap:40px;padding-top:88px}
  .numbers{gap:40px;padding-top:88px}
  .recent{padding-top:88px}.recent .item{grid-template-columns:1fr;gap:4px}
  .form{padding-top:40px}.form h1{font-size:34px}.form .lede{margin-bottom:48px}
  .kithead{padding-top:40px}.kithead h1{font-size:36px}
  .kit{grid-template-columns:1fr;gap:0;padding-top:48px}.side{position:static;margin-top:88px}
  .channel{padding-top:72px}.channel>.head{flex-direction:column;gap:16px}
  .opshead{padding-top:40px}.opshead h1{font-size:36px}
  .kpis{grid-template-columns:1fr 1fr;gap:12px}.kpis div:last-child{grid-column:1/-1}.kpis b{font-size:32px}
  .steps{grid-template-columns:1fr;padding-top:56px;gap:12px}.live{padding-top:88px}
  .recentlog li{grid-template-columns:1fr auto;gap:4px 16px}.recentlog .what{grid-column:1/-1;grid-row:2;white-space:normal}
  .blocks{padding-top:56px}.block{grid-template-columns:1fr;gap:24px;padding:40px 0}
  .two{grid-template-columns:1fr;gap:0}
  .writing{padding-top:88px}
  .page{padding-top:40px}
  header.top nav a.link{display:none}
}
`;

const FONT = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400..600&display=swap" rel="stylesheet">`;
const TODO_JS = `<script>(function(){var u=document.querySelector(".todo[data-kit]");if(!u)return;var k="lp-todo-"+u.getAttribute("data-kit"),d={};try{d=JSON.parse(localStorage.getItem(k)||"{}")}catch(e){}u.querySelectorAll("input[data-step]").forEach(function(i){i.checked=!!d[i.getAttribute("data-step")];i.addEventListener("change",function(){d[i.getAttribute("data-step")]=i.checked;try{localStorage.setItem(k,JSON.stringify(d))}catch(e){}})})})();</script>`;
const ICON = `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect x="7" y="7" width="18" height="18" rx="3" transform="rotate(45 16 16)" fill="#141413"/></svg>')}">`;
const COPY_JS = `<script>document.addEventListener("click",function(e){var b=e.target.closest("[data-copy]");if(!b)return;navigator.clipboard.writeText(b.getAttribute("data-copy")).then(function(){var o=b.textContent;b.textContent="Copied";setTimeout(function(){b.textContent=o},1400)})});</script>`;

const page = (title: string, body: string, head = "") =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>${ICON}${FONT}${head}<style>${CSS}</style></head><body>${body}</body></html>`;

const header = (cta = true) => `<header class="top wrap"><a class="mark" href="/"><i></i>Launchpad</a><nav><a class="link" href="/ops">How it works</a>${cta ? `<a class="btn sm" href="/new">Plan a launch</a>` : ""}</nav></header>`;
const footer = `<footer class="wrap"><div class="row"><p>Run by AI agents. Launchpad is not affiliated with Y Combinator. Every boost is a real founder choosing to share.</p><a href="/ops">How it works</a></div></footer>`;
/** The first sentence of a log entry, on one line, cut to fit. */
const oneLine = (text: string, max = 140) => {
  const flat = text.replace(/\s+/g, " ").trim();
  const first = /^.*?[.!?](?=\s|$)/.exec(flat)?.[0] ?? flat;
  return first.length > max ? `${first.slice(0, max - 1).trimEnd()}…` : first;
};
const copyBtn = (text: string, label = "Copy") => `<button class="copy" type="button" data-copy="${esc(text)}">${esc(label)}</button>`;

// ------------------------------------------------------------------- landing

type Overview = { launches: number; launched: number; clicks: number; boosts_sent: number; boosts_shared: number; squad: number };

export function renderHome(d: { overview: Overview; launches: Launch[] }): string {
  const listed = d.launches.filter((l) => l.listed && (l.status === "launched" || l.status === "reported"));
  const o = d.overview;
  const numbers = o.launched > 0
    ? `<section class="numbers"><div><b>${o.launched}</b><span>launched</span></div><div><b>${o.clicks}</b><span>people clicked through</span></div><div><b>${o.boosts_shared}</b><span>${o.boosts_shared === 1 ? "boost" : "boosts"} shared</span></div><div><b>${o.squad}</b><span>founders in the squad</span></div></section>`
    : "";
  return page("Launchpad — launch everywhere at once", `${header()}
<main class="wrap">
<section class="hero">
  <h1>Launch everywhere at once.</h1>
  <p class="lede">Tell us what you're launching. Agents pick the right time for each channel, write every post in that channel's voice, and line up founders who share it.</p>
  <div class="ctas"><a class="btn" href="/new">Plan my launch</a><span class="small muted">Free for YC founders. Your kit arrives in about ten minutes.</span></div>
</section>
<section class="showcase" aria-label="A sample launch kit">
  <div class="sched">
    <div class="head"><span><b>Ledgerline</b> <span class="muted">launch plan</span></span><span class="status live">Live</span></div>
    <div class="slot"><span>Sun 7:00 AM</span><span>X</span></div>
    <div class="slot"><span>Sun 8:00 AM</span><span>Launch YC</span></div>
    <div class="slot"><span>Mon 7:30 AM</span><span>Show HN</span></div>
    <div class="slot"><span>Tue 12:01 AM</span><span>Product Hunt</span></div>
  </div>
  <div class="tweet"><div class="who"><i></i><b>Ledgerline</b><span class="muted">7:00 AM</span></div>Today we're launching Ledgerline: agents that file your small-business taxes, with a human CPA signing every return.<div class="foot">Written for X. Posted in one click.</div></div>
</section>
<section class="points">
  <div><h3>Timing, not guesswork</h3><p>Every channel gets a time and a reason, so you don't land on the same morning as everyone else.</p></div>
  <div><h3>Every post, written</h3><p>X, LinkedIn, Show HN, Product Hunt, Launch YC and a note to your network. Each one ready to post.</p></div>
  <div><h3>Founders who share</h3><p>Press Launch now and founders in the squad get a one-tap request to share it. No bots, no upvote rings.</p></div>
</section>
${numbers}
${listed.length ? `<section class="recent"><h2>Recent launches</h2>${listed.map((l) => `<div class="item"><b>${esc(l.company)}</b><span class="muted">${esc(l.one_liner)}</span><a class="small" href="${esc(l.url)}" rel="noopener">${esc(l.url.replace(/^https?:\/\//, "").replace(/\/$/, ""))}</a></div>`).join("")}</section>` : ""}
</main>${footer}`, `<meta name="description" content="Launch everywhere at once: timing for every channel, every post written, and founders who share it. For YC founders.">`);
}

// ------------------------------------------------------------------- the form

export function renderNew(error?: string, v: Record<string, string> = {}): string {
  const posted = Boolean(v["_posted"]);
  const on = (name: string) => (posted ? Boolean(v[name]) : true);
  const field = (name: string, label: string, opts: { type?: string; hint?: string; required?: boolean; max?: number; placeholder?: string } = {}) =>
    `<label class="field"><span>${esc(label)}${opts.hint ? `<em>${esc(opts.hint)}</em>` : ""}</span><input type="${opts.type ?? "text"}" name="${name}" ${opts.required ? "required" : ""} maxlength="${opts.max ?? 200}" ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ""} value="${esc(v[name])}"></label>`;
  return page("Plan a launch · Launchpad", `${header(false)}
<main class="wrap"><div class="narrow form">
<h1>Plan a launch</h1>
<p class="lede">Two minutes here. Your kit, with timing for each channel and every post written, arrives by email in about ten.</p>
<form method="post" action="/new">
${error ? `<div class="error" role="alert">${esc(error)}</div>` : ""}
<fieldset><legend>What you're launching</legend>
${field("company", "Company", { required: true, max: 80 })}
${field("one_liner", "One-liner", { hint: "What it does, for whom", required: true, max: 160 })}
<label class="field"><span>The launch<em>The problem, what's new, anything we should know</em></span><textarea name="description" required maxlength="3000">${esc(v["description"])}</textarea></label>
<div class="two">${field("url", "Link", { type: "url", required: true, max: 500, placeholder: "https://" })}${field("video_url", "Launch video", { type: "url", hint: "Optional", max: 500, placeholder: "https://" })}</div>
<div class="two">${field("launch_when", "When", { max: 120, placeholder: "Sunday morning" })}${field("batch", "YC batch", { hint: "Optional", max: 10, placeholder: "F25" })}</div>
</fieldset>
<fieldset><legend>Channels</legend><div class="chips">${CHANNELS.map((c) => `<label><input type="checkbox" name="ch_${c}" value="1" ${on(`ch_${c}`) ? "checked" : ""}><span>${esc(CHANNEL_NAMES[c])}</span></label>`).join("")}</div></fieldset>
<fieldset><legend>You</legend>
<div class="two">${field("email", "Email", { type: "email", required: true, max: 254 })}${field("x_handle", "X handle", { hint: "Optional", max: 40, placeholder: "@" })}</div>
<div style="height:8px"></div>
<label class="check"><input type="checkbox" name="join_squad" value="1" ${on("join_squad") ? "checked" : ""}><span>Join the boost squad. You'll get a one-tap request when another founder launches, at most three a day, and they'll boost yours.</span></label>
<label class="check"><input type="checkbox" name="listed" value="1" ${on("listed") ? "checked" : ""}><span>Show my launch on Launchpad's front page once it's live.</span></label>
</fieldset>
<input type="hidden" name="timezone" id="tz"><script>try{document.getElementById("tz").value=Intl.DateTimeFormat().resolvedOptions().timeZone}catch(e){}</script>
<div class="hp" aria-hidden="true"><label>Website<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>
<div class="submit"><button class="btn" type="submit">Write my kit</button><span class="small muted">We only email your kit, your results and squad requests.</span></div>
</form>
</div></main>${footer}`);
}

// ------------------------------------------------------------------- the founder's kit

export function renderKit(l: Launch, d: { links: Record<string, string>; origin: string; stats: LaunchStats; squad: number; reports: Omit<Report, "body">[]; reciprocity: { given: number; received: number } }): string {
  const t = `?t=${l.token}`;
  if (!l.kit) {
    return page(`${l.company} launch kit · Launchpad`, `${header(false)}<main class="wrap"><div class="narrow writing">
<p class="label">${esc(l.company)}</p>
<h1>Writing your launch kit…</h1>
<p class="muted" style="font-size:17px;max-width:34em">The producer is reading your site, checking what else is launching this week, and writing every post. This takes about ten minutes. We'll email ${esc(maskEmail(l.email))} when it's ready, and this page refreshes on its own.</p>
<div class="pulse" role="progressbar" aria-label="Writing"></div>
<p class="small muted" style="margin-top:48px">This is your private kit. Bookmark it.</p>
</div></main>${footer}`, `<meta http-equiv="refresh" content="20"><meta name="robots" content="noindex">`);
  }

  const kit = l.kit;
  const tracked = (c: string) => (d.links[c] ? `${d.origin}/l/${d.links[c]}` : l.url);
  const whenOf = (c: Channel) => kit.timing.find((x) => x.channel === c);
  const chosen = CHANNELS.filter((c) => kit.posts[c as keyof typeof kit.posts]);
  const post = (body: string, label: string, raw = body) =>
    `<div class="post"><div class="top"><span>${label}</span>${copyBtn(raw)}</div><div class="body">${body}</div></div>`;
  const section = (c: Channel, action: string, inner: string, note = "") => {
    const w = whenOf(c);
    return `<section class="channel" id="ch-${c}"><div class="head"><div><h2>${esc(CHANNEL_NAMES[c])}</h2>${w ? `<div class="when">${esc(w.when)} · ${esc(w.why)}</div>` : ""}</div>${action}</div>${inner}${note ? `<p class="note">${note}</p>` : ""}</section>`;
  };

  const sections: string[] = [];
  if (kit.posts.x) {
    const thread = kit.posts.x.map((p) => withLink(p, tracked("x")));
    sections.push(section("x", `<a class="btn sm" href="${esc(share.x(thread[0]!))}" target="_blank" rel="noopener">Post on X</a>`,
      `<div class="thread">${thread.map((p, i) => post(esc(p), `${i + 1} of ${thread.length} · ${p.length} characters`, p)).join("")}</div>`,
      thread.length > 1 ? "The button opens the first post. Reply to it with the rest, in order." : ""));
  }
  if (kit.posts.linkedin) {
    const text = withLink(kit.posts.linkedin, tracked("linkedin"));
    sections.push(section("linkedin", `<a class="btn sm" href="${esc(share.linkedin(text))}" target="_blank" rel="noopener">Post on LinkedIn</a>`, post(esc(text), `${text.length} characters`, text)));
  }
  if (kit.posts.show_hn) {
    const hn = kit.posts.show_hn;
    sections.push(section("show_hn", `<a class="btn sm" href="${esc(share.show_hn(utm(l.url, "hn"), hn.title))}" target="_blank" rel="noopener">Submit to HN</a>`,
      `<div class="posts">${post(esc(hn.title), "Title", hn.title)}${post(esc(hn.text), "First comment", hn.text)}</div>`, "HN expects the real URL, so this link isn't redirected. It's tagged <span class=\"mono\">?ref=hn</span> instead."));
  }
  if (kit.posts.product_hunt) {
    const ph = kit.posts.product_hunt;
    sections.push(section("product_hunt", `<a class="btn sm quiet" href="${esc(share.product_hunt())}" target="_blank" rel="noopener">Open Product Hunt</a>`,
      `<div class="posts">${post(esc(ph.tagline), "Tagline", ph.tagline)}${post(esc(ph.description), "Description", ph.description)}${post(esc(ph.first_comment), "Maker's first comment", ph.first_comment)}</div>`,
      `Website field: <span class="mono">${esc(utm(l.url, "producthunt"))}</span>`));
  }
  if (kit.posts.launch_yc) {
    const body = withLink(kit.posts.launch_yc.body, tracked("launch_yc"));
    sections.push(section("launch_yc", `<a class="btn sm quiet" href="${esc(share.launch_yc())}" target="_blank" rel="noopener">Open Launch YC</a>`,
      `<div class="posts">${post(esc(kit.posts.launch_yc.title), "Title", kit.posts.launch_yc.title)}<div class="post"><div class="top"><span>Post body · copies as Markdown</span>${copyBtn(body)}</div><div class="body prose" style="white-space:normal;color:var(--ink);font-size:15px">${renderMarkdown(body)}</div></div></div>`));
  }
  if (kit.posts.email) {
    const body = withLink(kit.posts.email.body, tracked("email"));
    sections.push(section("email", `<a class="btn sm quiet" href="${esc(share.email(kit.posts.email.subject, body))}">Open in email</a>`,
      `<div class="posts">${post(esc(kit.posts.email.subject), "Subject", kit.posts.email.subject)}${post(esc(body), "Body", body)}</div>`));
  }

  const s = d.stats;
  const launched = l.status === "launched" || l.status === "reported";
  const channelsForBars = [...(["x", "linkedin", "launch_yc", "email"] as const).filter((c) => chosen.includes(c)), "boost" as const];
  const max = Math.max(1, ...channelsForBars.map((c) => s.clicks_by_channel[c] ?? 0));
  const results = launched ? `<section class="results">
<p class="label">Results so far</p>
<div class="big"><div><b>${s.clicks_total}</b><span>people clicked through</span></div><div><b>${s.boosts.shared}</b><span>founders shared it</span></div><div><b>${s.boosts.sent}</b><span>founders asked</span></div></div>
<div class="bars">${channelsForBars.map((c) => { const n = s.clicks_by_channel[c] ?? 0; return `<div class="row"><span>${esc(c === "boost" ? "Squad shares" : CHANNEL_NAMES[c])}</span><div class="track"><div class="fill" style="width:${Math.round((n / max) * 100)}%"></div></div><span class="n">${n}</span></div>`; }).join("")}</div>
<p class="note">Unique people per tracked link; bots and refreshes are ignored. Show HN and Product Hunt use your real URL, so check those in your own analytics.</p>
${d.reports.length ? `<div style="margin-top:32px;display:grid;gap:8px">${d.reports.map((r) => `<p><a href="/r/${esc(r.id)}${esc(t)}">${esc(r.title)}</a> <span class="small muted">· ${esc(time(r.created_at))}</span></p>`).join("")}</div>` : ""}
</section>` : "";

  const launchPanel = launched
    ? `<div class="panel"><span class="status live">You're live</span><p style="margin-top:12px">${s.boosts.total === 0
      ? "Nobody else is in the squad yet. Founders who join in the next 48 hours will be asked to share it."
      : `${s.boosts.pending > 0 ? `${esc(plural(s.boosts.pending, "squad founder is", "squad founders are"))} being asked to share it now.` : ""}${s.boosts.sent > 0 ? ` ${esc(plural(s.boosts.sent, "founder was", "founders were"))} asked, and ${esc(String(s.boosts.shared))} ${s.boosts.shared === 1 ? "has" : "have"} shared it so far.` : ""}`}</p></div>`
    : `<div class="panel"><h3>When your first post is up</h3><p>${d.squad > 0 ? `Press Launch now and ${esc(plural(d.squad, "founder", "founders"))} in the squad get a one-tap request to share it.` : "Press Launch now. Nobody else is in the squad yet, so founders who join in the next 48 hours will be asked to share it."}</p><form method="post" action="/k/${esc(l.slug)}/go${esc(t)}"><button class="btn" type="submit">Launch now</button></form></div>`;

  return page(`${l.company} launch kit · Launchpad`, `${header(false)}
<main class="wrap">
<div class="kithead"><div><p class="label">Launch kit</p><h1>${esc(l.company)}</h1><p class="sub">${esc(l.one_liner)}</p></div>
<div>${launched ? `<span class="status live">Live</span>` : `<span class="status">Ready to launch</span>`}</div></div>
<div class="kit">
<div>
<div class="mobile-only" style="margin-bottom:64px">${launchPanel}</div>
${results}
<section class="plan"><p class="label">The plan</p><div class="prose">${renderMarkdown(kit.strategy)}</div></section>
${sections.join("")}
</div>
<aside class="side">
<div class="launch">${launchPanel}</div>
<div><p class="label">When to post</p><ul class="timeline">${[...kit.timing].map((x) => `<li><a href="#ch-${esc(x.channel)}"><span class="c">${esc(CHANNEL_NAMES[x.channel])}</span><span class="t">${esc(x.when)}</span></a></li>`).join("")}</ul></div>
${kit.checklist.length ? `<div><p class="label">Launch day</p><ul class="todo" data-kit="${esc(l.slug)}">${kit.checklist.map((c, i) => `<li><label><input type="checkbox" data-step="${i}"><span>${esc(c)}</span></label></li>`).join("")}</ul></div>` : ""}
<p class="small muted">This is your private kit. Bookmark it.</p>
</aside>
</div>
</main>${footer}${COPY_JS}${TODO_JS}`, `<meta name="robots" content="noindex">${launched ? `<meta http-equiv="refresh" content="120">` : ""}`);
}

// ------------------------------------------------------------------- boost page

export function renderBoost(d: { company: string; one_liner: string; url: string; video_url: string | null; booster: string; code: string; status: string; boostText: string }): string {
  const done = d.status === "shared";
  return page(`Boost ${d.company} · Launchpad`, `${header(false)}
<main class="wrap"><div class="narrow page">
<p class="label">Boost squad</p>
<h1 style="margin:12px 0 16px">${esc(d.company)} just launched</h1>
<p style="font-size:17px;color:var(--ink-2)">${esc(d.one_liner)}${d.video_url ? ` <a class="small" href="${esc(d.video_url)}" rel="noopener" target="_blank" style="margin-left:6px">Watch the video</a>` : ""}</p>
<div class="post" style="margin:48px 0 24px"><div class="top"><span>Your post. Edit it however you like.</span>${copyBtn(d.boostText)}</div><div class="body">${esc(d.boostText)}</div></div>
<div style="display:flex;gap:12px;flex-wrap:wrap"><a class="btn" href="/b/${esc(d.code)}/go?to=x" target="_blank" rel="noopener">Share on X</a><a class="btn quiet" href="/b/${esc(d.code)}/go?to=linkedin" target="_blank" rel="noopener">Share on LinkedIn</a></div>
${done ? `<p class="status live" style="margin-top:24px">Thanks for boosting. The squad returns the favour when you launch.</p>` : ""}
<p class="small muted" style="margin-top:64px">You're getting this because ${esc(d.booster)} is in the Launchpad boost squad. Only share it if you'd recommend it. <a href="/b/${esc(d.code)}/skip">Skip this one</a> · <a href="/b/${esc(d.code)}/stop">Leave the squad</a></p>
</div></main>${footer}${COPY_JS}`, `<meta name="robots" content="noindex">`);
}

export const renderMessage = (title: string, text: string, confirm?: { label: string; action: string }) =>
  page(`${title} · Launchpad`, `${header()}<main class="wrap"><div class="narrow page" style="padding-top:120px"><h1>${esc(title)}</h1><p class="muted" style="margin-top:16px;font-size:17px">${esc(text)}</p>${confirm ? `<form method="post" action="${esc(confirm.action)}" style="margin-top:28px"><button class="btn" type="submit">${esc(confirm.label)}</button></form>` : ""}</div></main>${footer}`, confirm ? `<meta name="robots" content="noindex">` : "");

const SOURCE_NAMES: Record<string, string> = { launch_yc: "Launch YC", show_hn: "Show HN", product_hunt: "Product Hunt", x: "X", other: "Other" };

// ------------------------------------------------------------------- ops log

export function renderOps(d: { overview: Overview; launches: Launch[]; decisions: Decision[]; touches: Touch[]; radar: RadarItem[]; reports: (Omit<Report, "body"> & { listed: boolean })[]; interventions: { description: string; created_at: Date }[]; now: Date }): string {
  const byId = new Map(d.launches.map((l) => [l.id, l]));
  const name = (launchId: string | null) => { if (!launchId) return "Launchpad"; const l = byId.get(launchId); return l ? (l.listed ? l.company : "An unlisted launch") : ""; };
  const feed = <T>(rows: T[], empty: string, f: (r: T) => string) => (rows.length ? `<ul class="feed">${rows.map(f).join("")}</ul>` : `<p class="empty">${esc(empty)}</p>`);
  const block = (title: string, blurb: string, inner: string) => `<section class="block"><header><h2>${esc(title)}</h2><p>${esc(blurb)}</p></header><div>${inner}</div></section>`;
  const o = d.overview;
  const reports = d.reports.filter((r) => r.listed);
  const launches = d.launches.length === 0 ? `<p class="empty">None yet.</p>` : `<div class="tablewrap"><table class="t"><thead><tr><th>Company</th><th>Status</th><th>Asked</th><th>Kit ready</th><th>Launched</th></tr></thead><tbody>${[...d.launches].reverse().map((l) => `<tr><td>${esc(l.listed ? l.company : "Unlisted launch")}</td><td><span class="status ${l.status === "launched" || l.status === "reported" ? "live" : ""}">${esc(l.status)}</span></td><td class="muted">${esc(time(l.created_at))}</td><td class="muted">${l.ready_at ? esc(time(l.ready_at)) : "—"}</td><td class="muted">${l.launched_at ? esc(time(l.launched_at)) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  /* Only real actions: runs that skipped or found nothing to do stay in the full log. */ const recent = d.decisions.filter((x) => !/^(skip|no[-_ ]?op|idle|nothing)/i.test(x.decision)).slice(0, 4);
  const steps: [string, string, string][] = [
    ["You", "Tell us about the launch", "One short form: what you're launching, the link, and which channels you want."],
    ["Producer", "Writes your launch kit", "A time for every channel and every post written in its voice. In your inbox in about ten minutes."],
    ["Booster", "Rallies the squad", "Press Launch now and founders in the squad get a one-tap request to share it."],
    ["Producer", "Reports back", "Two hours later: clicks per channel, who shared it, and what to do next."],
  ];
  return page("How it works · Launchpad", `${header()}
<main class="wrap">
<section class="opshead"><h1>What the agents do for you</h1>
<p>You fill in one form. AI agents plan, write and rally your launch, and you post each piece in one click.</p>
<div class="ctas"><a class="btn" href="/new">Plan my launch</a><span class="small muted">Free. About two minutes.</span></div></section>
<ol class="steps">${steps.map(([who, title, text], i) => `<li><span class="n">${i + 1}</span><p class="who">${esc(who)}</p><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join("")}</ol>
<p class="behind">Behind the scenes, a scout watches what else is launching so your posts avoid crowded mornings, and a concierge answers your email.</p>
<section class="live">
<div class="livehead"><h2>Live</h2><span class="updated">Updated ${esc(time(d.now))}</span></div>
<div class="kpis">
<div><span>Launches</span><b>${o.launches}</b><em>${o.launched} live</em></div>
<div><span>Clicks</span><b>${o.clicks}</b><em>unique people</em></div>
<div><span>Boosts shared</span><b>${o.boosts_shared}</b><em>of ${o.boosts_sent} asked</em></div>
<div><span>Squad</span><b>${o.squad}</b><em>${o.squad === 1 ? "founder" : "founders"}</em></div>
<div><span>Human step-ins</span><b>${d.interventions.length}</b><em>${d.interventions.length === 1 ? "time a person stepped in" : "times a person stepped in"}</em></div>
</div>
${recent.length ? `<ul class="recentlog">${recent.map((x) => `<li><span class="who">${esc(x.agent)}</span><span class="what">${esc(oneLine(x.reasoning))}</span><span class="when">${esc(time(x.created_at))}</span></li>`).join("")}</ul>` : ""}
</section>
<details class="fulllog"><summary>Full agent log</summary>
<div class="blocks">
${block("Launches", "Every launch planned, newest first.", launches)}
${block("Reports", "Written by the producer about two hours after each launch.", feed(reports, "None yet.", (r) => `<li><div class="meta"><b>${esc(name(r.launch_id))}</b> · ${esc(time(r.created_at))}</div><p><a href="/r/${esc(r.id)}">${esc(r.title)}</a></p></li>`))}
${block("Decisions", "What the agents decided, and why.", feed(d.decisions, "None yet.", (x) => `<li><div class="meta"><b>${esc(name(x.launch_id))}</b> · ${esc(x.decision)} · ${esc(x.agent)} · ${esc(time(x.created_at))}</div><p>${esc(x.reasoning)}</p></li>`))}
${block("Outreach", "Every message the scout sent.", feed(d.touches, "None yet.", (x) => `<li><div class="meta"><b>${esc(x.channel)}</b>${x.target ? ` · to ${esc(maskEmail(x.target))}` : ""} · ${esc(time(x.created_at))}</div><p>${esc(x.content.slice(0, 240))}</p></li>`))}
${block("Launch radar", "What else is launching, so kits avoid crowded mornings.", feed(d.radar, "Nothing yet.", (r) => `<li><div class="meta"><b>${esc(SOURCE_NAMES[r.source] ?? r.source)}</b>${r.batch ? ` · ${esc(r.batch)}` : ""}</div><p><a href="${esc(r.url)}" rel="noopener nofollow">${esc(r.title)}</a></p></li>`))}
${block("Human step-ins", "Every time a person had to step in.", feed(d.interventions, "None so far.", (x) => `<li><div class="meta">${esc(time(x.created_at))}</div><p>${esc(x.description)}</p></li>`))}
</div>
</details>
</main>${footer}`);
}

export function renderReport(r: Report, company: string, stats: LaunchStats | null): string {
  return page(`${r.title} · Launchpad`, `${header()}<main class="wrap"><div class="narrow page">
<p class="label">Launch report · ${esc(company)} · ${esc(time(r.created_at))}</p>
<h1 style="margin:12px 0 48px">${esc(r.title)}</h1>
${stats ? `<div class="big" style="margin-bottom:56px"><div><b>${stats.clicks_total}</b><span>people clicked through</span></div><div><b>${stats.boosts.shared}</b><span>founders shared it</span></div><div><b>${stats.boost_clicks}</b><span>clicks from shares</span></div></div>` : ""}
<article class="prose">${renderMarkdown(r.body)}</article>
<p class="small muted" style="margin-top:48px">Numbers are counted by Launchpad, not reported by the agent.</p>
</div></main>${footer}`, `<meta name="robots" content="noindex">`);
}
