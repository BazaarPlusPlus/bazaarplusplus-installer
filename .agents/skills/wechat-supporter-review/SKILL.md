---
name: wechat-supporter-review
description: Use when Codex needs to process a WeChat business-account payment export into supporter review data for this repo, including incremental pending-review generation, display-name extraction from payment remarks, cursor tracking, or merging approved entries into static/support/supporter-list.json.
---

# WeChat Supporter Review

## Overview

Use this skill to turn a WeChat business-account `.xlsx` export into incremental supporter updates for this repo. Run the workflow directly in Codex; do not require an external API key or a fixed helper script unless the user explicitly asks for one.

## Files

- Source workbook: user-provided `.xlsx` export such as `经营账户明细20260412-20260419.xlsx`
- Incremental cursor: `scripts/supporters-import-state.json`
- Pending review output: `static/support/supporter-pending-review.json`
- Final supporter list: `static/support/supporter-list.json`
- Prompt reference for ambiguous remarks: `references/lm-prompt.md`

Keep the state and pending-review files gitignored. Only `static/support/supporter-list.json` is intended for committed repo data.

## Workflow

### 1. Read the workbook structure

- Inspect the first sheet and confirm these columns exist:
  - `交易时间`
  - `收支类型`
  - `交易类型`
  - `金额`
  - `单号`
  - `收款备注`
- Stop and ask the user only if the export shape is different enough that these columns cannot be mapped safely.

### 2. Filter eligible payments

Only consider rows where all of the following are true:
- `收支类型 = 收入`
- `交易类型 = 经营收款`
- `金额 >= 2.9`

Ignore service fees, expenses, refunds, and rows below the minimum threshold.

### 3. Apply the fixed tier mapping

- `2.9 <= 金额 < 9.9` -> tier `1`
- `9.9 <= 金额 < 14.9` -> tier `2`
- `14.9 <= 金额 < 49` -> tier `3`
- `金额 >= 49` -> tier `4`

Do not ask the model to infer tiers. Tiers are deterministic.

### 4. Enforce incremental processing

- Read `scripts/supporters-import-state.json` if it exists.
- Treat the cursor as a pair:
  - `tradeTime`
  - `orderId`
- Only process rows strictly later than that cursor.
- Compare by `交易时间` first, then `单号`.
- If the state file is missing or empty, treat the run as the first import.
- Only advance the cursor after the pending-review file has been written successfully.

### 5. Normalize and interpret remarks

Before extracting a display name:
- Trim whitespace.
- Strip the prefix `付款方备注：` or `付款方备注:`.
- Treat `/` and empty strings as empty remarks.

Then apply these rules:
- Empty remark: ignore the row entirely.
- Generic encouragement with no display intent: ignore the row entirely.
  - Examples: `加油`, `支持一下`, `谢谢`, `辛苦了`
- If the remark clearly contains a display name, extract only the name.
  - `我是某某` -> `某某`
  - `我叫某某` -> `某某`
  - `id:V1ncentlee` -> `V1ncentlee`
  - `B站id:三春去后` -> `三春去后`
  - `ID:红袖坊小凤仙。辛苦了，请你喝可乐。` -> `红袖坊小凤仙`
- Do not keep blessing text, commentary, or punctuation that is not part of the name.

For ambiguous remarks, use the current Codex session to reason about the intended display name. Follow `references/lm-prompt.md` and only return either:
- a single display name string, or
- no name

If the remark is non-empty but still ambiguous after reasoning, keep it in `unresolved` rather than guessing.

### 6. Write the pending-review file

Write `static/support/supporter-pending-review.json` with this shape:

```json
{
  "sourceFile": "/absolute/path/to/export.xlsx",
  "generatedAt": "2026-04-19T11:52:28Z",
  "cursorBefore": {
    "tradeTime": "2026/04/14 23:59:59",
    "orderId": "zzzzzzzzzzzzzzzzzzzz"
  },
  "cursorAfter": {
    "tradeTime": "2026/04/19 09:57:09",
    "orderId": "4500000133202604198231895021"
  },
  "summary": {
    "newRows": 25,
    "eligibleRows": 22,
    "emptyRemarkSkipped": 13,
    "genericRemarkSkipped": 0,
    "resolvedEntries": 9,
    "unresolvedEntries": 0
  },
  "entries": [
    {
      "name": "HowieLin",
      "tier": 4,
      "amount": 88.8,
      "tradeTime": "2026/04/19 09:57:09",
      "orderId": "10065909898817765638200191124600",
      "rawRemark": "付款方备注：HowieLin",
      "normalizedRemark": "HowieLin"
    }
  ],
  "unresolved": []
}
```

Rules:
- `entries` contains only resolved display names ready for user confirmation.
- `unresolved` contains non-empty remarks that may still need review.
- `summary` counts only rows considered during the current incremental run.

### 7. Merge approved entries only after confirmation

When the user says to put the pending entries into the official list:
- Read `static/support/supporter-list.json`.
- Merge new names by exact `name`.
- Do not duplicate an existing name.
- Preserve the pending tier for new names.
- Sort the final list by:
  - `tier` descending
  - `name` ascending
- After a successful merge, clear `static/support/supporter-pending-review.json` back to an empty-pending state while preserving the latest cursor.

## Output expectations

When generating pending review:
- Report the absolute cutoff date you used if the user described it relatively, such as "last Tuesday night".
- Summarize counts from `summary`.
- Call out any `unresolved` rows explicitly.

When merging:
- State how many names were added.
- Confirm that pending review has been cleared.

## Constraints

- Do not invent display names.
- Do not infer tiers from anything except amount.
- Do not require an external API key by default.
- Do not create README-style documentation for this workflow.
