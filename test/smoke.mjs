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

function tmpWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "intake-smoke-"));
}

function writePolicy(cwd, policy) {
  const dir = path.join(cwd, ".intake");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "policy.json"), JSON.stringify(policy, null, 2), "utf8");
}

const results = [];
const check = (name, pass) => results.push({ name, pass });

const cwd = tmpWorkspace();
const a = makeCtx(["memoir_record"]);
apply(a.ctx, { registryDir: "smoke-registry" });
const agent = { id: "s1", session: { header: { cwd } } };
const call = (name, args) => a.tools.get(name).execute(args, { agent, arguments: args });
const guard = (exec) => a.state.guard(exec);

check(
  "tools registered",
  ["intake_register", "intake_card", "intake_list", "intake_update", "intake_status"].every((n) => a.tools.has(n)),
);
check("prompt section registered", a.state.section?.name === "plugin:dsh-intake-guard");

a.state.handlers.get("agent/inbox/inserted")({
  agent,
  message: {
    id: "m1",
    role: "user",
    source: { kind: "user" },
    content: [
      { type: "text", text: "take a look" },
      { type: "file", attachment: { name: "Sample outline v0.1.md" } },
    ],
  },
});
const list1 = await call("intake_list", {});
check("attachment auto-registered", list1.text.includes("M-01") && list1.text.includes("Sample outline"));

const secText = a.state.section.text({ agent });
check("section lists pending", secText.includes("M-01") && secText.includes("拦截"));

check("default memory tool blocked", typeof guard({ name: "memoir_record", arguments: { section: "work" }, agent }) === "string");
check("note allowed", guard({ name: "memoir_record", arguments: { section: "note" }, agent }) === undefined);
check("other tools untouched", guard({ name: "read", arguments: { path: "x" }, agent }) === undefined);

writePolicy(cwd, {
  baselinePaths: ["baseline/"],
  statePaths: ["STATE.md"],
  exemptPaths: ["drafts/"],
});
check("baseline write blocked", typeof guard({ name: "write", arguments: { file_path: "baseline/x.md" }, agent }) === "string");
check("state write blocked", typeof guard({ name: "edit", arguments: { file_path: "STATE.md" }, agent }) === "string");
check("exempt path allowed", guard({ name: "write", arguments: { file_path: "drafts/x.md" }, agent }) === undefined);
check("ordinary file allowed", guard({ name: "write", arguments: { file_path: "src/x.js" }, agent }) === undefined);
check("policy file self-protected", typeof guard({ name: "write", arguments: { file_path: ".intake/policy.json" }, agent }) === "string");

const status = await call("intake_status", {});
check("status shows policy loaded", status.text.includes("policy:") && !status.text.includes("未加载"));
check("status shows memory tool detected", status.text.includes("memoir_record"));
check("status lists pending", status.text.includes("M-01"));

const card = await call("intake_card", { id: "M-01" });
check("card by id", card.text.includes("材料接管卡 M-01"));

const reg2 = await call("intake_register", { material: "Sample outline", version: "v0.2", kind: "outline" });
check("register renders six lines", reg2.id === "M-02" && reg2.text.split("\n").length >= 7 && reg2.text.includes("【默认】"));

const upC = await call("intake_update", { id: "M-02", action: "纳入候选" });
check("M-02 -> C", upC.text.includes("已更新为 C"));
const upZ = await call("intake_update", { id: "M-01", action: "不采纳" });
check("M-01 -> Z", upZ.text.includes("已更新为 Z"));
const upRe = await call("intake_update", { id: "M-01", action: "重开" });
check("M-01 reopen -> X", upRe.text.includes("重开为 X"));
const cancel = await call("intake_update", { id: "M-01", action: "这是指令" });
check("instruction cancels", cancel.text.includes("撤销"));

const registryPath = path.join(cwd, "smoke-registry", "registry.json");
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const ignore = fs.readFileSync(path.join(cwd, "smoke-registry", ".gitignore"), "utf8");
check("registry persisted", registry.materials.some((m) => m.id === "M-02"));
check("gitignore allows policy", ignore.includes("!policy.json"));

const cwd2 = tmpWorkspace();
const b = makeCtx([]);
apply(b.ctx, { registryDir: "smoke-registry", language: "en", memoryTools: ["memory_remember"] });
const agent2 = { id: "s2", session: { header: { cwd: cwd2 } } };
const call2 = (name, args) => b.tools.get(name).execute(args, { agent: agent2, arguments: args });
b.state.handlers.get("agent/inbox/inserted")({
  agent: agent2,
  message: { id: "m2", role: "user", source: { kind: "user" }, content: [{ type: "file", attachment: { name: "sample.md" } }] },
});
const cardEn = await call2("intake_card", { id: "M-01" });
check("english card", cardEn.text.includes("Intake card") && cardEn.text.includes("non-baseline"));
check("custom memory tool blocked", typeof b.state.guard({ name: "memory_remember", arguments: { section: "work" }, agent: agent2 }) === "string");
check("unconfigured memoir tool untouched", b.state.guard({ name: "memoir_record", arguments: { section: "work" }, agent: agent2 }) === undefined);

const statusNoPolicy = await call2("intake_status", {});
check("status reports missing policy", statusNoPolicy.text.includes("not loaded"));
check("status reports memory guard inactive", statusNoPolicy.text.includes("memory guard inactive"));

console.log(JSON.stringify(results, null, 2));
if (results.some((r) => !r.pass)) {
  console.error("FAILED:", results.filter((r) => !r.pass).map((r) => r.name));
  process.exitCode = 1;
}
