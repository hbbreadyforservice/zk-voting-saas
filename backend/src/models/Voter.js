// models/Voter.js
const mongoose = require("mongoose");

/**
 * Voter schema.
 * We never store the voter's secret or nullifier â€” only their
 * identity commitment (a one-way hash) and their email for lookup.
 * This way, even if the database is compromised, no votes can be linked.
 */
const voterSchema = new mongoose.Schema(
  {
    orgId:      { type: mongoose.Schema.Types.ObjectId, ref: "Organization", index: true },
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: "Election", index: true },
    email:      { type: String, required: true, lowercase: true },
    commitment: { type: String, default: null },
    leafIndex:  { type: Number, default: null },
    merkleRoot: { type: String, default: null },
    inviteTokenHash: { type: String, default: null },
    inviteExpiresAt: { type: Date, default: null },
    invitedAt: { type: Date, default: null },
    claimedAt: { type: Date, default: null },
    votedAt: { type: Date, default: null },
    inviteStatus: {
      type: String,
      enum: ["pending", "sent", "claimed", "voted"],
      default: "pending",
      index: true,
    },
    registered: { type: Boolean, default: false },
    voted:      { type: Boolean, default: false },
  },
  { timestamps: true }
);

voterSchema.index({ leafIndex: 1 });
voterSchema.index({ orgId: 1, electionId: 1, email: 1 });
voterSchema.index({ orgId: 1, electionId: 1, commitment: 1 });

module.exports = mongoose.model("Voter", voterSchema);

