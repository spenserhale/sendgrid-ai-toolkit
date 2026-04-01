export class SendgridError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode?: number
  ) {
    super(message);
    this.name = "SendgridError";
  }
}

export class SendgridAuthError extends SendgridError {
  constructor(message = "Authentication failed. Check your API key.") {
    super(message, "AUTH_ERROR", 401);
    this.name = "SendgridAuthError";
  }
}

export class SendgridNotFoundError extends SendgridError {
  constructor(resource: string, id: string) {
    super(`${resource} with id "${id}" not found`, "NOT_FOUND", 404);
    this.name = "SendgridNotFoundError";
  }
}
