import { describe, it, expect } from 'vitest';
import { TestResultValidator } from '../../../src/feedback/test-validator.js';

describe('TestResultValidator', () => {
  const validator = new TestResultValidator();

  it('应检测测试通过', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '✓ 3 tests passed', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('3 个测试通过');
  });

  it('应检测测试失败', () => {
    const feedback = validator.validate({
      success: false,
      data: {
        stdout: '',
        stderr: 'FAIL tests/unit/test.test.ts > test fails\nAssertionError: expected 1 to be 2',
      },
      error: '命令执行失败',
    });
    expect(feedback.passed).toBe(false);
    expect(feedback.details).toContain('AssertionError');
  });

  it('无测试输出时应正常处理', () => {
    const feedback = validator.validate({
      success: true,
      data: { stdout: '', stderr: '' },
    });
    expect(feedback.passed).toBe(true);
    expect(feedback.summary).toContain('无测试输出');
  });
});