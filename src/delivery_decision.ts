export type AssetIngestion = {
  assetId: string;
  creatorId: string;
  sourceObject: string;
  containsHealthData: boolean;
};

export type ProcessingJob = {
  jobId: string;
  assetId: string;
  operations: readonly ["virus-scan", "transcode", "package-hls"];
};

export type CreatorDelivery = {
  assetId: string;
  creatorId: string;
  processingJob: ProcessingJob;
  mode: "stream" | "download";
  auditReason: "flag-enabled" | "health-data-isolated" | "flag-disabled";
};

export function decideDelivery(asset: AssetIngestion, streamingEnabled: boolean): CreatorDelivery {
  const processingJob: ProcessingJob = {
    jobId: `process-${asset.assetId}`,
    assetId: asset.assetId,
    operations: ["virus-scan", "transcode", "package-hls"],
  };

  if (asset.containsHealthData) {
    return { ...asset, processingJob, mode: "download", auditReason: "health-data-isolated" };
  }
  return {
    ...asset,
    processingJob,
    mode: streamingEnabled ? "stream" : "download",
    auditReason: streamingEnabled ? "flag-enabled" : "flag-disabled",
  };
}
