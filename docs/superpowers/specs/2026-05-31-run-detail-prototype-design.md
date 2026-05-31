# Run Detail Prototype Design

## Purpose

Build a local UI-only prototype for a BazaarPlusPlus Installer battle-history run detail page.

The prototype validates information architecture and visual density only. It must not add Rust commands, SQLite queries, video playback, screenshot processing, or new production data contracts.

## Scope

The page represents one completed run. The run has one player hero, one player name, one end-of-run screenshot, and a battle ledger listing the opponents encountered during the run.

In scope:

- Add a local prototype surface reachable in development.
- Show a run summary with hero, player name, run timing/status, wins/losses, final day, final rank, and final rating.
- Show the end-of-run screenshot as a long horizontal strip.
- Put the screenshot action on the run card as `打开截图位置`.
- Show a battle table with columns: `Day`, `Result`, `Opponent Hero`, `Opponent Player`, `Rank`, `Rating`, `Video`.
- Provide `打开视频位置` actions per battle when sample data marks a video as available.
- Keep a lightweight selected battle summary below the table.

Out of scope:

- Battle-level screenshots. Battle records do not have screenshots.
- Inline video preview or playback.
- Card art, board previews, or synthetic build/card visuals.
- Repeating the player hero in every battle row.
- Showing battle-level rating deltas.
- Showing `level / gold` in the run summary.
- A `Local files` side panel.
- A top global `打开截图位置` or `启动游戏` action.
- Copying `run_id` as a primary action in this prototype.

## Reference Decisions

The approved visual direction is the visual companion v5 screen:

- Left navigation rail remains consistent with the handoff design.
- The top page toolbar only contains `← 返回战绩列表`.
- The run card right action is `打开截图位置`.
- The screenshot is a wide, horizontal run-level preview.
- The battle table is dense and field-driven.
- Opponent hero and opponent player name are separate columns.
- Video is the only battle-level file action.

## Data Model For Prototype

Use sample data only. Keep the fields shaped close to the existing local history schema:

```ts
export type RunDetailPrototype = {
  runId: string;
  hero: string;
  playerName: string;
  gameMode: string;
  status: string;
  capturedAt: string;
  wins: number;
  losses: number;
  finalDay: number;
  finalRank: string;
  finalRating: number;
  screenshotAvailable: boolean;
  battles: BattleDetailPrototype[];
};

export type BattleDetailPrototype = {
  id: string;
  day: number;
  hour: number;
  result: 'Victory' | 'Defeat';
  opponentHero: string;
  opponentPlayerName: string;
  opponentRank: string;
  opponentRating: number;
  videoAvailable: boolean;
};
```

Do not include player hero per battle. The run hero already covers it.

## Page Structure

The prototype page has three major regions:

1. Page navigation row
   - `← 返回战绩列表`
   - No global screenshot/game buttons.

2. Run summary card
   - Title: `{hero} · Run CLIII` or equivalent sample label.
   - Metadata: `Player {playerName}`, game mode, timestamp, status.
   - Stats: wins/losses, final day, final rank, final rating.
   - Right-side action: `打开截图位置`.
   - Screenshot: a long horizontal strip, not a portrait card.

3. Battle ledger
   - Header note: opponent hero/player split, video-only battle file action.
   - Table columns: `Day`, `Result`, `Opponent Hero`, `Opponent Player`, `Rank`, `Rating`, `Video`.
   - Each row may show a low-contrast opponent hero watermark in the background.
   - A selected row summary below the table uses one sentence and one `打开视频位置` action.

## Interaction

The prototype only simulates local UI state:

- Back link returns to the battle-history list prototype route or a static stub page if the list route is not implemented.
- Clicking a battle row updates the selected battle summary.
- Clicking `打开截图位置` and `打开视频位置` may no-op or show disabled/simulated behavior in the UI-only prototype.

No Tauri filesystem action is required for this prototype.

## Visual Rules

- Match the dark gold installer design already used by install, stream, and about surfaces.
- Keep controls compact and table-like.
- Use exact, field-driven text. Do not add marketing copy or tutorial text.
- The screenshot preview must preserve a long horizontal aspect and may overflow/crop inside a framed strip.
- Avoid cards inside cards. The run summary and battle ledger are the main panels; rows are table rows.
- Avoid invented media thumbnails for battles.

## Error And Empty States

Prototype sample states should include:

- A run with no screenshot: show a compact empty strip message and disable or de-emphasize `打开截图位置`.
- A battle with no video: show `无视频` in the `Video` column.
- A list with no battles: show a compact empty table message.

These are UI states only. Do not add data-loading errors or filesystem error handling until real commands are introduced.

## Verification

For the UI-only prototype:

- Run `npm run check`.
- Start `npm run dev`.
- Open the prototype route in the browser.
- Verify desktop layout at a normal installer-sized viewport.
- Verify mobile/narrow behavior does not overlap or truncate important table text incoherently.
- Click battle rows and confirm the selected summary updates.
- Confirm no Battle screenshot/video media preview appears.
