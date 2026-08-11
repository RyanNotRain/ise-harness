export interface GuardrailCheck {
  command?: string;
  filePath?: string;
  action: string;
  toolName?: string;
}

export interface GuardrailResult {
  allowed: boolean;
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

export interface Guardrail {
  name: string;
  check(action: GuardrailCheck): GuardrailResult | Promise<GuardrailResult>;
}
