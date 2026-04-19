# Ambiguous Remark Prompt

Use this only when a non-empty remark is not already resolved by the deterministic rules in `SKILL.md`.

## Goal

Extract the single display name the payer wants shown publicly in the supporter list.

## Output contract

Return one of:
- the display name only
- empty / no name

Do not return JSON unless the current task explicitly needs JSON. Do not include explanation in the extracted value.

## Extraction rules

- Keep only the intended display name.
- Remove courtesy text, blessings, thanks, and filler.
- If the remark is only encouragement or support with no display-name intent, return no name.
- If a clear name appears inside a longer sentence, extract the name only.
- If multiple candidates exist and one is clearly marked as `id`, `ID`, `名字`, `昵称`, or self-introduction phrasing like `我是`, prefer that candidate.
- If the remark remains ambiguous, return no name.

## Examples

- `我是星海` -> `星海`
- `想上墙的话就写这个名字：Luna` -> `Luna`
- `B站id:三春去后` -> `三春去后`
- `ID:红袖坊小凤仙。辛苦了，请你喝可乐。` -> `红袖坊小凤仙`
- `加油！！` -> no name
- `挺你bro，祝你越做越好` -> no name
