const mongoose = require("mongoose");

const organizationSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 160 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    plan: {
      type: String,
      enum: ["starter", "pro", "business"],
      default: "starter",
    },
    stripeCustomerId: { type: String, default: null },
    stripeSubscriptionId: { type: String, default: null },
    stripePriceId: { type: String, default: null },
    subscriptionStatus: {
      type: String,
      enum: ["none", "trialing", "active", "past_due", "canceled", "unpaid", "incomplete", "incomplete_expired", "paused"],
      default: "none",
    },
    subscriptionCurrentPeriodEnd: { type: Date, default: null },
    refreshTokenHash: { type: String, default: null },
    elections: [{ type: mongoose.Schema.Types.ObjectId, ref: "Election" }],
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Organization", organizationSchema);
