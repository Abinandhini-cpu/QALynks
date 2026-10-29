import { AppError } from '../errors';

/** Base for AI failures. `detail` is for server logs only and never sent to clients. */
export class AiError extends AppError {
  constructor(
    statusCode: number,
    code: string,
    message: string,
    readonly detail?: string,
    readonly retryAfterSeconds?: number,
  ) {
    super(statusCode, code, message);
  }
}

export class AiNotConfiguredError extends AiError {
  constructor() {
    super(
      503,
      'AI_NOT_CONFIGURED',
      'AI generation is not configured. Set ANTHROPIC_API_KEY on the server and restart it.',
    );
  }
}

export class AiRateLimitedError extends AiError {
  constructor(retryAfterSeconds: number, detail?: string) {
    super(
      429,
      'AI_RATE_LIMITED',
      `Too many generation requests. Try again in ${retryAfterSeconds} seconds.`,
      detail,
      retryAfterSeconds,
    );
  }
}

export class AiTimeoutError extends AiError {
  constructor(detail?: string) {
    super(
      504,
      'AI_TIMEOUT',
      'The AI provider took too long to respond. Try again, or shorten the requirement.',
      detail,
    );
  }
}

export class AiProviderError extends AiError {
  constructor(message: string, detail?: string) {
    super(502, 'AI_PROVIDER_ERROR', message, detail);
  }
}

export class AiInvalidResponseError extends AiError {
  constructor(detail: string) {
    super(
      502,
      'AI_INVALID_RESPONSE',
      'The AI returned a response that could not be used. Nothing was saved. Try again.',
      detail,
    );
  }
}
