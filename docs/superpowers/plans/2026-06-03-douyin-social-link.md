# Douyin Social Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Douyin QR entry next to the existing Xiaohongshu entry in the installer header media area.

**Architecture:** Treat Douyin as a QR-first social surface, matching the Xiaohongshu hover card without inventing a fake profile URL. Add a cleaned static PNG asset, then refactor the existing Xiaohongshu QR card into a small shared component so the two entries stay visually consistent.

**Tech Stack:** React, TypeScript, Tailwind utility classes, Vite static asset imports, ImageMagick for one-time asset cleanup.

---

## File Structure

- Create: `static/support/douyin.png` - cleaned QR asset derived from `/Users/yxinyu/Downloads/20260603-003518.jpg`.
- Modify: `src/layouts/ShellHeader.tsx` - import Douyin asset, add the Douyin entry next to Xiaohongshu, and share QR popover markup.

Do not add `href="#"` for Douyin. If the only reliable entry point is the QR image, render a button/focusable trigger with a hover/focus popover.

### Task 1: Clean The Douyin QR Asset

**Files:**
- Create: `static/support/douyin.png`

- [ ] **Step 1: Generate the cleaned asset**

Run from the repo root:

```bash
magick /Users/yxinyu/Downloads/20260603-003518.jpg \
  -gravity center -crop 1188x1188+0+0 +repage \
  -alpha set -fuzz 4% \
  -fill none \
  -draw 'color 0,0 floodfill' \
  -draw 'color 1187,0 floodfill' \
  -draw 'color 0,1187 floodfill' \
  -draw 'color 1187,1187 floodfill' \
  -background none -trim +repage \
  -gravity center -extent '%[fx:max(w,h)]x%[fx:max(w,h)]' \
  -filter Lanczos -resize 1024x1024 \
  -unsharp 0x0.65+0.75+0.015 \
  static/support/douyin.png
```

This center-crops the original 1320x1188 JPEG to square, resizes it to a 1024 working baseline, removes only the connected outside brown background, trims the resulting transparent border, extends the near-square QR body back onto a square transparent canvas, and applies a conservative sharpening pass. Do not use simple color-key transparency because the QR marks use a similar bronze color.

- [ ] **Step 2: Inspect the asset**

Run:

```bash
identify -format '%wx%h %[channels] %b\n' static/support/douyin.png
```

Expected:

```text
1024x1024 srgba ...B
```

Open the image and confirm the white Douyin QR body is intact, the large outer transparent margins are gone, and the remaining canvas is square.

- [ ] **Step 3: Commit the asset only**

```bash
git add static/support/douyin.png
git commit -m "feat: add douyin qr asset"
```

### Task 2: Add A Shared QR Social Entry

**Files:**
- Modify: `src/layouts/ShellHeader.tsx`

- [ ] **Step 1: Import the asset**

At the top of `src/layouts/ShellHeader.tsx`, next to the Xiaohongshu import:

```tsx
import type { CSSProperties, ReactNode } from 'react';
import douyinPng from '../../static/support/douyin.png';
import xiaohongshuSvg from '../../static/support/xiaohongshu.svg';
```

- [ ] **Step 2: Add a reusable QR popover component**

Place this helper above `ShellSocialLinks`:

```tsx
type QrSocialEntryProps = {
  href?: string;
  accent: string;
  badge: string;
  label: string;
  qrAlt: string;
  qrSrc: string;
  subtitle: string;
  title: string;
  children: ReactNode;
};

function QrSocialEntry({
  href,
  accent,
  badge,
  label,
  qrAlt,
  qrSrc,
  subtitle,
  title,
  children
}: QrSocialEntryProps) {
  const triggerClassName =
    'flex items-center justify-center size-8 text-[rgba(200,170,120,0.6)] hover:text-[var(--social-accent)] focus-visible:text-[var(--social-accent)] transition-colors';

  const trigger = href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={triggerClassName}
      aria-label={label}
    >
      {children}
    </a>
  ) : (
    <button
      type="button"
      className={triggerClassName}
      aria-label={label}
    >
      {children}
    </button>
  );

  return (
    <div
      className="relative group flex"
      style={{ '--social-accent': accent } as CSSProperties}
    >
      {trigger}
      <div className="absolute top-[calc(100%+0.5rem)] left-1/2 w-[260px] bg-[#0b0906] border border-[rgba(200,148,55,0.2)] rounded-[4px] shadow-[0_16px_40px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(255,198,98,0.05)] p-5 z-50 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto group-focus-within:opacity-100 group-focus-within:pointer-events-auto transition-all duration-200 transform -translate-x-1/2 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0 flex flex-col items-center gap-4">
        <div
          className="border rounded-[2px] px-3 py-[0.15rem] text-[0.55rem] tracking-[0.15em] font-bold"
          style={{
            borderColor: `${accent}80`,
            color: accent,
            backgroundColor: `${accent}10`
          }}
        >
          {badge}
        </div>
        <div className="w-full aspect-square bg-[#f8f0e3] rounded-[2px] p-2 shadow-[inset_0_0_0_1px_rgba(212,160,64,0.4)] flex items-center justify-center">
          <img src={qrSrc} alt={qrAlt} className="w-full h-full object-contain" />
        </div>
        <div className="flex flex-col items-center gap-[0.15rem]">
          <h3 className="font-bold text-[#d4a040] tracking-[0.08em] text-[1.05rem] m-0 leading-none">
            {title}
          </h3>
          <p className="text-[rgba(200,170,120,0.8)] text-[0.72rem] tracking-wide m-0">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Replace the current Xiaohongshu block and add Douyin**

Inside `ShellSocialLinks`, replace the current Xiaohongshu `div className="relative group flex"` block with:

```tsx
<QrSocialEntry
  href={bootstrap.links.xiaohongshu}
  accent="#ff2442"
  badge="REDNOTE"
  label="小红书"
  qrAlt="作者小红书二维码"
  qrSrc={xiaohongshuSvg}
  title="来小红书找我"
  subtitle="VibeCoding 日常和碎碎念"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
    <path d="M8 11h8" />
    <path d="M8 7h8" />
  </svg>
</QrSocialEntry>

<QrSocialEntry
  accent="#d4a040"
  badge="DOUYIN"
  label="抖音"
  qrAlt="作者抖音二维码"
  qrSrc={douyinPng}
  title="来抖音找我"
  subtitle="短视频、开发切片和日常"
>
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 3v11.5a4.5 4.5 0 1 1-4.5-4.5" />
    <path d="M14 6c1.35 2.25 3.1 3.5 5 3.8" />
  </svg>
</QrSocialEntry>
```

Keep the Douyin entry immediately after Xiaohongshu and before the Bilibili button.

- [ ] **Step 4: Run TypeScript verification**

Run:

```bash
npm run check
```

Expected: TypeScript passes.

- [ ] **Step 5: Commit the UI change**

```bash
git add src/layouts/ShellHeader.tsx
git commit -m "feat: add douyin social qr entry"
```

### Task 3: Browser Visual Check

**Files:**
- No code changes unless the check exposes layout issues.

- [ ] **Step 1: Start the dev server**

Run:

```bash
npm run dev -- --host 127.0.0.1 --port 14207
```

Open:

```text
http://127.0.0.1:14207/
```

- [ ] **Step 2: Check desktop header**

At a normal desktop width, verify:

- GitHub, Xiaohongshu, Douyin, and Bilibili remain in one row.
- Douyin sits directly next to Xiaohongshu.
- Hovering Xiaohongshu and Douyin shows same-size 260px popovers.
- Douyin QR has no brown square corners and remains scan-friendly.
- Bilibili and support menus are not covered in a way that prevents clicking their triggers.

- [ ] **Step 3: Check narrow width**

Resize to a narrow app-like viewport around 900px wide and verify:

- Header controls do not overlap the BazaarPlusPlus brand.
- QR popovers stay readable and are not clipped by the app shell.

If overlap appears, reduce `ShellSocialLinks` gap first (`gap-1` is already tight), then consider hiding the update message at narrower widths. Do not shrink the QR card below 240px because scan reliability matters.

## Self-Review

- Spec coverage: Adds Douyin beside Xiaohongshu, uses the provided QR image after cleanup, and keeps the visual language close to the existing Xiaohongshu card.
- Placeholder scan: No placeholder URL is included. Douyin remains QR-only because the input only includes a QR image.
- Type consistency: `QrSocialEntry` uses the same `bootstrap.links.xiaohongshu` contract already present; Douyin intentionally omits `href`.

## Future Link Wiring

If a real Douyin profile URL is provided later, add a separate small change that extends `AppLinks` in `src-tauri/src/commands/app.rs`, updates `src-tauri/resources/app-bootstrap.json`, mirrors the browser fallback in `src/features/about/aboutApi.ts`, regenerates bindings with `npm run generate:bindings`, and passes `href={bootstrap.links.douyin}` into the Douyin `QrSocialEntry`.
