export interface Feedback {
  passed: boolean;
  summary: string;
  details: string;
  suggestions: string[];
}

export interface Validator {
  name: string;
  supports?(context: { toolName: string; arguments: Record<string, unknown> }): boolean;
  validate(
    result: { success: boolean; data: unknown; error?: string },
    context?: { toolName: string; arguments: Record<string, unknown> }
  ): Feedback | Promise<Feedback>;
}
