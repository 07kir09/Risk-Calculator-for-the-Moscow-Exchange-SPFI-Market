import axios, { AxiosError } from "axios";

export class ApiError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
  traceId?: string;
  requestId?: string;

  constructor(params: { message: string; status?: number; code?: string; details?: unknown; traceId?: string; requestId?: string }) {
    super(params.message);
    this.name = "ApiError";
    this.status = params.status;
    this.code = params.code;
    this.details = params.details;
    this.traceId = params.traceId;
    this.requestId = params.requestId;
  }
}

function genRequestId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `req_${Math.random().toString(16).slice(2)}_${Date.now()}`;
  }
}

const viteEnv = ((import.meta as any).env ?? {}) as Record<string, any>;
const baseURL = viteEnv.VITE_API_BASE_URL ?? "/api";

const client = axios.create({
  baseURL,
  timeout: 15000,
});

client.interceptors.request.use((cfg) => {
  const requestId = genRequestId();
  cfg.headers = cfg.headers ?? {};
  (cfg.headers as any)["x-request-id"] = requestId;
  (cfg as any).__requestId = requestId;
  return cfg;
});

client.interceptors.response.use(
  (resp) => resp,
  (error: AxiosError) => {
    const status = error.response?.status;
    const requestId = (error.config as any)?.__requestId as string | undefined;

    const traceIdHeader = (error.response?.headers as any)?.["x-trace-id"];
    const requestIdHeader = (error.response?.headers as any)?.["x-request-id"];
    const traceId = (traceIdHeader || requestIdHeader || (error.response?.data as any)?.traceId || (error.response?.data as any)?.requestId) as
      | string
      | undefined;

    const code = (error.response?.data as any)?.code as string | undefined;
    const details = (error.response?.data as any)?.details ?? error.response?.data;

    const messageBase =
      (error.response?.data as any)?.message ||
      (error.response?.data as any)?.error ||
      error.message ||
      "Ошибка API";

    const suffixParts = [
      traceId ? `traceId=${traceId}` : null,
      requestId ? `requestId=${requestId}` : null,
      status ? `status=${status}` : null,
    ].filter(Boolean);

    const message = suffixParts.length ? `${messageBase} (${suffixParts.join(", ")})` : messageBase;

    // eslint-disable-next-line no-console
    console.error("API error", { messageBase, status, code, traceId, requestId, details });

    throw new ApiError({ message, status, code, details, traceId, requestId });
  }
);

export default client;
