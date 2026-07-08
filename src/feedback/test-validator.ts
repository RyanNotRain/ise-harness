import type { Validator, Feedback } from './types.js';

export class TestResultValidator implements Validator {
  name = 'test_result';

  validate(result: { success: boolean; data: unknown; error?: string }): Feedback {
    const stdout = (result.data as { stdout?: string })?.stdout || '';
    const stderr = (result.data as { stderr?: string })?.stderr || '';

    if (result.success && !stderr.includes('FAIL') && !stdout.includes('FAIL')) {
      const match = stdout.match(/(\d+)\s+tests?/);
      return {
        passed: true,
        summary: match ? `${match[1]} 个测试通过` : '无测试输出',
        details: stdout,
        suggestions: [],
      };
    }

    const failMatch = stderr.match(/FAIL\s+(.+?)\n(.+?)(?:\n|$)/);
    return {
      passed: false,
      summary: '测试失败',
      details: failMatch
        ? `${failMatch[1]}: ${failMatch[2]}`
        : stderr || result.error || '未知失败',
      suggestions: ['检查失败的测试并修复实现', '修复后重新运行测试'],
    };
  }
}