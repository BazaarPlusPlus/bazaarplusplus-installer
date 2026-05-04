# Installer Cohesion And Coupling Refactor Design

> Status: historical refactor design. Several phases are now reflected in the codebase; use `docs/architecture.md` for the current structure before executing any remaining plan.

## Context

The `bazaarplusplus-installer` app has grown organically across installer, identity, stream, and updater domains. Exploration across both the SvelteKit frontend (`src/`) and the Tauri/Rust backend (`src-tauri/src/`) shows the following structural pressure points:

- [src/routes/install/+page.svelte](../../../src/routes/install/+page.svelte) is 1509 lines with 31 top-level imports and owns the orchestration of installer, identity, stream, updater, and post-update flows in one component.
- [src/lib/installer/page-model.ts](../../../src/lib/installer/page-model.ts) (347 lines) exposes one `createInstallPageModel` that mixes i18n labels, updater button state, Steam modal copy, and identity panel copy into a single 40+ field object.
- [src/lib/identity/api.ts](../../../src/lib/identity/api.ts) (391 lines) combines HTTP transport, JSON normalization, WebCrypto key generation, JWT export, and local file I/O. It also reaches back into [src/lib/installer/api.ts](../../../src/lib/installer/api.ts) for installation-record read/write helpers, creating an upward dependency from the identity layer to the installer layer.
- [src-tauri/src/stream/records.rs](../../../src-tauri/src/stream/records.rs) (970 lines) bundles SQLite I/O, image path resolution, overlay row → DTO mapping, and hardcoded Steam library fallback paths in one module.
- [src-tauri/src/commands/detect.rs](../../../src-tauri/src/commands/detect.rs) (624 lines) mixes Windows registry access, VDF parsing, .NET runtime probing, and game-path validation.
- [src-tauri/src/commands/bepinex.rs](../../../src-tauri/src/commands/bepinex.rs) (675 lines) combines ZIP archive extraction, file layout knowledge, version comparison, and the install/repair/uninstall Tauri commands.
- Cross-boundary types are duplicated by hand: backend structs declared inline in each command file on the Rust side, and a hand-written [src/lib/types.ts](../../../src/lib/types.ts) on the frontend side, with no type-safe `invoke()` contract (every call is a string literal such as `invoke('detect_environment')`).
- API hosts, Steam library fallback paths, the Steam Bazaar URL, the Bilibili page URL, and the .NET download URLs are hardcoded across multiple frontend and backend files.

These issues are not defects in the current behavior. They are structural costs that slow down every future change: any UI restructure requires coordinating three domains, and any backend command rename or field change can silently drift between Rust and TypeScript.

The goal of this refactor is to raise cohesion inside each module and lower coupling across modules without changing any user-facing behavior.

## Goals

- Decompose `install/+page.svelte` so the page file becomes a thin composition layer that wires controllers to components. The business logic of each domain lives in its own testable controller/store.
- Replace the single `createInstallPageModel` god-object with a set of focused selectors that can be composed by the page.
- Restructure `src/lib/identity/` so transport, crypto, normalization, repository, and use-case layers each live in their own file, and remove the reverse dependency from `identity/api.ts` back into `installer/api.ts`.
- Split `stream/records.rs`, `commands/detect.rs`, and `commands/bepinex.rs` into focused Rust submodules, each with a single reason to change.
- Introduce a single source of truth for Tauri command types shared between Rust and TypeScript, and a type-safe `invoke()` wrapper on the frontend.
- Centralize hardcoded hosts, URLs, and Steam library fallback paths.
- Preserve the existing test seams in [src/lib/installer/*.test.ts](../../../src/lib/installer/) and [src/lib/identity/*.test.ts](../../../src/lib/identity/), and add new unit tests for the extracted modules.

## Non-Goals

- No user-facing behavior changes. The installer, identity binding, updater, and stream flows must look and act the same.
- No changes to the SQLite schema, overlay HTTP contract, or `/overlay` URL stability.
- No dependency upgrades beyond those strictly required to enable Rust↔TS type generation.
- No introduction of a new state management library. Existing Svelte 5 runes/stores and plain modules are enough.
- No rewrite of the Tauri command surface. Command names and payloads stay stable through the refactor; only their internal implementations move.
- No attempt to unify `stream` and `installer` domains. They remain two separate top-level areas.

## Recommended Approach

Do the refactor in five phases ordered by risk/reward. Each phase produces working, testable software on its own and must land behind its own PR with `npm run check` passing and relevant unit tests green.

1. **Backend module splits** (low risk, pure Rust) — lands first because it has strong compiler checks and existing test coverage under `src-tauri/src/stream/` is mostly pure functions.
2. **Identity layer restructure** (contained within `src/lib/identity/`) — well-isolated, already has a DI seam.
3. **Page-model selector decomposition** (contained within `src/lib/installer/`) — depends on identity phase for types.
4. **`+page.svelte` controller extraction** — the biggest code move, but now safe because the layers below are already structured.
5. **Typed command bridge + config centralization** — last because it requires the surface area to be stable before generation.

Each phase MUST land separately. Do not bundle phases.

Alternatives considered and rejected:

- **One big-bang refactor PR:** rejected because regression risk is high and review is infeasible for a >2000-line diff across Rust and Svelte.
- **Introduce a frontend state management library (e.g. Redux/Zustand port):** rejected, Svelte 5 runes and plain module stores already express the needs; new dependencies add coupling rather than reducing it.
- **Keep hand-written TS types and skip `tauri-specta` / `ts-rs`:** rejected, the current duplication is a recurring cost that a one-time generation setup amortizes.
- **Collapse `installer/` and `identity/` into one domain:** rejected, they have genuinely different lifecycles (installer runs once, identity runs per game session) and different persistence surfaces.

## Architecture

### Phase 1 — Backend module splits

#### 1.1 `stream/records.rs` → `stream/records/`

Convert `src-tauri/src/stream/records.rs` from a single 970-line file into a module directory:

- `stream/records/mod.rs` — public facade: re-export `OverlayRecord`, `OverlayRecordRepository`, `resolve_database_path`.
- `stream/records/repo.rs` — `OverlayRecordRow`, `load_latest_overlay_record`, `load_overlay_record_count`, `load_overlay_record_list`, `load_overlay_record_by_id`, `table_exists`. Pure SQLite; takes `&Path` inputs, returns rows.
- `stream/records/image.rs` — `resolve_overlay_image_path`, `normalized_relative_image_path`. Pure path functions, easy to unit test with `tempfile`.
- `stream/records/mapper.rs` — `OverlayRecordRow → OverlayRecord` translation, including the subtitle rule. No I/O.
- `stream/records/locator.rs` — `resolve_database_path` and `find_database_path_anywhere`. Steam library fallback candidates move here.
- `stream/records/repository.rs` — `OverlayRecordRepository` impl that composes the above. The facade that Tauri commands use.

Delete the hardcoded Steam-library candidate array in `find_database_path_anywhere` by having `locator.rs` import the shared Steam library discovery from `commands/detect/steam.rs` (Phase 1.2).

#### 1.2 `commands/detect.rs` → `commands/detect/`

Split `src-tauri/src/commands/detect.rs` by concern:

- `commands/detect/mod.rs` — Tauri command entry points only: `detect_environment`, `detect_dotnet_runtime`, `verify_game_path`. No business logic.
- `commands/detect/steam.rs` — Windows registry reads and Steam library discovery, including the candidate path list currently duplicated in `records.rs`.
- `commands/detect/dotnet.rs` — .NET runtime probing.
- `commands/detect/game.rs` — Bazaar path validation, BepinEx presence checks, BPP data directory inspection. (Note: distinct from existing `commands/game.rs` which handles running-process detection; rename the latter to `commands/game_process.rs` as part of this phase to avoid ambiguity.)

Public API stays identical — `use` re-exports in `mod.rs` keep `commands::detect::{detect_environment, ...}` valid at the top-level `lib.rs`.

#### 1.3 `commands/bepinex.rs` → `commands/bepinex/`

Split by layer:

- `commands/bepinex/mod.rs` — Tauri commands: `install_bepinex`, `repair_bpp`, `uninstall_bpp`, `get_legacy_record_directory_info`.
- `commands/bepinex/archive.rs` — ZIP extraction helpers, temp directory handling.
- `commands/bepinex/layout.rs` — Filesystem layout constants (BepinEx directory names, plugin directory paths) and path computations.
- `commands/bepinex/version.rs` — Version comparison between bundled and installed BPP.

### Phase 2 — Identity layer restructure

`src/lib/identity/api.ts` is split into focused files inside `src/lib/identity/`:

- `identity/transport.ts` — `postJsonWithFetch`, `readJsonOrError`, `IdentityTransportResponse` type. Pure HTTP.
- `identity/crypto.ts` — `generateInstallationKeyPair`, `exportPrivateKeyToJwk`. Pure WebCrypto.
- `identity/normalize.ts` — `normalizePlayerObservation`, `normalizeInstallationRecord`, `isRecord`, `isNonEmptyString`. No I/O.
- `identity/repository.ts` — `readPlayerObservation`, `readInstallationRecord`, `readInstallationPrivateKey`, `writeInstallationRecord`, `writeInstallationPrivateKey`. These currently live in `installer/api.ts`; move them here. Keep shim re-exports in `installer/api.ts` only if Phase 5 has not yet landed — once the typed bridge is in place, shims go away.
- `identity/api.ts` — becomes the use-case layer: `createIdentityApi` factory exposing `loadLocalIdentity`, `activateFirstAccount`, `loginAndCreateInstallation`. Internally composes the four modules above through the existing `IdentityApiDeps` DI surface.

Result: the reverse dependency from `identity/` to `installer/api.ts` is removed. Identity becomes a self-contained domain.

`src/lib/identity/api.test.ts` needs small updates to import the new file layout; the behavioral assertions stay identical.

### Phase 3 — Page-model selector decomposition

Replace the single `createInstallPageModel` function in [src/lib/installer/page-model.ts](../../../src/lib/installer/page-model.ts) with a set of focused selectors. Each selector takes the minimum input it needs and returns the minimum output its consumer needs.

- `installer/selectors/install-gates.ts` — `selectPageState`, `selectHasPath`, `selectIsBusy`, `selectCanInstall`, `selectCanLaunchGame`, `selectVersionMismatch`. Input: env + custom path + action busy.
- `installer/selectors/updater-button.ts` — `selectUpdaterButton({ snapshot, hasPendingUpdate, t })` → `{ label, title, disabled, highlighted, progressLabel }`.
- `installer/selectors/identity-panel.ts` — `selectIdentityPanel({ identityState, identityLoadState, localized })` → `{ title, summary, shouldCollapse }`.
- `installer/selectors/steam-modal.ts` — `selectSteamModal({ pendingSteamAction, t })` → `{ title, body, cancelText }`.
- `installer/selectors/mode-labels.ts` — `selectModeLabels({ showStreamMode, locale, t, localized })` → `{ modeTitle, modeToggleLabel, localeBadge, localeButtonLabel, dotnetDownloadUrl }`.
- `installer/selectors/identity-gates.ts` — `selectIdentityGates({ identityState, pageState, input })` → `{ activationPasswordMatches, identityBusy, canActivateObservedAccount, canLoginIdentity }`.

Keep `createInstallPageModel` as a thin composition function for one release cycle so consumers migrate incrementally. Remove it at the end of Phase 4 when `+page.svelte` composes selectors directly.

`formatIdentityErrorMessage`, `formatByteLabel`, and `createInstallDebugEnvironment` are already pure and stay where they are — they are cohesive helpers, not god-object symptoms.

### Phase 4 — `+page.svelte` controller extraction

Extract three controllers from [src/routes/install/+page.svelte](../../../src/routes/install/+page.svelte). Each controller is a plain TypeScript module exposing reactive state (Svelte 5 runes via `$state`/`$derived` where appropriate) and methods. Each is unit-testable without mounting a Svelte component.

- `src/lib/installer/controllers/install-controller.ts` — owns: `env`, `dotnetState`, `bazaarFound`, `bazaarChecking`, `bazaarInvalid`, `customGamePath`, `actionBusy`, all install/repair/uninstall/verify calls, install-related modal booleans (`showInstallModal`, `showRepairModal`, `showLaunchOptionsWarningModal`, `showSteamQuitModal`), and the `InstallRuntimeRisk` gating.
- `src/lib/installer/controllers/identity-controller.ts` — owns: `playerObservation`, `installationRecord`, `hasInstallationPrivateKey`, `identityLoadState`, `identityActionBusy`, `identityPassword*`, `identityConfirmed`, plus the `activateInstallIdentity` / `reloginInstallIdentity` / `loadInstallIdentitySnapshot` wrappers. Consumes the existing [src/lib/installer/identity-flow.ts](../../../src/lib/installer/identity-flow.ts) rather than duplicating it.
- `src/lib/installer/controllers/updater-controller.ts` — owns: `updaterSnapshot`, `hasPendingUpdate`, `runStartupUpdaterCheck`, `downloadPendingUpdate`, `maybeOpenWhatsNewAfterAutoUpdate`, and the updater-related modals. Consumes [src/lib/installer/updater-flow.ts](../../../src/lib/installer/updater-flow.ts).

`+page.svelte` becomes a thin assembly: instantiate the three controllers, feed their reactive state into selectors (Phase 3), pass derived view-models into the existing components ([InstallerHeader.svelte](../../../src/lib/components/installer/InstallerHeader.svelte), [InstallerStatusSteps.svelte](../../../src/lib/components/installer/InstallerStatusSteps.svelte), [InstallerInstallPreviewModal.svelte](../../../src/lib/components/installer/InstallerInstallPreviewModal.svelte), etc.). Stream-mode logic moves into a `stream-controller.ts` sibling but is strictly optional for this phase — if stream usage is already encapsulated in [src/lib/stream/](../../../src/lib/stream/), it can stay as-is and be referenced directly.

Target final size for `+page.svelte`: under 400 lines, with the `<script>` block under 200 lines. If it does not come under 400 lines at the end of Phase 4, the controllers are not fine-grained enough and the phase is not done.

### Phase 5 — Typed command bridge and config centralization

#### 5.1 Rust-generated TypeScript types

Add the [`specta`](https://github.com/oscartbeaumont/specta) + [`tauri-specta`](https://github.com/oscartbeaumont/tauri-specta) crate pair to `src-tauri/Cargo.toml` (dev-only feature gated by `specta` feature flag) to generate a `src/lib/generated/commands.ts` file at build time from the existing `#[tauri::command]` functions and their `#[derive(Serialize, Deserialize)]` structs.

If `tauri-specta` generation proves too invasive, fall back to `ts-rs` with explicit `#[derive(TS)]` annotations on the shared structs only (`EnvironmentInfo`, `DotnetInfo`, `StreamRecordSummary`, etc.). Do not write the generated file to git — generate it as part of `vite dev`/`vite build` via a prebuild hook in `scripts/generate-bindings.mjs`.

Migrate [src/lib/types.ts](../../../src/lib/types.ts) to re-export from `src/lib/generated/commands.ts`. Any field discrepancy becomes a TypeScript compile error on `npm run check`.

#### 5.2 Typed `invoke()` wrapper

Introduce `src/lib/bridge/commands.ts`:

```ts
// Conceptual sketch only — see Phase 5 plan for full implementation.
import { invoke } from '@tauri-apps/api/core';
import type { Commands } from '$lib/generated/commands';

export async function call<K extends keyof Commands>(
  name: K,
  payload: Commands[K]['input']
): Promise<Commands[K]['output']> {
  return invoke<Commands[K]['output']>(name, payload as Record<string, unknown>);
}
```

Migrate [src/lib/installer/api.ts](../../../src/lib/installer/api.ts), [src/lib/identity/repository.ts](../../../src/lib/identity/repository.ts) (from Phase 2), and [src/lib/stream/api.ts](../../../src/lib/stream/api.ts) to use `call(...)` instead of raw `invoke(...)`. Removing or renaming a backend command now produces a compile error on the exact call site.

#### 5.3 Config centralization

- `src/lib/config/endpoints.ts` — exports `V3_API_BASE_URL` (replacing `DEFAULT_V3_API_BASE_URL` in `identity/api.ts`), `STEAM_BAZAAR_URL`, `BILIBILI_URL`, `DOTNET_DOWNLOAD_URLS` (replaces the inline `locale === 'zh' ? ...` ternary in `page-model.ts`).
- `src-tauri/src/config.rs` — exports `STEAM_LIBRARY_FALLBACK_CANDIDATES: &[&str]`, `BAZAAR_DATA_DIRECTORY: &str = "BazaarPlusPlus"`, `DATABASE_FILE_NAME: &str = "bazaarplusplus.db"`, `SCREENSHOTS_DIRECTORY: &str = "Screenshots"`. Consumed by `stream/records/locator.rs`, `stream/records/image.rs`, and `commands/detect/steam.rs`.

## Dependencies Between Phases

- Phase 2 (identity) does not depend on Phase 1 and can run in parallel if someone is available.
- Phase 3 (selectors) depends on Phase 2 only for the `IdentityState` import path — if Phase 2 lands first, Phase 3 imports from the new location; otherwise imports stay as-is and update in Phase 2.
- Phase 4 (`+page.svelte`) depends on both Phase 2 and Phase 3. Do not start Phase 4 before both land.
- Phase 5 (typed bridge) depends on Phase 2 because `identity/repository.ts` is a new migration target. It also depends on Phase 4 to avoid touching `+page.svelte` twice.

## Risks

- **Rust module split churn creates merge conflicts.** Mitigation: land Phase 1 in small sub-PRs (1.1, 1.2, 1.3) and merge within a single week. Do not leave split half-done across a release.
- **`tauri-specta` incompatibility with Tauri 2.10.** Mitigation: Phase 5.1 gate — if `tauri-specta` is not compatible with the pinned Tauri version by the time Phase 5 starts, fall back to `ts-rs`. If both fail, keep the hand-written `types.ts` and still do Phase 5.2 (typed wrapper over string-literal command names), which captures most of the drift risk.
- **Svelte 5 runes in controller modules outside `.svelte` files.** Mitigation: verify that `$state` / `$derived` work inside `.svelte.ts` files under Svelte 5.55. If not, use plain writable stores from `svelte/store` instead — the interface stays the same.
- **Behavior drift during `+page.svelte` extraction.** Mitigation: before starting Phase 4, write an end-to-end smoke script in `scripts/` that drives the main install happy-path via `tauri dev` (detect → install → patch launch options → activate identity). Run it before and after Phase 4.
- **Silent removal of an edge case when collapsing inlined conditionals in `page-model.ts`.** Mitigation: Phase 3 lands with expanded unit tests for each selector that snapshot the exact outputs the old `createInstallPageModel` produced for a matrix of inputs. Tests go in `src/lib/installer/selectors/*.test.ts`.

## Verification

Per the project rules in [CLAUDE.md](../../../CLAUDE.md), verification is proportional to the change. For this refactor:

- Every phase MUST run `npm run check` before PR open.
- Phases 2, 3, 4 MUST run `node --test` over the full `src/` test suite (existing tests under `src/lib/installer/*.test.ts`, `src/lib/identity/*.test.ts`, `src/lib/stream/*.test.ts`).
- Phase 1 MUST run `cargo test` under `src-tauri/`.
- Phase 5 MUST run `npm run prebuild-check` because it changes what is bundled and how type generation feeds the build.
- Release packaging (`./build.sh --prod`) is NOT required per phase. It runs once before the first release that contains any of these phases, in line with the project rule that reserves full builds for packaging-impacting changes.

Each phase's PR body MUST include a `Release Notes:` section with `- N/A` (no user-facing change) unless a phase happens to also fix a latent bug, in which case `- Fixed …`.

## Out of Scope and Deferred

The following were noted during analysis but deliberately deferred. Each can become its own spec later.

- Consolidating `stream::http.rs` and `stream::records.rs` shared image URL logic further once Phase 1.1 lands. This requires deciding whether HTTP-facing URL generation belongs inside the repository or in `server.rs`.
- Moving `+page.svelte` stream-mode sections into a dedicated `stream-controller.ts` (mentioned under Phase 4 as optional). Do this only if stream features continue to grow.
- Generating strongly-typed overlay HTTP contracts shared between `src-tauri/resources/stream/overlay.js` and the backend. This is governed by [2026-04-15-stream-battle-list-and-overlay-unification-design.md](2026-04-15-stream-battle-list-and-overlay-unification-design.md) and should not be bundled into this refactor.
- Replacing `keyvalues-parser` VDF handling with a typed wrapper. VDF is a single-concern, already-cohesive module; changes would be motivated by VDF format needs, not cohesion/coupling.

## Follow-Up Plans

After this spec is accepted, each phase becomes its own implementation plan under `docs/superpowers/plans/`:

- `YYYY-MM-DD-installer-phase-1-backend-module-splits.md`
- `YYYY-MM-DD-installer-phase-2-identity-restructure.md`
- `YYYY-MM-DD-installer-phase-3-page-model-selectors.md`
- `YYYY-MM-DD-installer-phase-4-install-page-controllers.md`
- `YYYY-MM-DD-installer-phase-5-typed-bridge-and-config.md`

Each plan follows the standard TDD-step format with exact file paths, test code, and commit points.
