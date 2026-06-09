const router = require("express").Router();

const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const { getStripe, getPlanForPriceId } = require("../services/stripe");

router.post("/", async (req, res) => {
  let event;

  try {
    const stripe = getStripe();
    const signature = req.headers["stripe-signature"];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, signature, webhookSecret);
    } else {
      event = JSON.parse(req.body.toString("utf8"));
    }
  } catch (err) {
    return res.status(400).json({ error: `Webhook error: ${err.message}` });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object);
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated" ||
      event.type === "customer.subscription.deleted"
    ) {
      await handleSubscriptionChanged(event.data.object);
    }

    if (event.type === "invoice.payment_failed") {
      await handlePaymentFailed(event.data.object);
    }

    res.json({ received: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function handleCheckoutCompleted(session) {
  const orgId = session.metadata?.orgId;
  if (!orgId) return;

  await Organization.updateOne(
    { _id: orgId },
    {
      stripeCustomerId: session.customer,
      stripeSubscriptionId: session.subscription,
    }
  );

  await AuditLog.create({
    orgId,
    actorType: "system",
    action: "billing.checkout_completed",
    metadata: { sessionId: session.id, subscription: session.subscription },
  }).catch(() => null);
}

async function handleSubscriptionChanged(subscription) {
  const orgId = subscription.metadata?.orgId;
  if (!orgId) return;

  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.id || null;
  const plan = getPlanForPriceId(priceId);
  const status = subscription.status || "none";

  await Organization.updateOne(
    { _id: orgId },
    {
      plan: status === "active" || status === "trialing" ? plan : "starter",
      stripeCustomerId: subscription.customer,
      stripeSubscriptionId: subscription.id,
      stripePriceId: priceId,
      subscriptionStatus: status,
      subscriptionCurrentPeriodEnd: subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000)
        : null,
    }
  );

  await AuditLog.create({
    orgId,
    actorType: "system",
    action: "billing.subscription_changed",
    metadata: { subscriptionId: subscription.id, status, plan, priceId },
  }).catch(() => null);
}

async function handlePaymentFailed(invoice) {
  const subscriptionId = invoice.subscription;
  if (!subscriptionId) return;

  const organization = await Organization.findOne({ stripeSubscriptionId: subscriptionId });
  if (!organization) return;

  organization.subscriptionStatus = "past_due";
  await organization.save();

  await AuditLog.create({
    orgId: organization._id,
    actorType: "system",
    action: "billing.payment_failed",
    metadata: { invoiceId: invoice.id, subscriptionId },
  }).catch(() => null);
}

module.exports = router;
