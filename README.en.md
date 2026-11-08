# dsh-intake-guard · material intake gate

> A material intake gate for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). When a user hands in an undecided external document (outline, spec, idea, screenshot…) or drops a path/link, the plugin registers it as **external, non-baseline material**, requires a six-line **intake card**, and blocks writes to the project's declared **authority paths** and project memory until the material is adopted.
>
> Local only, no network, never edits baseline files.

## Problem it solves

"Here, take a look" → the model treats the material as fact → the discussion drifts and the baseline gets polluted. The root cause is that incoming material has **no identity** at the door. The plugin does three things:

1. **Detect**: attachment / image / path / link / document block ≥ threshold → register as material with state `X`.
2. **Render**: a fixed six-line intake card (identity, source, purpose, prohibitions, output & upgrade).
3. **Guard**: while `X`/`H` material exists in the session, memory-write tools and write tools targeting authority paths are denied; `note` (pointer only) is allowed.

## The six lines

```
【Intake card M-01】
1. Material: Sample outline v0.1 (outline)
2. Identity: external · non-baseline · state X · 2026-11-08 [default]
3. Source: user provided · 2026-11-08 · <path/no path>
4. Purpose: read-only understanding (baseline unchanged) [default]
5. I will not: merge into baseline, write to project memory, or cite as authority
6. Output & upgrade: conflict candidates + additions + questions | "candidate" / "baseline" / "hold"; "close" if not needed; "instruction" if this is an instruction
```

## States and actions

| State | Meaning | Guarded |
|---|---|---|
| `X` | external material (default, unadopted) | yes |
| `H` | parked | yes |
| `C` | candidate (still not baseline) | no |
| `B` | baseline | no |
| `Z` | closed (not adopted; audit row kept) | no |

Actions: **candidate / baseline / hold / close**; correction word **instruction** (cancel a mistaken registration); **reopen** (Z→X).

"baseline" only marks state B and reminds about the change gate (decision + conflict record + backup); the plugin never edits baseline files.

## Tools

| Tool | Purpose |
|---|---|
| `intake_register` | register material, return the six-line card |
| `intake_card` | render the card for one ID |
| `intake_list` | list materials and states |
| `intake_update` | change state (candidate/baseline/hold/close/instruction/reopen) |
| `intake_status` | report policy status, protected paths, memory tools, write tools, pending material — and explicitly say when the memory guard is inactive |

## Project policy: `.intake/policy.json`

The plugin never guesses authority paths — the project declares them:

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

- `baselinePaths` / `statePaths`: authority sinks; writes are denied while X/H exists.
- `exemptPaths`: always allowed (material folders, drafts, references).
- `memoryTools`: write-tool names of your memory plugins (default `memoir_record`).
- `.intake/policy.json` protects itself.
- No policy file → file guard reports "not configured"; everything else still works.

## Configuration

```yaml
- insert:
    - id: 'intake-guard'
      name: 'dsh-intake-guard'
      config:
        language: en              # zh | en (card and prompt text)
        pasteThreshold: 500
        policyPath: ''            # default: <workspace>\.intake\policy.json
        registryDir: ''           # default: <workspace>\.intake
        memoryTools: [memoir_record]
        blockSections: [work, lessons, actions]
        allowSections: [note]
        writeTools: [write, edit]
```

## Install

```bash
dsh plugin --profile desktop add github:sarsgy-wenjian/dsh-intake-guard
# or local link:
dsh plugin --profile desktop add link:/path/to/dsh-intake-guard
```

After editing plugin code, toggle the row (disable→enable) or restart.

## Data & privacy

- Registry: `<workspace>/.intake/registry.json` (auto `.gitignore`, not committed by default);
- Policy: `<workspace>/.intake/policy.json` (committed with the project);
- No network, no telemetry, no data collection.

## Compatibility and limits

- **No memory plugin required**: without one, detection/card/registry/states/authority-path protection still work; only memory interception is inactive, and `intake_status` says so.
- Files the model reads by itself are **not** material; normal research is not blocked.
- Detection is heuristic; say "instruction" to cancel a false registration.
- The guard covers direct tool calls; writes performed inside shell scripts are outside its scope.
- Designed to sit alongside team packs such as `dsh-wenjian-team` without modifying them.

## Development

```bash
node --check lib/index.js
node test/smoke.mjs
```

## License

MIT
