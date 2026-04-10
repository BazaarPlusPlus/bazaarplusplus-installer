import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_PORT = 18765;
const MAX_PORT = 18785;
const TEMP_RENDER_DIR = join(homedir(), 'Desktop', 'temp_render');
const DATABASE_PATH = join(TEMP_RENDER_DIR, 'debug-records.sqlite');
const DEFAULT_CROP = {
  left: 0.342,
  top: 0.313,
  width: 0.58,
  height: 0.22
};

export function clampCrop(crop) {
  const width = Math.min(1, Math.max(0.05, Number(crop.width)));
  const height = Math.min(1, Math.max(0.05, Number(crop.height)));
  const left = Math.min(1 - width, Math.max(0, Number(crop.left)));
  const top = Math.min(1 - height, Math.max(0, Number(crop.top)));

  return {
    left: Number(left.toFixed(4)),
    top: Number(top.toFixed(4)),
    width: Number(width.toFixed(4)),
    height: Number(height.toFixed(4))
  };
}

export function buildCropStyle(crop) {
  const normalized = clampCrop(crop);
  return {
    widthPercent: `${(100 / normalized.width).toFixed(4)}%`,
    translateXPercent: `-${(normalized.left * 100).toFixed(4)}%`,
    translateYPercent: `-${(normalized.top * 100).toFixed(4)}%`
  };
}

export function computeCropFrameAspectRatio(imageSize, crop) {
  const normalized = clampCrop(crop);
  const width = Math.max(1, Number(imageSize.width));
  const height = Math.max(1, Number(imageSize.height));

  return ((width * normalized.width) / (height * normalized.height)).toFixed(4);
}

export function deriveSeedRows(imagePaths) {
  return [...imagePaths].sort().map((imagePath, index) => ({
    id: `debug-record-${index + 1}`,
    title: `Debug Record ${index + 1}`,
    subtitle: `Card strip calibration for ${imagePath.split('/').at(-1)}`,
    captured_at: `2026-04-10T23:${String(10 + index).padStart(2, '0')}:00+08:00`,
    image_path: imagePath
  }));
}

function listSourceImages() {
  const entries = readdirSync(TEMP_RENDER_DIR)
    .map((name) => join(TEMP_RENDER_DIR, name))
    .filter((path) => {
      const extension = extname(path).toLowerCase();
      return extension === '.png' && statSync(path).isFile();
    });

  if (entries.length === 0) {
    throw new Error(`No PNG files found in ${TEMP_RENDER_DIR}`);
  }

  return entries;
}

function runSqlite(sql) {
  const result = spawnSync('sqlite3', [DATABASE_PATH, sql], {
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'sqlite3 command failed');
  }

  return result.stdout.trim();
}

function initializeDatabase(rows) {
  runSqlite(`
    drop table if exists records;
    create table records (
      id text primary key,
      title text not null,
      subtitle text not null,
      captured_at text not null,
      image_path text not null
    );
  `);

  for (const row of rows) {
    const escaped = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [key, String(value).replaceAll("'", "''")])
    );

    runSqlite(`
      insert into records (id, title, subtitle, captured_at, image_path)
      values (
        '${escaped.id}',
        '${escaped.title}',
        '${escaped.subtitle}',
        '${escaped.captured_at}',
        '${escaped.image_path}'
      );
    `);
  }
}

function queryRows() {
  const result = spawnSync(
    'sqlite3',
    ['-json', DATABASE_PATH, 'select id, title, subtitle, captured_at, image_path from records order by captured_at asc'],
    { encoding: 'utf8' }
  );

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || 'sqlite3 query failed');
  }

  return JSON.parse(result.stdout || '[]');
}

function getMimeType(pathname) {
  const extension = extname(pathname).toLowerCase();
  switch (extension) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.js':
      return 'application/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'text/html; charset=utf-8';
  }
}

function renderPage(rows) {
  const initialRows = JSON.stringify(rows);
  const initialCrop = JSON.stringify(DEFAULT_CROP);

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Temp Render Crop Debugger</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0d1014;
        --panel: rgba(19, 23, 29, 0.88);
        --line: rgba(255, 184, 76, 0.18);
        --text: #f6ead1;
        --muted: rgba(246, 234, 209, 0.68);
        --accent: #f2b35a;
        --accent-strong: #ffd38d;
        --crop-left: 34.2%;
        --crop-top: 31.3%;
        --crop-width: 58%;
        --crop-height: 22%;
        --crop-image-width: 172.4138%;
        --crop-translate-x: -34.2000%;
        --crop-translate-y: -31.3000%;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Iowan Old Style", "Palatino Linotype", serif;
        background:
          radial-gradient(circle at top, rgba(255, 183, 77, 0.12), transparent 30%),
          linear-gradient(180deg, #131920 0%, #090c10 100%);
        color: var(--text);
      }

      .shell {
        width: min(1440px, calc(100vw - 24px));
        margin: 12px auto 24px;
        display: grid;
        gap: 14px;
      }

      .hero,
      .controls,
      .record {
        background: var(--panel);
        border: 1px solid var(--line);
        border-radius: 24px;
        box-shadow: 0 24px 80px rgba(0, 0, 0, 0.34);
      }

      .hero,
      .controls {
        padding: 18px 20px;
      }

      .hero h1,
      .hero p,
      .record h2,
      .record p {
        margin: 0;
      }

      .eyebrow {
        font-size: 12px;
        letter-spacing: 0.34em;
        text-transform: uppercase;
        color: rgba(255, 202, 118, 0.76);
      }

      .hero h1 {
        margin-top: 6px;
        font-size: clamp(28px, 4vw, 52px);
        line-height: 0.96;
      }

      .hero p {
        margin-top: 8px;
        max-width: 70ch;
        line-height: 1.5;
        color: var(--muted);
      }

      .controls-grid {
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 14px;
        margin-top: 14px;
      }

      .control {
        display: grid;
        gap: 8px;
      }

      .control label {
        font-size: 13px;
        color: var(--accent-strong);
      }

      .control output {
        font-family: "SF Mono", "Menlo", monospace;
        font-size: 12px;
        color: var(--muted);
      }

      .control input[type="range"] {
        width: 100%;
      }

      .summary {
        margin-top: 14px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }

      .summary-chip {
        padding: 9px 12px;
        border-radius: 999px;
        border: 1px solid rgba(255, 196, 108, 0.16);
        background: rgba(255, 196, 108, 0.06);
        font-family: "SF Mono", "Menlo", monospace;
        font-size: 12px;
        color: var(--muted);
      }

      .records {
        display: grid;
        gap: 14px;
      }

      .record {
        padding: 18px;
      }

      .record-head {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        align-items: start;
        margin-bottom: 14px;
      }

      .record-head p {
        color: var(--muted);
        margin-top: 6px;
      }

      .preview-grid {
        display: grid;
        grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
        gap: 16px;
      }

      .frame {
        display: grid;
        gap: 10px;
      }

      .frame-title {
        font-size: 12px;
        letter-spacing: 0.22em;
        text-transform: uppercase;
        color: rgba(255, 202, 118, 0.76);
      }

      .source-stage,
      .crop-stage {
        position: relative;
        overflow: hidden;
        border-radius: 18px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        background: rgba(5, 7, 10, 0.92);
      }

      .source-stage img,
      .crop-stage img {
        display: block;
        width: 100%;
        height: auto;
      }

      .source-stage::after {
        content: "";
        position: absolute;
        left: var(--crop-left);
        top: var(--crop-top);
        width: var(--crop-width);
        height: var(--crop-height);
        border: 2px solid rgba(255, 196, 108, 0.95);
        box-shadow:
          0 0 0 9999px rgba(4, 5, 7, 0.46),
          0 0 22px rgba(255, 196, 108, 0.24);
        border-radius: 14px;
        pointer-events: none;
      }

      .crop-stage {
        aspect-ratio: 4.6875;
      }

      .crop-stage img {
        position: absolute;
        left: 0;
        top: 0;
        max-width: none;
        width: var(--crop-image-width);
        height: auto;
        transform: translate(var(--crop-translate-x), var(--crop-translate-y));
        transform-origin: top left;
      }

      .footer-note {
        color: var(--muted);
        font-size: 13px;
        line-height: 1.5;
      }

      @media (max-width: 980px) {
        .controls-grid,
        .preview-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      <section class="hero">
        <p class="eyebrow">Temp Render</p>
        <h1>Card Strip Crop Debugger</h1>
        <p>
          This page serves the original images from your desktop and crops the card strip entirely in HTML/CSS using normalized ratios.
          Adjust the four sliders until both examples align, then copy the final ratios back into the app.
        </p>
      </section>

      <section class="controls">
        <p class="eyebrow">Calibration Controls</p>
        <div class="controls-grid">
          <div class="control">
            <label for="left">Left</label>
            <input id="left" type="range" min="0" max="0.95" step="0.001" />
            <output id="leftValue"></output>
          </div>
          <div class="control">
            <label for="top">Top</label>
            <input id="top" type="range" min="0" max="0.95" step="0.001" />
            <output id="topValue"></output>
          </div>
          <div class="control">
            <label for="width">Width</label>
            <input id="width" type="range" min="0.05" max="1" step="0.001" />
            <output id="widthValue"></output>
          </div>
          <div class="control">
            <label for="height">Height</label>
            <input id="height" type="range" min="0.05" max="1" step="0.001" />
            <output id="heightValue"></output>
          </div>
        </div>
        <div class="summary">
          <div class="summary-chip" id="cropJson"></div>
          <div class="summary-chip">SQLite: ${DATABASE_PATH}</div>
          <div class="summary-chip">Images: ${rows.length}</div>
        </div>
      </section>

      <section class="records" id="records"></section>
    </main>
    <script>
      const rows = ${initialRows};
      const defaultCrop = ${initialCrop};
      const controls = {
        left: document.getElementById('left'),
        top: document.getElementById('top'),
        width: document.getElementById('width'),
        height: document.getElementById('height')
      };
      const outputs = {
        left: document.getElementById('leftValue'),
        top: document.getElementById('topValue'),
        width: document.getElementById('widthValue'),
        height: document.getElementById('heightValue')
      };
      const cropJson = document.getElementById('cropJson');
      const recordsRoot = document.getElementById('records');

      function clampCrop(crop) {
        const width = Math.min(1, Math.max(0.05, Number(crop.width)));
        const height = Math.min(1, Math.max(0.05, Number(crop.height)));
        const left = Math.min(1 - width, Math.max(0, Number(crop.left)));
        const top = Math.min(1 - height, Math.max(0, Number(crop.top)));
        return {
          left: Number(left.toFixed(4)),
          top: Number(top.toFixed(4)),
          width: Number(width.toFixed(4)),
          height: Number(height.toFixed(4))
        };
      }

      function buildCropStyle(crop) {
        const normalized = clampCrop(crop);
        return {
          widthPercent: (100 / normalized.width).toFixed(4) + '%',
          translateXPercent: '-' + (normalized.left * 100).toFixed(4) + '%',
          translateYPercent: '-' + (normalized.top * 100).toFixed(4) + '%'
        };
      }

      function renderRecords() {
        recordsRoot.innerHTML = rows.map((row, index) => \`
          <article class="record">
            <div class="record-head">
              <div>
                <p class="eyebrow">Record \${index + 1}</p>
                <h2>\${row.title}</h2>
                <p>\${row.subtitle}</p>
              </div>
              <div class="summary-chip">\${row.captured_at}</div>
            </div>
            <div class="preview-grid">
              <div class="frame">
                <div class="frame-title">Original</div>
                <div class="source-stage">
                  <img src="/images/\${encodeURIComponent(row.image_path.split('/').at(-1))}" alt="\${row.title}" />
                </div>
              </div>
              <div class="frame">
                <div class="frame-title">Cropped In HTML</div>
                <div class="crop-stage">
                  <img src="/images/\${encodeURIComponent(row.image_path.split('/').at(-1))}" alt="\${row.title}" />
                </div>
                <p class="footer-note">The crop preview uses the same raw image and only reveals the card strip with normalized CSS ratios.</p>
              </div>
            </div>
          </article>
        \`).join('');
      }

      function syncCropFrames(crop) {
        const normalized = clampCrop(crop);

        document.querySelectorAll('.crop-stage').forEach((stage) => {
          const image = stage.querySelector('img');
          if (!image) {
            return;
          }

          const updateStage = () => {
            if (!image.naturalWidth || !image.naturalHeight) {
              return;
            }

            stage.style.aspectRatio =
              ((image.naturalWidth * normalized.width) /
                (image.naturalHeight * normalized.height))
                .toFixed(4);
          };

          if (image.complete) {
            updateStage();
          } else {
            image.addEventListener('load', updateStage, { once: true });
          }
        });
      }

      function applyCrop(crop) {
        const normalized = clampCrop(crop);
        const layout = buildCropStyle(normalized);
        document.documentElement.style.setProperty('--crop-left', (normalized.left * 100).toFixed(2) + '%');
        document.documentElement.style.setProperty('--crop-top', (normalized.top * 100).toFixed(2) + '%');
        document.documentElement.style.setProperty('--crop-width', (normalized.width * 100).toFixed(2) + '%');
        document.documentElement.style.setProperty('--crop-height', (normalized.height * 100).toFixed(2) + '%');
        document.documentElement.style.setProperty('--crop-image-width', layout.widthPercent);
        document.documentElement.style.setProperty('--crop-translate-x', layout.translateXPercent);
        document.documentElement.style.setProperty('--crop-translate-y', layout.translateYPercent);

        for (const [key, value] of Object.entries(normalized)) {
          controls[key].value = value;
          outputs[key].textContent = value.toFixed(4);
        }

        cropJson.textContent = JSON.stringify(normalized);
        window.localStorage.setItem('bpp-temp-render-crop-v2', JSON.stringify(normalized));
        syncCropFrames(normalized);
      }

      for (const control of Object.values(controls)) {
        control.addEventListener('input', () => {
          applyCrop({
            left: controls.left.value,
            top: controls.top.value,
            width: controls.width.value,
            height: controls.height.value
          });
        });
      }

      const savedCrop = (() => {
        try {
          return JSON.parse(window.localStorage.getItem('bpp-temp-render-crop-v2') || 'null');
        } catch {
          return null;
        }
      })();

      renderRecords();
      applyCrop(savedCrop || defaultCrop);
    </script>
  </body>
</html>`;
}

function serve() {
  const imagePaths = listSourceImages();
  const rows = deriveSeedRows(imagePaths);
  initializeDatabase(rows);
  const page = renderPage(rows);
  writeFileSync(join(TEMP_RENDER_DIR, 'debug-index.html'), page, 'utf8');

  let port = DEFAULT_PORT;
  while (port <= MAX_PORT) {
    try {
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`);

        if (url.pathname === '/' || url.pathname === '/index.html') {
          response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          response.end(page);
          return;
        }

        if (url.pathname === '/api/records') {
          response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
          response.end(JSON.stringify(queryRows(), null, 2));
          return;
        }

        if (url.pathname.startsWith('/images/')) {
          const name = decodeURIComponent(url.pathname.slice('/images/'.length));
          const path = resolve(TEMP_RENDER_DIR, name);
          if (!path.startsWith(resolve(TEMP_RENDER_DIR))) {
            response.writeHead(403);
            response.end('forbidden');
            return;
          }

          try {
            const body = readFileSync(path);
            response.writeHead(200, { 'content-type': getMimeType(path) });
            response.end(body);
          } catch {
            response.writeHead(404);
            response.end('not found');
          }
          return;
        }

        response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        response.end('not found');
      });

      server.listen(port, '127.0.0.1');
      server.on('listening', () => {
        console.log(`Temp render debug server listening at http://127.0.0.1:${port}`);
        console.log(`SQLite seeded at ${DATABASE_PATH}`);
      });
      return;
    } catch {
      port += 1;
    }
  }

  throw new Error(`No available port in range ${DEFAULT_PORT}-${MAX_PORT}`);
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  serve();
}
