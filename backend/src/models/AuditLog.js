const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
  {
    orgId: { type: mongoose.Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    electionId: { type: mongoose.Schema.Types.ObjectId, ref: "Election", default: null, index: true },
    actorType: {
      type: String,
      enum: ["organization", "voter", "system"],
      default: "organization",
    },
    actorId: { type: String, default: null },
    action: { type: String, required: true, trim: true, maxlength: 120 },
    txHash: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

auditLogSchema.index({ orgId: 1, createdAt: -1 });
auditLogSchema.index({ electionId: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
