// Errors carry a plain message written for the person reading it, not for a
// developer. The API returns the same message the screen shows.
export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const notFound = (what = "That record") =>
  new AppError(404, "not_found", `${what} was not found, or you do not have access to it.`);
export const forbidden = (message = "Your role does not allow this.") =>
  new AppError(403, "forbidden", message);
export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, "bad_request", message, details);
export const unauthenticated = () =>
  new AppError(401, "unauthenticated", "Please sign in first.");
export const conflict = (message: string) => new AppError(409, "conflict", message);
