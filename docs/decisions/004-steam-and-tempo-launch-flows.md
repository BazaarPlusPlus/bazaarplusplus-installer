---
status: decision
topic: steam-tempo-launch
---

# Steam And Tempo Launch Flows

## Context

The installer supports Steam installs and native Tempo Launcher installs. Steam should remain the zero-change path for Steam copies, but Tempo copies cannot be launched through `steam://`.

## Decision

Choose Steam flow only when Steam is detected and the game path is under `steamapps`; otherwise use Tempo native capture/replay. The resolver is in `src-tauri/src/services/install/mod.rs:177-191`, and launch dispatch is in `src-tauri/src/services/install/mod.rs:199-210`.

## Rejected Alternatives

- Use Steam launch for every install. That fails native Tempo installs and can target the wrong copy when Steam exists on the same machine.
- Use Tempo capture for every install. That would change existing Steam behavior and add unnecessary backup/capture complexity for Steam users.
- Treat a manifest or user setting as the only source of launch flow. The implemented resolver uses detected Steam path plus the actual game path so it follows the selected copy.

## Consequences

Launch bugs must report both detected Steam path and selected game path. Tempo launch needs backup/restore, cancellation, and status-event handling; Steam launch remains the direct URL path.
