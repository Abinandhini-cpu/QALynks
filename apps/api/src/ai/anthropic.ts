import {
  AiInvalidResponseError,
  AiProviderError,
  AiRateLimitedError,
  AiTimeoutError,
} from './errors';
import type { LlmProvider, StructuredRequest } from './provider';

export interface AnthropicOptions {
  apiKey: string;
  model: string;
  baseUrl: string;
  timeoutMs: number;
  fetchImpl?: typeof fetch;
}

interface MessagesResponse {
  stop_reason?: string;
  content?: { type: string; input?: unknown }[];
}

/** Anthropic Messages API. Structured output uses a forced tool call. */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;

  constructor(private readonly options: AnthropicOptions) {
    this.model = options.model;
  }

  async generateStructured(request: StructuredRequest): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    let response: Response;
    try {
      response = await fetchImpl(`${this.options.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.options.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.options.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: 'user', content: request.user }],
          tools: [
            {
              name: request.schemaName,
              description: request.schemaDescription,
              input_schema: request.jsonSchema,
            },
          ],
          tool_choice: { type: 'tool', name: request.schemaName },
        }),
        signal: AbortSignal.timeout(this.options.timeoutMs),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new AiTimeoutError(`No response within ${this.options.timeoutMs} ms`);
      }
      throw new AiProviderError(
        'Could not reach the AI provider. Check the network connection and try again.',
        err instanceof Error ? err.message : 'network error',
      );
    }

    if (!response.ok) throw this.errorFor(response);

    let body: MessagesResponse;
    try {
      body = (await response.json()) as MessagesResponse;
    } catch {
      throw new AiInvalidResponseError('Provider response was not valid JSON');
    }
    if (body.stop_reason === 'max_tokens') {
      throw new AiInvalidResponseError('Output was cut off at the token limit');
    }
    const toolUse = body.content?.find((block) => block.type === 'tool_use');
    if (!toolUse || typeof toolUse.input !== 'object' || toolUse.input === null) {
      throw new AiInvalidResponseError('Provider response had no structured output');
    }
    return toolUse.input;
  }

  private errorFor(response: Response): Error {
    const status = response.status;
    if (status === 429) {
      const retry = Number(response.headers.get('retry-after'));
      return new AiRateLimitedError(
        Number.isFinite(retry) && retry > 0 ? Math.ceil(retry) : 30,
        'Provider returned 429',
      );
    }
    if (status === 401 || status === 403) {
      return new AiProviderError(
        'The AI provider rejected the configured credentials. Check ANTHROPIC_API_KEY.',
        `Provider returned ${status}`,
      );
    }
    if (status === 400 || status === 404 || status === 413) {
      return new AiProviderError(
        'The AI provider rejected the request. Check AI_MODEL and shorten the requirement.',
        `Provider returned ${status}`,
      );
    }
    return new AiProviderError(
      'The AI provider is unavailable. Try again shortly.',
      `Provider returned ${status}`,
    );
  }
}
