---
status: decision
topic: tauri-specta-command-bindings
supersedes: 008-command-names-artifact
---

# Generate Tauri Command Bindings With tauri-specta

## Context

The old IPC contract was repeated across Rust command signatures, `ts-rs` DTO exports, a generated command-name artifact, and a handwritten TypeScript command map. That let command payload fields drift even when the name list remained complete.

## Decision

Rust Tauri commands are the only IPC schema. `tauri-specta = "=2.0.0-rc.25"`, `specta = "=2.0.0-rc.25"`, and `specta-typescript = "=0.0.12"` are pinned exactly; the release-candidate risk is accepted to support Tauri 2 without a second generator. One Specta builder registers the Tauri invoke handler and exports `src/types/generated/commands.ts`, including both DTO types and typed command functions.

The native frontend adapter uses those generated functions. Browser Preview is a second adapter implementing the generated command interface; it does not preserve a handwritten command-name or payload registry. Binding generation is mandatory for check, test, build, and prebuild validation, and a generation failure must leave the previous generated directory intact and fail the invoking command.

## Rejected Alternatives

- Keep `ts-rs` as a fallback. This would preserve two schema generators and make drift possible again.
- Keep the command-name artifact or handwritten `TauriCommandMap`. Names alone cannot verify argument or result shapes.
- Generate only DTO types and continue calling `invoke` manually. That would still duplicate command strings and payload construction in TypeScript.
- Make Preview branch inside feature modules. Runtime selection belongs at one adapter boundary so feature workflows have one command interface.

## Consequences

The project accepts an exactly pinned release candidate and must deliberately upgrade the three Specta packages together. Generated bindings are a single replaceable artifact and are never hand-edited. Commands require Specta metadata and all IPC DTOs require `specta::Type`. ADR-008 is superseded because there is no longer a separate command-name artifact.
