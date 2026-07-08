export interface HITLRequest {
  action: string;
  reason: string;
  severity: 'info' | 'warn' | 'block';
}

export interface HITLResponse {
  approved: boolean;
  timeout: boolean;
}

export interface HITLOptions {
  timeout: number;
  defaultDeny: boolean;
}

export class HITLHandler {
  private options: HITLOptions;

  constructor(options: HITLOptions) {
    this.options = options;
  }

  async requestConfirmation(request: HITLRequest): Promise<HITLResponse> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ approved: false, timeout: true });
      }, this.options.timeout * 1000);

      const severityLabel = request.severity === 'block' ? '阻断' : '警告';
      console.log(`[HITL] ${severityLabel} | 动作: ${request.action}`);
      console.log(`  原因: ${request.reason}`);
      console.log(`  ${this.options.defaultDeny ? '默认拒绝' : '默认允许'}，超时: ${this.options.timeout}秒`);
      console.log('  等待用户确认...');
    });
  }
}