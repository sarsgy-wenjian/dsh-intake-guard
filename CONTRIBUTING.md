# 贡献指南 / Contributing

欢迎反馈、提意见、分享改进。中文或英文都可以。

## 反馈

- **Issue（推荐）**：https://github.com/sarsgy-wenjian/dsh-intake-guard/issues
  - 用仓库自带的「问题反馈 / Bug report」或「建议 / Feedback」模板；
  - 请勿贴稿件正文、密钥或隐私；给最小复现即可。
- **邮件**：sarsgy01@outlook.com（GitHub 不便时）。

## 提交改进（PR）

1. Fork 本仓库，新建分支；
2. 改代码或文档；
3. 跑检查：

   ```bash
   node --check lib/index.js
   node test/smoke.mjs
   ```

4. 提交 PR，说明：改了什么、为什么、怎么验证的（贴测试结果更好）。

## 代码约束

- 零运行时依赖，只用 Node 内置模块；
- 不联网、不收集数据、不读取材料正文之外的目录；
- 分类器/政策默认值保持通用，不要把某个项目的专属路径写进默认值；
- 不修改 `dsh-wenjian-team` 等团队包。

## 分享调好的版本

不熟悉 git 也可以：把改动的文件（或 diff）发到 Issue 或邮箱，注明：
- 基于哪个版本（如 v0.2.1）；
- 改了什么、解决什么问题；
- 怎么验证的。

MIT License，欢迎自由修改与再分发。
