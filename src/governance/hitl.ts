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
  confirm?: (request: HITLRequest) => Promise<boolean>;
}

export class HITLHandler {
  private options: HITLOptions;

  constructor(options: HITLOptions) {
    this.options = options;
  }

  async requestConfirmation(request: HITLRequest): Promise<HITLResponse> {
    if (this.options.confirm) {
      const approved = await this.withTimeout(this.options.confirm(request));
      return approved;
    }

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = new Promise<boolean>((resolve) => {
      const severityLabel = request.severity === 'block' ? '阻断' : '警告';
      console.log(`[HITL] ${severityLabel} | 动作: ${request.action}`);
      console.log(`  原因: ${request.reason}`);
      rl.question('确认执行？输入 yes 批准，其他内容拒绝: ', (value) => {
        resolve(['yes', 'y'].includes(value.trim().toLowerCase()));
      });
    });
    const result = await this.withTimeout(answer);
    rl.close();
    return result;
  }

  private async withTimeout(confirmation: Promise<boolean>): Promise<HITLResponse> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        resolve({ approved: !this.options.defaultDeny, timeout: true });
      }, this.options.timeout * 1000);
      confirmation.then((approved) => {
        clearTimeout(timer);
        resolve({ approved, timeout: false });
      }).catch(() => {
        clearTimeout(timer);
        resolve({ approved: !this.options.defaultDeny, timeout: false });
      });
    });
  }
}
import * as readline from 'node:readline';
