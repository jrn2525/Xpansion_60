export class ValidationError extends Error {
  public statusCode = 400;
  public code = "VALIDATION_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export function parseIntOrThrow(value: string | undefined, paramName: string): number {
  const parsed = parseInt(value as string, 10);
  if (isNaN(parsed)) {
    throw new ValidationError(`Invalid ${paramName}: must be a valid integer`);
  }
  return parsed;
}
