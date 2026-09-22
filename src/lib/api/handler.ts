import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { isAppError } from "@/lib/errors";
import { logger, type Logger } from "@/lib/logging/logger";
import { randomUUID } from "node:crypto";

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: { params: P; requestId: string }) => Promise<Response>;

/**
 * Wraps a route handler with: request id, structured logging, and error → JSON
 * mapping. Stack traces and secrets never reach the client.
 */
export function route<P = Record<string, string>>(handler: Handler<P>) {
  return async (req: NextRequest, ctx: Ctx<P>): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    const log = logger.child({ requestId, method: req.method, path: req.nextUrl.pathname });
    try {
      const params = await ctx.params;
      const res = await handler(req, { params, requestId });
      log.debug("request completed", { status: res.status, durationMs: Date.now() - started });
      return res;
    } catch (err) {
      return errorResponse(err, requestId, log);
    }
  };
}

export function errorResponse(err: unknown, requestId: string, log: Logger = logger) {
  if (isAppError(err)) {
    if (err.status >= 500) log.error(err.message, { code: err.code });
    else log.warn(err.message, { code: err.code });
    return NextResponse.json({ error: { code: err.code, message: err.message, details: err.details ?? undefined, requestId } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    log.warn("validation failed", { issues: err.issues.length });
    const issueSummary = err.issues.map((i) => `${i.path.join(".") || "field"}: ${i.message}`).join(", ");
    return NextResponse.json(
      {
        error: {
          code: "VALIDATION",
          message: `The request contains invalid data: ${issueSummary}`,
          issues: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          requestId,
        },
      },
      { status: 400 },
    );
  }
  const e = err as Error & { code?: string; details?: string };
  log.error("unhandled error", { error: e?.message, code: e?.code, stack: e?.stack });

  // Postgres immutability trigger → user friendly
  if (e?.code === "P0001") {
    return NextResponse.json({ error: { code: "IMMUTABLE", message: e.message, requestId } }, { status: 409 });
  }

  // Postgres unique constraint violation
  if (e?.code === "23505") {
    let userMessage = "A duplicate record already exists with these details.";
    if (e.message?.includes("cmr_documents_packing_slip_uq")) {
      userMessage =
        "A CMR has already been issued for this packing slip. Cancel the existing CMR first if it must be re-issued.";
    }
    return NextResponse.json({ error: { code: "CONFLICT", message: userMessage, requestId } }, { status: 409 });
  }

  const message =
    e?.message?.includes("not configured")
      ? e.message
      : e?.message && !e.message.includes("violates") && !e.message.includes("syntax error") && !e.message.includes("relation")
      ? e.message
      : "Something went wrong. Please try again or contact an administrator.";
  return NextResponse.json({ error: { code: "INTERNAL", message, requestId } }, { status: 500 });
}

export const json = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);

