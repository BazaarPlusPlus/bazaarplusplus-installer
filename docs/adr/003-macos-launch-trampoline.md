---
status: decision
topic: macos-launch-trampoline
---

# macOS Launch Trampoline

## Context

Steam must launch The Bazaar's application bundle directly. A launch bootstrap placed in Steam `LaunchOptions` is not a reliable macOS process boundary, while BepInEx still needs Doorstop environment variables and JIT entitlements before Unity starts. The installer therefore needs one deterministic, inspectable bootstrap inside the game bundle.

Steam LaunchOptions are user-editable, account-scoped configuration. The installer cannot safely classify arbitrary strings by provenance. Readiness must depend on a structural invariant instead of recognizing specific command text.

## Decision

macOS uses the in-bundle Mach-O trampoline as its only installation and launch bootstrap on every supported macOS version. The real Unity executable is preserved as `.orig`; the bundled trampoline becomes `CFBundleExecutable`, establishes the Doorstop environment, and executes the preserved binary. The installer signs and verifies the resulting bundle and compares the installed stub byte-for-byte with the bundled resource.

The Bazaar's Steam LaunchOptions must be empty across every numeric Steam account. Any non-empty direct value is dirty, regardless of content, and Install or Repair removes the whole property after closing Steam. Unreadable or malformed Steam configuration blocks mutation rather than being treated as clean.

The payload contains `libdoorstop.dylib` but no launcher script or trampoline source. The fixed filenames `run_bepinex.sh`, `bpp_launcher.c`, and `.bpp-launch-mode` are non-canonical residue: repair deletes them by name without reading, parsing, or using them to infer state.

## Rejected Alternatives

- Bootstrap through Steam LaunchOptions. It depends on Steam executing an external prefix before the application bundle and makes correctness depend on mutable command text.
- Support multiple macOS bootstrap choices. It multiplies state, recovery paths, UI controls, and release payloads without adding a supported product behavior.
- Infer or preserve selected LaunchOptions fragments. Arbitrary user content has no reliable ownership boundary; the only deterministic invariant is an empty property.
- Accept any structurally valid trampoline. The bundle must converge to the exact signed stub shipped by the current installer so upgrades and repairs have one final state.
- Mutate when Steam configuration cannot be inspected. A partial install would make readiness unverifiable and recovery ambiguous.

## Consequences

Install and Repair converge to one ordered macOS state: Steam stopped, current payload present, current trampoline installed, LaunchOptions empty, and non-canonical residue absent. The UI exposes no compatibility control or mode status. Steam Verify, game updates, manual LaunchOptions edits, and stub updates make `ready` false and route the existing primary action to Repair.
