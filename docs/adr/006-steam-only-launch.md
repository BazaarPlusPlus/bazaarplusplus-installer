---
status: decision
topic: steam-only-launch
---

# Steam-Only Launch

## Context

The installer previously had a second launch flow so users who ran The Bazaar through the native
**Tempo Launcher** (no Steam) could still install and launch the mod.
It worked by a capture/replay dance: back up and temporarily remove the mod payload, start Tempo,
let the user click PLAY, capture the vanilla game process's command line, terminate it, restore the
payload, and relaunch the modded game with the captured arguments. That lived in a ~1,200-line
`services/tempo.rs` (process discovery, platform-specific termination, backup/restore with orphan
recovery, in-flight/cancel atomics) plus a `LaunchFlow` resolver, a `launch_flow` field on
`InstallState`, a `cancel_tempo_launch` command, and Tempo status/error UI and i18n.

## Decision

Remove Tempo native launch entirely and make the installer **Steam-only**. Detection resolves Steam
copies only; a non-Steam (Tempo) copy is simply "game not found". `launch_game` takes no arguments
and opens `steam://rungameid/1617400` directly.

Reasons (recorded per the reversal):

1. **Strategic shift to Steam-only.** Product direction narrowed to Steam.
2. **Maintenance burden.** The capture/replay implementation (process capture, platform
   differences, backup/restore, concurrency guards, orphan recovery) was large and fragile
   relative to the size of the non-Steam user segment.
3. **Tempo deprecation.** The Tempo Launcher adaptation had lost its reason to exist.

## Rejected Alternatives

- **Keep Tempo but only fix the fragile parts.** Rejected: the whole flow, not just its bugs, was
  the cost; the user segment did not justify keeping it.
- **Keep the `LaunchFlow` abstraction with a single `Steam` variant.** Rejected as speculative
  (YAGNI) — a one-variant enum and a dead `launch_flow` field carry cost with no current use.
- **Detect Tempo copies but block launch with a "Steam required" warning.** Rejected: keeps a
  half-supported path and detection candidates for a segment we no longer serve.

## Consequences

- Native Tempo users are no longer supported; this is a deliberate product cut, not a regression.
- The launch path is a single fixed `steam://` URL — no per-launch detection, no backup/restore, no
  cancellation surface. Launch bugs now only need the detected Steam path and selected game path.
- Because every install is now guaranteed to be a Steam copy under `steamapps`, downstream
  Steam-only work (e.g. deriving `appmanifest_1617400.acf` from the resolved game path) is safe.
