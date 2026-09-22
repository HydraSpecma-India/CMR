"use client";

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public issues?: { path: string; message: string }[]) {
    super(message);
  }
}

/** Client-side JSON fetch helper that unwraps the API error envelope. */
export async function api<T = unknown>(input: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(input, {
    ...rest,
    headers: { ...(json !== undefined ? { "Content-Type": "application/json" } : {}), ...(rest.headers ?? {}) },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = data?.error ?? {};
    throw new ApiError(err.code ?? "ERROR", err.message ?? res.statusText, res.status, err.issues);
  }
  return data as T;
}
