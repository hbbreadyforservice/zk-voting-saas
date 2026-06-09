const Stripe = require("stripe");

let stripe = null;

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }

  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }

  return stripe;
}

function getPriceIdForPlan(plan) {
  if (plan === "pro") return process.env.STRIPE_PRO_PRICE_ID;
  if (plan === "business") return process.env.STRIPE_BUSINESS_PRICE_ID;
  return null;
}

function getPlanForPriceId(priceId) {
  if (priceId && priceId === process.env.STRIPE_PRO_PRICE_ID) return "pro";
  if (priceId && priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return "business";
  return "starter";
}

module.exports = {
  getStripe,
  getPriceIdForPlan,
  getPlanForPriceId,
};
