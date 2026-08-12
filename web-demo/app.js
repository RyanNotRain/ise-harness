const STORAGE_KEY = 'ise-harness-demo-memory-v1';

const scenarioInput = document.querySelector('#scenario');
const promptInput = document.querySelector('#prompt');
const runButton = document.querySelector('#run');
const clearButton = document.querySelector('#clear');
const statusNode = document.querySelector('#status');
const eventsNode = document.querySelector('#events');

const prompts = {
  guardrail: '清理项目，但不要越过安全边界。',
  feedback: '运行测试并根据失败结果修复实现。',
  memory: '记住：这个项目把记忆与上下文管理作为重点维度。',
};

scenarioInput.addEventListener('change', () => {
  promptInput.value = prompts[scenarioInput.value];
});

runButton.addEventListener('click', async () => {
  runButton.disabled = true;
  statusNode.textContent = '运行中';
  statusNode.className = 'status status--running';
  eventsNode.replaceChildren();

  const events = createEvents(scenarioInput.value, promptInput.value.trim());
  for (const event of events) {
    await delay(140);
    eventsNode.append(createEventNode(event));
  }

  statusNode.textContent = '确定性完成';
  statusNode.className = 'status status--done';
  runButton.disabled = false;
});

clearButton.addEventListener('click', () => {
  localStorage.removeItem(STORAGE_KEY);
  statusNode.textContent = '记忆已清除';
  statusNode.className = 'status status--idle';
});

function createEvents(scenario, prompt) {
  if (scenario === 'feedback') {
    return [
      event('context', '构建上下文', `接收任务：“${prompt || prompts.feedback}”`),
      event('mock_llm', 'MockLLM 决策', '选择工具：bash → npm test'),
      event('tool', '确定性工具结果', '1 个测试失败：expected 2, received 1'),
      event('validator', '反馈解析', 'TestResultValidator 提取失败数和断言摘要'),
      event('feedback', '回灌下一轮', 'assistant 上下文新增结构化 test_failure 消息'),
      event('mock_llm', 'MockLLM 第二轮', '根据失败详情选择最小修复'),
      event('halt', '验证停机', '复测通过；停止原因：objective_completed'),
    ];
  }

  if (scenario === 'memory') {
    const memory = readMemory();
    const value = prompt || prompts.memory;
    memory.push({ value, savedAt: new Date().toLocaleString('zh-CN') });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(memory.slice(-5)));
    const previous = memory.slice(0, -1).at(-1);
    return [
      event('memory_load', '读取浏览器演示记忆', previous ? `检索到上一条：${previous.value}` : '当前没有旧记录'),
      event('context', '构建上下文', '把检索结果加入 MockLLM 输入；生产版使用 sql.js'),
      event('mock_llm', 'MockLLM 决策', `确认并保存：“${value}”`),
      event('memory_write', '持久化', '已写入 localStorage；刷新页面后可再次检索'),
      event('halt', '正常停机', `当前保留 ${Math.min(memory.length, 5)} 条浏览器演示记忆`),
    ];
  }

  return [
    event('context', '构建上下文', `接收任务：“${prompt || prompts.guardrail}”`),
    event('mock_llm', 'MockLLM 决策', '请求工具：bash → rm -rf /'),
    event('guardrail', '危险命令护栏', '命中递归删除与系统根目录规则', true),
    event('hitl', 'Web 模式策略', '无交互批准通道，默认拒绝危险动作', true),
    event('tool_result', '结果回灌', '工具没有执行；返回 governance_denied'),
    event('halt', '安全停机', '停止原因：guardrail_blocked'),
  ];
}

function readMemory() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function event(kind, title, detail, blocked = false) {
  return { kind, title, detail, blocked };
}

function createEventNode(item) {
  const node = document.createElement('li');
  node.className = `event${item.blocked ? ' event--blocked' : ''}`;

  const kind = document.createElement('strong');
  kind.textContent = item.kind;
  const content = document.createElement('div');
  const title = document.createElement('b');
  title.textContent = item.title;
  const detail = document.createElement('div');
  detail.textContent = item.detail;
  content.append(title, detail);
  node.append(kind, content);
  return node;
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
