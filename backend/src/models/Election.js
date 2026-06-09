const mongoose = require("mongoose");

const candidateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { _id: false }
);

const electionSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 180 },
    description: { type: String, default: "", trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: ["draft", "scheduled", "voting_open", "closed", "archived"],
      default: "draft",
      index: true,
    },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    candidates: {
      type: [candidateSchema],
      validate: {
        validator: (candidates) => !candidates || candidates.length === 0 || candidates.length >= 2,
        message: "An election must have at least two candidates.",
      },
      default: [],
    },
    voterCount: { type: Number, default: 0, min: 0 },
    votesCast: { type: Number, default: 0, min: 0 },
    merkleRoot: { type: String, default: null },
    factoryElectionId: { type: String, default: null },
    contractAddress: { type: String, default: null },
    verifierAddress: { type: String, default: null },
    factoryAddress: { type: String, default: null },
    chainId: { type: String, default: null },
    deploymentTxHash: { type: String, default: null },
    openedTxHash: { type: String, default: null },
    closedTxHash: { type: String, default: null },
    snapshot: {
      candidatesHash: { type: String, default: null },
      commitmentsHash: { type: String, default: null },
      circuitVersion: { type: String, default: null },
      zkeyHash: { type: String, default: null },
      verifierAddress: { type: String, default: null },
      capturedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

electionSchema.virtual("participationRate").get(function participationRate() {
  if (!this.voterCount) return 0;
  return Math.round((this.votesCast / this.voterCount) * 10000) / 100;
});

electionSchema.set("toJSON", { virtuals: true });
electionSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Election", electionSchema);
