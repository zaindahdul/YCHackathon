import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Stripe from "stripe";
import { get, type IncomingMessage, type ClientRequest } from "node:http";
import { Store } from "../src/store.js";
import { Company } from "../src/company.js";
import { DEFAULT_POLICY, type Experiment, type Job } from "../src/domain.js";
import { createCompanyServer, customerOrderToken } from "../src/server.js";
import {
  StripePaymentProvider,
  type CheckoutRequest,
} from "../src/payments.js";

const admin = "operator-token-at-least-24-characters";
const customerSecret = "customer-hmac-secret-more-than-32-characters";
const webhookSecret = "whsec_offline_test_only";
const sdk = new Stripe("sk_test_offline_no_network");
class OfflineProvider extends StripePaymentProvider {
  calls: CheckoutRequest[] = [];
  live = true;
  constructor() {
    super("sk_test_offline_no_network");
  }
  override async createCheckout(input: CheckoutRequest) {
    this.calls.push(input);
    return {
      id: `cs_${input.orderId}`,
      url: `https://checkout.stripe.com/test/${input.orderId}`,
      live: this.live,
    };
  }
}
function offer(
  id = "customer-tool",
  priceCents = 2900,
  fulfillmentType: Experiment["fulfillmentType"] = "microtool",
): Experiment {
  return {
    id,
    name: id,
    audience: "Developers",
    offer: "An agreed checked artifact",
    priceCents,
    currency: "USD",
    fulfillmentType,
    status: "active",
    budgetCents: 1000,
    channels: ["owned_intake"],
    hypothesis: "Customers use the delivered file",
    successCriteria: ["independent paid delivery"],
    killCriteria: ["no demand"],
    evidenceRequirements: ["request", "artifact"],
    parentExperimentId: null,
  };
}
async function setup(
  t: TestContext,
  opts: { priceCents?: number; enabled?: boolean; provider?: boolean } = {},
) {
  const root = await mkdtemp(join(tmpdir(), "company-server-")),
    assetsDirectory = join(root, "assets"),
    artifactsDirectory = join(root, "artifacts");
  await mkdir(assetsDirectory);
  await mkdir(artifactsDirectory);
  const store = new Store(":memory:");
  store.setPolicy({
    ...DEFAULT_POLICY,
    mode: "live",
    liveAuthorized: opts.enabled ?? true,
    totalBudgetCents: 2000,
    perTaskBudgetCents: 100,
    allowedChannels: ["owned_intake"],
    stopAt: "2100-01-01T00:00:00Z",
  });
  store.seed([
    offer("customer-tool", opts.priceCents ?? 2900),
    offer("customer-video", 1900, "video"),
    offer("customer-qa", 1900, "qa"),
  ]);
  const company = new Company(store, {
    assetsDirectory,
    outputDirectory: artifactsDirectory,
    adapter: () => ({
      async run() {
        return {
          status: "completed",
          summary: "Offline deterministic proposal",
          output: { template: "json-formatter" },
          artifacts: [],
          costCents: 1,
          costKnown: true,
        };
      },
    }),
  });
  const provider = new OfflineProvider();
  const server = createCompanyServer(store, company, admin, {
    customerSecret,
    assetsDirectory,
    artifactsDirectory,
    ...(opts.provider === false
      ? {}
      : {
          paymentProvider: provider,
          stripeWebhookSecret: webhookSecret,
          publicBaseUrl: "https://company.example.test",
        }),
  });
  await new Promise<void>((accept) => server.listen(0, "127.0.0.1", accept));
  const port = (server.address() as { port: number }).port,
    base = `http://127.0.0.1:${port}`;
  t.after(async () => {
    await new Promise<void>((accept, reject) =>
      server.close((error) => (error ? reject(error) : accept())),
    );
    store.close();
    await rm(root, { recursive: true, force: true });
  });
  const api = async (
    path: string,
    init: { method?: string; value?: unknown; token?: string } = {},
  ) => {
    const response = await fetch(base + path, {
      method: init.method ?? (init.value === undefined ? "GET" : "POST"),
      headers: {
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
        ...(init.value !== undefined
          ? { "content-type": "application/json" }
          : {}),
      },
      ...(init.value !== undefined ? { body: JSON.stringify(init.value) } : {}),
    });
    return {
      status: response.status,
      data: (await response.json()) as Record<string, any>,
      headers: response.headers,
    };
  };
  const request = (extra: Record<string, unknown> = {}) =>
    api("/api/requests", {
      value: {
        experimentId: "customer-tool",
        name: "Ada",
        contact: "ada@example.com",
        request: "Format my JSON",
        consent: true,
        assetRights: true,
        input: {
          template: "json-formatter",
          acceptanceExamples: [
            { input: '{"a":1}', expected: '{\n  "a": 1\n}' },
          ],
        },
        ...extra,
      },
    });
  const approve = (order: { id: string; scopeHash: string }, token: string) =>
    api(`/api/orders/${order.id}/approve`, {
      value: { scopeHash: order.scopeHash },
      token,
    });
  const webhook = async (event: unknown, signature?: string) => {
    const raw = JSON.stringify(event),
      header =
        signature ??
        sdk.webhooks.generateTestHeaderString({
          payload: raw,
          secret: webhookSecret,
        });
    const response = await fetch(base + "/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": header,
        "content-type": "application/json",
      },
      body: raw,
    });
    return {
      status: response.status,
      data: (await response.json()) as Record<string, any>,
    };
  };
  return {
    root,
    assetsDirectory,
    artifactsDirectory,
    store,
    company,
    provider,
    base,
    api,
    request,
    approve,
    webhook,
  };
}
function paidEvent(
  store: Store,
  orderId: string,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  const job = store.job(orderId),
    lead = store.lead(job.leadId!);
  return {
    id: "evt_customer_paid",
    object: "event",
    type: "checkout.session.completed",
    livemode: true,
    data: {
      object: {
        id: `cs_${job.id}`,
        object: "checkout.session",
        livemode: true,
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        currency: "usd",
        amount_total: job.priceCents,
        client_reference_id: job.id,
        payment_intent: `pi_${job.id}`,
        metadata: {
          orderId: job.id,
          scopeHash: job.scopeHash,
          customerId: lead.customerId,
        },
        ...extra,
      },
    },
  };
}

test("public intake creates an isolated immutable order and cannot access operator/customer peers", async (t) => {
  const e = await setup(t);
  assert.equal((await e.api("/api/status")).status, 401);
  const first = await e.request({
    independent: true,
    customerId: "forged-founder-id",
  });
  assert.equal(first.status, 201);
  const { order, token } = first.data;
  assert.equal(typeof token, "string");
  assert.equal(token, customerOrderToken(customerSecret, order.id));
  assert.equal(e.store.lead(e.store.job(order.id).leadId!).independent, false);
  assert.notEqual(
    e.store.lead(e.store.job(order.id).leadId!).customerId,
    "forged-founder-id",
  );
  assert.equal((await e.api("/api/status", { token })).status, 401);
  const second = await e.request({ contact: "lin@example.com" });
  assert.equal(
    (await e.api(`/api/orders/${second.data.order.id}`, { token })).status,
    401,
  );
  assert.equal(
    (
      await e.api(`/api/orders/${order.id}/approve`, {
        token,
        value: { scopeHash: "old-scope" },
      })
    ).status,
    409,
  );
  assert.equal((await e.approve(order, token)).status, 200);
  assert.equal((await e.approve(order, token)).status, 200);
  assert.equal(
    e.store.signals().filter((s) => s.type === "approval").length,
    1,
  );
  assert.equal(
    e.store.signals().filter((s) => s.type === "qualified_lead").length,
    1,
  );
  const status = await e.api(`/api/orders/${order.id}`, { token });
  assert.equal(status.data.approved, true);
  assert.equal(status.data.canDownload, false);
  assert.equal("input" in status.data, false);
  assert.equal("output" in status.data, false);
});

test("paid customer journey gates real local artifact transfer on approved scope and signed live payment", async (t) => {
  const e = await setup(t);
  const created = await e.request(),
    { order, token } = created.data;
  assert.equal(
    (await e.api(`/api/orders/${order.id}/checkout`, { token, value: {} }))
      .status,
    409,
  );
  await e.approve(order, token);
  assert.equal(
    (await e.api(`/api/orders/${order.id}/checkout`, { token, value: {} }))
      .status,
    409,
    "generation is still required",
  );
  await e.company.execute(e.store.job(order.id));
  assert.equal(e.store.job(order.id).status, "completed");
  const unpaid = await e.api(`/api/orders/${order.id}`, { token });
  assert.equal(unpaid.data.artifacts.length, 2);
  assert.equal(unpaid.data.canDownload, false);
  assert.equal(
    JSON.stringify(unpaid.data).includes(e.artifactsDirectory),
    false,
  );
  assert.equal(
    (await e.api(`/api/orders/${order.id}/artifacts/0`, { token })).status,
    403,
  );
  const checkout = await e.api(`/api/orders/${order.id}/checkout`, {
    token,
    value: {},
  });
  assert.equal(checkout.status, 201);
  assert.equal(checkout.data.paymentConfirmed, false);
  assert.equal(e.provider.calls[0]!.priceCents, 2900);
  const spoof = await e.webhook(paidEvent(e.store, order.id), "t=0,v1=forged");
  assert.equal(spoof.status, 400);
  assert.equal(
    e.store.signals().some((s) => s.type === "payment"),
    false,
  );
  const testMode = paidEvent(e.store, order.id);
  testMode.livemode = false;
  assert.equal((await e.webhook(testMode)).data.status, "ignored");
  assert.equal(
    (await e.webhook(paidEvent(e.store, order.id))).data.status,
    "recorded",
  );
  assert.equal(
    (await e.webhook(paidEvent(e.store, order.id))).data.status,
    "duplicate",
  );
  const paid = await e.api(`/api/orders/${order.id}`, { token });
  assert.equal(paid.data.canDownload, true);
  const one = await fetch(e.base + `/api/orders/${order.id}/artifacts/0`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(one.status, 200);
  assert.equal(one.headers.get("content-type"), "application/octet-stream");
  assert.match(one.headers.get("content-disposition")!, /^attachment/);
  assert.match(await one.text(), /Format JSON/);
  assert.equal(
    e.store.signals().filter((s) => s.type === "delivery").length,
    0,
    "all package artifacts must be transferred",
  );
  const two = await fetch(e.base + `/api/orders/${order.id}/artifacts/1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(two.status, 200);
  assert.match(await two.text(), /examples/);
  assert.equal(
    e.store.signals().filter((s) => s.type === "delivery").length,
    1,
  );
  assert.equal(
    e.store.metrics(order.experimentId, "live").payments,
    0,
    "unqualified public identity is not asserted independent",
  );
  e.store.qualifyLead(
    e.store.job(order.id).leadId!,
    "Outside customer verified in a separate opt-in conversation",
  );
  assert.equal(e.store.metrics(order.experimentId, "live").completedOrders, 1);
  const again = await fetch(e.base + `/api/orders/${order.id}/artifacts/1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  await again.arrayBuffer();
  assert.equal(
    e.store.signals().filter((s) => s.type === "delivery").length,
    1,
  );
});

test("free pilot transfers do not become paid orders or revenue", async (t) => {
  const e = await setup(t, { priceCents: 0 });
  const created = await e.request(),
    { order, token } = created.data;
  await e.approve(order, token);
  await e.company.execute(e.store.job(order.id));
  assert.equal(
    (await e.api(`/api/orders/${order.id}`, { token })).data.canDownload,
    true,
  );
  for (const index of [0, 1]) {
    const response = await fetch(
      e.base + `/api/orders/${order.id}/artifacts/${index}`,
      { headers: { authorization: `Bearer ${token}` } },
    );
    assert.equal(response.status, 200);
    await response.arrayBuffer();
  }
  e.store.qualifyLead(
    e.store.job(order.id).leadId!,
    "Outside free pilot participant",
  );
  assert.equal(e.store.metrics(order.experimentId, "live").completedOrders, 0);
  assert.equal(e.store.metrics(order.experimentId, "live").revenueCents, 0);
});

test("path escapes and symlinked private files cannot be downloaded even by paid customers", async (t) => {
  const e = await setup(t, { priceCents: 0 });
  const created = await e.request(),
    { order, token } = created.data;
  await e.approve(order, token);
  const secret = join(e.root, "secret.txt");
  await writeFile(secret, "private");
  const link = join(e.artifactsDirectory, "link.txt");
  await symlink(secret, link);
  const job = e.store.job(order.id);
  job.status = "completed";
  job.output = {
    fulfillment: {
      status: "completed",
      artifacts: [{ name: "secret.txt", path: link }],
    },
  };
  e.store.saveJob(job);
  assert.equal(
    (await e.api(`/api/orders/${order.id}/artifacts/0`, { token })).status,
    403,
  );
  assert.equal(
    e.store.signals().some((s) => s.type === "delivery"),
    false,
  );
});

test("public intake rejects local paths, unavailable QA and unconfigured/disabled operations", async (t) => {
  const e = await setup(t);
  const dangerous = await e.request({
    input: {
      assetPaths: ["another-customer/photo.png"],
      acceptanceExamples: [{ input: "{}", expected: "{}" }],
    },
  });
  assert.equal(dangerous.status, 400);
  assert.equal(e.store.leads().length, 0);
  const qa = await e.request({
    experimentId: "customer-qa",
    input: {
      targetAuthorized: true,
      targetUrl: "https://target.example",
      journeys: ["signup"],
    },
  });
  assert.equal(qa.status, 503);
  assert.equal(e.store.leads().length, 0);
  const disabled = await setup(t, { enabled: false });
  assert.equal((await disabled.request()).status, 409);
  const noProvider = await setup(t, { provider: false, priceCents: 0 });
  const order = await noProvider.request();
  await noProvider.approve(order.data.order, order.data.token);
  await noProvider.company.execute(noProvider.store.job(order.data.order.id));
  assert.equal(
    (
      await noProvider.api(`/api/orders/${order.data.order.id}/checkout`, {
        token: order.data.token,
        value: {},
      })
    ).status,
    503,
  );
});

test("video uploads are customer-scoped instead of exposing global asset paths", async (t) => {
  const e = await setup(t);
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(16),
  ]);
  const uploaded = await e.request({
    experimentId: "customer-video",
    input: { durationSeconds: 5, approvedFacts: ["Approved title"] },
    assets: [{ contentType: "image/png", base64: bytes.toString("base64") }],
  });
  assert.equal(uploaded.status, 201);
  const job = e.store.job(uploaded.data.order.id),
    lead = e.store.lead(job.leadId!),
    paths = job.input.assetPaths as string[];
  assert.equal(paths.length, 1);
  assert.match(paths[0]!, /^[a-f0-9-]{36}\/[a-f0-9-]{36}\.png$/);
  assert.equal(paths[0]!.includes(lead.customerId), false);
  assert.deepEqual(await readFile(join(e.assetsDirectory, paths[0]!)), bytes);
  assert.equal(JSON.stringify(uploaded.data).includes(paths[0]!), false);
});

test("owner evidence endpoint cannot forge provider payment or delivery verification", async (t) => {
  const e = await setup(t);
  const created = await e.request(),
    order = e.store.job(created.data.order.id),
    lead = e.store.lead(order.leadId!);
  const result = await e.api("/api/signals", {
    token: admin,
    value: {
      experimentId: order.experimentId,
      customerId: lead.customerId,
      orderId: order.id,
      scopeHash: order.scopeHash,
      type: "payment",
      evidence: "An operator claimed payment",
      amountCents: order.priceCents,
      independent: true,
      mode: "live",
      externalId: "operator-fake",
      verified: true,
    },
  });
  assert.equal(result.status, 201);
  assert.equal(result.data.verified, false);
  assert.equal(
    (await e.api(`/api/orders/${order.id}`, { token: created.data.token })).data
      .payment.settled,
    false,
  );
});

test("live orders refuse test checkout registration and oversized operator bodies", async (t) => {
  const e = await setup(t);
  const created = await e.request(),
    { order, token } = created.data;
  await e.approve(order, token);
  await e.company.execute(e.store.job(order.id));
  e.provider.live = false;
  assert.equal(
    (await e.api(`/api/orders/${order.id}/checkout`, { token, value: {} }))
      .status,
    409,
  );
  assert.equal(
    e.store.db
      .prepare(
        "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name='commerce_checkouts'",
      )
      .get()!.count,
    0,
  );
  const response = await e.api("/api/leads", {
    token: admin,
    value: { oversized: "x".repeat(130_000) },
  });
  assert.equal(response.status, 413);
});

test("canonical contacts share buyer identity but never share private tokens or upload directories", async (t) => {
  const e = await setup(t);
  const a = await e.request({ contact: " Ada@Example.COM " }),
    b = await e.request({ contact: "ada@example.com" });
  const first = e.store.lead(e.store.job(a.data.order.id).leadId!),
    second = e.store.lead(e.store.job(b.data.order.id).leadId!);
  assert.equal(first.customerId, second.customerId);
  assert.notEqual(a.data.token, b.data.token);
  assert.equal(
    (await e.api(`/api/orders/${b.data.order.id}`, { token: a.data.token }))
      .status,
    401,
  );
  await e.approve(a.data.order, a.data.token);
  await e.approve(b.data.order, b.data.token);
  e.store.qualifyLead(first.id, "Outside buyer contact verified");
  e.store.qualifyLead(second.id, "Same outside buyer verified again");
  assert.equal(e.store.metrics(first.experimentId, "live").qualifiedLeads, 1);
  const bytes = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    Buffer.alloc(16),
  ]);
  const upload = {
    experimentId: "customer-video",
    input: { durationSeconds: 5 },
    assets: [{ contentType: "image/png", base64: bytes.toString("base64") }],
  };
  const videoA = await e.request(upload),
    videoB = await e.request(upload);
  assert.equal(videoA.status, 201);
  assert.equal(videoB.status, 201);
  const pathA = (
      e.store.job(videoA.data.order.id).input.assetPaths as string[]
    )[0]!,
    pathB = (
      e.store.job(videoB.data.order.id).input.assetPaths as string[]
    )[0]!;
  assert.notEqual(pathA.split("/")[0], pathB.split("/")[0]);
});

test("private customer feedback is bounded, recorded once and isolated by order", async (t) => {
  const e = await setup(t),
    created = await e.request(),
    { order, token } = created.data;
  const path = `/api/orders/${order.id}/feedback`;
  assert.equal(
    (await e.api(path, { value: { text: "Please add YAML input support." } }))
      .status,
    401,
  );
  assert.equal(
    (await e.api(path, { token, value: { text: "x".repeat(2001) } })).status,
    400,
  );
  assert.equal(
    (
      await e.api(path, {
        token,
        value: { text: "Please add YAML input support." },
      })
    ).status,
    200,
  );
  e.store.qualifyLead(
    e.store.job(order.id).leadId!,
    "Outside customer verified",
  );
  assert.equal(
    (
      await e.api(path, {
        token,
        value: { text: "Please add YAML input support." },
      })
    ).status,
    200,
  );
  const replies = e.store.signals().filter((s) => s.type === "reply");
  assert.equal(replies.length, 1);
  assert.equal(replies[0]!.evidence, "Please add YAML input support.");
  assert.equal(replies[0]!.scopeHash, order.scopeHash);
  assert.equal(replies[0]!.verified, true);
  assert.equal(e.store.metrics(order.experimentId, "live").replies, 1);
});

test("download slots are acquired before filesystem awaits and held through unfinished responses", async (t) => {
  const e = await setup(t, { priceCents: 0 }),
    created = await e.request(),
    { order, token } = created.data;
  await e.approve(order, token);
  const file = join(e.artifactsDirectory, "large.bin");
  await writeFile(file, Buffer.alloc(8_000_000, 65));
  const job = e.store.job(order.id);
  job.status = "completed";
  job.output = {
    fulfillment: {
      status: "completed",
      artifacts: [{ name: "large.bin", path: file }],
    },
  };
  e.store.saveJob(job);
  const requests: ClientRequest[] = [],
    responses: IncomingMessage[] = [];
  const statuses = await Promise.all(
    Array.from(
      { length: 5 },
      () =>
        new Promise<number>((accept, reject) => {
          const req = get(
            e.base + `/api/orders/${order.id}/artifacts/0`,
            { headers: { authorization: `Bearer ${token}` } },
            (response) => {
              responses.push(response);
              response.pause();
              accept(response.statusCode!);
            },
          );
          requests.push(req);
          req.on("error", reject);
        }),
    ),
  );
  responses.forEach((r) => r.destroy());
  requests.forEach((r) => r.destroy());
  assert.equal(statuses.filter((s) => s === 200).length, 4);
  assert.equal(statuses.filter((s) => s === 429).length, 1);
  assert.equal(
    e.store.signals().some((s) => s.type === "delivery"),
    false,
    "interrupted buffered transfers are not complete delivery",
  );
});
