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
- 最后一次 CI/CD URL：**待填写**

上述四项依赖外部仓库和平台账号，本地实现不能代替真实发布证据。
