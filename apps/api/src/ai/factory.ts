import type { AiConfig } from '../config';
import { AnthropicProvider } from './anthropic';
import { MockProvider } from './mockProvider';
import type { LlmProvider } from './provider';

/**
 * Chooses the provider from configuration. Returns null when none is configured,
 * which keeps all non-AI features working. Register new vendors here.
 */
export function createProvider(config: AiConfig, production: boolean): LlmProvider | null {
  switch (config.provider) {
    case 'anthropic':
      if (!config.apiKey) return null;
      return new AnthropicProvider({
        apiKey: config.apiKey,
        model: config.model,
        baseUrl: config.baseUrl,
        timeoutMs: config.timeoutMs,
      });
    case 'mock':
      if (production) throw new Error('AI_PROVIDER=mock is not allowed when NODE_ENV=production');
      return new MockProvider();
    case 'none':
      return null;
    default:
      throw new Error(
        `Unknown AI_PROVIDER "${config.provider}". Use "anthropic" or leave it unset.`,
      );
  }
}
