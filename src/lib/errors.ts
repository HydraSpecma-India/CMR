/**
 * Application error with a stable code and a user-safe message.
 * Never carries stack traces or secrets to the client.
 */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const Errors = {
  unauthorized: () => new AppError("UNAUTHORIZED", "You must be signed in.", 401),
  forbidden: (what = "perform this action") => new AppError("FORBIDDEN", `You do not have permission to ${what}.`, 403),
  notFound: (what = "Resource") => new AppError("NOT_FOUND", `${what} not found.`, 404),
  validation: (message: string, details?: unknown) => new AppError("VALIDATION", message, 400, details),
  conflict: (message: string) => new AppError("CONFLICT", message, 409),
  notConfigured: (integration: string) =>
    new AppError("NOT_CONFIGURED", `${integration} is not configured. Contact an administrator.`, 503),
  integration: (integration: string, message: string) =>
    new AppError("INTEGRATION", `${integration}: ${message}`, 502),
};

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
