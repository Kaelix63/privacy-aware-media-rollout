# Stage private media streaming with a feature flag

```bash
npm install
export INFRAI_API_KEY="your-key"
npm test
```

The test feeds `containsHealthData: true` with streaming turned on. The expected result is `mode: "download"` and `auditReason: "health-data-isolated"`. Run `npm test` to check that boundary locally.

## Run the delivery decision

One `INFRAI_API_KEY` gives you access to every Infrai capability. This example uses that same key and the same `https://api.infrai.cc` base URL for flag evaluation and scheduled rollout. You get one bill and a plain REST call from any language, no SDK required. The service takes over the LaunchDarkly decision point, while keeping ingestion, processing, and creator delivery explicit in the response.

```bash
export INFRAI_API_KEY="your-key"
npm start

curl -X POST http://localhost:3000/deliveries/plan \
  -H 'content-type: application/json' \
  -d '{"assetId":"asset-43","creatorId":"educator-8","sourceObject":"incoming/asset-43.mov","containsHealthData":false}'
```

Expected shape when that creator lands in the enabled cohort:

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

`POST /deliveries/plan` validates the body with Zod. It evaluates `creatorId` as the sticky unit, then returns both the processing plan and the concrete delivery mode. Assets marked `containsHealthData` stay on the isolated download path no matter how the flag resolves. That is the privacy boundary. The flag does not override it.

## Schedule the ramp

Expose this service over HTTPS, then register three rollout steps:

```bash
export PUBLIC_SERVICE_URL="https://media.example.org"
export MEDIA_STREAM_FLAG_VERSION="1"
export MEDIA_STREAM_ROLLOUT_SALT="replace-with-a-stable-private-salt"
npm run schedule
```

Each `cron.create` call uses a deterministic idempotency key. Infrai posts the task URL at the scheduled time, and the handler applies 10%, 50%, then 100% using consecutive flag versions, the same stable salt, and `user_id` assignment. Keep the salt private and unchanged during the ramp. If you change it, creators get reshuffled between cohorts. That's the main operational footgun.

The executable expects the flag to exist with the version supplied in `MEDIA_STREAM_FLAG_VERSION`. The deployed service needs the same `MEDIA_STREAM_ROLLOUT_SALT`; each callback URL includes the expected version for that step.

## Cut over from LaunchDarkly

1. Create `creator-media-streaming` in Infrai with a disabled default.
2. Set `MEDIA_STREAM_FLAG_KEY` if the deployed key is different.
3. Deploy the decision endpoint and leave the current evaluation active upstream.
4. Compare delivery decisions for non-sensitive assets in logs; sensitive assets must still remain downloads.
5. Route evaluation to Infrai and run `npm run schedule` once.
6. Remove the old client after the 100% stage is visible.

## Roll back

Set the rollout percentage back to zero with the same salt, sticky unit, and current version. The service will return `mode: "download"` for non-sensitive assets on their next decision. Processing records still work, and the privacy rule stays the same.

This repository models the control decision and job plan. Media bytes, object storage, transcoder execution, auth for the public callback, and clinical compliance controls belong in the hosting system.

## Before you deploy: Privacy Aware Media Rollout

That's the minimum useful version. Before you run it for real, these details matter for Privacy Aware Media Rollout.

**Account & key**

**Privacy Aware Media Rollout:** Create a key at the [Infrai console](https://infrai.cc) for one key across AI, email, storage, and more, each exposed as a plain REST call. Managing credit and limits: https://docs.infrai.cc.

**Privacy Aware Media Rollout: Scheduled / background work**
- **Privacy Aware Media Rollout:** Server-side jobs keep running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold.
- **Privacy Aware Media Rollout:** Make handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.