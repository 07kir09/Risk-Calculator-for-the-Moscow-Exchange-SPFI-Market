import { createRequestId } from "../lib/id";
import { ApiErrorModel, NormalizedValidationIssue, RequestMeta } from "../types/contracts";

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type ApiSuccess<T> = {
  data: T;
  meta: RequestMeta;
};

const defaultTimeoutMs = 30_000;

function toValidationIssues(details: unknown): NormalizedValidationIssue[] {
  if (!Array.isArray(details)) {
    return [];
  }

  return details
    .map((entry): NormalizedValidationIssue | null => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const data = entry as Record<string, unknown>;
      const loc = Array.isArray(data.loc) ? data.loc : [];
      const index = typeof loc[2] === "number" ? loc[2] : undefined;
      const message = typeof data.msg === "string" ? data.msg : "Validation error";
      const rawField = typeof loc[3] === "string" ? loc[3] : typeof loc[1] === "string" ? loc[1] : undefined;
      const field =
        rawField === "__root__"
          ? message.toLowerCase().includes("дата экспирации")
            ? "maturity_date"
            : "position"
          : rawField;
      return { index, field, message };
    })
    .filter((entry): entry is NormalizedValidationIssue => Boolean(entry));
}

function normalizeError(status: number, body: any, meta: RequestMeta): ApiErrorModel {
  const message = body?.message || body?.detail || `Request failed with status ${status}`;

  if (status === 422) {
    return {
      kind: "validation",
      message,
      status,
      requestId: body?.requestId || meta.requestId,
      traceId: body?.traceId || meta.traceId,
      details: body?.details,
      validationIssues: toValidationIssues(body?.details),
    };
  }

  if (status === 400) {
    return {
      kind: "business",
      message,
      status,
      requestId: body?.requestId || meta.requestId,
      traceId: body?.traceId || meta.traceId,
      details: body,
    };
  }

  if (status >= 500) {
    return {
      kind: "internal",
      message,
      status,
      requestId: body?.requestId || meta.requestId,
      traceId: body?.traceId || meta.traceId,
      details: body,
    };
  }

  return {
    kind: "unknown",
    message,
    status,
    requestId: body?.requestId || meta.requestId,
    traceId: body?.traceId || meta.traceId,
    details: body,
  };
}

function normalizeNetworkError(error: unknown): ApiErrorModel {
  if (error instanceof DOMException && error.name === "AbortError") {
    return {
      kind: "network",
      message: "Request aborted",
    };
  }

  if (error instanceof Error) {
    return {
      kind: "network",
      message: error.message,
    };
  }

  return {
    kind: "network",
    message: "Network error",
  };
}

async function parseResponseBody(response: Response): Promise<any> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function apiRequest<T>(url: string, options: RequestOptions = {}): Promise<ApiSuccess<T>> {
  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? defaultTimeoutMs;
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  if (options.signal) {
    if (options.signal.aborted) {
      clearTimeout(timeout);
      controller.abort();
    } else {
      options.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  const requestId = createRequestId();
  const startedAt = performance.now();

  try {
    const response = await fetch(url, {
      method: options.method ?? "GET",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-request-id": requestId,
        ...(options.headers ?? {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    const responseMs = Math.round(performance.now() - startedAt);
    const meta: RequestMeta = {
      requestId: response.headers.get("x-request-id") ?? requestId,
      traceId: response.headers.get("x-trace-id") ?? undefined,
      statusCode: response.status,
      responseMs,
    };

    const body = await parseResponseBody(response);

    if (!response.ok) {
      throw normalizeError(response.status, body, meta);
    }

    return {
      data: body as T,
      meta,
    };
  } catch (error) {
    if ((error as ApiErrorModel)?.kind) {
      throw error;
    }
    throw normalizeNetworkError(error);
  } finally {
    clearTimeout(timeout);
  }
}
