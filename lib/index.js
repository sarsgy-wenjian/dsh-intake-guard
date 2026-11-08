import fs from "node:fs";
import path from "node:path";

export const name = "intake-guard";
export const inject = ["tools", "systemPrompt"];

const VERSION = "0.2.1";

const CODE_EXTENSIONS = [
  ".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".json", ".jsonc", ".yaml", ".yml",
  ".toml", ".ini", ".cfg", ".conf", ".sh", ".bash", ".zsh", ".ps1", ".bat", ".cmd", ".html",
  ".htm", ".css", ".scss", ".csv", ".xml", ".sql", ".java", ".go", ".rs", ".c", ".h", ".cpp",
  ".hpp", ".rb", ".php", ".lua", ".mdx",
];

const DOC_EXTENSIONS = [".pdf", ".docx", ".pptx", ".xlsx", ".rtf", ".pages", ".eml", ".epub", ".odt", ".odp", ".ods"];

const DEFAULTS = {
  enabled: true,
  language: "zh",
  pasteThreshold: 500,
  registryDir: "",
  policyPath: "",
  memoryTools: ["memoir_record"],
  blockSections: ["work", "lessons", "actions"],
  allowSections: ["note"],
  writeTools: ["write", "edit"],
  lightExtensions: CODE_EXTENSIONS,
  documentExtensions: DOC_EXTENSIONS,
  textDefault: "document",
};

const STATUSES = new Set(["Q", "X", "H", "C", "B", "Z"]);

const STATUS_LABEL = {
  zh: { Q: "问题上下文", X: "外部材料（未采纳）", H: "暂存待议", C: "候选", B: "基准", Z: "已关闭（不采纳）" },
  en: { Q: "question context", X: "external material (unadopted)", H: "parked", C: "candidate", B: "baseline", Z: "closed (not adopted)" },
};

const ACTION_TO_STATUS = new Map([
  ["纳入候选", "C"], ["candidate", "C"],
  ["并入基准", "B"], ["baseline", "B"],
  ["暂存待议", "H"], ["hold", "H"],
  ["不采纳", "Z"], ["close", "Z"],
]);

const PROMOTE_ACTIONS = new Set(["升为材料", "promote", "升级为材料"]);
const DEMOTE_ACTIONS = new Set(["降为上下文", "demote", "仅作上下文"]);
const INSTRUCTION_ACTIONS = new Set(["这是指令", "instruction"]);

const DOC_CUES = /(大纲|设定|稿|外稿|底本|材料|正文|章节|规则包|总纲|人物卡|story|outline|manuscript|draft|baseline|document|spec)/i;
const Q_CUES = /(报错|错误|为什么|为何|怎么|如何|格式|语法|渲染|崩溃|异常|失败|不工作|这是什么|这段代码|看看这段|问题|why|error|fail|debug|fix|syntax|format|render|what is)/i;

function isZh(lang) {
  return lang !== "en";
}

function rulesText(lang) {
  if (isZh(lang)) {
    return [
      "## 材料接管（intake-guard）",
      "用户新递进来的东西默认是「外部材料·非基准」。分两档：",
      "- **文档类（X）**：大纲/设定/稿/长文/PDF/DOCX 等 → 先 intake_card 或 intake_register 出六行卡，贴给用户，再干活。",
      "- **上下文类（Q）**：截图/视频/代码/配置等问答材料 → 不出六行卡，回复末尾留一行「M-xx · 类型 · 非基准，仅作上下文」；不得当依据、不得写入记忆或基准。",
      "1. 材料不得并入基准、不得写入项目记忆、不得作为依据引用；编辑材料不改变身份。",
      "2. 状态：Q 上下文 / X 外部 / H 暂存待议 / C 候选 / B 基准 / Z 已关闭。动作词：纳入候选、并入基准、暂存待议、不采纳；「升为材料」Q→X、「降为上下文」X/H→Q、「这是指令」撤销。",
      "3. 本会话存在 X/H 待定材料时，记忆写入工具与权威路径写入会被拦截；Q 不硬拦，只软提醒。",
    ].join("\n");
  }
  return [
    "## Material intake (intake-guard)",
    "Anything newly handed in defaults to EXTERNAL, non-baseline material. Two tiers:",
    "- **Document (X)**: outline/spec/draft/long text/PDF/DOCX -> call intake_card or intake_register, show the six-line card, then continue.",
    "- **Context (Q)**: screenshot/video/code/config used for a question -> no six-line card; append one line \"M-xx · kind · non-baseline, context only\"; never cite it as authority or write it to memory/baseline.",
    "1. Never merge material into the baseline, never write it into project memory, never cite it as authority; editing material does not change its identity.",
    "2. States: Q context / X external / H parked / C candidate / B baseline / Z closed. Actions: candidate, baseline, hold, close; \"promote\" Q->X, \"demote\" X/H->Q, \"instruction\" cancels.",
    "3. While this session has X/H material, memory-write tools and authority-path writes are blocked; Q is soft-warned only.",
  ].join("\n");
}

function cfg(config) {
  const c = { ...DEFAULTS, ...(config || {}) };
  const threshold = Number(c.pasteThreshold);
  const list = (value, fallback) =>
    Array.isArray(value) && value.length > 0 ? value.map(String) : fallback.slice();
  return {
    enabled: c.enabled !== false,
    language: c.language === "en" ? "en" : "zh",
    pasteThreshold: Number.isFinite(threshold) && threshold > 0 ? threshold : DEFAULTS.pasteThreshold,
    registryDir: typeof c.registryDir === "string" ? c.registryDir : "",
    policyPath: typeof c.policyPath === "string" ? c.policyPath : "",
    memoryTools: list(c.memoryTools, DEFAULTS.memoryTools),
    blockSections: list(c.blockSections, DEFAULTS.blockSections),
    allowSections: list(c.allowSections, DEFAULTS.allowSections),
    writeTools: list(c.writeTools, DEFAULTS.writeTools),
    lightExtensions: list(c.lightExtensions, DEFAULTS.lightExtensions).map((e) => e.toLowerCase()),
    documentExtensions: list(c.documentExtensions, DEFAULTS.documentExtensions).map((e) => e.toLowerCase()),
    textDefault: c.textDefault === "light" ? "light" : "document",
  };
}

function textBlock(text) {
  return [{ type: "text", text: String(text) }];
}

function tool(name, description, parameters, execute) {
  return {
    name,
    description,
    parameters,
    output: {
      schema: { type: "object", additionalProperties: true },
      render(_args, value) {
        if (value && typeof value.text === "string" && value.text) return textBlock(value.text);
        return textBlock(typeof value === "string" ? value : JSON.stringify(value, null, 2));
      },
    },
    async execute(args, exec) {
      return execute(args || {}, exec);
    },
  };
}

const params = (properties = {}, required = []) => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/* ---------------------------------------------------------------- 会话状态 */

const sessions = new Map();

function stateOf(sessionId) {
  if (!sessionId) return undefined;
  let state = sessions.get(sessionId);
  if (state === undefined) {
    state = { materials: new Map(), seenMessages: new Set() };
    sessions.set(sessionId, state);
  }
  return state;
}

function pendingOf(state) {
  if (state === undefined) return [];
  return [...state.materials.values()].filter((m) => m.status === "X" || m.status === "H");
}

function lightOf(state) {
  if (state === undefined) return [];
  return [...state.materials.values()].filter((m) => m.status === "Q");
}

function cwdOf(agent) {
  const cwd = agent?.session?.header?.cwd;
  return typeof cwd === "string" && cwd !== "" ? cwd : "";
}

/* ---------------------------------------------------------------- 政策文件 */

const policyCache = new Map();

function policyFile(cwd, c) {
  return c.policyPath ? path.resolve(cwd, c.policyPath) : path.join(cwd, ".intake", "policy.json");
}

function normalizePolicy(raw) {
  const list = (value) => (Array.isArray(value) ? value.map(String) : []);
  return {
    baselinePaths: list(raw?.baselinePaths),
    statePaths: list(raw?.statePaths),
    exemptPaths: list(raw?.exemptPaths),
    memoryTools: list(raw?.memoryTools),
    blockSections: list(raw?.blockSections),
    allowSections: list(raw?.allowSections),
    lightExtensions: list(raw?.lightExtensions).map((e) => e.toLowerCase()),
    documentExtensions: list(raw?.documentExtensions).map((e) => e.toLowerCase()),
    textDefault: raw?.textDefault === "light" ? "light" : "",
  };
}

function loadPolicy(cwd, c) {
  if (!cwd) return { file: "", loaded: false, policy: normalizePolicy({}) };
  const file = policyFile(cwd, c);
  try {
    const stat = fs.statSync(file);
    const cached = policyCache.get(file);
    if (cached !== undefined && cached.mtimeMs === stat.mtimeMs) {
      return { file, loaded: true, policy: cached.policy };
    }
    const policy = normalizePolicy(JSON.parse(fs.readFileSync(file, "utf8")));
    policyCache.set(file, { mtimeMs: stat.mtimeMs, policy });
    return { file, loaded: true, policy };
  } catch {
    return { file, loaded: false, policy: normalizePolicy({}) };
  }
}

function effective(cwd, c) {
  const loaded = loadPolicy(cwd, c);
  const policy = loaded.policy;
  const memoryTools = [...new Set([...c.memoryTools, ...policy.memoryTools])];
  return {
    ...loaded,
    memoryTools,
    blockSections: policy.blockSections.length > 0 ? policy.blockSections : c.blockSections,
    allowSections: policy.allowSections.length > 0 ? policy.allowSections : c.allowSections,
    lightExtensions: policy.lightExtensions.length > 0 ? policy.lightExtensions : c.lightExtensions,
    documentExtensions: policy.documentExtensions.length > 0 ? policy.documentExtensions : c.documentExtensions,
    textDefault: policy.textDefault || c.textDefault,
  };
}

/* ---------------------------------------------------------------- 路径保护 */

function isUnder(parent, child) {
  const rel = path.relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function globToRegExp(pattern) {
  const escaped = String(pattern).replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/\\\\]*");
  return new RegExp(`^${escaped}$`);
}

function matchEntry(rel, entry) {
  const normalized = rel.replace(/\\/g, "/");
  const rule = String(entry).replace(/\\/g, "/").replace(/^\.\//, "");
  if (rule === "") return false;
  if (rule.includes("*")) {
    return globToRegExp(rule).test(normalized) || globToRegExp(`${rule.replace(/\/$/, "")}/*`).test(normalized);
  }
  const prefix = rule.replace(/\/+$/, "");
  return normalized === prefix || normalized.startsWith(`${prefix}/`);
}

function protectedHit(cwd, c, policy, target) {
  if (!cwd || !target) return "";
  const resolved = path.resolve(cwd, String(target));
  if (path.resolve(policyFile(cwd, c)) === resolved) return policyFile(cwd, c);
  if (!isUnder(cwd, resolved)) return "";
  const rel = path.relative(cwd, resolved);
  for (const entry of policy.exemptPaths) if (matchEntry(rel, entry)) return "";
  for (const entry of [...policy.baselinePaths, ...policy.statePaths]) if (matchEntry(rel, entry)) return entry;
  return "";
}

/* ---------------------------------------------------------------- 分类器 */

function looksLikeCode(text) {
  const lines = String(text || "").split(/\r?\n/);
  let score = 0;
  for (const line of lines.slice(0, 200)) {
    if (/^\s*(```|~~~)/.test(line)) score += 3;
    else if (/^\s*(at\s+\S+\(|Traceback|\w*Error:|PS [A-Z]:\\|\$ )/.test(line)) score += 2;
    else if (/^\s*"[^"]+"\s*:/.test(line)) score += 1;
    else if (/[{};]\s*$/.test(line) && /[:=(),[\]{}]/.test(line)) score += 1;
  }
  return score >= 2;
}

function looksLikeDocument(text) {
  const trimmed = String(text || "").trim();
  if (trimmed === "") return false;
  const lines = trimmed.split(/\r?\n/);
  let headings = 0;
  let numbered = 0;
  for (const line of lines.slice(0, 60)) {
    if (/^#{1,6}\s/.test(line)) headings += 1;
    else if (/^\s*\d+[.、)]\s/.test(line)) numbered += 1;
  }
  const paragraphs = trimmed.split(/\n\s*\n/).filter((block) => block.trim().length > 40).length;
  return headings > 0 || numbered >= 3 || paragraphs >= 3;
}

function firstHeading(text) {
  const match = /^#{1,6}\s+(.+)$/m.exec(String(text || ""));
  return match ? match[1].trim().slice(0, 60) : "";
}

function findLocation(text) {
  const windowsPath = /[A-Za-z]:\\[^\s"'<>|]+/.exec(text);
  if (windowsPath) return windowsPath[0];
  const uncPath = /\\\\[\w.~-]+\\[^\s"'<>|]+/.exec(text);
  if (uncPath) return uncPath[0];
  const url = /https?:\/\/[^\s"'<>）)]+/.exec(text);
  if (url) return url[0];
  return "";
}

function classifyByType({ ext, text, eff }) {
  const lower = String(ext || "").toLowerCase();
  if (lower !== "" && eff.documentExtensions.includes(lower)) return "document";
  if (lower !== "" && eff.lightExtensions.includes(lower)) return "light";
  if (lower === ".md" || lower === ".markdown" || lower === ".txt" || lower === "") {
    if (text) {
      if (looksLikeCode(text)) return "light";
      if (looksLikeDocument(text)) return "document";
    }
    return eff.textDefault === "light" ? "light" : "document";
  }
  return "document";
}

function classifyTier({ ext, userText, text, eff }) {
  const intent = String(userText || "");
  if (DOC_CUES.test(intent)) return "document";
  if (Q_CUES.test(intent)) return "light";
  return classifyByType({ ext, text, eff });
}

function detect(message, c, eff) {
  if (!message || message.role !== "user") return null;
  if (message.source !== undefined && message.source?.kind !== "user") return null;
  const blocks = Array.isArray(message.content) ? message.content : [];
  const files = blocks.filter((b) => b && b.type === "file");
  const images = blocks.filter((b) => b && b.type === "image");
  const media = blocks.filter((b) => b && (b.type === "video" || b.type === "audio"));
  const userText = blocks
    .filter((b) => b && b.type === "text")
    .map((b) => b.text || "")
    .join("\n")
    .trim();

  if (files.length > 0 || images.length > 0 || media.length > 0) {
    const names = files.map((f) => f.attachment?.name).filter(Boolean);
    const fileName = names[0] || "";
    const ext = fileName ? path.extname(fileName).toLowerCase() : "";
    let tier;
    if (DOC_CUES.test(userText)) tier = "document";
    else if (Q_CUES.test(userText)) tier = "light";
    else if (files.length > 0) tier = classifyByType({ ext, text: "", eff });
    else tier = "light";
    const kind = files.length > 0 ? "附件" : images.length > 0 ? "图片" : "媒体";
    return {
      tier,
      material: (names.join("；") || `${kind} ${images.length + media.length} 份`).slice(0, 120),
      kind,
      ext,
      source: { by: "用户上传", path: names[0] || "" },
    };
  }

  if (userText === "") return null;
  if (userText.length >= c.pasteThreshold) {
    let tier;
    if (DOC_CUES.test(userText)) tier = "document";
    else if (looksLikeCode(userText)) tier = "light";
    else if (Q_CUES.test(userText)) tier = "light";
    else if (looksLikeDocument(userText)) tier = "document";
    else tier = eff.textDefault === "light" ? "light" : "document";
    const title = firstHeading(userText) || userText.slice(0, 30).replace(/\s+/g, " ");
    return {
      tier,
      material: `${title}（粘贴${tier === "light" ? "代码/上下文" : "文本"} ${userText.length} 字）`,
      kind: tier === "light" ? "粘贴上下文" : "粘贴文本",
      ext: "",
      source: { by: "用户消息·粘贴", path: "" },
    };
  }
  const location = findLocation(userText);
  if (location !== "") {
    const ext = path.extname(location).toLowerCase();
    const tier = classifyTier({ ext, userText, text: "", eff });
    return {
      tier,
      material: `引用：${location}`.slice(0, 120),
      kind: "路径/链接引用",
      ext,
      source: { by: "用户消息·引用", path: location },
    };
  }
  return null;
}

/* ---------------------------------------------------------------- 登记表 */

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function idNumber(id) {
  const match = /^M-(\d+)$/.exec(String(id || ""));
  return match ? Number(match[1]) : 0;
}

function idOf(n) {
  return `M-${String(n).padStart(2, "0")}`;
}

function registryFile(cwd, c) {
  return path.join(cwd, c.registryDir || ".intake", "registry.json");
}

function readRegistry(file) {
  try {
    const data = JSON.parse(fs.readFileSync(file, "utf8"));
    return {
      version: 1,
      counter: Number(data.counter) || 0,
      materials: Array.isArray(data.materials) ? data.materials : [],
    };
  } catch {
    return { version: 1, counter: 0, materials: [] };
  }
}

function writeRegistry(file, data) {
  try {
    const dir = path.dirname(file);
    fs.mkdirSync(dir, { recursive: true });
    try {
      const ignore = path.join(dir, ".gitignore");
      if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n!.gitignore\n!policy.json\n!policy.example.json\n", "utf8");
    } catch {
      /* convenience only */
    }
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
    fs.renameSync(tmp, file);
  } catch {
    /* session state stays authoritative */
  }
}

function persistMaterial(cwd, c, material) {
  if (!cwd || material.status === "Q") return;
  const file = registryFile(cwd, c);
  const registry = readRegistry(file);
  const index = registry.materials.findIndex((m) => m.id === material.id);
  if (index >= 0) registry.materials[index] = material;
  else registry.materials.push(material);
  registry.counter = Math.max(registry.counter, idNumber(material.id));
  writeRegistry(file, registry);
}

function forgetMaterial(cwd, c, id) {
  if (!cwd) return;
  const file = registryFile(cwd, c);
  const registry = readRegistry(file);
  const next = registry.materials.filter((m) => m.id !== id);
  if (next.length !== registry.materials.length) {
    registry.materials = next;
    writeRegistry(file, registry);
  }
}

function nextId(state, cwd, c) {
  let max = 0;
  for (const id of state.materials.keys()) max = Math.max(max, idNumber(id));
  if (cwd) {
    const registry = readRegistry(registryFile(cwd, c));
    max = Math.max(max, Number(registry.counter) || 0);
    for (const m of registry.materials) max = Math.max(max, idNumber(m.id));
  }
  return idOf(max + 1);
}

function findMaterial(state, cwd, c, id) {
  const local = state.materials.get(id);
  if (local !== undefined) return local;
  if (!cwd) return undefined;
  const registry = readRegistry(registryFile(cwd, c));
  const found = registry.materials.find((m) => m.id === id);
  if (found === undefined) return undefined;
  state.materials.set(id, found);
  return found;
}

/* ---------------------------------------------------------------- 卡片 */

function cardFor(m, lang) {
  const defaults = m.defaults || {};
  const mark = (key) => (defaults[key] ? "【默认】" : "");
  if (m.status === "Q") {
    return `${markerFor(m, lang)}\n（这是上下文材料，不硬拦；要当材料请说「升为材料」）`;
  }
  if (!isZh(lang)) {
    const enMark = (key) => (defaults[key] ? " [default]" : "");
    return [
      `【Intake card ${m.id}】`,
      `1. Material: ${m.material}${m.version ? ` ${m.version}` : ""} (${m.kind})`,
      `2. Identity: ${m.identityEn} · state ${m.status} · ${m.date}${enMark("status")}`,
      `3. Source: ${m.source?.by || "user provided"} · ${m.date}${m.source?.path ? ` · ${m.source.path}` : " · no path"}${enMark("source")}`,
      `4. Purpose: ${m.purposeEn} (baseline unchanged)${enMark("purpose")}`,
      `5. I will not: merge into baseline, write to project memory, or cite it as authority`,
      `6. Output & upgrade: conflict candidates + additions + questions | "candidate" / "baseline" / "hold"; "close" if not needed; "instruction" if this is an instruction`,
    ].join("\n");
  }
  return [
    `【材料接管卡 ${m.id}】`,
    `① 材料：${m.material}${m.version ? ` ${m.version}` : ""}（${m.kind}）`,
    `② 身份：${m.identity} · 状态 ${m.status} · ${m.date}${mark("status")}`,
    `③ 来源：${m.source?.by || "用户提供"} · ${m.date}${m.source?.path ? ` · ${m.source.path}` : " · 无路径"}${mark("source")}`,
    `④ 用途：${m.purpose}（不改基准）${mark("purpose")}`,
    `⑤ 我不会做：${m.notDo.join("、")}`,
    `⑥ 产出与升级：${m.output}｜说「纳入候选」/「并入基准」/「暂存待议」；不用了回「不采纳」；如这是指令请回「这是指令」`,
  ].join("\n");
}

function markerFor(m, lang) {
  if (!isZh(lang)) return `${m.id} · ${m.kind} · non-baseline, context only`;
  return `${m.id} · ${m.kind} · 非基准，仅作上下文`;
}

function createMaterial(state, cwd, c, fields) {
  const stamp = new Date().toISOString();
  const status = STATUSES.has(fields.status) ? fields.status : fields.tier === "light" ? "Q" : "X";
  const material = {
    id: fields.id || nextId(state, cwd, c),
    material: String(fields.material || "未命名材料").slice(0, 200),
    version: fields.version ? String(fields.version).slice(0, 40) : "",
    kind: fields.kind ? String(fields.kind).slice(0, 40) : isZh(c.language) ? "材料" : "material",
    ext: fields.ext ? String(fields.ext) : "",
    identity: "外部材料·非基准",
    identityEn: "external · non-baseline",
    status,
    date: fields.date || today(),
    source: {
      by: fields.source?.by || (isZh(c.language) ? "用户提供" : "user provided"),
      path: fields.source?.path || "",
      session: fields.source?.session || "",
    },
    purpose: fields.purpose ? String(fields.purpose).slice(0, 80) : status === "Q" ? "问答上下文" : "只读理解",
    purposeEn: status === "Q" ? "question context" : "read-only understanding",
    notDo: ["不并入基准", "不写入项目记忆", "不作为依据引用"],
    output: "冲突候选＋新增点＋待拍问题",
    createdAt: stamp,
    updatedAt: stamp,
    closedReason: "",
    defaults: { status: !fields.status, source: !fields.source, purpose: !fields.purpose },
  };
  state.materials.set(material.id, material);
  persistMaterial(cwd, c, material);
  return material;
}

function listText(state, lang) {
  if (state === undefined || state.materials.size === 0) {
    return isZh(lang) ? "本会话还没有登记任何材料。" : "No material registered in this session.";
  }
  const labels = isZh(lang)
    ? ["| 编号 | 材料 | 身份 | 用途 | 状态 |", "|---|---|---|---|---|"]
    : ["| ID | Material | Identity | Purpose | State |", "|---|---|---|---|---|"];
  const lines = labels.slice();
  for (const m of [...state.materials.values()].sort((a, b) => idNumber(a.id) - idNumber(b.id))) {
    lines.push(`| ${m.id} | ${m.material} | ${m.identity} | ${m.purpose} | ${m.status} ${STATUS_LABEL[lang][m.status] ?? ""} |`);
  }
  lines.push("");
  lines.push(
    isZh(lang)
      ? "按编号操作：如「M-01 纳入候选」。X/H 状态下记忆写入与权威路径写入会被拦截；Q 只软提醒。"
      : "Operate by ID, e.g. \"M-01 candidate\". X/H blocks memory and authority-path writes; Q is soft-warned only.",
  );
  return lines.join("\n");
}

/* ---------------------------------------------------------------- 注册 */

export function apply(ctx, config) {
  const c = cfg(config);
  if (!c.enabled) return;
  const lang = c.language;
  const describe = (zh, en) => (isZh(lang) ? zh : en);

  ctx.effect(
    () =>
      ctx.tools.register(
        tool(
          "intake_register",
          describe(
            "登记一份用户新递进来的材料。tier=document（默认）出六行卡并硬拦；tier=context（截图/代码/问答上下文）只留一行标记、不硬拦。",
            "Register newly provided material. tier=document (default) renders the six-line card and hard-guards; tier=context (screenshot/code/QA) renders one line and soft-warns only.",
          ),
          params(
            {
              material: { type: "string", description: describe("材料名称", "Material name") },
              version: { type: "string", description: describe("版本号，可省略", "Version, optional") },
              kind: { type: "string", description: describe("类型：大纲/设定/代码/截图 等", "Kind") },
              tier: { type: "string", enum: ["document", "context"], description: describe("document=文档（六行卡）｜context=问答上下文（一行）", "document | context") },
              purpose: { type: "string", description: describe("用途，可省略", "Purpose, optional") },
              by: { type: "string", description: describe("来源方，可省略", "Source party, optional") },
              path: { type: "string", description: describe("路径或链接，可省略", "Path or link, optional") },
            },
            ["material"],
          ),
          (args, exec) => {
            const state = stateOf(exec.agent?.id);
            const tier = args.tier === "context" ? "light" : "document";
            const material = createMaterial(state, cwdOf(exec.agent), c, {
              material: args.material,
              version: args.version,
              kind: args.kind,
              tier,
              purpose: args.purpose,
              source: args.by !== undefined || args.path !== undefined ? { by: args.by || "user", path: args.path || "", session: exec.agent?.id || "" } : undefined,
            });
            return {
              id: material.id,
              status: material.status,
              tier: material.status === "Q" ? "context" : "document",
              text: material.status === "Q" ? markerFor(material, lang) : cardFor(material, lang),
            };
          },
        ),
      ),
    "dsh-intake-guard: register tool",
  );

  ctx.effect(
    () =>
      ctx.tools.register(
        tool(
          "intake_card",
          describe("按编号取回六行卡；Q 状态只返回一行标记（要出卡请先说「升为材料」）。", "Render the six-line card by ID; Q returns the one-line marker (promote first for a card)."),
          params({ id: { type: "string", description: describe("材料编号，如 M-01", "Material ID") } }, ["id"]),
          (args, exec) => {
            const state = stateOf(exec.agent?.id);
            const material = findMaterial(state, cwdOf(exec.agent), c, String(args.id || "").trim());
            if (material === undefined) return { text: describe(`没有找到材料 ${args.id}。`, `No material ${args.id}.`) };
            return { text: cardFor(material, lang) };
          },
        ),
      ),
    "dsh-intake-guard: card tool",
  );

  ctx.effect(
    () =>
      ctx.tools.register(
        tool(
          "intake_list",
          describe("列出本会话已登记的材料及状态。", "List materials registered in this session."),
          params({}),
          (_args, exec) => ({ text: listText(stateOf(exec.agent?.id), lang) }),
        ),
      ),
    "dsh-intake-guard: list tool",
  );

  ctx.effect(
    () =>
      ctx.tools.register(
        tool(
          "intake_status",
          describe("报告接管闸门状态：政策、保护路径、记忆/写工具、待定与上下文材料、分类默认值、语言。", "Report guard status: policy, protected paths, memory/write tools, pending and context material, classifier defaults, language."),
          params({}),
          (_args, exec) => {
            const cwd = cwdOf(exec.agent);
            const eff = effective(cwd, c);
            const defs = ctx.tools.definitions(exec.agent).map((d) => d.name);
            const blockedMemory = eff.memoryTools.filter((n) => defs.includes(n));
            const state = stateOf(exec.agent?.id);
            const pending = pendingOf(state);
            const light = lightOf(state);
            return {
              text: [
                describe("## 接管闸门状态", "## Intake guard status"),
                `- policy: ${eff.loaded ? eff.file : describe("未加载（L3 文件保护关闭）", "not loaded (L3 off)")}`,
                `- baselinePaths: ${eff.policy.baselinePaths.length} / statePaths: ${eff.policy.statePaths.length} / exemptPaths: ${eff.policy.exemptPaths.length}`,
                `- memoryTools: ${eff.memoryTools.join(", ") || "-"} / detected: ${blockedMemory.join(", ") || describe("无（记忆拦截未启用）", "none (memory guard inactive)")}`,
                `- writeTools: ${c.writeTools.join(", ")}`,
                `- pending (X/H): ${pending.map((m) => `${m.id}(${m.status})`).join(", ") || "-"}`,
                `- context (Q): ${light.map((m) => m.id).join(", ") || "-"}`,
                `- classifier: lightExtensions=${eff.lightExtensions.length} / documentExtensions=${eff.documentExtensions.length} / textDefault=${eff.textDefault}`,
                `- language: ${lang}`,
              ].join("\n"),
            };
          },
        ),
      ),
    "dsh-intake-guard: status tool",
  );

  ctx.effect(
    () =>
      ctx.tools.register(
        tool(
          "intake_update",
          describe(
            "按编号改变材料状态：纳入候选/并入基准/暂存待议/不采纳；升为材料（Q→X，出卡＋硬拦）、降为上下文（X/H→Q，释放硬拦）、这是指令（撤销）、重开（Z→X）。",
            "Change material state: candidate/baseline/hold/close; promote (Q->X, card+hard guard), demote (X/H->Q, release), instruction (cancel), reopen (Z->X).",
          ),
          params(
            {
              id: { type: "string", description: describe("材料编号，如 M-01", "Material ID") },
              action: { type: "string", description: describe("纳入候选/并入基准/暂存待议/不采纳/升为材料/降为上下文/这是指令/重开", "candidate/baseline/hold/close/promote/demote/instruction/reopen") },
              reason: { type: "string", description: describe("可选：原因", "Optional reason") },
            },
            ["id", "action"],
          ),
          (args, exec) => {
            const state = stateOf(exec.agent?.id);
            const cwd = cwdOf(exec.agent);
            const id = String(args.id || "").trim();
            const action = String(args.action || "").trim();
            const material = findMaterial(state, cwd, c, id);
            if (material === undefined) return { text: describe(`没有找到材料 ${id}。`, `No material ${id}.`) };

            if (INSTRUCTION_ACTIONS.has(action)) {
              state.materials.delete(id);
              forgetMaterial(cwd, c, id);
              return { text: describe(`已撤销 ${id} 的登记，不再拦截。`, `Registration ${id} cancelled.`) };
            }
            if (PROMOTE_ACTIONS.has(action)) {
              if (material.status !== "Q") return { text: describe(`${id} 不是上下文材料，无需升级。`, `${id} is not context material.`) };
              material.status = "X";
              material.purpose = "只读理解";
              material.updatedAt = new Date().toISOString();
              persistMaterial(cwd, c, material);
              return { text: describe(`已升为材料（X）。\n${cardFor(material, lang)}`, `Promoted to X.\n${cardFor(material, lang)}`) };
            }
            if (DEMOTE_ACTIONS.has(action)) {
              if (material.status !== "X" && material.status !== "H") return { text: describe(`${id} 不是待定材料，无法降级。`, `${id} is not pending material.`) };
              material.status = "Q";
              material.purpose = "问答上下文";
              material.updatedAt = new Date().toISOString();
              forgetMaterial(cwd, c, id);
              return { text: describe(`已降为上下文（Q），硬拦截解除。\n${markerFor(material, lang)}`, `Demoted to Q; hard guard released.\n${markerFor(material, lang)}`) };
            }
            if (action === "重开" || action === "reopen") {
              material.status = "X";
              material.closedReason = "";
              material.updatedAt = new Date().toISOString();
              persistMaterial(cwd, c, material);
              return { text: describe(`${id} 已重开为 X。`, `${id} reopened as X.`) };
            }
            const target = ACTION_TO_STATUS.get(action);
            if (target === undefined) return { text: describe(`未知动作「${action}」。`, `Unknown action "${action}".`) };
            if (target === "Z" && material.status === "Q") {
              state.materials.delete(id);
              return { text: describe(`${id}（上下文）已关闭。`, `${id} (context) closed.`) };
            }
            material.status = target;
            material.updatedAt = new Date().toISOString();
            if (target === "H") material.purpose = "暂存待议";
            if (target === "Z") material.closedReason = args.reason ? String(args.reason) : describe("不采纳", "close");
            persistMaterial(cwd, c, material);
            const lines = [describe(`${id} 已更新为 ${target}（${STATUS_LABEL[lang][target]}）。`, `${id} -> ${target} (${STATUS_LABEL[lang][target]}).`)];
            if (target === "C") lines.push(describe("候选仍不是基准。", "Candidate is still not the baseline."));
            if (target === "H") lines.push(describe("已记入待议：X/H 拦截继续。", "Parked; guard continues."));
            if (target === "Z") lines.push(describe("拦截已解除；登记表保留审计行，可重开。", "Guard released; audit row kept; reopen possible."));
            if (target === "B") lines.push(describe("已标为基准（B）；请走变更闸门：裁定＋登记＋备份。", "Marked B; run the change gate."));
            return { text: lines.join("\n") };
          },
        ),
      ),
    "dsh-intake-guard: update tool",
  );

  ctx.effect(
    () =>
      ctx.tools.guard((exec) => {
        const agentId = exec.agent?.id;
        if (agentId === undefined) return undefined;
        const state = sessions.get(agentId);
        if (state === undefined) return undefined;
        const pending = pendingOf(state);
        if (pending.length === 0) return undefined;
        const ids = pending.map((m) => m.id).join(", ");
        const args = exec.arguments && typeof exec.arguments === "object" ? exec.arguments : {};

        if (c.writeTools.includes(exec.name)) {
          const cwd = cwdOf(exec.agent);
          const eff = effective(cwd, c);
          const target = args.file_path ?? args.path ?? args.target;
          const hit = protectedHit(cwd, c, eff.policy, target);
          if (hit !== "") {
            return describe(
              `本轮有未采纳外部材料 ${ids}；${target} 属于受保护的权威路径（${hit}）。要改请先「纳入候选/暂存待议/不采纳」，或走变更闸门。`,
              `Unadopted material ${ids} is pending; ${target} is a protected authority path (${hit}). Promote, park, or close first, or run the change gate.`,
            );
          }
          return undefined;
        }

        const eff = effective(cwdOf(exec.agent), c);
        if (eff.memoryTools.includes(exec.name)) {
          const section = args.section;
          if (section !== undefined && eff.allowSections.includes(String(section))) return undefined;
          return describe(
            `本轮有未采纳外部材料 ${ids}；要记录请先「纳入候选/暂存待议/不采纳」，或改记 ${eff.allowSections.join("/") || "note"}（只记指针）。`,
            `Unadopted material ${ids} is pending; promote, park, or close first, or write a pointer-only note.`,
          );
        }
        return undefined;
      }),
    "dsh-intake-guard: write guard",
  );

  ctx.effect(
    () =>
      ctx.systemPrompt.section({
        name: "plugin:dsh-intake-guard",
        order: 155,
        interpolate: false,
        text: (context) => {
          const agentId = context?.agent?.id;
          const state = agentId === undefined ? undefined : sessions.get(agentId);
          const pending = pendingOf(state);
          const light = lightOf(state);
          const blocks = [rulesText(lang)];
          if (pending.length > 0) {
            blocks.push(
              `${describe("### 本会话待定材料（X/H，硬拦）", "### Pending material (X/H, hard-blocked)")}\n` +
                pending.map((m) => `- ${m.id}「${m.material}」${m.status}（${STATUS_LABEL[lang][m.status] ?? ""}，非基准）`).join("\n") +
                `\n${describe("处理：先 intake_card 出卡贴给用户；未采纳前记忆/权威路径写入会被拦截。", "Next: intake_card and show it; memory/authority writes stay blocked until adopted.")}`,
            );
          }
          if (light.length > 0) {
            blocks.push(
              `${describe("### 本会话上下文材料（Q，软提醒）", "### Context material (Q, soft)")}\n` +
                light.map((m, i) => `- ${m.id}「${m.material}」（${m.kind}，非基准）`).join("\n") +
                `\n${describe("处理：不出六行卡；回复末尾留一行「编号 · 类型 · 非基准，仅作上下文」；不得当依据/写入记忆。", "Next: no six-line card; append one line; never cite or write to memory.")}`,
            );
          }
          return blocks.join("\n\n");
        },
      }),
    "dsh-intake-guard: prompt section",
  );

  ctx.effect(
    () =>
      ctx.on("agent/inbox/inserted", (payload) => {
        try {
          const agent = payload?.agent;
          const message = payload?.message;
          if (agent === undefined || message === undefined) return;
          const state = stateOf(agent.id);
          if (state === undefined) return;
          if (message.id !== undefined && state.seenMessages.has(message.id)) return;
          if (message.id !== undefined) state.seenMessages.add(message.id);
          const cwd = cwdOf(agent);
          const eff = effective(cwd, c);
          const detected = detect(message, c, eff);
          if (detected === null) return;
          createMaterial(state, cwd, c, { ...detected, source: { ...detected.source, session: agent.id } });
        } catch {
          /* never disturb message intake */
        }
      }),
    "dsh-intake-guard: material detection",
  );

  ctx.effect(
    () =>
      ctx.on("agent/disposed", ({ agent }) => {
        if (agent?.id !== undefined) sessions.delete(agent.id);
      }),
    "dsh-intake-guard: session cleanup",
  );

  return { name, version: VERSION };
}
