/**
 * The founder's private workspace: seven tabs over one launch. Server-rendered, every piece of
 * founder or commenter text goes through esc(), and every link and form carries the owner token.
 */
import { COPY_JS, copyBtn, esc, footer, page, renderMarkdown, time } from "./pages.ts";
import type { Launch } from "./repo.ts";
import { CHANNEL_NAMES, share, utm, withLink, type Channel } from "./rules.ts";
import { DEMO_STUDIO_JS } from "./video-client.ts";
import type { CommentCategory, CommentStatus, LaunchComment, Outreach, Tab, WorkspaceView } from "./workspace-types.ts";

const TAB_LABELS: Record<Tab, string> = { kit: "Kit", reach: "Reach", demo: "Demo", replies: "Replies", results: "Results", network: "Network", follow: "Follow-through" };
const TAB_ORDER: Tab[] = ["kit", "reach", "demo", "replies", "results", "network", "follow"];

const channelName = (c: string) => CHANNEL_NAMES[c as Channel] ?? c;
/** Only http(s) URLs become links; anything else a commenter or import supplied stays inert. */
const safeHref = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? esc(u) : "#");
/** Keeps the producer's link placeholder intact in an editable field without printing it literally in the page source. */
const rawField = (s: string) => esc(s).replace(/\{link\}/g, "&#123;link&#125;");
const empty = (title: string, text: string) => `<div class="empty-state"><b>${esc(title)}</b>${esc(text)}</div>`;
/** Opens company context when linked to it, and keeps the active tab visible on narrow screens. */
const UX_JS = `<script>(function(){var c=document.getElementById("context");function o(){if(c&&location.hash==="#context"){c.open=true;c.scrollIntoView({block:"start"})}}addEventListener("hashchange",o);o();var t=document.querySelector(".tabs"),a=t&&t.querySelector("[aria-current]");if(a)t.scrollLeft=a.offsetLeft-(t.clientWidth-a.offsetWidth)/2})();</script>`;
const SAVE_JS = `<script>document.addEventListener("submit",function(e){var b=e.submitter;if(b)setTimeout(function(){b.disabled=true;b.textContent="Saving…"},0)});</script>`;

const CATEGORY_LABELS: Record<CommentCategory, string> = { question: "Question", buying_intent: "Buying intent", objection: "Objection", support: "Support", praise: "Praise", low_value: "Low value" };
const STATUS_GROUPS: { status: CommentStatus; title: string; sub: string }[] = [
  { status: "needs_founder", title: "Needs you", sub: "The answer isn't in your company facts, so no reply was invented." },
  { status: "needs_review", title: "Ready for review", sub: "Grounded in your facts. Edit and approve." },
  { status: "approved", title: "Approved", sub: "Post these yourself, then mark them posted." },
  { status: "posted_manual", title: "Posted by you", sub: "" },
  { status: "ignored", title: "Ignored", sub: "" },
];

export function renderWriting(l: Launch, token: string): string {
  const base = `/k/${esc(l.slug)}`;
  const script = `<script>(function(){var r=document.getElementById("writing"),t=r.getAttribute("data-token"),b=r.getAttribute("data-base"),q="?t="+encodeURIComponent(t),e=document.getElementById("failed"),w=document.getElementById("working"),started,timer;
function fail(){w.hidden=true;e.hidden=false;clearInterval(timer)}
function poll(){fetch(b+"/status"+q,{cache:"no-store"}).then(function(x){return x.json()}).then(function(j){if(j.ready)location.reload();else if(Date.now()-started>60000)fail()}).catch(function(){if(Date.now()-started>60000)fail()})}
function go(){started=Date.now();e.hidden=true;w.hidden=false;clearInterval(timer);timer=setInterval(poll,2000);fetch(b+"/produce"+q,{method:"POST"}).then(function(x){if(x.ok)poll();else if(x.status>=500)fail()}).catch(fail)}
document.getElementById("retry").addEventListener("click",go);go()})();</script>`;
  return page(`${l.company} launch kit · Launchpad`, `<main class="wrap narrow writing" id="writing" data-token="${esc(token)}" data-base="${base}">
<p class="eyebrow">Launch kit · ${esc(l.company)}</p>
<div id="working">
<h1>Writing your launch kit…</h1>
<p class="muted" style="font-size:16px;max-width:34em">Reading your context and preparing each deliverable. This page opens your workspace as soon as it's ready.</p>
<div class="pulse" role="progressbar" aria-label="Writing"></div>
</div>
<div id="failed" class="err-state" role="alert" hidden>
<h1>The producer didn't finish.</h1>
<p class="muted" style="font-size:16px;max-width:34em">Nothing was published and your launch details are saved. It's safe to try again.</p>
<button id="retry" class="btn" type="button" style="margin-top:18px">Try again</button>
</div>
<ul class="made"><li>Channel posts and timing</li><li>Communities, with reasons and rules</li><li>Demo storyboard</li><li>Wave plan for the first hours</li></ul>
<p class="small muted" style="margin-top:28px">Bookmark this page. It's your private kit.</p>
<noscript><p>Refresh this page in a minute to see your kit.</p></noscript>
</main>${footer}${script}`, `<meta name="robots" content="noindex">`);
}

export function renderWorkspace(v: WorkspaceView): string {
  const l = v.launch;
  const q = `t=${encodeURIComponent(v.token)}`;
  const tabUrl = (t: Tab, hash = "") => `/k/${esc(l.slug)}?tab=${t}&amp;${esc(q)}${hash}`;
  const act = (p = "") => `/k/${esc(l.slug)}${p}?${esc(q)}`;
  const launched = l.status === "launched" || l.status === "reported";
  const producerLabel = v.producer === "local-template" ? "Local template producer" : v.producer ? `Agent: ${v.producer}` : "Producer not recorded";

  const counts: Partial<Record<Tab, number>> = {
    replies: v.comments.filter((c) => c.status === "needs_founder" || c.status === "needs_review").length,
    reach: v.outreach.filter((o) => o.status === "draft").length,
    follow: v.commitments.filter((c) => c.status === "open").length,
  };

  const head = `<header class="ws-head"><div class="wrap">
<div class="ws-top"><div class="ws-id"><a class="mark" href="/" aria-label="Launchpad home"><i></i></a><span class="co">${esc(l.company)}</span>${launched ? `<span class="status live">Live</span>` : `<span class="status">Ready to launch</span>`}</div>
<div class="ws-meta"><span class="tag ${v.producer === "local-template" ? "warn" : ""}">${esc(producerLabel)}</span><span class="small muted">Private link</span></div></div>
<nav class="tabs" aria-label="Workspace">${TAB_ORDER.map((t) => `<a href="${tabUrl(t)}"${t === v.tab ? ` aria-current="page"` : ""}>${esc(TAB_LABELS[t])}${counts[t] ? `<span class="count" aria-label="${counts[t]} need attention">${counts[t]}</span>` : ""}</a>`).join("")}</nav>
</div></header>`;

  const banners = v.is_sample ? `<p class="sample-note" role="note"><span class="tag warn">Sample</span>Sample data, not real users. Numbers and people here were seeded to show the workflow.</p>` : "";
  const missingCallout = v.missing.length ? `<div class="callout" role="note"><b>Still missing:</b> ${esc(v.missing.map((m) => m.replace(/\.$/, "")).join(" "))}. We won't invent these. <a href="#context">Add them</a>.</div>` : "";

  const panes: Record<Tab, () => string> = { kit: kitTab, reach: reachTab, demo: demoTab, replies: repliesTab, results: resultsTab, network: networkTab, follow: followTab };

  return page(`${l.company} launch kit · Launchpad`, `${head}
<main class="wrap">${banners}${panes[v.tab]()}</main>
${v.notice ? `<div class="toast" role="status">${esc(v.notice)}</div>` : ""}
${footer}${COPY_JS}${SAVE_JS}${UX_JS}`, `<meta name="robots" content="noindex">`);

  // ---------------------------------------------------------------- Kit
  function kitTab(): string {
    const kit = l.kit;
    if (!kit) return `<section class="pane">${empty("No kit yet", "The producer hasn't written this launch's kit.")}</section>`;
    const tracked = (c: string) => (v.links[c] ? `${v.origin}/l/${v.links[c]}` : l.url);
    const whenOf = (c: Channel) => kit.timing.find((x) => x.channel === c);

    const post = (channel: Channel, part: string, label: string, raw: string, shown: string, foot: string, bodyHtml?: string) => `<div class="post">${label ? `<div class="label">${esc(label)}</div>` : ""}
<div class="body${bodyHtml ? " prose" : ""}"${bodyHtml ? ` style="white-space:normal;color:var(--ink)"` : ""}>${bodyHtml ?? esc(shown)}</div>
<div class="foot"><span>${esc(foot)}</span>${copyBtn(shown)}</div>
<details class="edit"><summary>Edit</summary><form method="post" action="${act("/edit")}"><input type="hidden" name="channel" value="${esc(channel)}"><input type="hidden" name="part" value="${esc(part)}">
<label class="field"><span>${esc(label || "Post text")}</span><textarea class="draft" name="text" required>${rawField(raw)}</textarea></label>
${raw.includes("{link}") ? `<p class="note">Keep &#123;link&#125; where the tracked link goes.</p>` : ""}<div class="actions"><button class="btn sm" type="submit">Save edit</button></div></form></details></div>`;

    const section = (c: Channel, action: string, inner: string, note = "") => {
      const w = whenOf(c);
      return `<section class="channel" id="ch-${c}"><div class="head"><div><h2>${esc(channelName(c))}</h2>${w ? `<div class="when">${esc(w.when)}. ${esc(w.why)}</div>` : ""}</div>${action}</div>${inner}${note ? `<p class="note">${note}</p>` : ""}</section>`;
    };

    const sections: string[] = [];
    const p = kit.posts;
    if (p.x) {
      const thread = p.x.map((t) => withLink(t, tracked("x")));
      sections.push(section("x", `<a class="btn sm" href="${esc(share.x(thread[0]!))}" target="_blank" rel="noopener">Open X composer</a>`,
        `<div class="thread">${thread.map((t, i) => post("x", String(i), "", p.x![i]!, t, `${i + 1}/${thread.length} · ${t.length} characters`)).join("")}</div>`,
        thread.length > 1 ? "The button opens the first post. Reply to it with the rest, in order." : ""));
    }
    if (p.linkedin) {
      const t = withLink(p.linkedin, tracked("linkedin"));
      sections.push(section("linkedin", `<a class="btn sm" href="${esc(share.linkedin(t))}" target="_blank" rel="noopener">Open LinkedIn composer</a>`, post("linkedin", "body", "", p.linkedin, t, `${t.length} characters`)));
    }
    if (p.show_hn) {
      const hn = p.show_hn;
      sections.push(section("show_hn", `<a class="btn sm" href="${esc(share.show_hn(utm(l.url, "hn"), hn.title))}" target="_blank" rel="noopener">Open HN submit form</a>`,
        post("show_hn", "title", "Title", hn.title, hn.title, `${hn.title.length} characters`) + post("show_hn", "text", "First comment", hn.text, hn.text, `${hn.text.length} characters`),
        `HN expects the real URL, so this one isn't redirected. It's tagged <span class="mono">?ref=hn</span> instead.`));
    }
    if (p.product_hunt) {
      const ph = p.product_hunt;
      sections.push(section("product_hunt", `<a class="btn sm quiet" href="${esc(share.product_hunt())}" target="_blank" rel="noopener">Open Product Hunt</a>`,
        post("product_hunt", "tagline", "Tagline", ph.tagline, ph.tagline, `${ph.tagline.length} characters`) + post("product_hunt", "description", "Description", ph.description, ph.description, `${ph.description.length} characters`) + post("product_hunt", "first_comment", "Maker's first comment", ph.first_comment, ph.first_comment, `${ph.first_comment.length} characters`),
        `Website field: <span class="mono">${esc(utm(l.url, "producthunt"))}</span>`));
    }
    if (p.launch_yc) {
      const body = withLink(p.launch_yc.body, tracked("launch_yc"));
      sections.push(section("launch_yc", `<a class="btn sm quiet" href="${esc(share.launch_yc())}" target="_blank" rel="noopener">Open Launch YC</a>`,
        post("launch_yc", "title", "Title", p.launch_yc.title, p.launch_yc.title, "Title") + post("launch_yc", "body", "", p.launch_yc.body, body, "Post body · copies as Markdown", renderMarkdown(body))));
    }
    if (p.email) {
      const body = withLink(p.email.body, tracked("email"));
      sections.push(section("email", `<a class="btn sm quiet" href="${esc(share.email(p.email.subject, body))}">Open in email</a>`,
        post("email", "subject", "Subject", p.email.subject, p.email.subject, "Subject") + post("email", "body", "Body", p.email.body, body, `${body.length} characters`)));
    }

    const f = v.facts;
    const faqText = f.faq.map((x) => `Q: ${x.q}\nA: ${x.a}`).join("\n\n");
    const textField = (name: string, label: string, value: string, hint: string) => `<label class="field"><span>${esc(label)} <em>${esc(hint)}</em></span><textarea name="${name}" rows="2" style="min-height:64px">${esc(value)}</textarea></label>`;
    const context = `<details class="context" id="context"${v.notice && /context|facts/i.test(v.notice) ? " open" : ""}><summary>Company context</summary>
<form method="post" action="${act("/facts")}"><div class="fields">
<p class="small muted">Replies, outreach and demos only use what's written here. Leave a field empty and we'll ask rather than guess.</p>
${textField("audience", "Audience", f.audience, "who it's for")}${textField("problem", "Problem", f.problem, "what hurts today")}${textField("proof", "Proof", f.proof, "real numbers, customers, results")}
<div class="grid2">${textField("pricing", "Pricing", f.pricing, "what you charge")}${textField("voice", "Voice", f.voice, "how you sound")}</div>
<label class="field"><span>FAQ <em>blocks of Q: and A:</em></span><textarea name="faq" rows="5" placeholder="Q: Do you support SSO?&#10;A: Yes, on the Team plan.">${esc(faqText)}</textarea></label>
<label class="check"><input type="checkbox" name="b2b" value="1"${f.b2b ? " checked" : ""}><span>Technical B2B product. Demos and copy lean technical rather than consumer social.</span></label>
<div><button class="btn sm" type="submit">Save context</button></div></div></form></details>`;

    const s = v.stats;
    const launchPanel = launched
      ? `<div class="panel"><span class="status live">You're live</span><p style="margin-top:8px">${s.boosts.sent} squad ${s.boosts.sent === 1 ? "founder" : "founders"} asked. ${s.boosts.shared} opened a composer, which doesn't confirm a post went up.</p><a class="btn quiet" href="${tabUrl("results")}">See results</a></div>`
      : `<div class="panel"><h3>When your first post is up</h3><p>${v.squad > 0 ? `Launch now asks ${v.squad} opted-in squad ${v.squad === 1 ? "founder" : "founders"} to share it.` : "Launch now marks you live. No one else is in the squad yet."} Launchpad doesn't post for you.</p><form method="post" action="${act("/go")}"><button class="btn" type="submit">Launch now</button></form></div>`;

    return `<section class="pane"><div class="split"><div>
<div class="pane-head" style="margin-bottom:24px"><h1>${esc(l.one_liner)}</h1></div>
${missingCallout}
<p class="eyebrow" style="margin-bottom:10px">The plan</p><div class="prose">${renderMarkdown(kit.strategy)}</div>
${context}
${sections.join("") || empty("No channels selected", "This launch has no channel posts.")}
</div>
<aside class="side">${launchPanel}
<div><p class="eyebrow" style="margin-bottom:6px">When to post</p><ul class="timeline">${kit.timing.map((x) => `<li><a href="#ch-${esc(x.channel)}"><span class="t">${esc(x.when)}</span></a><span class="c">${esc(channelName(x.channel))}</span></li>`).join("")}</ul></div>
${kit.checklist.length ? `<div><p class="eyebrow" style="margin-bottom:6px">Launch day</p><ul class="todo">${kit.checklist.map((c) => `<li>${esc(c)}</li>`).join("")}</ul></div>` : ""}
</aside></div></section>`;
  }

  // ---------------------------------------------------------------- Reach
  function reachTab(): string {
    const communities = v.communities.length
      ? `<div class="grid2">${v.communities.map((c) => `<article class="card"><div class="line"><h3><a href="${safeHref(c.url)}" target="_blank" rel="noopener nofollow">${esc(c.name)}</a></h3><span class="tag">${esc(c.kind.replace("_", " "))}</span></div>
<dl class="kv"><dt>Why</dt><dd>${esc(c.why)}</dd><dt>Angle</dt><dd>${esc(c.angle)}</dd><dt>Rules</dt><dd>${esc(c.rules)} <a href="${safeHref(c.rules_url)}" target="_blank" rel="noopener nofollow">Source</a></dd></dl>
<p class="small muted" style="margin-top:8px">Catalog entry ${esc(c.reviewed)}. Check the live rules before posting.</p>
<details class="edit"><summary>Draft post</summary><p style="margin-top:8px"><b style="font-weight:600">${esc(c.draft_title)}</b></p><p style="white-space:pre-wrap">${esc(c.draft_body)}</p><div class="actions">${copyBtn(`${c.draft_title}\n\n${c.draft_body}`, "Copy draft")}</div></details></article>`).join("")}</div>`
      : empty("No communities yet", "Add your audience in Company context and the shortlist will follow.");

    const wave = v.wave_plan.length
      ? `<ol class="steps">${v.wave_plan.map((w) => `<li><div class="w">${esc(w.when)} · ${esc(channelName(w.channel))}</div><div>${esc(w.step)}</div><div class="y">${esc(w.why)}</div></li>`).join("")}</ol>`
      : empty("No wave plan yet", "The wave plan appears once your kit is written.");

    const row = (o: Outreach) => {
      const closed = o.status === "sent_manual" || o.status === "opted_out";
      const tag = o.status === "approved" ? `<span class="tag good">Approved</span>` : o.status === "sent_manual" ? `<span class="tag good">Sent by you</span>` : o.status === "opted_out" ? `<span class="tag">Opted out</span>` : `<span class="tag accent">Draft</span>`;
      const when = [o.approved_at ? `approved ${time(o.approved_at)}` : "", o.sent_at ? `sent ${time(o.sent_at)}` : "", !o.approved_at && !o.sent_at ? `updated ${time(o.updated_at)}` : ""].filter(Boolean).join(" · ");
      return `<article class="card"><div class="line"><h3>${esc(o.name)}</h3>${tag}</div><p class="small muted">${esc(o.contact)} · ${esc(when)}</p><p style="margin-top:8px"><b style="font-weight:600">Why them:</b> ${esc(o.why)}</p>
${closed ? `<p class="quote" style="margin-top:10px">${esc(o.draft)}</p>` : `<form method="post" action="${act(`/outreach/${esc(o.id)}`)}" style="margin-top:10px"><label class="field"><span>Message to ${esc(o.name)}</span><textarea class="draft" name="draft">${esc(o.draft)}</textarea></label>
<div class="actions"><button class="btn sm quiet" name="action" value="save" type="submit">Save</button>${o.status === "draft" ? `<button class="btn sm" name="action" value="approve" type="submit">Approve</button>` : `<button class="btn sm" name="action" value="sent" type="submit">I sent this</button>`}<button class="btn sm quiet" name="action" value="opt_out" type="submit">Opted out</button>${copyBtn(o.draft)}</div></form>`}</article>`;
    };

    return `<section class="pane"><div class="pane-head"><h1>Where to reach people</h1><p>Communities that fit your audience, a plan for the first hours, and people worth writing to.</p></div>
<div class="block"><h2>Communities</h2><p class="sub">Each reason comes from your context. Launchpad doesn't post here for you.</p>${communities}</div>
<div class="block"><h2>Wave plan</h2><p class="sub">What to do at each stage of the first hours. Log your numbers in Results to see how you're tracking.</p>${wave}</div>
<div class="block"><h2>Outreach</h2><p class="sub"><b style="color:var(--ink);font-weight:600">Nothing is sent by Launchpad.</b> You review each draft, send it yourself, then mark it here.</p>
${v.outreach.map(row).join("") || empty("No one on the list yet", "Add a person below and we'll draft a note from your company facts.")}
<form class="card" method="post" action="${act("/outreach")}" style="margin-top:14px"><h3>Add someone</h3><div class="fields" style="margin-top:10px"><div class="grid2"><label class="field"><span>Name</span><input type="text" name="name" required maxlength="120"></label><label class="field"><span>Contact <em>email, handle or URL</em></span><input type="text" name="contact" required maxlength="200"></label></div><label class="field"><span>Why they're relevant</span><textarea name="why" required maxlength="600" rows="2" style="min-height:64px"></textarea></label><div><button class="btn sm" type="submit">Draft a note</button></div></div></form></div></section>`;
  }

  // ---------------------------------------------------------------- Demo
  function demoTab(): string {
    const d = v.demo;
    if (!d) return `<section class="pane"><div class="pane-head"><h1>Demo cuts</h1></div>${empty("No storyboard yet", "The storyboard appears once your kit is written.")}</section>`;
    const total = d.scenes.reduce((n, s) => n + s.seconds, 0);
    return `<section class="pane"><div class="pane-head"><h1>${esc(d.title)}</h1><p>${d.format === "technical_b2b" ? "A technical B2B cut: the workflow and the result, shown plainly." : "A short product cut."} ${d.scenes.length} scenes, ${total} seconds.</p></div>
<div class="block"><h2>Studio</h2><p class="sub">Add your own recording for a real product cut. Without one, this renders a storyboard from your facts, which is not footage of your product.</p>
<div id="demo-studio" data-plan="${esc(JSON.stringify(d))}" data-company="${esc(l.company)}"></div><noscript>${empty("JavaScript needed", "Rendering happens in your browser.")}</noscript></div>
<div class="block"><h2>Scenes</h2><p class="sub">The script used for the cut.</p><ol class="steps">${d.scenes.map((s) => `<li><div class="w">${esc(s.heading)} · ${s.seconds}s</div><div class="y">${esc(s.caption)}</div></li>`).join("")}</ol></div>
<div class="block"><h2>Regular demos</h2><p class="sub">One topic a week between launches, drawn from your facts. Nothing here is scheduled or published automatically.</p>
${d.cadence.length ? `<div class="grid2">${d.cadence.map((c) => `<article class="card"><p class="eyebrow">Week ${c.week}</p><h3 style="margin-top:4px">${esc(c.topic)}</h3><p>${esc(c.why)}</p></article>`).join("")}</div>` : empty("No cadence yet", "Add proof and FAQ answers to Company context to get weekly topics.")}</div>
<script>${DEMO_STUDIO_JS}</script></section>`;
  }

  // ---------------------------------------------------------------- Replies
  function repliesTab(): string {
    const i = v.insights;
    const max = Math.max(1, ...Object.values(i.by_category));
    const insights = i.total === 0 ? empty("No comments imported", "Insights come only from comments you import, so there's nothing to summarize yet.") : `<div class="big"><div><b>${i.total}</b><span>comments imported</span></div><div><b>${i.unanswered}</b><span>still unanswered</span></div><div><b>${i.interested.length}</b><span>showing buying interest</span></div></div>
<div class="grid2"><div class="bars full">${(Object.keys(CATEGORY_LABELS) as CommentCategory[]).map((c) => { const n = i.by_category[c] ?? 0; return `<div class="row"><span>${esc(CATEGORY_LABELS[c])}</span><div class="track"><div class="fill" style="width:${Math.round((n / max) * 100)}%"></div></div><span class="n">${n}</span></div>`; }).join("")}</div>
<div>${insightList("Top questions", i.top_questions.map((x) => [x.text, x.comment_id]))}${insightList("Objections", i.objections.map((x) => [x.text, x.comment_id]))}${insightList("Interested", i.interested.map((x) => [x.author, x.comment_id]))}</div></div>`;

    const card = (c: LaunchComment) => {
      const closed = c.status === "posted_manual" || c.status === "ignored";
      const source = c.url ? `<a href="${safeHref(c.url)}" target="_blank" rel="noopener nofollow">Original comment</a>` : `<span>Manual import, no link</span>`;
      return `<article class="card" id="c-${esc(c.id)}"><div class="line"><h3>${esc(c.author)}</h3><span class="tag">${esc(CATEGORY_LABELS[c.category])}</span></div><p class="small muted">${esc(c.platform)} · ${source} · ${esc(time(c.created_at))}</p>
<p class="quote" style="margin-top:10px">${esc(c.body)}</p>
${c.unknown ? `<div class="escalate"><b>We don't know this:</b> ${esc(c.unknown)} <a href="${tabUrl("kit", "#context")}">Add it to your facts</a></div>` : ""}
${c.fact_refs.length ? `<div class="chips-row"><span class="small muted">Grounded in:</span>${c.fact_refs.map((r) => `<span class="tag">${esc(r)}</span>`).join("")}</div>` : ""}
${closed ? (c.draft ? `<p style="margin-top:10px;white-space:pre-wrap">${esc(c.draft)}</p>` : "") : `<form method="post" action="${act(`/comments/${esc(c.id)}`)}" style="margin-top:10px"><label class="field"><span>Reply to ${esc(c.author)}</span><textarea class="draft" name="draft" placeholder="Write the answer, or add the missing fact and re-import.">${esc(c.draft)}</textarea></label>
<div class="actions"><button class="btn sm quiet" name="action" value="save" type="submit">Save</button>${c.status === "approved" ? `<button class="btn sm" name="action" value="posted" type="submit">I posted this</button>` : `<button class="btn sm" name="action" value="approve" type="submit">Approve</button>`}${c.status !== "needs_founder" ? `<button class="btn sm quiet" name="action" value="escalate" type="submit">Needs me</button>` : ""}<button class="btn sm quiet" name="action" value="ignore" type="submit">Ignore</button>${c.draft ? copyBtn(c.draft) : ""}</div></form>`}</article>`;
    };
    const groups = STATUS_GROUPS.map((g) => { const rows = v.comments.filter((c) => c.status === g.status); return rows.length ? `<div class="block"><h2>${esc(g.title)} <span class="muted" style="font-weight:400">${rows.length}</span></h2>${g.sub ? `<p class="sub">${esc(g.sub)}</p>` : `<div style="height:12px"></div>`}${rows.map(card).join("")}</div>` : ""; }).join("");

    return `<section class="pane"><div class="pane-head"><h1>Launch comments</h1><p>Replies drawn only from your company facts. If the facts don't cover a question, it comes to you.</p></div>
<div class="block"><h2>Insights</h2><p class="sub">Counted from the comments below, with no outside sentiment data.</p>${insights}</div>
${groups || `<div class="block">${empty("Your review queue is empty", "Paste comments from your launch thread below to get grounded drafts.")}</div>`}
<div class="block"><h2>Manual import</h2><p class="sub">Paste comments from your launch post. Launchpad doesn't read your social accounts, and imports stay labelled manual.</p>
<form method="post" action="${act("/comments")}"><div class="fields"><label class="field"><span>Platform</span><select name="platform"><option>X</option><option>LinkedIn</option><option>Hacker News</option><option>Product Hunt</option><option>Reddit</option><option>Other</option></select></label>
<label class="field"><span>Comments <em>separate with a blank line. "author: text", optional URL on its own line</em></span><textarea name="raw" required rows="7" placeholder="jane: Does this work with Postgres?&#10;https://x.com/jane/status/123&#10;&#10;sam: How is this priced?"></textarea></label><div><button class="btn sm" type="submit">Import and draft replies</button></div></div></form></div></section>`;

    function insightList(title: string, items: [string, string][]): string {
      if (!items.length) return "";
      return `<div style="margin-bottom:14px"><p class="eyebrow" style="margin-bottom:6px">${esc(title)}</p>${items.slice(0, 5).map(([text, id]) => `<p class="small" style="margin-bottom:4px"><a href="#c-${esc(id)}">${esc(text)}</a></p>`).join("")}</div>`;
    }
  }

  // ---------------------------------------------------------------- Results
  function resultsTab(): string {
    const a = v.attribution;
    const t = a.totals;
    const s = v.stats;
    const channels = l.channels.length ? l.channels : ["x"];
    const advice = v.advice.length
      ? `<div class="grid2">${v.advice.map((x) => `<article class="card"><div class="line"><h3>${esc(channelName(x.channel))}</h3><span class="verdict ${esc(x.verdict)}">${esc(x.verdict.replace("_", " "))}</span></div><p>${esc(x.reading)}</p><p style="margin-top:8px;color:var(--ink)"><b style="font-weight:600">Next:</b> ${esc(x.action)}</p><p class="small muted" style="margin-top:8px">Rule: ${esc(x.rule)}</p></article>`).join("")}</div>`
      : empty("No checks logged", "Enter your numbers above after a post has been up for a while. The reading uses only those numbers.");
    const funnel = a.funnel.length
      ? `<div class="tablewrap"><table class="funnel"><thead><tr><th>Channel</th><th>Clicks</th><th>Visitors</th><th>Activated</th><th>Returned</th><th>Visit → active</th></tr></thead><tbody>${a.funnel.map((f) => `<tr><td>${esc(channelName(f.channel))}</td><td>${f.clicks}</td><td>${f.visitors}</td><td>${f.activated}</td><td>${f.returned}</td><td>${f.visitors ? `${Math.round((f.activated / f.visitors) * 100)}%` : "–"}</td></tr>`).join("")}</tbody><tfoot><tr><td>Total</td><td>${t.clicks}</td><td>${t.visitors}</td><td>${t.activated}</td><td>${t.returned}</td><td>${t.visitors ? `${Math.round((t.activated / t.visitors) * 100)}%` : "–"}</td></tr></tfoot></table></div>`
      : empty("No tracked traffic yet", "Clicks on your tracked links and product events from the snippet will appear here.");
    const d = v.deal;

    return `<section class="pane"><div class="pane-head"><h1>What's working</h1><p>${launched ? "Live numbers from your tracked links and product." : "These fill in once your tracked links get traffic."}</p></div>
<div class="big"><div><b>${t.clicks}</b><span>clicks</span></div><div><b>${t.visitors}</b><span>product visitors</span></div><div><b>${t.activated}</b><span>activated</span></div><div><b>${t.returned}</b><span>returned</span></div><div><b>${s.boosts.shared}</b><span>squad composers opened</span></div></div>
<div class="block"><h2>Wave check</h2><p class="sub">Enter what the platform shows you. We compare it with stated thresholds. Launchpad can't see platform analytics.</p>
<form method="post" action="${act("/wave")}"><div class="fields"><div class="row4 nums"><label class="field"><span>Channel</span><select name="channel">${channels.map((c) => `<option value="${esc(c)}">${esc(channelName(c))}</option>`).join("")}</select></label><label class="field"><span>Minutes since post</span><input type="number" name="minutes" min="0" required></label><label class="field"><span>Impressions</span><input type="number" name="impressions" min="0" required></label><label class="field"><span>Likes</span><input type="number" name="likes" min="0" required></label><label class="field"><span>Replies</span><input type="number" name="replies" min="0" required></label></div><div><button class="btn sm" type="submit">Read my numbers</button></div></div></form>
<div style="margin-top:18px">${advice}</div>
${v.checks.length ? `<p class="small muted" style="margin-top:8px">${v.checks.length} ${v.checks.length === 1 ? "check" : "checks"} logged. Latest ${esc(time(v.checks[v.checks.length - 1]!.created_at))}.</p>` : ""}</div>
<div class="block"><h2>What brought users</h2><p class="sub">${esc(a.rules)}</p>${funnel}
<p class="small muted" style="margin-top:10px">${t.qa_excluded} QA ${t.qa_excluded === 1 ? "event" : "events"} excluded. ${t.returned > 0 ? `${t.returned} observed ${t.returned === 1 ? "return" : "returns"} within ${a.return_window_days} days.` : "No return use observed yet, so we make no retention claim."}</p>
<details class="edit"><summary>Add the tracking snippet to your product</summary><p class="small muted" style="margin-top:8px">Sends visits and activations from your product, so the funnel goes past the click.</p><pre class="snippet">${esc(a.snippet)}</pre>${copyBtn(a.snippet, "Copy snippet")}</details></div>
${v.reports.length ? `<div class="block"><h2>Reports</h2>${v.reports.map((r) => `<p><a href="/r/${esc(r.id)}?${esc(q)}">${esc(r.title)}</a> <span class="small muted">· ${esc(time(r.created_at))}</span></p>`).join("")}</div>` : ""}
<div class="block"><div class="deal"><div class="grid2"><div><p class="small">Per launch</p><div class="price">$${d.price_usd}</div><ul>${d.deliverables.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p class="small">No payment taken. Trials are recorded separately from revenue.</p></div>
<div><div class="fields">${d.trial_accepted_at ? `<p>Trial accepted ${esc(time(d.trial_accepted_at))}.</p>` : `<form method="post" action="${act("/deal")}"><input type="hidden" name="action" value="accept_trial"><button class="btn" type="submit">Accept trial</button></form>`}
<form method="post" action="${act("/deal")}"><input type="hidden" name="action" value="hours"><label class="field"><span>Hours this saved you <em style="color:inherit;opacity:.7">your own estimate</em></span><input type="number" name="hours" min="0" step="0.5" required value="${d.hours_saved ?? ""}"></label><div class="actions"><button class="btn sm" type="submit">Save hours</button></div></form></div></div></div></div></div></section>`;
  }

  // ---------------------------------------------------------------- Network
  function networkTab(): string {
    const results = v.ask
      ? v.matches.length
        ? `<div class="grid2">${v.matches.map((m) => `<article class="card"><div class="line"><h3><a href="${safeHref(m.url)}" target="_blank" rel="noopener nofollow">${esc(m.company)}</a></h3></div><p class="small muted">${esc(m.one_liner)}</p><p style="margin-top:8px"><b style="font-weight:600">Why:</b> ${esc(m.why)}</p><p class="quote" style="margin-top:10px">${esc(m.ask)}</p><div class="actions">${copyBtn(m.ask, "Copy ask")}</div></article>`).join("")}</div>`
        : empty("No match among opted-in founders", "Nobody in the squad clearly fits this ask. We'd rather show nothing than a weak match.")
      : empty("Describe what you need", "We'll look through founders who opted in and explain why each one is relevant.");
    return `<section class="pane"><div class="pane-head"><h1>Find the right founder</h1><p>Describe what you need help with, or who might want to try what you're building.</p></div>
<form method="get" action="/k/${esc(l.slug)}"><input type="hidden" name="t" value="${esc(v.token)}"><input type="hidden" name="tab" value="network"><div class="fields"><label class="field"><span>Your ask</span><textarea name="ask" required maxlength="600" rows="3" placeholder="We need someone who has sold developer tools into security teams.">${esc(v.ask)}</textarea></label><div><button class="btn sm" type="submit">Find founders</button></div></div></form>
<div class="block" style="margin-top:26px"><p class="sub">Searches only founders who opted in through Launchpad. It doesn't read Bookface or any private YC data.</p>${results}</div></section>`;
  }

  // ---------------------------------------------------------------- Follow-through
  function followTab(): string {
    const open = v.commitments.filter((c) => c.status === "open");
    const done = v.commitments.filter((c) => c.status === "done");
    const card = (c: WorkspaceView["commitments"][number]) => `<article class="card"><div class="line"><h3>${esc(c.person)}</h3>${c.status === "done" ? `<span class="tag good">Done</span>` : c.due ? `<span class="tag accent">Due ${esc(c.due)}</span>` : `<span class="tag">Open</span>`}</div>
<p style="margin-top:6px"><b style="font-weight:600">You promised:</b> ${esc(c.promise)}</p>${c.context ? `<p class="small muted">${esc(c.context)}</p>` : ""}
${c.followup ? `<p class="quote" style="margin-top:10px">${esc(c.followup)}</p>` : ""}
<form method="post" action="${act(`/commit/${esc(c.id)}`)}"><div class="actions">${c.followup ? copyBtn(c.followup, "Copy follow-up") : ""}<button class="btn sm ${c.status === "done" ? "quiet" : ""}" name="action" value="${c.status === "done" ? "reopen" : "done"}" type="submit">${c.status === "done" ? "Reopen" : "Mark done"}</button></div></form></article>`;
    return `<section class="pane"><div class="pane-head"><h1>Follow-through</h1><p>What you promised people, the context from the conversation, and a follow-up ready to send yourself.</p></div>
<div class="block"><h2>Open <span class="muted" style="font-weight:400">${open.length}</span></h2><div style="height:12px"></div>${open.map(card).join("") || empty("Nothing outstanding", "Add a promise below after your next customer or investor conversation.")}</div>
<form class="card" method="post" action="${act("/commit")}"><h3>Add a commitment</h3><div class="fields" style="margin-top:10px"><div class="grid2"><label class="field"><span>Person</span><input type="text" name="person" required maxlength="120"></label><label class="field"><span>Due <em>optional</em></span><input type="text" name="due" maxlength="60" placeholder="Friday"></label></div><label class="field"><span>What you promised</span><input type="text" name="promise" required maxlength="400"></label><label class="field"><span>Conversation context <em>optional</em></span><textarea name="context" maxlength="1000" rows="2" style="min-height:64px"></textarea></label><div><button class="btn sm" type="submit">Add</button></div></div></form>
${done.length ? `<div class="block"><h2>Done <span class="muted" style="font-weight:400">${done.length}</span></h2><div style="height:12px"></div>${done.map(card).join("")}</div>` : ""}</section>`;
  }
}
