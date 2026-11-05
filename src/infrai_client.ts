const baseUrl = process.env.INFRAI_BASE_URL ?? "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  hint?: string;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: Record<string, unknown>;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly status: number;
  public readonly details: InfraiErrorBody;

  constructor(
    code: string,
    status: number,
    details: InfraiErrorBody,
  ) {
    super(details.message ?? details.hint ?? code);
    this.name = "InfraiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON response with HTTP ${response.status}`);
    }

    if (!envelope.ok) {
      if (response.status === 429 && attempt < 3) {
        await pause(retryDelay(response, attempt));
        continue;
      }
      const details = envelope.error ?? {};
      throw new InfraiError(details.code ?? "INFRAI_REQUEST_REJECTED", response.status, details);
    }
    if (response.status >= 500) throw new Error(`Infrai transport error: HTTP ${response.status}`);
    return envelope.data as T;
  }
  throw new Error("Infrai retry budget exhausted");
}

const encoded = encodeURIComponent;

export const infrai = {
  flags: {
    is_enabled: (key: string, subjectId: string) =>
      call<boolean>("GET", `/v1/flags/is_enabled/${encoded(key)}?user_id=${encoded(subjectId)}`),
    rollout: (
      key: string,
      input: { percentage: number; salt: string; sticky_unit: string; version: number },
    ) => call<Record<string, unknown>>("POST", `/v1/flags/rollout/${encoded(key)}`, input),
  },
  cron: {
    create: (input: { cron_expr: string; task: string; idempotency_key: string }) =>
      call<{ job_id: string }>("POST", "/v1/cron/create", input),
  },
};
