/**
 * Typed fetch wrapper for the EzboAI backend.
 * Includes credentials so admin-session cookies are sent automatically.
 */

const BASE_URL =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "/api";

export class ApiError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public body: unknown,
  ) {
    super(`API ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

type RequestOptions = Omit<RequestInit, "body"> & {
  body?: unknown;
  searchParams?: Record<string, string | number | boolean | undefined>;
};

function buildUrl(path: string, searchParams?: RequestOptions["searchParams"]): string {
  const base = BASE_URL.replace(/\/$/, "");
  const cleaned = path.startsWith("http") ? path : `${base}/${path.replace(/^\//, "")}`;
  if (!searchParams) return cleaned;
  const url = new URL(
    cleaned,
    typeof window !== "undefined" ? window.location.origin : "http://localhost",
  );
  for (const [key, value] of Object.entries(searchParams)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, searchParams, headers, ...rest } = options;
  const url = buildUrl(path, searchParams);

  const init: RequestInit = {
    credentials: "include",
    ...rest,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...headers,
    },
  };
  if (body !== undefined) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }

  const response = await fetch(url, init);

  let payload: unknown = undefined;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    payload = await response.json().catch(() => undefined);
  } else if (response.status !== 204) {
    payload = await response.text().catch(() => undefined);
  }

  if (!response.ok) {
    throw new ApiError(response.status, response.statusText, payload);
  }
  return payload as T;
}

export const apiClient = {
  get: <T>(path: string, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "PUT", body }),
  patch: <T>(path: string, body?: unknown, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "PATCH", body }),
  delete: <T>(path: string, options?: Omit<RequestOptions, "body" | "method">) =>
    request<T>(path, { ...options, method: "DELETE" }),
};

export function streamUrl(path: string): string {
  return buildUrl(path);
}

export type { RequestOptions };
