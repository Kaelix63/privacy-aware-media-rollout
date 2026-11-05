import { z } from "zod";
import { infrai } from "./infrai_client.js";

const environmentSchema = z.object({
  PUBLIC_SERVICE_URL: z.string().url(),
  MEDIA_STREAM_FLAG_VERSION: z.coerce.number().int().nonnegative(),
  MEDIA_STREAM_ROLLOUT_SALT: z.string().min(16),
});

const environment = environmentSchema.parse(process.env);
const baseTaskUrl = environment.PUBLIC_SERVICE_URL.replace(/\/$/, "");
const stages = [
  { percentage: 10, cron_expr: "0 9 1 * *", versionOffset: 0 },
  { percentage: 50, cron_expr: "0 9 3 * *", versionOffset: 1 },
  { percentage: 100, cron_expr: "0 9 5 * *", versionOffset: 2 },
] as const;

for (const stage of stages) {
  const version = environment.MEDIA_STREAM_FLAG_VERSION + stage.versionOffset;
  const task = `${baseTaskUrl}/rollout/${stage.percentage}/${version}`;
  const created = await infrai.cron.create({
    cron_expr: stage.cron_expr,
    task,
    idempotency_key: `media-stream-${version}-${stage.percentage}`,
  });
  console.log(JSON.stringify({ percentage: stage.percentage, job_id: created.job_id }));
}
