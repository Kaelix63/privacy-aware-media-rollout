import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { decideDelivery } from "./delivery_decision.js";
import { InfraiError, infrai } from "./infrai_client.js";

const flagKey = process.env.MEDIA_STREAM_FLAG_KEY ?? "creator-media-streaming";
const port = Number(process.env.PORT ?? 3000);

const ingestionSchema = z.object({
  assetId: z.string().min(1).max(120),
  creatorId: z.string().min(1).max(120),
  sourceObject: z.string().min(1).max(500),
  containsHealthData: z.boolean(),
}).strict();

const rolloutEnvironmentSchema = z.object({
  MEDIA_STREAM_ROLLOUT_SALT: z.string().min(16).max(120),
});

async function readJson(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/deliveries/plan") {
      const asset = ingestionSchema.parse(await readJson(request));
      const streamingEnabled = await infrai.flags.is_enabled(flagKey, asset.creatorId);
      json(response, 200, decideDelivery({
        assetId: asset.assetId,
        creatorId: asset.creatorId,
        sourceObject: asset.sourceObject,
        containsHealthData: asset.containsHealthData,
      }, streamingEnabled));
      return;
    }

    const rolloutMatch = request.url?.match(/^\/rollout\/(\d{1,3})\/(\d+)$/);
    if (request.method === "POST" && rolloutMatch) {
      const percentage = Number(rolloutMatch[1]);
      if (percentage > 100) {
        json(response, 400, { error: "percentage must be between 0 and 100" });
        return;
      }
      const environment = rolloutEnvironmentSchema.parse(process.env);
      const version = Number(rolloutMatch[2]);
      const result = await infrai.flags.rollout(flagKey, {
        percentage,
        salt: environment.MEDIA_STREAM_ROLLOUT_SALT,
        sticky_unit: "user_id",
        version,
      });
      json(response, 200, { flagKey, percentage, result });
      return;
    }

    json(response, 404, { error: "route not found" });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      json(response, 400, { error: "invalid request body" });
      return;
    }
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      json(response, status, { error: error.code, message: error.message });
      return;
    }
    json(response, 500, { error: "request failed" });
  }
});

server.listen(port, () => {
  console.log(`media delivery service listening on http://localhost:${port}`);
});
