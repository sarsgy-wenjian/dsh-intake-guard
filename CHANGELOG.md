# Changelog

## 0.2.1 (2026-11-08)

两档接管，降低问答场景摩擦。

- 新增 `Q`（问题上下文）状态：截图/视频/代码/配置等问答材料自动轻登记——不出六行卡、回复末尾一行标记、只软提醒不硬拦、会话结束自动失效。
- 新增 `intake_update` 动作：`升为材料`（Q→X，出卡＋硬拦）、`降为上下文`（X/H→Q，释放硬拦）。
- 分类器：意图（文档词/问题词）→ 内容形状（代码/文档）→ 类型（扩展名）→ 用户纠正；`.md/.txt` 支持 `textDefault`。
- 政策新增 `lightExtensions` / `documentExtensions` / `textDefault`；配置同名可覆盖。
- 测试扩到分类器两档、升级/降级、Q 不拦截等场景。

## 0.2.0 (2026-11-08)

首个公开版。

- **去记忆插件耦合**：记忆写工具改为 `memoryTools` 配置/政策声明，不再硬编码绑死 `memoir_record`；没有记忆插件时插件仍完整可用，`intake_status` 明确报告“记忆拦截未启用”。
- **政策化权威保护**：新增 `.intake/policy.json`（`baselinePaths` / `statePaths` / `exemptPaths`），X/H 材料存在时拦截 `write`/`edit` 对权威路径的写入；政策文件自保护。
- **状态可见**：新增 `intake_status` 工具。
- **双语**：`language: zh | en` 控制六行卡与提示文案；新增 README.en.md。
- 登记表 `.gitignore` 放行 `policy.json`；补测试：自定义记忆工具、政策路径拦截/放行、状态报告、英文卡。

## 0.1.0 (2026-11-08)

内部 MVP（未发布）：材料检测、六行卡、X/H/C/B/Z 五态、`memoir_record` 拦截、登记表。
