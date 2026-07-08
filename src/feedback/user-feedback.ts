import * as readline from 'node:readline';
import type { Validator, Feedback } from './types.js';

export class UserFeedbackValidator implements Validator {
  name = 'user_feedback';

  async validate(result: { success: boolean; data: unknown; error?: string }): Promise<Feedback> {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question('操作结果是否正确？(yes/no/备注): ', (answer) => {
        rl.close();
        const a = answer.trim().toLowerCase();
        if (a === 'yes' || a === 'y') {
          resolve({
            passed: true,
            summary: '用户确认通过',
            details: '',
            suggestions: [],
          });
        } else {
          resolve({
            passed: false,
            summary: '用户报告问题',
            details: answer,
            suggestions: ['检查操作并重试'],
          });
        }
      });
    });
  }
}