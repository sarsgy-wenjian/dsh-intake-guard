import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { apply } from "../lib/index.js";

function makeCtx(extraNames = []) {
  const tools = new Map();
  const state = { section: null, guard: null, handlers: new Map() };
  const ctx = {
    tools: {
      register(def) {
        tools.set(def.name, def);
        return () => {};
      },
      guard(fn) {
        state.guard = fn;
        return () => {};
      },
      definitions() {
        return [...tools.keys(), ...extraNames].map((name) => ({ name }));
      },
    },
    systemPrompt: {
      section(def) {
        state.section = def;
        return () => {};
      },
    },
    on(event, fn) {
      state.handlers.set(event, fn);
      return () => {};
    },
    effect(factory) {
      const dispose = factory();
      return typeof dispose === "function" ? dispose : () => {};
    },
  };
  return { ctx, tools, state };
}

const results = [];
const check = (name, pass) => results.push({ name, pass });

function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "intake-smoke-"));
}

function writePolicy(cwd, policy) {
  fs.mkdirSync(path.join(cwd, ".intake"), { recursive: true });
  fs.writeFileSync(path.join(cwd, ".intake", "policy.json"), JSON.stringify(policy, null, 2), "utf8");
}

const cwd = tmpWorkspace();
const p = makeCtx(["memoir_record"]);
apply(p.ctx, { registryDir: "smoke-registry" });

const agentA = { id: "a", session: { header: { cwd } } };
const agentB = { id: "b", session: { header: { cwd } } };
const call = (tool, args, agent) => p.tools.get(tool).execute(args, { agent, arguments: args });
const guard = (exec) => p.state.guard(exec);
const send = (agent, id, content) =>
  p.state.handlers.get("agent/inbox/inserted")({
    agent,
    message: { id, role: "user", source: { kind: "user" }, content },
  });
const fileBlock = (name) => ({ type: "file", attachment: { name } });
const idOf = (text) => {
  const m = /M-\d+/.exec(text);
  return m ? m[0] : "";
};

check(
  "tools registered",
  ["intake_register", "intake_card", "intake_list", "intake_update", "intake_status"].every((n) => p.tools.has(n)),
);

/* ---------- Q tier ---------- */
send(agentA, "a1", [{ type: "image", attachment: { attachmentId: "img" } }]);
let list = await call("intake_list", {}, agentA);
const qImage = idOf(list.text);
check("image -> Q", list.text.includes("Q 问题上下文"));
check("Q marker not card", (await call("intake_card", { id: qImage }, agentA)).text.includes("仅作上下文"));
check("Q soft: memory allowed", guard({ name: "memoir_record", arguments: { section: "work" }, agent: agentA }) === undefined);

send(agentA, "a2", [fileBlock("config.json"), { type: "text", text: "为什么报错？" }]);
list = await call("intake_list", {}, agentA);
check("json + why -> Q", /config\.json/.test(list.text) && (list.text.match(/Q 问题上下文/g) || []).length >= 2);

send(agentA, "a3", [fileBlock("notes.md"), { type: "text", text: "这段为什么渲染错了？" }]);
list = await call("intake_list", {}, agentA);
check("md + question -> Q", /notes\.md/.test(list.text) && (list.text.match(/Q 问题上下文/g) || []).length >= 3);

send(agentA, "a4", [fileBlock("mystery.xyz")]);
list = await call("intake_list", {}, agentA);
check("unknown ext no words -> X", /mystery\.xyz/.test(list.text) && list.text.includes("X 外部材料"));

const codePaste =
  "这段为什么报错\n```js\n" +
  Array.from({ length: 40 }, (_, i) => `const v${i} = fn(${i});`).join("\n") +
  "\n```\n";
send(agentA, "a5", [{ type: "text", text: codePaste.repeat(4) }]);
list = await call("intake_list", {}, agentA);
check("code paste -> Q", list.text.includes("粘贴代码/上下文"));

/* ---------- X tier ---------- */
send(agentB, "b1", [fileBlock("outline.md")]);
list = await call("intake_list", {}, agentB);
const xOutline = idOf(list.text);
check("md no words -> X (textDefault document)", list.text.includes("X 外部材料"));
check("X hard: memory blocked", typeof guard({ name: "memoir_record", arguments: { section: "work" }, agent: agentB }) === "string");
check("X card is six lines", (await call("intake_card", { id: xOutline }, agentB)).text.includes("材料接管卡"));

send(agentB, "b2", [fileBlock("contract.pdf")]);
list = await call("intake_list", {}, agentB);
check("pdf -> X", /contract\.pdf/.test(list.text) && list.text.includes("X 外部材料"));

send(agentB, "b3", [fileBlock("data.json"), { type: "text", text: "这份是材料，先看一下" }]);
list = await call("intake_list", {}, agentB);
check("json + material cue -> X", list.text.includes("X 外部材料"));

const docPaste =
  "# 示例大纲\n\n" +
  Array.from({ length: 8 }, (_, i) => `## ${i + 1}、章节\n` + "正文内容".repeat(60)).join("\n\n");
send(agentB, "b4", [{ type: "text", text: docPaste }]);
list = await call("intake_list", {}, agentB);
check("doc paste -> X", list.text.includes("粘贴文本") && list.text.includes("X 外部材料"));

/* ---------- promote / demote (fresh session) ---------- */
const agentG = { id: "g", session: { header: { cwd } } };
send(agentG, "g1", [{ type: "image", attachment: { attachmentId: "img2" } }]);
const listG = await call("intake_list", {}, agentG);
const qG = idOf(listG.text);
const promote = await call("intake_update", { id: qG, action: "升为材料" }, agentG);
check("promote Q -> X shows card", promote.text.includes("已升为材料") && promote.text.includes("材料接管卡"));
check("promote -> hard guard", typeof guard({ name: "memoir_record", arguments: { section: "work" }, agent: agentG }) === "string");
const demote = await call("intake_update", { id: qG, action: "降为上下文" }, agentG);
check("demote X -> Q releases guard", demote.text.includes("硬拦截解除") && guard({ name: "memoir_record", arguments: { section: "work" }, agent: agentG }) === undefined);

const qJson = (await call("intake_list", {}, agentA)).text.match(/M-\d+/g);
const someQ = qJson[qJson.length - 1];
const closeQ = await call("intake_update", { id: someQ, action: "不采纳" }, agentA);
check("Q close removes", closeQ.text.includes("已关闭"));

/* ---------- registry ---------- */
const registryFile = path.join(cwd, "smoke-registry", "registry.json");
const registry = JSON.parse(fs.readFileSync(registryFile, "utf8"));
check("registry keeps X, drops Q", registry.materials.some((m) => m.status === "X") && !registry.materials.some((m) => m.status === "Q"));

const status = await call("intake_status", {}, agentB);
check("status shows classifier", status.text.includes("textDefault=document") && status.text.includes("context (Q)"));
check("status shows pending", status.text.includes("pending (X/H)"));

/* ---------- policy defaults ---------- */
const cwd2 = tmpWorkspace();
writePolicy(cwd2, { textDefault: "light" });
const p2 = makeCtx([]);
apply(p2.ctx, { registryDir: "smoke-registry" });
const agentC = { id: "c", session: { header: { cwd: cwd2 } } };
p2.state.handlers.get("agent/inbox/inserted")({
  agent: agentC,
  message: { id: "c1", role: "user", source: { kind: "user" }, content: [fileBlock("notes.md")] },
});
const listC = await p2.tools.get("intake_list").execute({}, { agent: agentC, arguments: {} });
check("policy textDefault light -> Q", listC.text.includes("Q 问题上下文"));

const cwd3 = tmpWorkspace();
writePolicy(cwd3, { lightExtensions: [".md"] });
const p3 = makeCtx([]);
apply(p3.ctx, { registryDir: "smoke-registry" });
const agentD = { id: "d", session: { header: { cwd: cwd3 } } };
p3.state.handlers.get("agent/inbox/inserted")({
  agent: agentD,
  message: { id: "d1", role: "user", source: { kind: "user" }, content: [fileBlock("notes.md")] },
});
const listD = await p3.tools.get("intake_list").execute({}, { agent: agentD, arguments: {} });
check("policy lightExtensions -> Q", listD.text.includes("Q 问题上下文"));

const cwd4 = tmpWorkspace();
writePolicy(cwd4, { documentExtensions: [".json"] });
const p4 = makeCtx([]);
apply(p4.ctx, { registryDir: "smoke-registry" });
const agentE = { id: "e", session: { header: { cwd: cwd4 } } };
p4.state.handlers.get("agent/inbox/inserted")({
  agent: agentE,
  message: { id: "e1", role: "user", source: { kind: "user" }, content: [fileBlock("data.json")] },
});
const listE = await p4.tools.get("intake_list").execute({}, { agent: agentE, arguments: {} });
check("policy documentExtensions -> X", listE.text.includes("X 外部材料"));

/* ---------- custom memory tool ---------- */
const cwd5 = tmpWorkspace();
const p5 = makeCtx(["memory_remember"]);
apply(p5.ctx, { registryDir: "smoke-registry", memoryTools: ["memory_remember"] });
const agentF = { id: "f", session: { header: { cwd: cwd5 } } };
p5.state.handlers.get("agent/inbox/inserted")({
  agent: agentF,
  message: { id: "f1", role: "user", source: { kind: "user" }, content: [fileBlock("contract.pdf")] },
});
check(
  "custom memory tool blocked",
  typeof p5.state.guard({ name: "memory_remember", arguments: { section: "work" }, agent: agentF }) === "string",
);
check(
  "unconfigured memoir tool untouched",
  p5.state.guard({ name: "memoir_record", arguments: { section: "work" }, agent: agentF }) === undefined,
);

console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.pass)) {
  console.error("FAILED:", results.filter((r) => !r.pass).map((r) => r.name));
  process.exitCode = 1;
}

