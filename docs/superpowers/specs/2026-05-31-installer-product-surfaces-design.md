# Installer Product Surface Design

Date: 2026-05-31

## Status

Approved prototype surfaces:

- Run detail: `Run Detail v5`
- Stream: `Stream Detail v4`
- History: `History Detail v4`
- Install: `Install Detail v2`

These surfaces share the Run Detail v5 visual language: left rail, compact dark-gold panels, entity-scoped actions, and data-first layout.

## Shared Rules

- Keep the left rail: `安装 / 战绩 / 直播 / 关于`.
- Keep pages dense and operational. Do not introduce landing-page or tutorial-style hero layouts.
- Place actions on the object they operate on.
  - Run screenshot actions live on the run card.
  - Battle video actions live on battle rows.
  - Overlay actions live in the stream control card.
  - Install and maintenance actions live in the install action sidebar.
- Show only existing local data. Do not invent battle screenshots, card art, or video previews.
- Prefer one visible primary action per surface.

## Install Page

Approved version: `Install Detail v2`.

The install page is a status console, not a three-step tutorial. It uses a two-column layout:

- Left column: detection results and game path.
- Right column: install, launch, and maintenance actions.

The left column contains:

- `当前状态` panel with two status cards:
  - `BazaarPlusPlus`
  - `The Bazaar`
- `游戏路径` panel with the detected path and actions:
  - `重新选择`
  - `重新检测`

The right column contains `安装操作`:

- Main state copy, such as `当前可以启动游戏`.
- Primary action: `启动游戏` when the install is ready.
- Runtime and install facts:
  - `Installed`
  - `Bundled`
  - `.NET`
  - `Steam`
- Maintenance actions:
  - `重新安装`
  - `修复`
  - `更多`

`.NET Runtime` must not be a third top-level status card. It belongs in the right action sidebar as a runtime condition.

## Stream Page

Approved version: `Stream Detail v4`.

The stream page is an Overlay control console. It does not contain screenshot history or run history.

Layout:

- Page header.
- A single `Overlay Control` main card.

The main card contains:

- Status row:
  - `Overlay Running`
  - concise service metadata such as port and DB status
- Overlay actions:
  - `打开预览页`
  - `打开校准页`
  - `重启服务`
- OBS URL row:
  - URL value
  - `复制`
- `展示窗口` control:
  - current count, such as `当前展示 8 场`
  - day slot track, such as `D4 ... D11`
  - actions `↑ 更多历史`, `回到当前`, `↓ 更少历史`
  - metadata: `窗口起点`, `开播后`, `可向前补`, `当前英雄`
- `Overlay 配置`:
  - display mode options: `战斗场数`, `完整英雄`, `半高英雄`
  - crop code input
  - `应用裁切代码`
  - `恢复默认裁切`

Remove the standalone `运行诊断` panel. Failure states should replace the status area inside the main control card.

The Overlay service will eventually auto-start when the app starts. This does not remove start/stop/restart backend capabilities; it only changes the default surface state. Stop service should not be a top-level page action.

## History Page

Approved version: `History Detail v4`.

The history page is the run-list entry point. It replaces the old screenshot-record-list mental model.

Top summary keeps only:

- `Runs`
- `Videos`
- `Last Run`

Remove:

- `Screenshots`
- `Best Finish`
- the entire filter panel

Run rows show only run-level information:

- Hero name only, for example `Vanessa`
- timestamp only under the hero, for example `2026-05-24 19:12`
- end-of-run screenshot preview if available
- record, end day, final rank, final rating
- `查看详情`

Do not show row badges such as `partial videos`, `video rendered`, or `no screenshot`.

The row title must not include synthetic run labels like `Run CLIII`. Use only the hero name.

## Run Detail Page

Approved version: `Run Detail v5`.

Layout:

- Left rail active on `战绩`.
- Top bar only contains `← 返回战绩列表`.
- Run summary card:
  - `Vanessa · Run CLIII`
  - `Player cauyxy`
  - mode/time/status line
  - right-side action `打开截图位置`
  - stats: `胜 / 负`, `结束日`, `最终段位`, `最终评分`
  - long horizontal end-of-run screenshot strip
- Battle ledger:
  - columns: `Day`, `Result`, `Opponent Hero`, `Opponent Player`, `Rank`, `Rating`, `Video`
  - opponent hero watermark in each row background
  - video action only: `打开视频位置` or `无视频`
- Lightweight inline selected battle summary below the table.

Remove from run detail:

- top-level `打开截图位置` and `启动游戏`
- `复制 RUN_ID`
- `Local files`
- `level / gold`
- battle screenshots
- embedded battle video or replay content
- player hero repeated per battle
- rating deltas

## Data Boundaries

Use existing local data only:

- run metadata from local run storage
- run-level end-of-run screenshot
- battle metadata
- battle video file location
- overlay settings and service state
- install environment and detected game path

Do not add new required media fields for battle screenshots or card images.

## Implementation Notes

- Split reusable presentation pieces instead of moving stream-specific logic wholesale.
- Reusable pieces may include:
  - horizontal screenshot strip frame
  - compact status panel/card styles
  - entity-scoped file action button
- Keep stream-only behavior inside stream code:
  - Overlay service state
  - OBS URL
  - display mode
  - crop code
  - showcase window up/down logic
- Move screenshot/history record presentation to the history/run surfaces.
