import { describe, expect, it, vi } from 'vitest';
import { AnthropicProvider } from '../src/ai/anthropic';
import type { AiError } from '../src/ai/errors';
import { createProvider } from '../src/ai/factory';
import { MockProvider } from '../src/ai/mockProvider';
import { RateLimiter } from '../src/ai/rateLimiter';
import { loadConfig } from '../src/config';

const KEY = 'sk-test-key-123';
const request = {
  system: 'sys',
  user: 'usr',
  schemaName: 'submit',
  schemaDescription: 'desc',
  jsonSchema: { type: 'object' },
  maxOutputTokens: 100,
};

const provider = (fetchImpl: typeof fetch) =>
  new AnthropicProvider({
    apiKey: KEY,
    model: 'test-model',
    baseUrl: 'https://api.example.test',
    timeoutMs: 5000,
    fetchImpl,
  });

const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  vi
    .fn()
    .mockResolvedValue(
      new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers }),
    ) as unknown as typeof fetch;

const failure = async (p: AnthropicProvider) =>
  p.generateStructured(request).then(
    () => {
      throw new Error('expected failure');
    },
    (e: unknown) => e as AiError,
  );

describe('AnthropicProvider', () => {
  it('sends a forced tool call and returns the structured input', async () => {
    const fetchImpl = respond(200, {
      stop_reason: 'tool_use',
      content: [
        { type: 'text', text: 'hi' },
        { type: 'tool_use', input: { ok: true } },
      ],
    });
    await expect(provider(fetchImpl).generateStructured(request)).resolves.toEqual({ ok: true });

    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]!;
    expect(url).toBe('https://api.example.test/v1/messages');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers['x-api-key']).toBe(KEY);
    expect(headers['anthropic-version']).toBe('2023-06-01');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      model: 'test-model',
      max_tokens: 100,
      system: 'sys',
      messages: [{ role: 'user', content: 'usr' }],
      tools: [{ name: 'submit', input_schema: { type: 'object' } }],
      tool_choice: { type: 'tool', name: 'submit' },
    });
  });

  it('maps 429 to a rate-limit error using Retry-After', async () => {
    const err = await failure(provider(respond(429, {}, { 'retry-after': '12' })));
    expect(err).toMatchObject({ statusCode: 429, code: 'AI_RATE_LIMITED', retryAfterSeconds: 12 });
  });

  it('uses a default wait when Retry-After is missing', async () => {
    expect(await failure(provider(respond(429, {})))).toMatchObject({ retryAfterSeconds: 30 });
  });

  it('maps rejected credentials without leaking the key', async () => {
    for (const status of [401, 403]) {
      const err = await failure(provider(respond(status, { error: { message: KEY } })));
      expect(err).toMatchObject({ statusCode: 502, code: 'AI_PROVIDER_ERROR' });
      expect(err.message).toContain('credentials');
      expect(err.message).not.toContain(KEY);
    }
  });

  it('maps bad requests and server errors', async () => {
    expect((await failure(provider(respond(400, {})))).message).toContain('rejected the request');
    expect((await failure(provider(respond(500, {})))).message).toContain('unavailable');
    expect((await failure(provider(respond(529, {})))).message).toContain('unavailable');
  });

  it('maps timeouts', async () => {
    const timeout = Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    const err = await failure(
      provider(vi.fn().mockRejectedValue(timeout) as unknown as typeof fetch),
    );
    expect(err).toMatchObject({ statusCode: 504, code: 'AI_TIMEOUT' });
  });

  it('maps network failures without exposing the cause', async () => {
    const err = await failure(
      provider(vi.fn().mockRejectedValue(new TypeError('ECONNRESET')) as unknown as typeof fetch),
    );
    expect(err).toMatchObject({ statusCode: 502, code: 'AI_PROVIDER_ERROR' });
    expect(err.message).not.toContain('ECONNRESET');
    expect(err.detail).toBe('ECONNRESET');
  });

  it('rejects malformed provider output', async () => {
    const cases: unknown[] = [
      'not json',
      { content: [] },
      { content: [{ type: 'text', text: 'no tool' }] },
      { content: [{ type: 'tool_use', input: 'string' }] },
      { stop_reason: 'max_tokens', content: [{ type: 'tool_use', input: {} }] },
    ];
    for (const body of cases) {
      const err = await failure(provider(respond(200, body as never)));
      expect(err.code).toBe('AI_INVALID_RESPONSE');
    }
  });
});

describe('createProvider', () => {
  const config = (env: Record<string, string>) => loadConfig(env).ai;

  it('is disabled by default so manual features need no key', () => {
    expect(createProvider(config({}), false)).toBeNull();
    expect(config({}).provider).toBe('none');
  });

  it('creates the Anthropic provider when a key is set', () => {
    const p = createProvider(config({ ANTHROPIC_API_KEY: KEY, AI_MODEL: 'm1' }), false);
    expect(p).toMatchObject({ name: 'anthropic', model: 'm1' });
  });

  it('defaults the model, timeout and base URL, and trims a trailing slash', () => {
    const c = config({ ANTHROPIC_API_KEY: KEY, ANTHROPIC_BASE_URL: 'https://proxy.test/' });
    expect(c).toMatchObject({
      model: 'claude-sonnet-5-5',
      timeoutMs: 120000,
      maxRequestsPerMinute: 10,
      baseUrl: 'https://proxy.test',
    });
  });

  it('returns null for anthropic without a key', () => {
    expect(createProvider(config({ AI_PROVIDER: 'anthropic' }), false)).toBeNull();
  });

  it('allows the mock provider outside production only', () => {
    const c = config({ AI_PROVIDER: 'mock' });
    expect(createProvider(c, false)).toBeInstanceOf(MockProvider);
    expect(() => createProvider(c, true)).toThrow(/not allowed/);
  });

  it('rejects unknown providers', () => {
    expect(() => createProvider(config({ AI_PROVIDER: 'nope' }), false)).toThrow(
      /Unknown AI_PROVIDER/,
    );
  });
});

describe('MockProvider', () => {
  it('returns canned output and is labelled as a mock', async () => {
    const mock = new MockProvider();
    expect(mock.mock).toBe(true);
    const out = await mock.generateStructured();
    expect(out.testCases.length).toBeGreaterThan(0);
  });
});

describe('RateLimiter', () => {
  it('allows a burst up to the limit, then reports the wait, then recovers', () => {
    let now = 0;
    const limiter = new RateLimiter(2, 60_000, () => now);
    expect(limiter.take()).toBe(0);
    now = 1000;
    expect(limiter.take()).toBe(0);
    now = 2000;
    expect(limiter.take()).toBe(58);
    now = 60_000;
    expect(limiter.take()).toBe(0);
  });
});
