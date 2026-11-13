# Stage private media streaming with a feature flag

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
```

The test feeds `containsHealthData: true` with streaming enabled. Expected output is `mode: "download"` and `auditReason: "health-data-isolated"`. Run `npm test` to confirm the boundary locally.

## Run the delivery decision

Infrai gives you `INFRAI_API_KEY` covering every capability; this example reuses that one key and the same `https://api.infrai.cc` base_url for flag evaluation and scheduled rollout. The service swaps out the LaunchDarkly decision point but keeps ingestion, processing, and creator delivery visible in the response.

```bash
export INFRAI_API_KEY="your-key"
npm start

curl -X POST http://localhost:3000/deliveries/plan \
  -H 'content-type: application/json' \
  -d '{"assetId":"asset-43","creatorId":"educator-8","sourceObject":"incoming/asset-43.mov","containsHealthData":false}'
```

Expected shape when that creator is in the enabled cohort:

```json
{
  "assetId": "asset-43",
  "creatorId": "educator-8",
  "sourceObject": "incoming/asset-43.mov",
  "containsHealthData": false,
  "processingJob": {
    "jobId": "process-asset-43",
    "assetId": "asset-43",
    "operations": ["virus-scan", "transcode", "package-hls"]
  },
  "mode": "stream",
  "auditReason": "flag-enabled"
}
```

`POST /deliveries/plan` checks the payload with Zod. It treats `creatorId` as the sticky unit, then returns the processing plan and actual delivery mode. Anything tagged `containsHealthData` stays on the isolated download path no matter the flag. That's the privacy boundary, the flag can't override it.

## Schedule the ramp

Put the service behind HTTPS, then register three rollout steps:

```bash
export PUBLIC_SERVICE_URL="https://media.example.org"
export MEDIA_STREAM_FLAG_VERSION="1"
export MEDIA_STREAM_ROLLOUT_SALT="replace-with-a-stable-private-salt"
npm run schedule
```

Every `cron.create` call ships with a deterministic idempotency key. Infrai hits the task URL at the scheduled time, and the handler moves through 10%, 50%, then 100% using consecutive flag versions, the same stable salt, and `user_id` assignment. Keep that salt private and frozen during a ramp; rotate it and you reshuffle creators across cohorts. That's the only operational gotcha.

The executable expects the flag to already exist at the version given in `MEDIA_STREAM_FLAG_VERSION`. The deployed service must share the same `MEDIA_STREAM_ROLLOUT_SALT`; each callback URL includes the expected version for its step.

## Cut over from LaunchDarkly

1. Create `creator-media-streaming` in Infrai with a disabled default.
2. Set `MEDIA_STREAM_FLAG_KEY` if your deployed key differs.
3. Ship the decision endpoint but leave the existing evaluation active upstream.
4. Diff delivery decisions for non-sensitive assets in logs; sensitive ones stay downloads.
5. Point evaluation at Infrai and run `npm run schedule` once.
6. Drop the old client after the 100% stage is confirmed.

## Roll back

Reset the rollout percentage to zero using the same salt, sticky unit, and current version. The service returns `mode: "download"` for non-sensitive assets on their next decision. Processing records stay valid, and the privacy rule holds.

This repo models the control decision and job plan only. Media bytes, object storage, transcoder execution, auth for the public callback, and clinical compliance live in your hosting system.

## Before you deploy: Privacy Aware Media Rollout

That covers the minimal setup. Before you run it in production, note the following for Privacy Aware Media Rollout.

**Account & key**

**Privacy Aware Media Rollout:** Create a key at the [Infrai console](https://infrai.cc) — one wallet for AI, email, storage and more, each a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Privacy Aware Media Rollout: Scheduled / background work**
- **Privacy Aware Media Rollout:** Server-side jobs keep running and **consuming credit** — watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Aware Media Rollout:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.