import "server-only";

type Level = "debug" | "info" | "warn" | "error";
const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const threshold = (): number => order[(process.env.LOG_LEVEL as Level) || "info"] ?? 20;

/** Structured JSON logger – one line per event, safe for Vercel log drains. */
function emit(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  if (order[level] < threshold()) return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...redact(fields) });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

const SECRET_KEYS = /secret|password|token|authorization|apikey|api_key/i;
function redact(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = SECRET_KEYS.test(k) ? "[redacted]" : v;
  }
  return out;
}

export interface Logger {
  debug: (msg: string, f?: Record<string, unknown>) => void;
  info: (msg: string, f?: Record<string, unknown>) => void;
  warn: (msg: string, f?: Record<string, unknown>) => void;
  error: (msg: string, f?: Record<string, unknown>) => void;
}

export const logger = {
  debug: (msg: string, f?: Record<string, unknown>) => emit("debug", msg, f),
  info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, f),
  warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, f),
  error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, f),
  /** child logger carrying context (requestId, cmrId, …) */
  child: (ctx: Record<string, unknown>): Logger => ({
    debug: (msg: string, f?: Record<string, unknown>) => emit("debug", msg, { ...ctx, ...f }),
    info: (msg: string, f?: Record<string, unknown>) => emit("info", msg, { ...ctx, ...f }),
    warn: (msg: string, f?: Record<string, unknown>) => emit("warn", msg, { ...ctx, ...f }),
    error: (msg: string, f?: Record<string, unknown>) => emit("error", msg, { ...ctx, ...f }),
  }),
};
