# 维护指南 / Maintaining

给后续维护者（包括 AI 代理）用的操作清单。

## 仓库

| 位置 | 角色 |
|---|---|
| https://github.com/sarsgy-wenjian/dsh-intake-guard | **主仓库（canonical）** |
| https://gitee.com/the-color-of-the-night-sky/dsh-intake-guard | 国内镜像（可能滞后，以 GitHub 为准） |
| https://github.com/sarsgy-wenjian/dsh-wenjian-team | 团队包，本插件是其可选配套 |

## 版本策略

- 语义化版本：行为变更/新状态 → minor（0.2.x）；仅文档 → 不升版本；修复 → patch。
- 每次发版更新 `CHANGELOG.md` 与 `package.json` 的 `version`。

## 发版清单

1. 改 `lib/index.js` / `README*.md` / `CHANGELOG.md` / `package.json`；
2. 检查：

   ```bash
   node --check lib/index.js
   node test/smoke.mjs
   ```

3. 用 GitHub API 推送（Git Data API：blobs → tree → commit → 更新 ref），不要手改远程；
4. 建 release（tag `vX.Y.Z`），附上变更摘要；
5. 逐文件比对远端 `size` 与本地（13 个运行文件 + 文档）；
6. 同步 Gitee 镜像；
7. 更新项目续接清单/检查点与项目记忆。

## 令牌（不要外泄）

- GitHub：`GITHUB_PAT`，classic，scopes `repo, workflow`（当前到期 2027-11-07）；
- Gitee：`GITEE_PAT`（当前**不能创建仓库**；如需脚本化镜像，需要带 `projects` 写权限的令牌）；
- 铁律：**令牌不得作为命令参数/函数参数**，不得打印、不得哈希打印；只从环境变量或文件读取，用完即弃；
- 泄漏后立即在网页撤销并重建。

## Gitee 镜像

- 已建立：https://gitee.com/the-color-of-the-night-sky/dsh-intake-guard （2026-11-08 从 GitHub 导入，默认分支 `main`；18 个文件 size 与 GitHub 一致）
- `GITEE_PAT` 已升级为**账号级令牌**（2026-11-08，具备 `projects` 读写），可用 Gitee Contents API 推送更新：`PUT /repos/{owner}/{repo}/contents/{path}`，带当前 `sha` 与 base64 `content`。
- 若未来换回仓库级令牌：无法写镜像，改用 Gitee 网页「重新导入」或手动上传改动文件。
- README 已标注「镜像可能滞后，以 GitHub 为准」；可用匿名 Contents API 逐文件比对 `size` 做校验。

## 联系方式

- Issues：https://github.com/sarsgy-wenjian/dsh-intake-guard/issues
- 邮箱：sarsgy01@outlook.com
