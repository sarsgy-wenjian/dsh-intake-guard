# dsh-intake-guard · 材料接管闸门

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的材料入口闸门：用户新递进来的东西默认是「外部材料·非基准」，按两档处理——
> **文档（X）**出六行接管卡并硬拦截；**上下文（Q）**（截图/视频/代码/配置等问答材料）只留一行标记、软提醒，不打扰。
>
> 只读、纯本地、不联网、不修改任何基准文件。

## 它解决什么问题

“发份稿子说一句『先看一下』→ 模型读完直接当依据 → 讨论跑偏、基准被污染 → 很久才发现。”起点不是记忆检索，而是**材料进门时没有身份**。

同时，问答场景里发一张截图、一段代码就问一句，每次都弹六行卡又太吵——所以分两档。

## 两档接管

| 档 | 典型材料 | 用户可见 | 拦截 |
|---|---|---|---|
| **X 文档** | 大纲、设定、外稿、长文、PDF/DOCX、路径/链接 | **六行接管卡** | 记忆写入 + 权威路径写入（硬拦） |
| **Q 上下文** | 截图、视频、代码/配置（.json/.js/.py 等） | **一行标记** | 只软提醒，不硬拦；会话结束自动失效 |

### 六行卡（X）

```
【材料接管卡 M-01】
① 材料：《示例大纲》v0.1（大纲）
② 身份：外部材料·非基准 · 状态 X · 2026-11-08【默认】
③ 来源：用户上传 · 2026-11-08 · <路径/无路径>
④ 用途：只读理解（不改基准）【默认】
⑤ 我不会做：不并入基准、不写入项目记忆、不作为依据引用
⑥ 产出与升级：冲突候选＋新增点＋待拍问题｜说「纳入候选」/「并入基准」/「暂存待议」；不用了回「不采纳」；如这是指令请回「这是指令」
```

### 一行标记（Q）

```
M-08 · 代码 .json · 非基准，仅作上下文
```

Q 不出六行卡、不硬拦；说「升为材料」即转 X，出卡并开硬拦。

## 状态与动作

| 状态 | 含义 | 硬拦 |
|---|---|---|
| `Q` | 问题上下文 | 否（软提醒） |
| `X` | 外部材料（默认，未采纳） | 是 |
| `H` | 暂存待议 | 是 |
| `C` | 候选（仍非基准） | 否 |
| `B` | 基准 | 否 |
| `Z` | 已关闭（不采纳，审计留档） | 否 |

动作：**纳入候选 / 并入基准 / 暂存待议 / 不采纳**；**升为材料**（Q→X）、**降为上下文**（X/H→Q）、**这是指令**（撤销）、**重开**（Z→X）。

「并入基准」只标状态并提醒变更闸门（裁定＋冲突登记＋备份）；插件不改任何基准文件。

## 工具

| 工具 | 用途 |
|---|---|
| `intake_register` | 登记材料；`tier=document`（默认）出六行卡，`tier=context` 出一行标记 |
| `intake_card` | 按编号取卡；Q 只返回一行标记 |
| `intake_list` | 列出材料与状态 |
| `intake_update` | 改状态/升级/降级/撤销/重开 |
| `intake_status` | 政策、保护路径、记忆/写工具、待定与上下文材料、分类默认值 |

## 分类规则（意图 → 内容 → 类型）

1. **意图**：“大纲/设定/稿/材料/纳入”等 → X；“报错/为什么/怎么/格式/语法”等 → Q。
2. **类型**：图片/视频/音频 → Q；代码/配置扩展名 → Q；PDF/DOCX/PPTX/XLSX → X。
3. **`.md`/`.txt`**：有代码围栏/堆栈 → Q；长文多标题段落 → X；否则按 `textDefault`（默认 document）。
4. **未知扩展名**：无话 → X（保守）；有问题语 → Q。
5. **用户一句话优先**：可随时升/降。

## 项目政策：`.intake/policy.json`

插件不猜权威路径与分类默认值，由项目声明（建议随项目提交）：

```json
{
  "baselinePaths": ["baseline/", "docs/spec/"],
  "statePaths": ["STATE.md"],
  "exemptPaths": ["drafts/", "references/"],
  "memoryTools": ["memoir_record"],
  "blockSections": ["work", "lessons", "actions"],
  "allowSections": ["note"],
  "lightExtensions": [".json", ".js", ".py"],
  "documentExtensions": [".pdf", ".docx"],
  "textDefault": "document"
}
```

- `baselinePaths` / `statePaths`：权威落点，X/H 存在时写这些路径被拦；
- `exemptPaths`：永远放行（材料目录、草稿、参考）；
- `textDefault`：`.md/.txt` 判不出形状时的默认档（`document`｜`light`）；
- `.intake/policy.json` 自身受保护。

## 配置（cordis.patch.yml）

```yaml
- insert:
    - id: 'intake-guard'
      name: 'dsh-intake-guard'
      config:
        language: zh              # zh | en
        pasteThreshold: 500
        policyPath: ''            # 默认 <workspace>\.intake\policy.json
        registryDir: ''           # 默认 <workspace>\.intake
        memoryTools: [memoir_record]
        blockSections: [work, lessons, actions]
        allowSections: [note]
        writeTools: [write, edit]
        textDefault: document     # .md/.txt 默认档
        lightExtensions: []       # 留空 = 内置代码扩展名
        documentExtensions: []    # 留空 = 内置文档扩展名
```

## 安装

```bash
dsh plugin --profile desktop add github:sarsgy-wenjian/dsh-intake-guard
# 本地开发：
dsh plugin --profile desktop add link:/path/to/dsh-intake-guard
```

改了插件代码后需要 toggle 该行（disable→enable）或重启。

## 数据与隐私

- 登记表：`<workspace>/.intake/registry.json`（自动 `.gitignore`，默认不入 git）；
- 政策：`<workspace>/.intake/policy.json`（随项目提交）；
- Q 上下文材料只存在于会话内存，不落盘；不联网、不收集数据。

## 兼容与边界

- **不依赖任何记忆插件**：没有记忆插件时检测/卡片/登记/分类/路径保护仍有效；`intake_status` 明确报告记忆拦截是否启用。
- 模型自己 `read` 的文件不算材料；检测是启发式，误判时一句话纠正（升/降/这是指令）。
- 只拦模型直接调用的工具；shell 脚本内部写文件不在范围内。
- 可作为 `dsh-wenjian-team` 等团队包的配套插件，不改团队包。

## 开发与测试

```bash
node --check lib/index.js
node test/smoke.mjs
```

## 反馈与交流

- **反馈 / 提意见**：GitHub Issues（推荐）https://github.com/sarsgy-wenjian/dsh-intake-guard/issues
- **国内访问**：Gitee 镜像 https://gitee.com/the-color-of-the-night-sky/dsh-intake-guard （可能滞后，以 GitHub 为准）
- **邮件**：sarsgy01@outlook.com（GitHub 不便时）
- **欢迎分享改进**：MIT，fork/PR 都欢迎；调试好的版本可以通过 Issue 或邮件发我，注明改了什么、怎么验证的。
- 反馈时请**不要贴稿件正文、密钥或隐私**，给最小复现即可。

## 维护

见 [`MAINTAINING.md`](MAINTAINING.md)（版本、发布、Gitee 镜像同步步骤）。

## License

MIT
