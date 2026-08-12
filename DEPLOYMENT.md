# WebUI 部署与验证记录

## 最终提交采用的架构

最终公网界面使用 GitHub Pages 托管 `web-demo/` 中的静态 MockLLM 演示。它不收集 API key、不连接真实 LLM、不执行 shell，也不把静态页面冒充生产后端。页面用确定性事件轨迹展示三项可独立验证的机制：危险动作治理、测试反馈回灌和跨刷新浏览器演示记忆。

```text
GitHub Pages → static HTML/CSS/JS → deterministic MockLLM event trace
                                      ├→ governance demo
                                      ├→ feedback demo
                                      └→ browser-local demo memory

npm package / local Node WebUI → real Agent loop
                                  ├→ LLM API
                                  ├→ workspace tools
                                  └→ encrypted credentials + sql.js memory
```

这种拆分避免在公共演示页面传输真实凭据，同时仍提供课程要求的可访问 WebUI。完整能力通过公开 npm 包交付。

## GitHub Pages 自动部署

1. [pages.yml](./.github/workflows/pages.yml) 在 `main` 的 `web-demo/**` 或工作流变化时触发。
2. workflow 上传 `web-demo/` 为 Pages artifact。
3. `actions/deploy-pages` 发布到项目 Pages URL。
4. 部署后验证首页标题、三个场景和外部证据链接。

该流程不需要 Secret、银行卡或第三方云平台账号。

## 可选真实后端

仓库保留 [render.yaml](./render.yaml)。若以后需要公网真实 LLM 后端，可以在 Render 或其他 Node 平台部署，并通过平台 Secret 管理设置 `ISE_API_KEY` 与 `ISE_WEB_ACCESS_TOKEN`。免费实例的临时文件系统会导致 sql.js 记忆在重启后丢失，生产环境应挂载持久存储。

## 最终交付记录

- 公网 URL：[https://ryannotrain.github.io/ise-harness/](https://ryannotrain.github.io/ise-harness/)
- 部署 commit：`b7dda6c`
- 最后一次页面检查时间：2026-08-12；仓库恢复公开后重新启用 Pages，部署流水线成功
- Pages 部署流水线：[GitHub Actions #31553339513](https://github.com/RyanNotRain/ise-harness/actions/runs/31553339513)，成功
- npm 发布：[ise-harness@0.1.0](https://www.npmjs.com/package/ise-harness)
- 最终合规审查合并后的 main CI/CD：[GitHub Actions #31554563001](https://github.com/RyanNotRain/ise-harness/actions/runs/31554563001)，三个 job 全部通过
- 主要整改评审：[PR #1](https://github.com/RyanNotRain/ise-harness/pull/1)
- npm 发布评审：[PR #2](https://github.com/RyanNotRain/ise-harness/pull/2)
- Pages 部署评审：[PR #3](https://github.com/RyanNotRain/ise-harness/pull/3)
- 最终证据评审：[PR #4](https://github.com/RyanNotRain/ise-harness/pull/4)
- 合规逐项审查：[PR #5](https://github.com/RyanNotRain/ise-harness/pull/5)

公网 URL、部署流水线和 HTTP 检查均来自实际发布结果，不以本地预览代替。
