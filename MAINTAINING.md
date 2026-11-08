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

- 首次：Gitee 网页「新建仓库 → 导入已有仓库」，填 GitHub 地址（零令牌权限，最快）；
- 更新：若令牌有写权限，可用 Gitee Contents API 推送改动的文件；否则重新导入 / 手动上传；
- 在 README 标注「镜像可能滞后，以 GitHub 为准」。

## 联系方式

- Issues：https://github.com/sarsgy-wenjian/dsh-intake-guard/issues
- 邮箱：sarsgy01@outlook.com
