const router = require("express").Router();
const { body, validationResult } = require("express-validator");

const Organization = require("../models/Organization");
const AuditLog = require("../models/AuditLog");
const { getStripe, getPriceIdForPlan } = require("../services/stripe");
const { getPlanLimits, getUsage, serializeLimits } = require("../middleware/quota");

router.get("/summary", async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.orgId).select(
      "plan stripeCustomerId stripeSubscriptionId stripePriceId subscriptionStatus subscriptionCurrentPeriodEnd"
    );
    const usage = await getUsage(req.orgId);
    const limits = serializeLimits(getPlanLimits(organization.plan));

    res.json({
      plan: organization.plan,
      usage,
      limits,
      subscription: {
        status: organization.subscriptionStatus,
        currentPeriodEnd: organization.subscriptionCurrentPeriodEnd,
        stripeCustomerId: organization.stripeCustomerId,
        stripeSubscriptionId: organization.stripeSubscriptionId,
      },
      pricesConfigured: {
        pro: Boolean(process.env.STRIPE_PRO_PRICE_ID),
        business: Boolean(process.env.STRIPE_BUSINESS_PRICE_ID),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.post(
  "/create-checkout",
  [body("plan").isIn(["pro", "business"])],
  async (req, res, next) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const priceId = getPriceIdForPlan(req.body.plan);
      if (!priceId) {
        return res.status(503).json({ error: `Stripe price ID for ${req.body.plan} is not configured` });
      }

      const stripe = getStripe();
      const organization = await Organization.findById(req.orgId);
      let customerId = organization.stripeCustomerId;

      if (!customerId) {
        const customer = await stripe.customers.create({
          name: organization.name,
          email: organization.email,
          metadata: { orgId: organization._id.toString() },
        });
        customerId = customer.id;
        organization.stripeCustomerId = customerId;
        await organization.save();
      }

      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${frontendUrl}/dashboard/billing?checkout=success`,
        cancel_url: `${frontendUrl}/dashboard/billing?checkout=cancel`,
        metadata: {
          orgId: organization._id.toString(),
          plan: req.body.plan,
        },
        subscription_data: {
          metadata: {
            orgId: organization._id.toString(),
            plan: req.body.plan,
          },
        },
      });

      await AuditLog.create({
        orgId: req.orgId,
        actorType: "organization",
        actorId: req.orgId.toString(),
        action: "billing.checkout_created",
        metadata: { plan: req.body.plan, sessionId: session.id },
      }).catch(() => null);

      res.json({ url: session.url, sessionId: session.id });
    } catch (err) {
      next(err);
    }
  }
);

router.get("/portal", async (req, res, next) => {
  try {
    const organization = await Organization.findById(req.orgId);
    if (!organization.stripeCustomerId) {
      return res.status(409).json({ error: "No Stripe customer exists for this organization" });
    }

    const stripe = getStripe();
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
    const session = await stripe.billingPortal.sessions.create({
      customer: organization.stripeCustomerId,
      return_url: `${frontendUrl}/dashboard/billing`,
    });

    res.json({ url: session.url });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
