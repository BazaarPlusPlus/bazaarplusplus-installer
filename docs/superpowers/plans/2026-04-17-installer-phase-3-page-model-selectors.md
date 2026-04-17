# Installer Phase 3 — Page-Model Selector Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single `createInstallPageModel` god-function in `src/lib/installer/page-model.ts` with a set of focused selector modules under `src/lib/installer/selectors/`, while keeping `createInstallPageModel` as a thin compatibility composition layer for one release cycle.

**Architecture:** Current `src/lib/installer/page-model.ts` (322 lines) mixes installer gating, updater CTA derivation, Steam-risk modal copy, mode-label localization, and identity panel state into one object factory. Phase 3 extracts those derivations into pure selector files grouped by concern. `createInstallPageModel` remains temporarily, but its job shrinks to wiring shared inputs into the new selectors and returning the legacy `InstallPageModel` shape unchanged so `src/routes/install/+page.svelte` can stay untouched until Phase 4.

**Tech Stack:** TypeScript 5.9, SvelteKit 2.55, Svelte 5.55, `node --test --experimental-strip-types` for unit tests, `npm run check` for type validation.

---

## Parent Spec

`docs/superpowers/specs/2026-04-17-installer-cohesion-refactor-design.md` §"Phase 3 — Page-model selector decomposition".

## Baseline (pre-Phase-3 measurements on current branch)

- `src/lib/installer/page-model.ts` — 322 lines
- `src/lib/installer/page-model.test.ts` — 92 lines
- `src/routes/install/+page.svelte` — 1491 lines
- `src/lib/installer/selectors/` — does not exist yet
- `createInstallPageModel(...)` is still consumed directly by `src/routes/install/+page.svelte`
- No typed selector-level tests exist yet; only `page-model.test.ts` covers the combined output

## Scope Boundaries

This phase is intentionally narrow.

- In scope:
  - create `src/lib/installer/selectors/` and move pure derivation logic there
  - update `createInstallPageModel(...)` to compose selectors
  - add selector-level tests and keep legacy `page-model.test.ts`
  - centralize Phase-3-only helper types shared by selectors if needed
- Out of scope:
  - editing `src/routes/install/+page.svelte` beyond import-path or type-only fallout
  - introducing controller modules under `src/lib/installer/controllers/`
  - moving hardcoded URLs into `src/lib/config/`
  - typed Tauri command generation or `invoke()` bridge work

## Target File Structure After Phase 3

- Create `src/lib/installer/selectors/install-gates.ts`
- Create `src/lib/installer/selectors/install-gates.test.ts`
- Create `src/lib/installer/selectors/updater-button.ts`
- Create `src/lib/installer/selectors/updater-button.test.ts`
- Create `src/lib/installer/selectors/identity-panel.ts`
- Create `src/lib/installer/selectors/identity-panel.test.ts`
- Create `src/lib/installer/selectors/steam-modal.ts`
- Create `src/lib/installer/selectors/steam-modal.test.ts`
- Create `src/lib/installer/selectors/mode-labels.ts`
- Create `src/lib/installer/selectors/mode-labels.test.ts`
- Create `src/lib/installer/selectors/identity-gates.ts`
- Create `src/lib/installer/selectors/identity-gates.test.ts`
- Modify `src/lib/installer/page-model.ts`
- Modify `src/lib/installer/page-model.test.ts`

If repeated input/output types become noisy, add one small helper module:

- Optional create `src/lib/installer/selectors/types.ts`

Do not create selectors unrelated to the parent spec. Do not move `formatIdentityErrorMessage`, `formatByteLabel`, or `createInstallDebugEnvironment`; they remain in `page-model.ts`.

## Selector Ownership

| Selector | Responsibility | Inputs | Outputs |
|---|---|---|---|
| `selectInstallGates` | install-page state and install/launch booleans | env, custom path, action busy, debug preview, bazaar found | `selectedPath`, versions, `pageState`, `hasPath`, `isBusy`, `canInstall`, `canLaunchGame`, `versionMismatch`, data-reset flags |
| `selectUpdaterButton` | updater CTA text/state only | updater snapshot, pending-update flag, `t` | `progressLabel`, `label`, `title`, `disabled`, `highlighted` |
| `selectIdentityPanel` | identity summary panel | `identityState`, localized helper | `title`, `summary`, `shouldCollapse` |
| `selectSteamModal` | Steam quit modal copy | `pendingSteamAction`, `t` | `title`, `body`, `cancelText` |
| `selectModeLabels` | install-vs-stream labels and locale badge | showStreamMode, locale, `t`, localized | `modeTitle`, `modeToggleLabel`, `localeBadge`, `localeButtonLabel`, `dotnetDownloadUrl` |
| `selectIdentityGates` | identity form booleans only | identity state, page state, passwords, confirmation flags, load/action busy | `activationPasswordMatches`, `identityBusy`, `canActivateObservedAccount`, `canLoginIdentity` |

Naming note: the spec uses mixed names like `selectPageState` and `selectUpdaterButton(...)`; this phase should prefer one public selector per file, named after the file's concern. Helper functions may be private within the file.

## Invariants

1. `createInstallPageModel(input)` must keep the exact exported name and return the exact `InstallPageModel` shape during this phase.
2. `src/routes/install/+page.svelte` must not need behavior changes to keep compiling.
3. Selector modules must stay pure. No Svelte stores, DOM access, `Date.now()`, network access, or Tauri calls.
4. No user-facing copy changes. Existing strings, translation keys, and conditional branches must be preserved exactly.
5. No new dependencies.
6. Do not widen types with `any`, `unknown as`, or `@ts-ignore`.
7. `page-model.test.ts` must remain as a legacy integration-style test over the composed output.
8. Selector tests must assert behavior, not source text. Do not add tests that only check whether a function calls another function.
9. This phase must not add controller extraction scaffolding; that belongs to Phase 4.

## Verification Command Recipe

- Type check: `npm run check`
- Full source tests for impacted areas:
  - `node --test --experimental-strip-types src/lib/installer/*.test.ts src/lib/identity/*.test.ts src/lib/stream/*.test.ts`
- Focused iteration loop:
  - `node --test --experimental-strip-types src/lib/installer/page-model.test.ts src/lib/installer/selectors/*.test.ts`

Expected outcome:

- `npm run check` clean
- existing installer/identity/stream tests remain green
- new selector tests pass

---

## Task 0 — Commit this plan

**Files:**
- Create: `docs/superpowers/plans/2026-04-17-installer-phase-3-page-model-selectors.md`

- [ ] **Step 1: Stage and commit the plan**

```bash
git add docs/superpowers/plans/2026-04-17-installer-phase-3-page-model-selectors.md
git commit -m "$(cat <<'EOF'
Add Phase 3 page-model selector decomposition plan

Covers extraction of focused installer selector modules from
src/lib/installer/page-model.ts while keeping createInstallPageModel as a
compatibility composition layer until the Phase 4 install-page controller
work lands.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 1 — Establish selector boundaries and shared types

**Why this first:** before moving logic, we need stable selector contracts so later commits do not thrash types or rename outputs twice.

**Files:**
- Modify: `src/lib/installer/page-model.ts`
- Optional create: `src/lib/installer/selectors/types.ts`

- [ ] **Step 1: Audit the current `InstallPageModel` fields into concern groups**

Map every current field in `InstallPageModel` into one of these buckets and note any fields that are direct pass-throughs rather than true derivations:

- install gates
- updater button
- identity panel
- steam modal
- mode labels
- identity gates

The expected grouped outputs are:

- install gates:
  - `selectedPath`
  - `modInstalled`
  - `bundledBppVersion`
  - `installedBppVersion`
  - `bppDataVersion`
  - `bppDataIssue`
  - `bppDataResetRequired`
  - `pageState`
  - `hasPath`
  - `isBusy`
  - `canInstall`
  - `canLaunchGame`
  - `versionMismatch`
- updater button:
  - `updaterProgressLabel`
  - `updaterButtonLabel`
  - `updaterButtonTitle`
  - `updaterButtonDisabled`
  - `updaterButtonHighlighted`
- steam modal:
  - `steamModalTitle`
  - `steamModalBody`
  - `steamModalCancelText`
- mode labels:
  - `modeTitle`
  - `modeToggleLabel`
  - `dotnetDownloadUrl`
  - `localeBadge`
  - `localeButtonLabel`
- identity panel:
  - `identityState`
  - `identityPanelTitle`
  - `identityPanelSummary`
  - `shouldCollapseIdentityPanel`
- identity gates:
  - `activationPasswordMatches`
  - `identityBusy`
  - `canActivateObservedAccount`
  - `canLoginIdentity`

- [ ] **Step 2: Introduce minimal selector input/output types**

If the same small group of function signatures repeats across files, extract those shared types into `src/lib/installer/selectors/types.ts`. Keep this file small. It may contain:

- `LocalizedText`
- `TranslateText`
- `PendingSteamAction`
- `IdentityLoadState`
- `IdentityActionBusy`

Do not move the entire `InstallPageModelInput` or `InstallPageModel` interfaces into `selectors/types.ts`; those still belong to `page-model.ts` in Phase 3.

- [ ] **Step 3: Keep `page-model.ts` as the public compatibility surface**

After this task, `page-model.ts` should still own:

- `InstallPageModelInput`
- `InstallPageModel`
- `createInstallDebugEnvironment`
- `formatIdentityErrorMessage`
- `formatByteLabel`
- `createInstallPageModel`

But it should no longer hold large inlined derivation blocks once later tasks land.

---

## Task 2 — Extract `install-gates.ts`

**Files:**
- Create: `src/lib/installer/selectors/install-gates.ts`
- Create: `src/lib/installer/selectors/install-gates.test.ts`
- Modify: `src/lib/installer/page-model.ts`

- [ ] **Step 1: Write focused tests for install gating outputs first**

Add tests for:

- selected custom path is trimmed
- `pageState` is derived from `createPageState(...)`
- `versionMismatch` follows bundled vs installed version mismatch
- no detected/custom path produces `hasPath === false`
- busy action state disables install/launch through the derived `pageState`

Tests should call `selectInstallGates(...)` directly, not `createInstallPageModel(...)`.

- [ ] **Step 2: Implement `selectInstallGates(...)` as a pure selector**

The selector should compose existing helpers, not reimplement them:

- `selectCustomGamePath(...)`
- `createPageState(...)`

Suggested public return shape:

```ts
export interface InstallGatesSelection {
  selectedPath: string | null;
  modInstalled: boolean;
  bundledBppVersion: string | null;
  installedBppVersion: string | null;
  bppDataVersion: string | null;
  bppDataIssue: BppDataIssue | null;
  bppDataResetRequired: boolean;
  pageState: PageState;
  hasPath: boolean;
  isBusy: boolean;
  canInstall: boolean;
  canLaunchGame: boolean;
  versionMismatch: boolean;
}
```

- [ ] **Step 3: Rewire `createInstallPageModel(...)` to consume the selector**

Replace the current install-related inlined derivation block in `page-model.ts` with a single call to `selectInstallGates(...)` and spread the output into the legacy object assembly.

- [ ] **Step 4: Run focused tests**

```bash
node --test --experimental-strip-types src/lib/installer/selectors/install-gates.test.ts src/lib/installer/page-model.test.ts
```

---

## Task 3 — Extract `updater-button.ts`

**Files:**
- Create: `src/lib/installer/selectors/updater-button.ts`
- Create: `src/lib/installer/selectors/updater-button.test.ts`
- Modify: `src/lib/installer/page-model.ts`

- [ ] **Step 1: Lock down the current updater status matrix in tests**

Add selector tests covering at least:

- `checking`
- `available`
- `downloading`
- `installed`
- `error` with and without pending update
- `unsupported`
- default/current state

These tests should assert:

- label
- title
- disabled
- highlighted
- progress label

- [ ] **Step 2: Implement `selectUpdaterButton(...)`**

The selector should continue to use `createProgressLabel(...)` from `src/lib/updater.ts` and preserve the exact branching behavior currently in `page-model.ts`.

Suggested public shape:

```ts
export interface UpdaterButtonSelection {
  progressLabel: string | null;
  label: string;
  title: string;
  disabled: boolean;
  highlighted: boolean;
}
```

- [ ] **Step 3: Rewire `createInstallPageModel(...)`**

Map the selector output back to legacy field names:

- `progressLabel` → `updaterProgressLabel`
- `label` → `updaterButtonLabel`
- `title` → `updaterButtonTitle`
- `disabled` → `updaterButtonDisabled`
- `highlighted` → `updaterButtonHighlighted`

---

## Task 4 — Extract `identity-panel.ts` and `identity-gates.ts`

**Why paired:** both depend on the same identity inputs but represent different concerns. Splitting them together reduces churn in `page-model.ts`.

**Files:**
- Create: `src/lib/installer/selectors/identity-panel.ts`
- Create: `src/lib/installer/selectors/identity-panel.test.ts`
- Create: `src/lib/installer/selectors/identity-gates.ts`
- Create: `src/lib/installer/selectors/identity-gates.test.ts`
- Modify: `src/lib/installer/page-model.ts`

- [ ] **Step 1: Keep `createIdentityState(...)` in one place**

`identity-panel.ts` should accept a computed `IdentityState`, not recreate it internally from raw observation/install inputs. `page-model.ts` should stay responsible for:

```ts
const identityState = createIdentityState({
  observation: input.playerObservation,
  installation: input.installationRecord,
  hasInstallationPrivateKey: input.hasInstallationPrivateKey
});
```

This preserves a single authoritative identity-state transition point until Phase 4.

- [ ] **Step 2: Add panel tests for the three user-visible identity modes**

Cover at least:

- no observation found
- observation found but not activated
- installation present and healthy
- installation present but missing private key

Assert:

- title
- summary
- `shouldCollapse`

- [ ] **Step 3: Add gate tests for password and busy-state rules**

Cover at least:

- blank passwords count as matching
- mismatched confirmation blocks activation
- loading or action-busy sets `identityBusy`
- observed account can activate only when install state is correct
- login gate depends on confirmation + password presence + current identity mode

- [ ] **Step 4: Implement the two selectors and rewire `page-model.ts`**

Suggested public shapes:

```ts
export interface IdentityPanelSelection {
  title: string;
  summary: string;
  shouldCollapse: boolean;
}

export interface IdentityGatesSelection {
  activationPasswordMatches: boolean;
  identityBusy: boolean;
  canActivateObservedAccount: boolean;
  canLoginIdentity: boolean;
}
```

Do not move `createIdentityState(...)` itself into a selector file in this phase.

---

## Task 5 — Extract `steam-modal.ts` and `mode-labels.ts`

**Files:**
- Create: `src/lib/installer/selectors/steam-modal.ts`
- Create: `src/lib/installer/selectors/steam-modal.test.ts`
- Create: `src/lib/installer/selectors/mode-labels.ts`
- Create: `src/lib/installer/selectors/mode-labels.test.ts`
- Modify: `src/lib/installer/page-model.ts`

- [ ] **Step 1: Add explicit tests for current copy branching**

For `steam-modal.ts`, cover:

- pending action `install`
- pending action `uninstall`
- pending action `null`

For `mode-labels.ts`, cover:

- install mode, English locale
- install mode, Chinese locale
- stream mode, English locale
- stream mode, Chinese locale

- [ ] **Step 2: Implement selectors without changing copy**

Keep the current inline dotnet URL branching exactly as-is in this phase:

```ts
locale === 'zh'
  ? 'https://dotnet.microsoft.com/zh-cn/download'
  : 'https://dotnet.microsoft.com/en-us/download'
```

Do not centralize the URLs yet; that belongs to Phase 5.

- [ ] **Step 3: Rewire `createInstallPageModel(...)`**

After this task, the remaining body of `createInstallPageModel(...)` should read like a composition function, not a derivation implementation.

---

## Task 6 — Slim `page-model.ts` into a composition layer

**Files:**
- Modify: `src/lib/installer/page-model.ts`
- Modify: `src/lib/installer/page-model.test.ts`

- [ ] **Step 1: Remove duplicated local logic now owned by selectors**

After Tasks 2-5, `page-model.ts` should:

- import selectors
- compute `identityState`
- call each selector once
- assemble the legacy `InstallPageModel`

It should not still contain long conditional blocks for updater labels, mode labels, or identity gates.

- [ ] **Step 2: Keep the legacy integration test but retarget expectations where needed**

`page-model.test.ts` should continue proving that `createInstallPageModel(...)` produces the same user-facing aggregate outputs as before. Update only the assertions that need to reflect renamed internal wiring if test fixtures become stricter.

- [ ] **Step 3: Check final size trend**

Target outcome:

- `page-model.ts` materially smaller than 322 lines
- most branching moved into dedicated selector files

This phase does not need a hard line count gate, but if `page-model.ts` remains near its original size, the decomposition is incomplete.

---

## Task 7 — Full verification and handoff notes

**Files:**
- No additional source files required unless test fixes are needed

- [ ] **Step 1: Run full required verification**

```bash
npm run check
node --test --experimental-strip-types src/lib/installer/*.test.ts src/lib/identity/*.test.ts src/lib/stream/*.test.ts
```

- [ ] **Step 2: Review for accidental Phase 4 creep**

Confirm all of the following are still true before opening the PR:

- `src/routes/install/+page.svelte` still imports `createInstallPageModel(...)`
- no `src/lib/installer/controllers/` directory was introduced
- no Tauri bridge/config-centralization work was mixed in

- [ ] **Step 3: Open PR with non-user-facing release notes**

PR body must end with:

```text
Release Notes:

- N/A
```

If this work reveals a reusable, non-obvious repo rule, include a separate `Suggested .rules additions` section in the PR description. Do not edit `.rules` directly in this phase.
