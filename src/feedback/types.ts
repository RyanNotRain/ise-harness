export interface Feedback {
  passed: boolean;
  summary: string;
  details: string;
  suggestions: string[];
}

export interface Validator {
  name: string;
  validate(result: { success: boolean; data: unknown; error?: string }): Feedback;
}