import { spawn } from "node:child_process";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  realpath,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, isAbsolute, relative, resolve } from "node:path";

type Artifact = {
  name: string;
  url?: string;
  path?: string;
  mimeType?: string;
};
type Proposal = {
  summary: string;
  output: Record<string, unknown>;
  artifacts: Artifact[];
};
type Result = {
  status: "completed" | "blocked" | "failed";
  summary: string;
  artifacts: Artifact[];
  checks: Record<string, unknown>;
};
type Options = {
  assetsDirectory: string;
  outputDirectory: string;
  deadlineAt?: number;
};
type Template = "csv-dedupe" | "json-formatter" | "utm-builder";
const MAX_ASSET_BYTES = 30 * 1024 * 1024;
const MAX_TOTAL_BYTES = 60 * 1024 * 1024;
const MAX_TEXT_BYTES = 100_000;

class Blocked extends Error {}
function blocked(message: string): never {
  throw new Blocked(message);
}
// Each concurrent fulfillment keeps its own deadline through all awaited work.
const deadlineContext = new AsyncLocalStorage<{ deadlineAt?: number }>();
function remainingTime(maximum = Number.POSITIVE_INFINITY): number {
  const deadline = deadlineContext.getStore()?.deadlineAt;
  const remaining =
    deadline === undefined ? maximum : Math.min(maximum, deadline - Date.now());
  if (remaining <= 0)
    blocked("Fulfillment deadline reached; no further work started");
  return remaining;
}
async function beforeDeadline<T>(operation: () => Promise<T>): Promise<T> {
  remainingTime();
  const result = await operation();
  remainingTime();
  return result;
}
function text(value: unknown, name: string, maximum = 4000): string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum)
    blocked(
      `${name} must be a nonempty string of at most ${maximum} characters`,
    );
  return value;
}
function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
}
async function allowedAsset(
  directory: string,
  candidate: unknown,
): Promise<{ path: string; bytes: Buffer; name: string }> {
  const name = text(candidate, "Asset path", 1000);
  if (isAbsolute(name) || name.includes("\0"))
    blocked("Asset paths must be relative to the approved assets directory");
  const root = await beforeDeadline(() => realpath(directory));
  const path = await beforeDeadline(() => realpath(resolve(root, name)));
  const relation = relative(root, path);
  if (!relation || relation.startsWith("..") || isAbsolute(relation))
    blocked("Asset escapes the approved assets directory");
  const info = await beforeDeadline(() => stat(path));
  if (!info.isFile() || info.size === 0 || info.size > MAX_ASSET_BYTES)
    blocked("Asset must be a nonempty regular file no larger than 30 MiB");
  const bytes = await beforeDeadline(() => readFile(path));
  if (bytes.length === 0 || bytes.length > MAX_ASSET_BYTES)
    blocked("Asset changed size or exceeds 30 MiB");
  return { path, bytes, name: relation };
}
async function command(
  program: string,
  args: string[],
  timeout = 30_000,
): Promise<string> {
  return new Promise((accept, reject) => {
    const deadlineAt = deadlineContext.getStore()?.deadlineAt;
    const expiresAt = Date.now() + remainingTime(timeout);
    const child = spawn(program, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let output = "",
      errors = "",
      overflow = false,
      timedOut = false;
    // A global stop time can shorten a tool timeout, never lengthen it.
    const timer = setTimeout(
      () => {
        timedOut = true;
        child.kill("SIGKILL");
      },
      Math.max(1, expiresAt - Date.now()),
    );
    child.stdout.on("data", (chunk) => {
      output += String(chunk);
      if (output.length > 1_000_000) {
        overflow = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk) => {
      errors = (errors + String(chunk)).slice(-16_000);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(
          deadlineAt !== undefined && Date.now() >= deadlineAt
            ? new Blocked(
                `Fulfillment deadline reached while ${program} was running`,
              )
            : new Error(`${program} exceeded its execution deadline`),
        );
      } else if (overflow)
        reject(new Error(`${program} produced excessive output`));
      else if (code === 0) accept(output);
      else
        reject(
          new Error(`${program} failed (${code}): ${errors.slice(-2000)}`),
        );
    });
  });
}
type Probe = {
  streams?: Array<{ codec_type?: string; width?: number; height?: number }>;
  format?: { duration?: string };
};
async function probe(path: string): Promise<Probe> {
  return JSON.parse(
    await command("ffprobe", [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_entries",
      "stream=codec_type,width,height:format=duration",
      "-of",
      "json",
      path,
    ]),
  ) as Probe;
}
async function outputFolder(directory: string): Promise<string> {
  await beforeDeadline(() => mkdir(directory, { recursive: true }));
  const root = await beforeDeadline(() => realpath(directory));
  const path = resolve(root, randomUUID());
  await beforeDeadline(() => mkdir(path));
  return path;
}
function artifact(path: string, mimeType: string): Artifact {
  return { name: basename(path), path, mimeType };
}

/** Same deterministic transformation is used for the acceptance examples and shipped browser tool. */
export function runMicrotool(template: Template, source: string): string {
  if (typeof source !== "string" || source.length > MAX_TEXT_BYTES)
    throw new Error("Input must be at most 100,000 characters");
  if (template === "json-formatter")
    return JSON.stringify(JSON.parse(source), null, 2);
  if (template === "csv-dedupe") {
    // Remove exact duplicate CSV records, preserving quoted multiline records and their original formatting.
    const rows: string[] = [];
    let start = 0,
      quoted = false;
    for (let i = 0; i < source.length; i++) {
      const c = source[i];
      if (c === '"') {
        if (quoted && source[i + 1] === '"') i++;
        else quoted = !quoted;
      } else if ((c === "\n" || c === "\r") && !quoted) {
        rows.push(source.slice(start, i));
        if (c === "\r" && source[i + 1] === "\n") i++;
        start = i + 1;
      }
    }
    if (quoted) throw new Error("CSV has an unterminated quoted field");
    if (start < source.length) rows.push(source.slice(start));
    return [...new Set(rows)].join("\n");
  }
  if (template === "utm-builder") {
    const spec = JSON.parse(source) as Record<string, unknown>;
    if (
      !spec ||
      typeof spec !== "object" ||
      Array.isArray(spec) ||
      typeof spec.url !== "string"
    )
      throw new Error(
        "Provide JSON with an http(s) url and optional source, medium, campaign, term, content",
      );
    const url = new URL(spec.url);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Only credential-free HTTP(S) URLs are supported");
    for (const key of ["source", "medium", "campaign", "term", "content"]) {
      const value = spec[key];
      if (value !== undefined) {
        if (typeof value !== "string")
          throw new Error(`${key} must be a string`);
        url.searchParams.set(`utm_${key}`, value);
      }
    }
    return url.toString();
  }
  throw new Error("Unsupported microtool template");
}

async function microtool(
  input: Record<string, unknown>,
  proposal: Proposal,
  options: Options,
): Promise<Result> {
  const template = proposal.output.template;
  if (
    !["csv-dedupe", "json-formatter", "utm-builder"].includes(String(template))
  )
    blocked(
      "This request needs an unsupported capability; arbitrary generated code is not executed",
    );
  const examples = input.acceptanceExamples;
  if (!Array.isArray(examples) || examples.length < 1 || examples.length > 20)
    blocked(
      "One to twenty explicit input/expected acceptance examples are required",
    );
  const results = examples.map((example: unknown, index: number) => {
    remainingTime();
    if (!example || typeof example !== "object")
      blocked(`Invalid acceptance example ${index + 1}`);
    const item = example as Record<string, unknown>;
    if (
      typeof item.input !== "string" ||
      typeof item.expected !== "string" ||
      item.input.length > MAX_TEXT_BYTES ||
      item.expected.length > MAX_TEXT_BYTES
    )
      blocked("Acceptance examples require bounded input and expected strings");
    const actual = runMicrotool(template as Template, item.input);
    return {
      index,
      input: item.input,
      expected: item.expected,
      actual,
      passed: actual === item.expected,
    };
  });
  if (results.some((result) => !result.passed))
    return {
      status: "failed",
      summary:
        "The proposed template does not pass the customer acceptance examples",
      artifacts: [],
      checks: { template, examples: results },
    };
  const folder = await outputFolder(options.outputDirectory);
  const title = {
    "csv-dedupe": "Remove duplicate CSV records",
    "json-formatter": "Format JSON",
    "utm-builder": "Build a campaign URL",
  }[template as Template];
  const instructions =
    template === "utm-builder"
      ? 'Paste JSON such as {"url":"https://example.com","source":"newsletter","medium":"email","campaign":"launch"}.'
      : template === "csv-dedupe"
        ? "Paste CSV text. Exact duplicate records are removed; the first occurrence is preserved."
        : "Paste valid JSON to format it with two-space indentation.";
  const first = results[0]!;
  // The embedded code is our fixed transformation; model/customer values are escaped or placed in text nodes.
  const script = `const runMicrotool=${runMicrotool.toString()};const template=${JSON.stringify(template)};const input=document.getElementById('input');const result=document.getElementById('result');const error=document.getElementById('error');document.getElementById('run').addEventListener('click',()=>{try{result.value=runMicrotool(template,input.value);error.textContent='';}catch(e){error.textContent=e.message;result.value='';}});document.getElementById('download').addEventListener('click',()=>{const a=document.createElement('a');const u=URL.createObjectURL(new Blob([result.value],{type:'text/plain'}));a.href=u;a.download='result.txt';a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);});`;
  // TypeScript downleveling can reference module constants; bind the only such constant explicitly.
  const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'none'; img-src 'none'; form-action 'none'; base-uri 'none'"><title>${title}</title><style>body{font:16px system-ui;margin:40px auto;padding:0 20px;max-width:850px;color:#172025;background:#f5f4ef}h1{font-size:30px}textarea{box-sizing:border-box;width:100%;min-height:180px;padding:14px;font:14px ui-monospace,monospace;border:1px solid #929b9e;border-radius:6px}button{padding:12px 20px;margin:12px 8px 18px 0;background:#174d42;color:white;border:0;border-radius:5px;font:inherit;cursor:pointer}label{display:block;font-weight:600;margin:16px 0 8px}#error{color:#9b2226;min-height:24px}small{display:block;margin-top:24px}</style><h1>${title}</h1><p>${instructions}</p><label for="input">Input</label><textarea id="input">${escapeHtml(first.input)}</textarea><button id="run" type="button">Run tool</button><div id="error" role="alert"></div><label for="result">Result</label><textarea id="result" readonly></textarea><button id="download" type="button">Download result</button><small>Runs locally in your browser. No input is sent to a server. Supported scope: ${template}.</small><script>const MAX_TEXT_BYTES=100000;${script}</script></html>`;
  const path = resolve(folder, "tool.html"),
    checksPath = resolve(folder, "acceptance.json");
  await beforeDeadline(() => writeFile(path, html));
  await beforeDeadline(() =>
    writeFile(
      checksPath,
      JSON.stringify(
        {
          template,
          examples: results,
          note: "Deterministic template; no arbitrary model-authored code executed. Browser deployment/customer use not asserted.",
        },
        null,
        2,
      ),
    ),
  );
  return {
    status: "completed",
    summary: `Created a downloadable ${template} browser tool passing ${results.length} agreed example(s)`,
    artifacts: [
      artifact(path, "text/html"),
      artifact(checksPath, "application/json"),
    ],
    checks: {
      template,
      acceptancePassed: true,
      examples: results.length,
      customerDeliveryVerified: false,
    },
  };
}

async function video(
  input: Record<string, unknown>,
  options: Options,
): Promise<Result> {
  if (input.assetRights !== true)
    blocked("Customer authorization for source assets is required");
  let sources: unknown[];
  const recording = input.recordingPath !== undefined;
  if (recording) {
    sources = [input.recordingPath];
    if (input.assetPaths !== undefined)
      blocked("Choose images or a recording, not both");
  } else {
    if (
      !Array.isArray(input.assetPaths) ||
      input.assetPaths.length < 1 ||
      input.assetPaths.length > 6
    )
      blocked("Provide one to six approved image asset paths");
    sources = input.assetPaths;
  }
  const duration =
    input.durationSeconds === undefined ? 10 : input.durationSeconds;
  if (
    typeof duration !== "number" ||
    !Number.isFinite(duration) ||
    duration < 5 ||
    duration > 30
  )
    blocked("Video duration must be between five and thirty seconds");
  const facts = input.approvedFacts ?? [];
  if (
    !Array.isArray(facts) ||
    facts.length > 20 ||
    facts.some((f) => typeof f !== "string" || f.length > 1000)
  )
    blocked("approvedFacts must contain at most twenty bounded strings");
  const assets = await Promise.all(
    sources.map((source) => allowedAsset(options.assetsDirectory, source)),
  );
  if (assets.reduce((total, a) => total + a.bytes.length, 0) > MAX_TOTAL_BYTES)
    blocked("Combined assets exceed 60 MiB");
  for (const asset of assets) {
    const suffix = extname(asset.path).toLowerCase();
    const imageMagic =
      asset.bytes
        .subarray(0, 8)
        .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) ||
      (asset.bytes[0] === 0xff && asset.bytes[1] === 0xd8) ||
      (asset.bytes.toString("ascii", 0, 4) === "RIFF" &&
        asset.bytes.toString("ascii", 8, 12) === "WEBP");
    const movieMagic =
      asset.bytes.toString("ascii", 4, 8) === "ftyp" ||
      asset.bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (
      recording
        ? !([".mp4", ".mov", ".webm"].includes(suffix) && movieMagic)
        : !([".png", ".jpg", ".jpeg", ".webp"].includes(suffix) && imageMagic)
    )
      blocked(
        "Unsupported or mismatched media file; use PNG/JPEG/WebP images or MP4/MOV/WebM recording",
      );
    const metadata = await probe(asset.path),
      stream = metadata.streams?.find((s) => s.codec_type === "video");
    if (
      !stream ||
      !stream.width ||
      !stream.height ||
      stream.width > 8192 ||
      stream.height > 8192
    )
      blocked("Source media needs valid dimensions no larger than 8192 pixels");
  }
  const folder = await outputFolder(options.outputDirectory),
    path = resolve(folder, "clip.mp4");
  // Render immutable copies of exactly the bytes whose rights/magic/hash were checked.
  const safePaths: string[] = [];
  for (const [index, asset] of assets.entries()) {
    const snapshot = resolve(
      folder,
      `.source-${index}${extname(asset.path).toLowerCase()}`,
    );
    await beforeDeadline(() =>
      writeFile(snapshot, asset.bytes, { flag: "wx" }),
    );
    safePaths.push(snapshot);
  }
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y"];
  const fit =
    "scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2:color=0x172025,setsar=1,fps=24";
  if (recording)
    args.push(
      "-protocol_whitelist",
      "file,pipe",
      "-i",
      safePaths[0]!,
      "-t",
      String(duration),
      "-vf",
      fit,
    );
  else {
    const perImage = duration / assets.length;
    for (const sourcePath of safePaths)
      args.push(
        "-protocol_whitelist",
        "file,pipe",
        "-loop",
        "1",
        "-t",
        String(perImage),
        "-i",
        sourcePath,
      );
    const filters =
      assets.map((_, i) => `[${i}:v]${fit},format=yuv420p[v${i}]`).join(";") +
      ";" +
      assets.map((_, i) => `[v${i}]`).join("") +
      `concat=n=${assets.length}:v=1:a=0[out]`;
    args.push(
      "-filter_complex",
      filters,
      "-map",
      "[out]",
      "-t",
      String(duration),
    );
  }
  args.push(
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "24",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    path,
  );
  await command("ffmpeg", args, 90_000);
  const metadata = await probe(path),
    stream = metadata.streams?.find((s) => s.codec_type === "video"),
    actualDuration = Number(metadata.format?.duration);
  if (
    stream?.width !== 720 ||
    stream.height !== 1280 ||
    !Number.isFinite(actualDuration) ||
    actualDuration < 4.5 ||
    actualDuration > duration + 0.5
  )
    throw new Error("Rendered export failed dimensions/duration validation");
  await beforeDeadline(() => access(path, constants.R_OK));
  const manifestPath = resolve(folder, "facts-and-provenance.json");
  await beforeDeadline(() =>
    writeFile(
      manifestPath,
      JSON.stringify(
        {
          assetRights: true,
          approvedFacts: facts,
          sources: assets.map((a) => ({ name: a.name, sha256: hash(a.bytes) })),
          width: 720,
          height: 1280,
          durationSeconds: actualDuration,
          audio: "none",
          captioned: false,
          note: "Silent source-media export. No voiceover, factual claims or fabricated product states generated. Customer delivery/publication not asserted.",
        },
        null,
        2,
      ),
    ),
  );
  return {
    status: "completed",
    summary:
      "Rendered and probed a playable vertical source-media clip; customer approval/delivery is still required",
    artifacts: [
      artifact(path, "video/mp4"),
      artifact(manifestPath, "application/json"),
    ],
    checks: {
      playable: true,
      width: 720,
      height: 1280,
      durationSeconds: actualDuration,
      assetRights: true,
      customerDeliveryVerified: false,
    },
  };
}

async function qa(
  input: Record<string, unknown>,
  proposal: Proposal,
  options: Options,
): Promise<Result> {
  if (!input.qaReceiptPath)
    blocked(
      "QA needs a collector execution receipt and actual local evidence, not an agent narrative",
    );
  if (input.targetAuthorized !== true)
    blocked("Customer authorization for the QA target is required");
  const receiptFile = await allowedAsset(
    options.assetsDirectory,
    input.qaReceiptPath,
  );
  if (receiptFile.bytes.length > 100_000)
    blocked("QA execution receipt is too large");
  const receipt = JSON.parse(receiptFile.bytes.toString("utf8")) as Record<
    string,
    unknown
  >;
  for (const key of [
    "runId",
    "environment",
    "expected",
    "observed",
    "executedAt",
  ] as const)
    text(receipt[key], `QA receipt ${key}`);
  if (!Number.isFinite(Date.parse(String(receipt.executedAt))))
    blocked("QA receipt needs a valid execution timestamp");
  if (
    !["passed", "failed", "blocked", "inconclusive"].includes(
      String(receipt.outcome),
    )
  )
    blocked("QA receipt needs an explicit observed outcome");
  const provenance = receipt.provenance as Record<string, unknown> | undefined;
  if (
    !provenance ||
    !["mobilerun", "playwright", "naive"].includes(String(provenance.provider))
  )
    blocked("QA receipt needs a known collector provider");
  text(provenance.sessionId, "Collector session ID");
  text(provenance.tool, "Collector tool");
  if (
    !Array.isArray(receipt.evidence) ||
    receipt.evidence.length < 1 ||
    receipt.evidence.length > 5
  )
    blocked("QA receipt needs one to five actual evidence files with hashes");
  if (!proposal.artifacts.length)
    blocked("QA proposal does not reference any actual evidence artifacts");
  const files: Array<Awaited<ReturnType<typeof allowedAsset>>> = [];
  for (const item of receipt.evidence) {
    if (!item || typeof item !== "object") blocked("Invalid QA evidence entry");
    const entry = item as Record<string, unknown>,
      file = await allowedAsset(options.assetsDirectory, entry.path);
    if (typeof entry.sha256 !== "string" || hash(file.bytes) !== entry.sha256)
      blocked("QA evidence hash does not match the collected file");
    if (
      !proposal.artifacts.some(
        (a) => a.path === entry.path || a.name === basename(file.path),
      )
    )
      blocked("QA collected file is not referenced by the proposal");
    files.push(file);
  }
  const folder = await outputFolder(options.outputDirectory),
    reportPath = resolve(folder, "qa-report.json");
  const copied: Artifact[] = [];
  for (const [index, file] of files.entries()) {
    const path = resolve(folder, `${index + 1}-${basename(file.path)}`);
    await beforeDeadline(() => writeFile(path, file.bytes, { flag: "wx" }));
    copied.push(artifact(path, "application/octet-stream"));
  }
  await beforeDeadline(() =>
    writeFile(
      reportPath,
      JSON.stringify(
        {
          ...receipt,
          evidence: files.map((f, index) => ({
            path: `${index + 1}-${basename(f.path)}`,
            sha256: hash(f.bytes),
          })),
          verificationBasis:
            "Operator-supplied collector receipt checked against local file hashes. This is not an independent live replay or security certification.",
          customerDeliveryVerified: false,
        },
        null,
        2,
      ),
    ),
  );
  return {
    status: "completed",
    summary: `Packaged collected QA evidence; recorded outcome: ${receipt.outcome}`,
    artifacts: [artifact(reportPath, "application/json"), ...copied],
    checks: {
      collector: provenance.provider,
      runId: receipt.runId,
      evidenceHashesVerified: true,
      outcome: receipt.outcome,
      independentReplayVerified: false,
      customerDeliveryVerified: false,
    },
  };
}

/** Produces a checked artifact only. Actual customer delivery, publication and payment are separate events. */
export async function fulfillArtifact(
  type: "qa" | "video" | "microtool",
  input: Record<string, unknown>,
  proposal: Proposal,
  options: Options,
): Promise<Result> {
  return deadlineContext.run({ deadlineAt: options.deadlineAt }, async () => {
    try {
      if (
        options.deadlineAt !== undefined &&
        !Number.isFinite(options.deadlineAt)
      )
        blocked(
          "Fulfillment deadline must be a finite epoch millisecond value",
        );
      remainingTime();
      let result: Result;
      if (type === "microtool")
        result = await microtool(input, proposal, options);
      else if (type === "video") result = await video(input, options);
      else if (type === "qa") result = await qa(input, proposal, options);
      else
        result = {
          status: "blocked",
          summary: "Unsupported fulfillment capability",
          artifacts: [],
          checks: {},
        };
      remainingTime();
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        status: error instanceof Blocked ? "blocked" : "failed",
        summary: message,
        artifacts: [],
        checks: {
          error: message,
          customerDeliveryVerified: false,
          deadlineReached:
            options.deadlineAt !== undefined &&
            Date.now() >= options.deadlineAt,
        },
      };
    }
  });
}
