# dsh-intake-guard · 材料接管闸门

> 给 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的一道**材料入口闸门**：用户发来一份还没拍板的外部资料（大纲、设定、想法、截图……），或者丢下一个路径/链接，插件把它默认标成「外部材料·非基准」，要求模型先出**六行接管卡**；在材料被采纳之前，它不允许写进你声明的**权威路径**或项目记忆。
>
> 只读、纯本地、不联网、不修改任何基准文件。

## 它解决什么问题

“用户发份稿子说一句『先看一下』→ 模型读完直接当依据 → 讨论跑偏、基准被污染 → 很久才发现。”这类事故的起点不是记忆检索，而是**材料进门时没有身份**。本插件只做三件事：

1. **检测**：附件 / 图片 / 路径 / 链接 / ≥500 字的文档块 → 自动登记为材料，状态 `X`；
2. **出卡**：给出固定的六行卡模板（身份、来源、用途、禁止项、产出与升级方式）；
3. **拦截**：本会话还有 `X`/`H` 材料时，**记忆写入工具**与**权威路径的写文件工具**都会被拒绝；只放行 `note`（只记指针）。

## 六行卡

```
【材料接管卡 M-01】
① 材料：《示例大纲》v0.1（大纲）
② 身份：外部材料·非基准 · 状态 X · 2026-11-08【默认】
③ 来源：用户上传 · 2026-11-08 · <路径/无路径>
④ 用途：只读理解（不改基准）【默认】
⑤ 我不会做：不并入基准、不写入项目记忆、不作为依据引用
⑥ 产出与升级：冲突候选＋新增点＋待拍问题｜说「纳入候选」/「并入基准」/「暂存待议」；不用了回「不采纳」；如这是指令请回「这是指令」
```

## 状态与动作

| 状态 | 含义 | 是否拦截 |
|---|---|---|
| `X` | 外部材料（默认，未采纳） | 拦 |
| `H` | 暂存待议（不升也不丢） | 拦 |
| `C` | 候选（可参与比对，仍非基准） | 放 |
| `B` | 基准 | 放 |
| `Z` | 已关闭（不采纳，审计留档） | 放 |

动作词：**纳入候选 / 并入基准 / 暂存待议 / 不采纳**；纠错词 **这是指令**（撤销误登记）；**重开**（Z→X）。

「并入基准」只把状态标为 B 并提醒变更闸门（裁定＋冲突登记＋备份）；**插件不修改任何基准文件**。

## 工具

| 工具 | 用途 |
|---|---|
| `intake_register` | 主动登记一份材料，返回六行卡 |
| `intake_card` | 按编号取回六行卡（自动登记的新材料先用它出卡） |
| `intake_list` | 列出本会话材料与状态 |
| `intake_update` | 按编号改状态（纳入候选/并入基准/暂存待议/不采纳/这是指令/重开） |
| `intake_status` | 报告闸门状态：政策是否加载、保护路径、记忆工具、写工具、待定材料；**没有记忆插件时明说“记忆拦截未启用”** |

## 项目政策：`.intake/policy.json`

插件**不猜**哪些文件是权威——由项目自己声明。把下面这份文件放在工作区（建议随项目提交）：

```json
{
  "baselinePaths": ["baseline/", "docs/spec/"],
  "statePaths": ["STATE.md"],
  "exemptPaths": ["drafts/", "references/"],
  "memoryTools": ["memoir_record"],
  "blockSections": ["work", "lessons", "actions"],
  "allowSections": ["note"]
}
```

- `baselinePaths` / `statePaths`：权威落点。X/H 材料存在时，写这些路径会被拦（走变更闸门或先关闭材料）。
- `exemptPaths`：永远放行（材料自己的目录、草稿、参考资料）。
- `memoryTools`：你安装的记忆插件的“写记忆”工具名（默认 `memoir_record`；换插件就改这里）。
- `.intake/policy.json` 自身默认受保护，防止材料篡改保护清单。
- 没有政策文件：L3 文件保护显示“未配置”，其余功能照常。

## 配置（cordis.patch.yml）

```yaml
- insert:
    - id: 'intake-guard'
      name: 'dsh-intake-guard'
      config:
        language: zh              # zh | en（六行卡与提示文案）
        pasteThreshold: 500       # 粘贴文本多少字以上、且像文档，自动登记
        policyPath: ''            # 留空 = <工作区>\.intake\policy.json
        registryDir: ''           # 留空 = <工作区>\.intake
        memoryTools: [memoir_record]
        blockSections: [work, lessons, actions]
        allowSections: [note]
        writeTools: [write, edit]
```

## 安装

```bash
# 从 GitHub 安装
dsh plugin --profile desktop add github:sarsgy-wenjian/dsh-intake-guard

# 本地开发（指向本目录）
dsh plugin --profile desktop add link:/path/to/dsh-intake-guard
```

也可以用插件管理器 `install_bundle`，`target` 传本目录绝对路径。改动代码后需要 toggle 该行（disable→enable）或重启。

## 数据与隐私

- 登记表：`<工作区>/.intake/registry.json`（自动生成 `.gitignore`，默认不进 git）；
- 政策：`<工作区>/.intake/policy.json`（随项目提交）；
- 不联网、不收集任何数据、不读取材料正文之外的目录。

## 兼容与边界

- **不依赖任何记忆插件**：没有记忆插件时，检测/六行卡/登记表/五态/权威路径保护仍然有效；只是“记忆拦截”不启用，`intake_status` 会明确报告。
- 模型自己 `read` 的工作文件**不算**材料（否则正常查资料也会被拦）；仍受项目的引用纪律约束。
- 检测是启发式：附件/图片/路径/链接可靠；粘贴文本按“≥阈值且像文档”判断，误判时回「这是指令」撤销。
- 本插件只拦模型对工具的直接调用；不拦 shell 脚本内部写文件（那属于项目自己的命令纪律）。
- 可作为 `dsh-wenjian-team` 等团队包的配套插件使用，**不改团队包**。

## 开发与测试

```bash
node --check lib/index.js
node test/smoke.mjs
```

## License

MIT
