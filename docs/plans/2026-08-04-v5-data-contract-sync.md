# Installer V5 数据契约同步方案

状态：已确认，待实施

日期：2026-08-04

范围：installer 与 mod V5 数据管线（cutover `eed5da08`）和 server V5（`mod-api-v5.bazaarplusplus.com`）的全部同步改动。

引用约定：

- 无前缀路径 = 本仓库（installer）。
- `mod:` = `/Users/yxinyu/codes/workspaces/bpp/bazaarplusplus-mod`。
- `server:` = `/Users/yxinyu/codes/workspaces/bpp/bazaarplusplus-server`。
- mod 代码即数据契约。本文与 mod 行为冲突时，以 `mod:src/BazaarPlusPlus.Storage/**` 与 `mod:src/BazaarPlusPlus/Game/BundlePipeline/**` 为准。

---

## 0. 前提与不可变决策

1. **V4 遗留完全不管。** installer 不读、不删、不迁移、不提示 `<GameRoot>/BazaarPlusPlusV4/`。它与 mod 侧决策（V4 目录不读不删，`mod:docs/plans/2026-08-03-v5-data-pipeline-design.md:33`）一致：旧目录永久归用户所有。Reset 的可用性探测（`src-tauri/src/services/install/mod.rs:237-241`）只看 V5 目录；只有 V4 数据的用户 Reset 按钮保持禁用，这是接受的行为。
2. **`BundleOutbox/` 归 mod 自管理。** mod 上传成功即删文件、pending 14 天过期、permanent_failure 7 天清理、512 MiB 软上限（`mod:src/BazaarPlusPlus/Game/BundlePipeline/BundleUploadFeed.cs:27-29,111,259-289`）。installer 永不删除其文件或 `bundle_outbox` 行，也不把它计入清理体积估算。
3. **installer 不接 V5 server。** installer 运行时对 `mod-api-v5.bazaarplusplus.com` 零依赖；唯一外部端点是自更新器 `bppinstaller.bazaarplusplus.com`（`src-tauri/tauri.conf.json:36-40`）。server V5 不产生任何 installer 改动。
4. **payload 清单不变。** V5 六程序集拓扑与依赖集合与 installer 所有权清单逐文件一致（`mod:src/BazaarPlusPlus/BazaarPlusPlus.csproj:164-404` 对照 `src-tauri/src/services/bepinex/payload.rs:10-35`），无新增、删除或改名。`BPP_PRIVATE_RELATIVE_PATHS` / `BPP_BUNDLED_DEPENDENCY_RELATIVE_PATHS` / `REQUIRED_RELEASE_INPUTS` 均不动。

## 1. 契约事实摘要（已对两侧代码核实）

| 契约项 | V4 | V5 | 证据 |
|---|---|---|---|
| 数据根 | `BazaarPlusPlusV4/` | `BazaarPlusPlusV5/` | `mod:src/BazaarPlusPlus.Storage/Paths/PathConstants.cs:7` |
| DB 文件 | `bazaarplusplus.db` | 不变 | `mod:src/BazaarPlusPlus.Storage/Paths/PathConstants.cs:6-15` |
| `PRAGMA user_version` | 18 | 1（fresh schema，无迁移） | `mod:src/BazaarPlusPlus.Storage/RunLog/RunLogSchema.cs:9,33`；V4 值见 `eed5da08~1` |
| 子目录 | `CombatReplays/`、`Screenshots/`、`CombatReplayVideos/` | 名字不变；新增 `BundleOutbox/`、`GhostBattlePayloads/` 等 | `mod:src/BazaarPlusPlus.Storage/Paths/PathConstants.cs:6-30` |
| installer 读取的表列 | — | `runs`/`battles`/`run_screenshots`/`combat_replay_videos`/`run_events`/`battle_snapshots` 全部保留；History/Stream 生产读路径的 SQL 列级兼容，唯一破坏面在清理 gate（见 W2） | `mod:src/BazaarPlusPlus.Storage/RunLog/RunLogSchema.cs:30-258` |
| 上传状态载体 | `battles.replay_dirty`、`run_sync_state`、`bazaardb_snapshot_uploads` | 三者全删；替代物为 `bundle_seal_jobs`、`bundle_outbox` | 同上 |
| replay payload 文件 | `CombatReplays/<battleId>.payload.mpack.gz` | 路径不变，但成为 seal 的活输入：seal 前删除会让该 battle 永久退出 Bundle projection | `mod:src/BazaarPlusPlus/Game/BundlePipeline/RunPayloadComposer.cs` |
| 截图 | `Screenshots/yyyy-MM-dd/*.png`，`capture_source='end_of_run_auto'` | 不变；Bundle 内 JPEG 由 seal 时读主截图 PNG 内存编码，不落盘 | `mod:src/BazaarPlusPlus/Game/BundlePipeline/BundleScreenshotEncoder.cs`（内存编码）；主 PNG 解析 `mod:src/BazaarPlusPlus/Game/BundlePipeline/BundleSealCoordinator.cs:441-449` |
| mod 版本 | `4.5.0.prod` | `.version` 内容格式不变（`{semver}.prod`），精确字符串比对继续成立；发布门禁下限见 W5 | 版本号 `mod:Directory.Build.props:5`；`.prod` 后缀由 `mod:src/BazaarPlusPlus/BazaarPlusPlus.csproj` 的 WriteLinesToFile 写出 |
| 域值 | `completed/abandoned/active`、`LOCAL/GHOST`、`COMPLETED`、`end_of_run_auto` | 全部不变 | `mod:src/BazaarPlusPlus.Storage/RunLog/RunLogSchema.cs` |

## 2. 工作包

### W1 数据根常量翻转与 installer 自有状态目录拆分

先拆后翻，顺序不可倒：

1. `src-tauri/src/services/paths.rs:31-46` 的 `overlay_cache_dir()` / `overlay_settings_path()` 目前复用 `BAZAAR_DATA_DIRECTORY` 作为 OS cache/config 目录下的文件夹名。这是 installer 自有状态（OBS 裁切设置、overlay 图片缓存，另见 `src-tauri/src/stream/http.rs:323-325`），与 mod 数据根无关；直接翻常量会把所有用户的 crop 设置静默重置。
2. 在 `src-tauri/src/config.rs` 新增 `pub const INSTALLER_STATE_DIRECTORY: &str = "BazaarPlusPlusInstaller";`，`overlay_cache_dir`/`overlay_settings_path` 改用它。版本无关命名，避免每次 mod 数据根升版都牵动 installer 自有状态。
3. 设置文件做一次性读回退：读取 crop 设置时（`src-tauri/src/stream/overlay_settings.rs`）先读新路径，缺失则回退读旧路径 `<config_dir>/BazaarPlusPlusV4/stream-overlay-crop.json`；保存永远写新路径。缓存目录不迁移（可再生），旧缓存目录留给 OS 缓存回收，不主动删除。
4. 然后翻转 `src-tauri/src/config.rs:1`：`BAZAAR_DATA_DIRECTORY = "BazaarPlusPlusV5"`。所有游戏侧路径消费方（History、Reset、清理、Stream DB/截图定位、`GamePathProbe::DatabaseFile`）经 `paths.rs` 派生，随常量自动切换，无需逐点改动。

### W2 清理「上传保护」重写

现状三个 gate 探测的表/列在 V5 全部不存在，`table_exists`/`column_exists` 探测导致保护静默消失（fail-open）：`src-tauri/src/history/cleanup.rs:321-342`（探测）、`523-572`（`eligible_run_ids`）、`574-620`（`skipped_pending_run_count`）、`814-852`（`eligible_screenshots`）、`854-876`（`pending_upload_count`）。

**新保护谓词**（镜像 mod seal 候选判定 `mod:src/BazaarPlusPlus.Storage/BundleQueue/BundleQueueStore.cs:23-50`，不能用 `bundle_seal_jobs` 行存在性判断——seal job 只在游戏运行期间由 5 秒扫描创建，游戏关闭时完成的 run 没有任何行）。一个 run 被保护（不可删）当且仅当：

```sql
r.completed = 1
  and r.status = 'completed'
  and lower(r.game_mode) = 'ranked'
  and lower(coalesce(r.build_channel, 'unknown')) <> 'ptr'
  and not exists (select 1 from bundle_outbox o
                  where o.run_id = r.run_id and o.status in ('pending', 'uploaded'))
  and not exists (select 1 from bundle_seal_jobs j
                  where j.run_id = r.run_id and j.state = 'terminal_failure')
```

要点：

- 比较必须 `lower()`：mod 侧判定是大小写不敏感的，installer 旧代码的 `game_mode = 'Ranked'` 精确匹配不能沿用。
- **已 seal 的 pending outbox run 可删**：`.bundle` 文件自包含、上传只读该文件（`bundle_outbox` 故意无 FK），mod 自己的 HistoryPanel 也允许删这类 run。`status in ('pending','uploaded')` 表示 mod 不会再 seal，即 run 行与 replay payload 文件不再被需要。
- `terminal_failure` seal job 表示 mod 永久放弃该 run，可删（job 行随 `runs` 级联删除）。
- 不再做表存在性探测：W3 的 `user_version = 1` 守卫保证已完成 bootstrap 的 V5 库表齐全（`mod:src/BazaarPlusPlus.Storage/RunLog/RunLogSchema.cs` 的 bootstrap 把 `PRAGMA user_version` 与建表放在同一批语句；建库进行中的毫秒级窗口下静态 SQL 以 no such table 失败，fail-closed，由既有读取失败问题面兜底）。探测分支删除，SQL 回归静态字符串。

**落点**：

1. `eligible_run_ids` / `skipped_pending_run_count`：删除 `run_sync_state` join 与三个动态分支，改为 `and not (<保护谓词>)` / 统计命中保护谓词且在 cutoff 内的 run 数。
2. `execute_run_data_cleanup` 的 run 删除改为条件式：`delete from runs where run_id = ?1 and not (<保护谓词>)`（`src-tauri/src/history/cleanup.rs:505-507` 处）。游戏运行中，plan 与 execute 之间 mod 可能把 pending outbox 翻为 `permanent_failure` 并重新排 seal（`mod:src/BazaarPlusPlus/Game/BundlePipeline/BundleUploadFeed.cs:153-194`）；条件式删除让谓词在写事务内生效，消除该竞态。
3. 截图 scope（`eligible_screenshots` / `pending_upload_count`）：保护「被保护 run 的主截图」——排除满足 `s.is_primary = 1 and s.run_id in (被保护且 runs.bundle_screenshot_requested = 1 的 run)` 的行，并计入 `skipped_pending_uploads`。有意的轻度过保护：不细分 seal job 的 `screenshot_state`（`unavailable`/`timed_out` 后 PNG 其实已不被需要），代价只是这些 PNG 晚一个 seal 周期被清理，换取谓词简单可测。
4. 级联校验 `validate_run_cleanup_cascade_fks`（`src-tauri/src/history/cleanup.rs:1160-1182`）：校验对改为 `battles→runs`、`run_events→runs`、`battle_snapshots→battles`、`bundle_seal_jobs→runs` 四对，全部必须存在（不再 `table_exists` 跳过）；同步更新 `src-tauri/src/history/queries.rs:45-48` 处仍列举 `run_sync_state`/`bazaardb_snapshot_uploads` 的过时注释。
5. 死代码删除：`UPLOAD_CACHE_DIRECTORY`、`scan_upload_cache_files`、`all_screenshot_ids` 与 plan 内部字段 `upload_cache_files`（V5 删除了 `Screenshots/UploadCache` 的生产者，Bundle 截图在内存编码不落盘）。该字段只折叠进 `orphan_files` 计数（`cleanup.rs:114`），前端 DTO 形状不变，无需重生成 bindings。
6. `column_exists` 若因此无调用方，一并删除。

### W3 DB schema 守卫

- `src-tauri/src/config.rs` 新增 `pub const SUPPORTED_MOD_DB_USER_VERSION: i64 = 1;`。
- `src-tauri/src/history/queries.rs` 的 `open_connection` / `open_write_connection`（`:29-43`，History、Stream 截图、清理共用的唯一入口）在 `busy_timeout` 后读 `PRAGMA user_version`，不等于支持值即返回可识别错误。
- History 侧把该错误映射为新的语义问题码（沿用 `src-tauri/src/problem.rs` 契约，wire 值为 snake_case，例如 `history_database_unsupported_schema`，参数带 found/expected），前端 zh/en 各加一条文案：数据库版本不受支持，提示更新 mod 或 installer。Stream 与清理经各自既有的读取失败问题面呈现，不加新码。
- 价值：防止未来 schema 升版时旧 installer 把新库渲染成错误数据（本次 V4→V5 的「静默读旧库」正是这个形态的事故），也把「V5 目录里出现非 V5 库」变成显式可诊断状态。

### W4 i18n、测试与 fixture

1. i18n（`src/i18n/messages.ts:104,106,532,534`）：`resetDataTarget` / `resetDataConfirmBody` 两语言把 `BazaarPlusPlusV4` 改为 `BazaarPlusPlusV5`，confirm body 文案补一句「包括尚未上传的对局数据」（Reset 删除整个数据根，含 `BundleOutbox/` 中未上传的 bundle）。
2. 前端 fixture：`src/features/stream/streamWorkflow.test.ts:28`、`src/features/stream/streamCapabilityState.test.ts:31`、`src/features/shared/confirmedOperation.test.ts:107` 的 V4 路径字面量改 V5。
3. Rust fixture：`src-tauri/src/history/cleanup.rs` 测试中多处硬编码 `"BazaarPlusPlusV4"`（1264、1589、1602、1888、1986、2113 等）改用 `BAZAAR_DATA_DIRECTORY` 常量；各 `create_*_schema` 测试夹具改为 V5 形状——删 `run_sync_state`/`bazaardb_snapshot_uploads`/`replay_dirty`，建 `bundle_seal_jobs`/`bundle_outbox`。`src-tauri/src/services/history.rs`、`src-tauri/src/history/screenshots.rs`、`src-tauri/src/history/repo.rs`、`src-tauri/src/stream/records/mod.rs` 中的 schema 夹具同步，且所有经 `open_connection`/`open_write_connection` 打开真实 SQLite 的夹具都必须执行 `PRAGMA user_version = 1`（否则 W3 守卫会使这些测试失败）。`payload.rs:616` 的 `b"4.0.0"` 版本内容改为贴近现实的 `{semver}.prod` 形式（无断言依赖）。
4. 新增 gate 行为测试矩阵（V5 夹具）：
   - 保护：completed+`Ranked`(含小写 `ranked`)+非 PTR+无 outbox 行 → 跳过并计数；其主截图（`bundle_screenshot_requested=1`）在截图清理中同样跳过并计数。
   - 可删：pending outbox；uploaded outbox；`terminal_failure` seal job；PTR；非 Ranked；`abandoned`/未完成。
   - user_version ≠ 1 的库：History/清理/Stream 全部拒绝且问题码正确。

### W5 发布门禁与发布顺序

审计发现的真实缺口：`SourceForBuild` 里的 BPP 私有产物是 gitignored 的本机 staging（`.gitignore:59-60`），当前仍是 `4.5.0.prod`（V4 数据根的 mod），而 `REQUIRED_RELEASE_INPUTS` 只查文件存在不查内容（`scripts/payload-zip.mjs:100-115`）。若翻完常量忘了重新 stage，所有检查绿灯通过，出的包是「History 看 V5、装的 mod 写 V4」的坏拆分，且 git review 不可见。

1. 前置：先在 mod 仓做一次 post-cutover 版本 bump（建议 4.7.0）并以其为门禁下限。4.6.0 不能作下限——mod 版本号在 V5 cutover（`eed5da08`）之前 142 个 commit 就已升到 4.6.0（`2610282d` 已验证为其祖先），任何机器上残留的 pre-cutover `4.6.0.prod` staging（仍写 V4 数据根）都会通过 `>= 4.6.0` 检查。
2. `scripts/payload-zip.mjs`：新增 `V5_MIN_MOD_VERSION`，取上述 bump 后版本（注释注明这是首个保证写 `BazaarPlusPlusV5` 的 mod 版本）；在 `assertRequiredStagingInputs` 后读取两平台 `BepInEx/plugins/BazaarPlusPlus.version`，解析前缀 semver，低于下限即失败，错误信息指引「先在 mod 仓 `./run.sh publish` 重新 stage」。若不愿 bump mod 版本，备选是内容级断言（扫描 staged `BazaarPlusPlus.Storage.dll` 须含 `BazaarPlusPlusV5` 字面量且不含 `BazaarPlusPlusV4`），但 semver 门禁实现简单、错误信息可读，为首选。
3. `scripts/prebuild-check.mjs` 复用同一断言（共享 helper），保证 `prepare:resources` 与 `prebuild-check` 两条路径都拦截。
4. vitest 覆盖（`scripts/payload-zip.test.mjs`）：staging 版本过低/缺失/合法三种情形。
5. 发布顺序：本方案合入后的首个 installer 发布，必须先完成 mod ≥ `V5_MIN_MOD_VERSION` 的 publish 并重新 stage 两平台 `SourceForBuild`，再走 `npm run prepare:resources` → `npm run prebuild-check` → `./build.sh --prod`。

### W6 文档同步

1. `CONTEXT.md:29` Reset 词条的 `BazaarPlusPlusV4/` 改 V5；`docs/truth/install-reset.md:27` 同步。
2. `docs/truth/history-stream.md` 重写上传保护段落（`:37-41`）：删除 pending-BazaarDB/replay-dirty/completed-Ranked-dirty 三条旧 gate 与 `UploadCache` 清扫描述，改述 W2 谓词与 `BundleOutbox/` 归属。
3. 以上真相文档在同一变更内更新 `last-verified` hash，并在 `docs/INDEX.md` 追加一条 citation refresh 记录。
4. 新增 `docs/adr/011-v5-data-root-and-v4-orphan-policy.md`：记录「V4 遗留归用户所有、installer 不读不删不迁移不提示」「`BundleOutbox/` 归 mod 自管理，installer 不删其文件/行」两项不可变选择，含被否决的替代方案（Reset 附带清理 V4；installer 回收 outbox）。

## 3. 非目标

- 不读取、不删除、不迁移 `BazaarPlusPlusV4/`；不为其提供任何 UI 入口或提示。
- 不为 `BundleOutbox/`、`GhostBattlePayloads/` 等数据根下 mod 自管理的目录与文件提供清理、体积统计或展示。
- 不接入 `mod-api-v5` 服务器，不解析 Bundle/manifest/Run payload 任何 wire 格式。
- 不改 payload 所有权清单、BepInEx bootstrap 检测、启动模式、版本比对逻辑（精确字符串相等继续成立）。
- 不做 V4→V5 历史数据导入。

## 4. 验证

- `cargo test`（src-tauri）：W2/W3/W4 的 Rust 测试。
- `npm run check`：前端类型/测试（i18n 与 fixture 改动）。
- `npx vitest run scripts/payload-zip.test.mjs`（或所在测试文件）：W5 门禁。
- `npm run prebuild-check`：资源与打包契约整体回归（涉及 bundled resources 的变更按仓库规则必跑）。
- 手工冒烟（`npm run dev -- --host 127.0.0.1 --port 14207`，配合真实 V5 mod 存档）：History 列表/详情、清理预览的 `skipped_pending_uploads` 计数、Reset 目标文案、Stream overlay 出图、旧 crop 设置经回退读取后保存至新路径。

## 5. PR 切分

| PR | 内容 | 依赖 |
|---|---|---|
| A `feat(v5): repoint data root` | W1 + W4 中路径相关 fixture/i18n + W6 中 CONTEXT/install-reset | — |
| B `feat(v5): rebuild cleanup upload-safety` | W2 + W3 + W4 中 gate/守卫测试 + W6 中 history-stream + ADR-011 | A |
| C `build: gate stale mod payload` | W5 | 可独立，建议先行合入 |

A、B 可按评审习惯合并为一个 PR；C 与代码翻转解耦、越早合入越早消除错配出包风险。
