/**
 * Provider-neutral contract for structured generation. Adding a vendor means
 * implementing this interface and registering it in `createProvider`.
 */
export interface StructuredRequest {
  system: string;
  user: string;
  /** Name for the structured output (used as the tool name by providers that need one). */
  schemaName: string;
  schemaDescription: string;
  /** JSON Schema for the object the model must return. */
  jsonSchema: Record<string, unknown>;
  maxOutputTokens: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  /** True only for the built-in test provider. */
  readonly mock?: boolean;
  /** Returns the model's JSON object, unvalidated. Throws AiError subclasses on failure. */
  generateStructured(request: StructuredRequest): Promise<unknown>;
}
