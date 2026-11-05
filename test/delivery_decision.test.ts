import assert from "node:assert/strict";
import test from "node:test";
import { decideDelivery } from "../src/delivery_decision.js";

test("health data stays on the isolated download path even when streaming is enabled", () => {
  const result = decideDelivery({
    assetId: "asset-42",
    creatorId: "clinician-7",
    sourceObject: "incoming/asset-42.mov",
    containsHealthData: true,
  }, true);

  assert.equal(result.mode, "download");
  assert.equal(result.auditReason, "health-data-isolated");
  assert.deepEqual(result.processingJob.operations, ["virus-scan", "transcode", "package-hls"]);
});

test("a non-sensitive asset streams when its creator receives the flag", () => {
  const result = decideDelivery({
    assetId: "asset-43",
    creatorId: "educator-8",
    sourceObject: "incoming/asset-43.mov",
    containsHealthData: false,
  }, true);

  assert.equal(result.mode, "stream");
  assert.equal(result.auditReason, "flag-enabled");
});
