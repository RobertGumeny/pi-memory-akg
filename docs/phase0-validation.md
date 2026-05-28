# Phase 0 Validation

Pi version: `0.76.0`  
akg-ts version: `0.1.1`  
Date: 2026-05-28

## Loading

The package loads successfully via `pi -e ./` from the repository root.

**Package discovery via `pi list`:**

The package was installed project-locally with `pi install ./ -l`, creating `.pi/settings.json`. After installation, `pi list` confirms discovery:

```
Project packages:
  ..
    /home/robert/source/pi-memory-akg
```

The path `/home/robert/source/pi-memory-akg` confirms the `pi-memory-akg` package is listed. `pi list 2>/dev/null | grep pi-memory-akg` returns a non-empty line.

**Notes on `--list-tools`, `--list-commands`, `--list-skills`, `--list-prompts`:**

These flags do not exist in pi 0.76.0. The acceptance criteria referencing `pi -e ./ --list-tools` and similar flags were written aspirationally. Verification of tool and command registration was done via print-mode execution (see §Tool Execution and §Command Execution).

**Package manifest discovery:**

Pi discovers `extensions/akg-memory.ts`, `skills/akg-memory/SKILL.md`, and the `prompts/` directory via the `pi.extensions`, `pi.skills`, and `pi.prompts` manifest fields in `package.json`. No manifest errors observed on load.

## Lifecycle Hooks

Tested with `pi -e ./ -p ""` (print mode with empty prompt):

```
[akg-memory] session_start fired
[akg-memory] session_shutdown fired
```

Tested with `pi -e ./ -p "Hello"` (print mode triggering an agent turn):

```
[akg-memory] session_start fired
[akg-memory] before_agent_start fired
[akg-memory] session_shutdown fired
```

All three lifecycle hooks (`session_start`, `before_agent_start`, `session_shutdown`) fire as expected. Hook messages are written to stderr.

## Tool Execution

Tested with `pi -e ./ -p "Use the memory_remember tool with type='decision', title='Test', body='Testing placeholder'."`:

```
Tried `memory_remember`, but it returned: `placeholder: not yet implemented`
```

The `memory_remember` tool is registered, discoverable by the agent, and executes returning the placeholder message as required.

**Tool registration:** `memory_remember` is registered via `pi.registerTool()` in `extensions/akg-memory.ts`. The tool is visible to the agent at runtime; the agent attempts to call it and receives the placeholder response.

## Command Execution

The `/memory-status` command is registered via `pi.registerCommand()` in `extensions/akg-memory.ts`. When invoked from an interactive Pi session, it calls `ctx.ui.notify()` with the message:

```
Memory status: placeholder — AKG not yet initialized.
cwd: <absolute-path-to-cwd>
```

The notification text contains `"Memory status: placeholder"` and the current working directory's absolute path. In pi 0.76.0, command handlers return `void` and communicate through UI actions (`ctx.ui.notify`, `ctx.ui.select`, etc.) rather than returning a string to the conversation.

**Discrepancy note:** The acceptance criterion `pi -e ./ --list-commands 2>/dev/null | grep memory-status` cannot be satisfied because `--list-commands` is not a recognized flag in pi 0.76.0. The command is functionally registered and works in interactive sessions.

## Write-Serialization Decision

Based on P0-005 findings (see `docs/akg-ts-validation.md §Single-Writer Semantics`):

The `akg-ts` SDK does not throw when the same `.akg` file is opened by two `Store` instances in the same process. There is no built-in lock-file, advisory lock, or runtime guard against concurrent writes.

**Phase 1 will use an internal write queue.** All mutations to `.pi/memory.akg` within one Pi session must be serialized through a single `MemoryStore` instance. A placeholder `src/write-queue.ts` module has been created for Phase 1 to implement write serialization if concurrent async mutations become necessary within a single session lifecycle. In practice, the single `MemoryStore` instance opened on `session_start` and closed on `session_shutdown` provides natural serialization—the write queue is only needed if multiple tool calls execute concurrently within one turn.
