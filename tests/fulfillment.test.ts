import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { fulfillArtifact, runMicrotool } from "../src/fulfillment.js";

const proposal = (template = "json-formatter") => ({
  summary: "Proposed tool",
  output: { template },
  artifacts: [],
});
async function environment() {
  const root = await mkdtemp(join(tmpdir(), "naive-fulfill-"));
  const assetsDirectory = join(root, "assets"),
    outputDirectory = join(root, "outputs");
  await mkdir(assetsDirectory);
  return { root, assetsDirectory, outputDirectory };
}

test("CSV tool preserves quoted multiline records and drops exact duplicates", () => {
  const input =
    'name,note\r\nAda,"first\nsecond"\r\nAda,"first\nsecond"\r\nLin,"a ""quote"""\r\n';
  assert.equal(
    runMicrotool("csv-dedupe", input),
    'name,note\nAda,"first\nsecond"\nLin,"a ""quote"""',
  );
  assert.throws(
    () => runMicrotool("csv-dedupe", 'a,"unclosed'),
    /unterminated/,
  );
});

test("UTM builder encodes campaign values and preserves the existing URL", () => {
  assert.equal(
    runMicrotool(
      "utm-builder",
      JSON.stringify({
        url: "https://example.com/page?x=1#top",
        source: "my newsletter",
        medium: "email",
      }),
    ),
    "https://example.com/page?x=1&utm_source=my+newsletter&utm_medium=email#top",
  );
  assert.throws(
    () => runMicrotool("utm-builder", '{"url":"javascript:alert(1)"}'),
    /HTTP/,
  );
  assert.throws(
    () =>
      runMicrotool("utm-builder", '{"url":"https://user:secret@example.com"}'),
    /HTTP/,
  );
});

test("microtool fails incorrect acceptance examples without producing a delivery artifact", async () => {
  const options = await environment();
  try {
    const result = await fulfillArtifact(
      "microtool",
      { acceptanceExamples: [{ input: '{"a":1}', expected: "wrong" }] },
      proposal(),
      options,
    );
    assert.equal(result.status, "failed");
    assert.deepEqual(result.artifacts, []);
    const unsupported = await fulfillArtifact(
      "microtool",
      { acceptanceExamples: [] },
      proposal("run-shell-code"),
      options,
    );
    assert.equal(unsupported.status, "blocked");
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("shipped HTML runs the same accepted transformation and sends no network requests", async () => {
  const options = await environment();
  try {
    const result = await fulfillArtifact(
      "microtool",
      {
        acceptanceExamples: [{ input: '{"a":1}', expected: '{\n  "a": 1\n}' }],
      },
      proposal(),
      options,
    );
    assert.equal(result.status, "completed");
    assert.equal(result.checks.customerDeliveryVerified, false);
    const html = await readFile(result.artifacts[0]!.path!, "utf8");
    assert.match(html, /connect-src 'none'/);
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!;
    const nodes: Record<
      string,
      {
        value: string;
        textContent: string;
        addEventListener: (type: string, callback: () => void) => void;
      }
    > = {};
    const events: Record<string, () => void> = {};
    for (const id of ["input", "result", "error", "run", "download"])
      nodes[id] = {
        value: "",
        textContent: "",
        addEventListener: (_type, callback) => {
          events[id] = callback;
        },
      };
    runInNewContext(script, {
      URL,
      Blob,
      setTimeout,
      document: { getElementById: (id: string) => nodes[id] },
    });
    nodes.input!.value = '{"customer":"Ada"}';
    events.run!();
    assert.equal(nodes.result!.value, '{\n  "customer": "Ada"\n}');
    nodes.input!.value = "not-json";
    events.run!();
    assert.equal(nodes.result!.value, "");
    assert.ok(nodes.error!.textContent.length > 0);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("customer-supplied markup is escaped inside the downloadable HTML", async () => {
  const options = await environment();
  try {
    const input = '</textarea><script>fetch("https://evil.example")</script>';
    const result = await fulfillArtifact(
      "microtool",
      { acceptanceExamples: [{ input, expected: input }] },
      proposal("csv-dedupe"),
      options,
    );
    assert.equal(result.status, "completed");
    const html = await readFile(result.artifacts[0]!.path!, "utf8");
    assert.ok(!html.includes("</textarea><script>fetch("));
    assert.ok(html.includes("&lt;/textarea&gt;&lt;script&gt;"));
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("video requires asset rights and rejects paths escaping the asset root", async () => {
  const options = await environment();
  try {
    const missing = await fulfillArtifact(
      "video",
      { assetPaths: ["image.png"] },
      proposal(),
      options,
    );
    assert.equal(missing.status, "blocked");
    assert.match(missing.summary, /authorization/);
    const outside = join(options.root, "outside.png");
    await writeFile(outside, "not an image");
    const escape = await fulfillArtifact(
      "video",
      { assetRights: true, assetPaths: ["../outside.png"] },
      proposal(),
      options,
    );
    assert.equal(escape.status, "blocked");
    assert.match(escape.summary, /escapes/);
    await symlink(outside, join(options.assetsDirectory, "link.png"));
    const linked = await fulfillArtifact(
      "video",
      { assetRights: true, assetPaths: ["link.png"] },
      proposal(),
      options,
    );
    assert.equal(linked.status, "blocked");
    const fake = join(options.assetsDirectory, "fake.png");
    await writeFile(fake, "#EXTM3U\nhttps://example.com/secret");
    const mismatch = await fulfillArtifact(
      "video",
      { assetRights: true, assetPaths: ["fake.png"] },
      proposal(),
      options,
    );
    assert.equal(mismatch.status, "blocked");
    assert.match(mismatch.summary, /Unsupported/);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("video creates a real H264 vertical MP4 and records the exact source hash", async () => {
  const options = await environment();
  try {
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=blue:s=160x90",
        "-frames:v",
        "1",
        join(options.assetsDirectory, "image.png"),
      ],
      { timeout: 15_000 },
    );
    execFileSync(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "error",
        "-f",
        "lavfi",
        "-i",
        "color=c=red:s=90x160",
        "-frames:v",
        "1",
        join(options.assetsDirectory, "portrait.png"),
      ],
      { timeout: 15_000 },
    );
    const result = await fulfillArtifact(
      "video",
      {
        assetRights: true,
        assetPaths: ["image.png", "portrait.png"],
        durationSeconds: 5,
        approvedFacts: ["Owner-approved sample"],
      },
      proposal(),
      options,
    );
    assert.equal(result.status, "completed", result.summary);
    const movie = result.artifacts.find((a) => a.mimeType === "video/mp4")!;
    const check = JSON.parse(
      execFileSync(
        "ffprobe",
        [
          "-v",
          "error",
          "-show_entries",
          "stream=codec_name,width,height:format=duration",
          "-of",
          "json",
          movie.path!,
        ],
        { encoding: "utf8" },
      ),
    );
    assert.equal(check.streams[0].codec_name, "h264");
    assert.equal(check.streams[0].width, 720);
    assert.equal(check.streams[0].height, 1280);
    assert.ok(
      Number(check.format.duration) >= 4.9 &&
        Number(check.format.duration) <= 5.5,
    );
    const manifest = JSON.parse(
      await readFile(
        result.artifacts.find((a) => a.mimeType === "application/json")!.path!,
        "utf8",
      ),
    );
    assert.equal(
      manifest.sources[0].sha256,
      createHash("sha256")
        .update(await readFile(join(options.assetsDirectory, "image.png")))
        .digest("hex"),
    );
    assert.deepEqual(manifest.approvedFacts, ["Owner-approved sample"]);
    assert.equal(result.checks.customerDeliveryVerified, false);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("QA cannot complete from a model narrative or unverifiable evidence hash", async () => {
  const options = await environment();
  try {
    const narrative = await fulfillArtifact(
      "qa",
      { targetAuthorized: true },
      { summary: "Found a crash", output: { passed: true }, artifacts: [] },
      options,
    );
    assert.equal(narrative.status, "blocked");
    const evidence = Buffer.from("actual collector log");
    await writeFile(join(options.assetsDirectory, "run.txt"), evidence);
    const receipt = {
      runId: "run-1",
      environment: "Chromium desktop, not a physical phone",
      expected: "Open page",
      observed: "Page loaded",
      executedAt: new Date().toISOString(),
      outcome: "passed",
      provenance: {
        provider: "playwright",
        sessionId: "collector-1",
        tool: "browser.navigate",
      },
      evidence: [{ path: "run.txt", sha256: "0".repeat(64) }],
    };
    await writeFile(
      join(options.assetsDirectory, "receipt.json"),
      JSON.stringify(receipt),
    );
    const attempted = await fulfillArtifact(
      "qa",
      { targetAuthorized: true, qaReceiptPath: "receipt.json" },
      {
        summary: "Result",
        output: {},
        artifacts: [{ name: "run.txt", path: "run.txt" }],
      },
      options,
    );
    assert.equal(attempted.status, "blocked");
    assert.match(attempted.summary, /hash/);
    receipt.evidence[0]!.sha256 = createHash("sha256")
      .update(evidence)
      .digest("hex");
    await writeFile(
      join(options.assetsDirectory, "receipt.json"),
      JSON.stringify(receipt),
    );
    const packaged = await fulfillArtifact(
      "qa",
      { targetAuthorized: true, qaReceiptPath: "receipt.json" },
      {
        summary: "Result",
        output: {},
        artifacts: [{ name: "run.txt", path: "run.txt" }],
      },
      options,
    );
    assert.equal(packaged.status, "completed");
    assert.equal(packaged.checks.independentReplayVerified, false);
    assert.equal(packaged.checks.customerDeliveryVerified, false);
    const report = JSON.parse(
      await readFile(packaged.artifacts[0]!.path!, "utf8"),
    );
    assert.match(report.verificationBasis, /not an independent live replay/);
    assert.equal(report.environment, "Chromium desktop, not a physical phone");
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("expired deadline rejects before reading assets, spawning a renderer, or creating outputs", async () => {
  const options = await environment();
  try {
    const result = await fulfillArtifact(
      "video",
      { assetRights: true, assetPaths: ["missing.png"] },
      proposal(),
      { ...options, deadlineAt: Date.now() - 1 },
    );
    assert.equal(result.status, "blocked");
    assert.match(result.summary, /deadline reached/i);
    assert.equal(result.checks.deadlineReached, true);
    assert.deepEqual(result.artifacts, []);
    await assert.rejects(
      readFile(join(options.outputDirectory, "clip.mp4")),
      /ENOENT/,
    );
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("concurrent fulfillment deadlines are isolated and invalid deadlines are refused", async () => {
  const options = await environment();
  try {
    const input = {
      acceptanceExamples: [{ input: '{"a":1}', expected: '{\n  "a": 1\n}' }],
    };
    const [expired, allowed] = await Promise.all([
      fulfillArtifact("microtool", input, proposal(), {
        ...options,
        deadlineAt: Date.now() - 1,
      }),
      fulfillArtifact("microtool", input, proposal(), {
        ...options,
        deadlineAt: Date.now() + 10_000,
      }),
    ]);
    assert.equal(expired.status, "blocked");
    assert.equal(allowed.status, "completed", allowed.summary);
    const invalid = await fulfillArtifact("microtool", input, proposal(), {
      ...options,
      deadlineAt: NaN,
    });
    assert.equal(invalid.status, "blocked");
    assert.match(invalid.summary, /finite epoch/);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});

test("QA delivery retains the verified snapshot when a source changes after hashing", async () => {
  const options = await environment();
  try {
    const original = Buffer.from("collected evidence before any mutation");
    const source = join(options.assetsDirectory, "run.txt");
    await writeFile(source, original);
    const expectedHash = createHash("sha256").update(original).digest("hex");
    const receipt = {
      runId: "snapshot-run",
      environment: "Test collector",
      expected: "Original content",
      observed: "Original content",
      executedAt: new Date().toISOString(),
      outcome: "passed",
      provenance: {
        provider: "playwright",
        sessionId: "snapshot-session",
        tool: "browser.extract",
      },
      evidence: [{ path: "run.txt", sha256: expectedHash }],
    };
    await writeFile(
      join(options.assetsDirectory, "receipt.json"),
      JSON.stringify(receipt),
    );
    // The artifact lookup occurs after the collected file hash has passed. This
    // deterministic mutation represents another process replacing that source.
    const reference = {
      name: "run.txt",
      get path() {
        writeFileSync(source, "changed after verification");
        return "run.txt";
      },
    };
    const result = await fulfillArtifact(
      "qa",
      { targetAuthorized: true, qaReceiptPath: "receipt.json" },
      { summary: "Collected result", output: {}, artifacts: [reference] },
      options,
    );
    assert.equal(result.status, "completed", result.summary);
    assert.equal(await readFile(source, "utf8"), "changed after verification");
    const delivered = await readFile(result.artifacts[1]!.path!);
    assert.deepEqual(delivered, original);
    const report = JSON.parse(
      await readFile(result.artifacts[0]!.path!, "utf8"),
    );
    assert.equal(
      createHash("sha256").update(delivered).digest("hex"),
      report.evidence[0].sha256,
    );
    assert.equal(report.evidence[0].sha256, expectedHash);
  } finally {
    await rm(options.root, { recursive: true, force: true });
  }
});
