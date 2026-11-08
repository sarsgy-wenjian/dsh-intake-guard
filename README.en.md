# dsh-intake-guard · material intake gate

> A material intake gate for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH). Anything newly handed in defaults to **external, non-baseline material** and is handled in two tiers:
> **Document (X)** gets a six-line intake card and a hard write guard; **Context (Q)** (screenshots, video, code/config used in a question) gets a one-line marker and a soft warning only.
>
> Local only, no network, never edits baseline files.

## Problem it solves

"Here, take a look" → the model treats the material as fact → the discussion drifts and the baseline gets polluted. The root cause is that incoming material has **no identity** at the door. But showing a full six-line card for every screenshot or code snippet used in Q&A is too noisy — hence two tiers.

## Two tiers

| Tier | Typical material | User-visible | Guard |
|---|---|---|---|
| **X document** | outline, spec, draft, long text, PDF/DOCX, path/link | **six-line intake card** | memory writes + authority-path writes (hard block) |
| **Q context** | screenshot, video, code/config (.json/.js/.py) | **one-line marker** | soft warning only; expires with the session |

### Six-line card (X)

```
【Intake card M-01】
1. Material: Sample outline v0.1 (outline)
2. Identity: external · non-baseline · state X · 2026-11-08 [default]
3. Source: user provided · 2026-11-08 · <path/no path>
4. Purpose: read-only understanding (baseline unchanged) [default]
5. I will not: merge into baseline, write to project memory, or cite as authority
6. Output & upgrade: conflict candidates + additions + questions | "candidate" / "baseline" / "hold"; "close" if not needed; "instruction" if this is an instruction
```

### One-line marker (Q)

```
M-08 · code .json · non-baseline, context only
```

Say "promote" to turn Q into X (card + hard guard).

## States and actions

| State | Meaning | Hard guard |
|---|---|---|
| `Q` | question context | no (soft) |
| `X` | external material (unadopted) | yes |
| `H` | parked | yes |
| `C` | candidate (not baseline) | no |
| `B` | baseline | no |
| `Z` | closed (not adopted; audit row kept) | no |

Actions: **candidate / baseline / hold / close**; **promote** (Q→X), **demote** (X/H→Q), **instruction** (cancel), **reopen** (Z→X).

"baseline" only marks state B and reminds about the change gate; the plugin never edits baseline files.

## Tools

| Tool | Purpose |
|---|---|
| `intake_register` | register material; `tier=document` (default) card, `tier=context` one-line marker |
| `intake_card` | render the card by ID; Q returns the marker |
| `intake_list` | list materials and states |
| `intake_update` | change state / promote / demote / cancel / reopen |
| `intake_status` | policy, protected paths, memory/write tools, pending/context material, classifier defaults |

## Classifier (intent → content → type)

1. **Intent**: outline/spec/draft/material words → X; error/why/how/format words → Q.
2. **Type**: image/video/audio → Q; code/config extensions → Q; PDF/DOCX/PPTX/XLSX → X.
3. **.md/.txt**: code fences/stack traces → Q; long prose with headings → X; otherwise `textDefault`.
4. **Unknown extension**: no words → X (conservative); question cues → Q.
5. **User override**: promote/demote at any time.

## Project policy: `.intake/policy.json`

The plugin never guesses authority paths or classifier defaults — the project declares them:

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

`.intake/policy.json` protects itself.

## Configuration

```yaml
- insert:
    - id: 'intake-guard'
      name: 'dsh-intake-guard'
      config:
        language: en
        pasteThreshold: 500
        policyPath: ''
        registryDir: ''
        memoryTools: [memoir_record]
        blockSections: [work, lessons, actions]
        allowSections: [note]
        writeTools: [write, edit]
        textDefault: document
        lightExtensions: []
        documentExtensions: []
```

## Install

```bash
dsh plugin --profile desktop add github:sarsgy-wenjian/dsh-intake-guard
# local link:
dsh plugin --profile desktop add link:/path/to/dsh-intake-guard
```

Toggle the row (disable→enable) or restart after editing plugin code.

## Data & privacy

- Registry: `<workspace>/.intake/registry.json` (auto `.gitignore`);
- Policy: `<workspace>/.intake/policy.json` (committed with the project);
- Q context material lives in session memory only, never persisted; no network, no telemetry.

## Compatibility and limits

- **No memory plugin required**; `intake_status` reports whether memory interception is active.
- Files the model reads by itself are not material; detection is heuristic and one word corrects it.
- The guard covers direct tool calls; writes inside shell scripts are out of scope.
- Designed to sit alongside team packs such as `dsh-wenjian-team` without modifying them.

## Development

```bash
node --check lib/index.js
node test/smoke.mjs
```

## Feedback & mirror

- **Issues** (preferred): https://github.com/sarsgy-wenjian/dsh-intake-guard/issues
- **China mirror**: https://gitee.com/the-color-of-the-night-sky/dsh-intake-guard (may lag; GitHub is canonical)
- **Email**: sarsgy01@outlook.com
- **Improvements welcome**: MIT; fork/PR, or send the change + verification notes via Issue/email.
- Please do not paste private manuscript text, keys, or personal data; a minimal reproduction is enough.

## Maintaining

See [`MAINTAINING.md`](MAINTAINING.md).

## License

MIT
