import test from "node:test";
import assert from "node:assert/strict";
import Stripe from "stripe";
import { Store } from "../src/store.js";
import { DEFAULT_POLICY, type Experiment, type Job } from "../src/domain.js";
import {
  orderPayment,
  processStripeEvent,
  registerCheckout,
  StripePaymentProvider,
} from "../src/payments.js";

const offer: Experiment = {
  id: "paid-tool",
  name: "Small tool",
  audience: "Makers",
  offer: "A checked JSON formatter",
  priceCents: 2900,
  currency: "USD",
  fulfillmentType: "microtool",
  status: "active",
  budgetCents: 500,
  channels: ["owned_intake"],
  hypothesis: "Buyers use files",
  successCriteria: ["paid delivery"],
  killCriteria: ["no demand"],
  evidenceRequirements: ["actual receipt"],
  parentExperimentId: null,
};
function setup() {
  const store = new Store(":memory:");
  store.setPolicy({
    ...DEFAULT_POLICY,
    mode: "live",
    liveAuthorized: true,
    totalBudgetCents: 500,
    allowedChannels: ["owned_intake"],
    stopAt: "2100-01-01T00:00:00Z",
  });
  store.seed([offer]);
  const lead = store.addLead({
    experimentId: offer.id,
    customerId: "customer-one",
    name: "Ada",
    request: "JSON formatter",
    sourceUrl: "https://customer.example",
    contact: "ada@example.com",
    channel: "owned_intake",
    consent: true,
    assetRights: true,
  });
  const job = store.enqueue(
    offer.id,
    "fulfill",
    { template: "json-formatter" },
    "order-one",
    lead.id,
  );
  store.addSignal({
    experimentId: offer.id,
    customerId: lead.customerId,
    orderId: job.id,
    scopeHash: job.scopeHash,
    type: "approval",
    evidence: "Customer scope approval",
    amountCents: 0,
    independent: false,
    mode: "live",
    externalId: "approval-one",
    verified: true,
  });
  registerCheckout(store, job, "cs_live_one");
  return { store, job, lead };
}
function checkout(
  job: Job,
  overrides: Record<string, unknown> = {},
  eventType = "checkout.session.completed",
): Stripe.Event {
  return {
    id: "evt_one",
    object: "event",
    type: eventType,
    livemode: true,
    data: {
      object: {
        id: "cs_live_one",
        object: "checkout.session",
        livemode: true,
        mode: "payment",
        status: "complete",
        payment_status: "paid",
        amount_total: job.priceCents,
        currency: "usd",
        client_reference_id: job.id,
        payment_intent: "pi_live_one",
        metadata: {
          orderId: job.id,
          scopeHash: job.scopeHash,
          customerId: "customer-one",
        },
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}
function refund(
  amount: number,
  overrides: Record<string, unknown> = {},
): Stripe.Event {
  return {
    id: `evt_refund_${amount}`,
    object: "event",
    type: "charge.refunded",
    livemode: true,
    data: {
      object: {
        id: "ch_live_one",
        object: "charge",
        livemode: true,
        paid: true,
        currency: "usd",
        amount: 2900,
        amount_refunded: amount,
        payment_intent: "pi_live_one",
        ...overrides,
      },
    },
  } as unknown as Stripe.Event;
}

test("only exact, signed-provider-shaped live checkout truth counts, and event variants deduplicate", () => {
  const { store, job } = setup();
  try {
    const pending = checkout(job, { payment_status: "unpaid" });
    assert.equal(processStripeEvent(store, pending).status, "ignored");
    assert.equal(
      processStripeEvent(store, { ...checkout(job), livemode: false }).status,
      "ignored",
    );
    for (const change of [
      { amount_total: 1 },
      { currency: "eur" },
      {
        metadata: {
          orderId: job.id,
          scopeHash: "old",
          customerId: "customer-one",
        },
      },
      {
        metadata: {
          orderId: job.id,
          scopeHash: job.scopeHash,
          customerId: "other",
        },
      },
      { id: "cs_other" },
    ])
      assert.equal(
        processStripeEvent(store, checkout(job, change)).status,
        "ignored",
      );
    assert.equal(orderPayment(store, job).settled, false);
    assert.equal(processStripeEvent(store, checkout(job)).status, "recorded");
    assert.equal(
      processStripeEvent(store, {
        ...checkout(job, {}, "checkout.session.async_payment_succeeded"),
        id: "evt_different",
      }).status,
      "duplicate",
    );
    assert.equal(
      processStripeEvent(store, {
        ...checkout(job),
        id: "evt_intent",
        type: "payment_intent.succeeded",
      } as Stripe.Event).status,
      "ignored",
    );
    assert.equal(orderPayment(store, job).paidCents, 2900);
    assert.equal(store.signals().filter((s) => s.type === "payment").length, 1);
    assert.equal(
      store.signals().find((s) => s.type === "payment")!.independent,
      false,
      "payment truth does not assert buyer independence",
    );
  } finally {
    store.close();
  }
});

test("cumulative refunds stay order-bound, idempotent and monotonically reconciled", () => {
  const { store, job } = setup();
  try {
    assert.equal(processStripeEvent(store, refund(500)).status, "pending");
    processStripeEvent(store, checkout(job));
    assert.equal(processStripeEvent(store, refund(500)).status, "recorded");
    assert.equal(processStripeEvent(store, refund(500)).status, "duplicate");
    assert.equal(processStripeEvent(store, refund(1200)).status, "recorded");
    assert.equal(processStripeEvent(store, refund(500)).status, "duplicate");
    assert.equal(orderPayment(store, job).refundedCents, 1200);
    assert.equal(orderPayment(store, job).settled, false);
    assert.equal(processStripeEvent(store, refund(3000)).status, "ignored");
    assert.equal(orderPayment(store, job).refundedCents, 1200);
    assert.equal(
      processStripeEvent(store, refund(2900, { currency: "eur" })).status,
      "ignored",
    );
    assert.equal(processStripeEvent(store, refund(2900)).status, "recorded");
    assert.equal(orderPayment(store, job).refundedCents, 2900);
  } finally {
    store.close();
  }
});

test("replayed paid checkout repairs an interrupted intent mapping before returning duplicate", () => {
  const { store, job } = setup();
  try {
    processStripeEvent(store, checkout(job));
    store.db
      .prepare(
        "UPDATE commerce_checkouts SET payment_intent_id=NULL WHERE order_id=?",
      )
      .run(job.id);
    assert.equal(processStripeEvent(store, refund(500)).status, "pending");
    assert.equal(processStripeEvent(store, checkout(job)).status, "duplicate");
    assert.equal(processStripeEvent(store, refund(500)).status, "recorded");
    assert.equal(orderPayment(store, job).refundedCents, 500);
  } finally {
    store.close();
  }
});

test("the actual Stripe SDK checks the raw signature without calling Stripe", () => {
  const provider = new StripePaymentProvider("sk_test_not_a_real_key");
  const sdk = new Stripe("sk_test_not_a_real_key");
  const secret = "whsec_local_test_only";
  const raw = Buffer.from(
    JSON.stringify({
      id: "evt_signed",
      object: "event",
      type: "payment_intent.succeeded",
      livemode: false,
      data: { object: {} },
    }),
  );
  const signature = sdk.webhooks.generateTestHeaderString({
    payload: raw.toString(),
    secret,
  });
  assert.equal(
    provider.constructEvent(raw, signature, secret).id,
    "evt_signed",
  );
  assert.throws(() =>
    provider.constructEvent(Buffer.from("{}"), signature, secret),
  );
  assert.throws(() => provider.constructEvent(raw, signature, "whsec_wrong"));
});
