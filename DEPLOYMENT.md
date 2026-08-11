# WebUI 部署记录

## 架构

浏览器访问 Node.js 内置 HTTP 服务；服务端创建 `Agent` 运行时并调用配置的 LLM。会话记忆写入实例文件系统，因此免费实例重建后可能丢失；课程演示环境应把这一点视为已知限制，生产环境应挂载持久卷或外接数据库。

```text
Browser → HTTPS / Bearer token → WebUI server → Agent loop
                                         ├→ LLM API
                                         ├→ workspace tools
                                         └→ sql.js memory
```

## Render 部署步骤

1. 将仓库推送到课程要求的公开 GitLab/GitHub 仓库。
2. 在 Render 创建 Blueprint，并选择仓库中的 `render.yaml`。
3. 在平台 Secret 管理界面录入：
   - `ISE_API_KEY`：LLM 供应商 key；
   - `ISE_WEB_ACCESS_TOKEN`：至少 32 字节的随机访问令牌。
4. 等待构建完成，访问 `/health`，应返回 `{ "ok": true }`。
5. 打开首页，输入访问令牌和一个只读演示任务。
6. 将实际公网 URL 填入本文件和 README，并保存最后一次部署成功截图或流水线链接。

## 最终交付记录

- 公网 URL：**待项目所有者部署后填写**
- 部署 commit：**待填写**
- 最后一次健康检查时间：**待填写**
- 最后一次提交前 CI/CD：[GitHub Actions #31476962636](https://github.com/RyanNotRain/ise-harness/actions/runs/31476962636)，三个 job 全部通过
- 评审记录：[PR #1](https://github.com/RyanNotRain/ise-harness/pull/1)

前三项部署信息依赖 Render 账号与真实 Secret，不能以本地结果代替。
