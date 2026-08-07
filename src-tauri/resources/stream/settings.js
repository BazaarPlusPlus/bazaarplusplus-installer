const DEFAULT_CROP = {
  left: 0.342,
  top: 0.313,
  width: 0.58,
  height: 0.22
};

// This page is served by the local stream service on its own origin, so it
// cannot read the app's stored locale. The app appends `?lang=` when it opens
// the page; a direct visit falls back to the browser language.
const MESSAGES = {
  en: {
    documentTitle: 'BazaarPlusPlus Overlay Calibration',
    eyebrow: 'Stream Overlay',
    heading: 'Crop Calibration',
    headerNote:
      'Adjust the crop directly on the source screenshot, then save or copy the code.',
    previewEyebrow: 'Preview',
    previewHeading: 'Adjust once, preview everywhere',
    previewEmpty: 'Waiting for screenshots with end-of-run crops.',
    sourceImage: 'Source image',
    noSample: 'No sample selected',
    imageAlt: 'Selected end-of-run record image',
    controlsEyebrow: 'Controls',
    controlsHeading: 'Crop ratios',
    cropLeft: 'Left',
    cropTop: 'Top',
    cropWidth: 'Width',
    cropHeight: 'Height',
    saveButton: 'Save Crop',
    copyButton: 'Copy Base64 Code',
    settingsCode: 'Settings code',
    statusLoading: 'Loading the selected stream record...',
    statusLoaded:
      'Loaded the selected stream record image. Adjust the crop on the source image, then save or copy the code.',
    statusEmpty:
      'No end-of-run record is available in the current stream window yet. Finish a run, then refresh this page.',
    statusSaved: 'Crop saved. Overlay will use this code on the next refresh.',
    statusCopied: 'Base64 settings code copied to clipboard.',
    statusSaveFailed: 'Failed to save crop.',
    statusCopyFailed: 'Failed to copy code.',
    statusLoadFailed: 'Failed to load calibration data.',
    unknownHero: 'Unknown hero',
    battles: '{count} battles'
  },
  zh: {
    documentTitle: 'BazaarPlusPlus 叠加层校准',
    eyebrow: '直播叠加层',
    heading: '裁切校准',
    headerNote: '直接在源截图上调整裁切范围，然后保存或复制裁切代码。',
    previewEyebrow: '预览',
    previewHeading: '调整一次，处处生效',
    previewEmpty: '正在等待带有结算裁切的截图。',
    sourceImage: '源图像',
    noSample: '未选择样本',
    imageAlt: '当前选中的结算记录图像',
    controlsEyebrow: '控制',
    controlsHeading: '裁切比例',
    cropLeft: '左',
    cropTop: '上',
    cropWidth: '宽',
    cropHeight: '高',
    saveButton: '保存裁切',
    copyButton: '复制 Base64 代码',
    settingsCode: '设置代码',
    statusLoading: '正在读取当前展示的对局记录…',
    statusLoaded:
      '已载入当前展示的对局记录图像。在源图像上调整裁切范围，然后保存或复制裁切代码。',
    statusEmpty:
      '当前展示窗口内还没有结算记录。完成一局对局后刷新本页即可。',
    statusSaved: '裁切已保存。叠加层将在下次刷新时使用该配置。',
    statusCopied: 'Base64 设置代码已复制到剪贴板。',
    statusSaveFailed: '保存裁切失败。',
    statusCopyFailed: '复制裁切代码失败。',
    statusLoadFailed: '加载校准数据失败。',
    unknownHero: '未知英雄',
    battles: '{count} 场战斗'
  }
};

const locale = resolveLocale();
const strings = MESSAGES[locale];

function resolveLocale() {
  const candidates = [];
  try {
    candidates.push(new URLSearchParams(window.location.search).get('lang'));
  } catch {
    // A malformed query string just falls through to the browser language.
  }
  candidates.push(...(navigator.languages || []), navigator.language);

  for (const candidate of candidates) {
    if (typeof candidate !== 'string' || !candidate) continue;
    const lower = candidate.toLowerCase();
    if (lower.startsWith('zh')) return 'zh';
    if (lower.startsWith('en')) return 'en';
  }
  return 'en';
}

function t(key, params) {
  const text = strings[key] ?? MESSAGES.en[key] ?? key;
  if (!params) return text;
  return Object.entries(params).reduce(
    (result, [name, value]) => result.replaceAll(`{${name}}`, String(value)),
    text
  );
}

function applyStaticTranslations() {
  document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
  document.title = t('documentTitle');

  document.querySelectorAll('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-alt]').forEach((node) => {
    node.setAttribute('alt', t(node.dataset.i18nAlt));
  });
}

const pageStatus = document.getElementById('page-status');
const previewEmpty = document.getElementById('preview-empty');
const previewWorkspace = document.getElementById('preview-workspace');
const fullPreviewImage = document.getElementById('full-preview-image');
const selectedMeta = document.getElementById('selected-meta');
const codeField = document.getElementById('settings-code');
const saveButton = document.getElementById('save-button');
const copyButton = document.getElementById('copy-button');
const inputs = {
  left: document.getElementById('crop-left'),
  top: document.getElementById('crop-top'),
  width: document.getElementById('crop-width'),
  height: document.getElementById('crop-height')
};
const outputs = {
  left: document.getElementById('crop-left-value'),
  top: document.getElementById('crop-top-value'),
  width: document.getElementById('crop-width-value'),
  height: document.getElementById('crop-height-value')
};

let selectedRecord = null;
let currentCrop = { ...DEFAULT_CROP };
let previewNonce = 0;
let previewTimer = null;
const requestedOffset = readRequestedOffset();

function setStatus(message) {
  if (pageStatus) {
    pageStatus.textContent = message;
  }
}

// Request failures carry the raw response body, which can be a whole HTML error
// document. That belongs in the console, not in the page's status line.
function reportFailure(error, messageKey) {
  console.error('[calibration]', error);
  setStatus(t(messageKey));
}

function readRequestedOffset() {
  try {
    const params = new URLSearchParams(window.location.search);
    const raw = Number(params.get('offset') || '0');
    if (!Number.isFinite(raw)) {
      return 0;
    }
    return Math.max(0, Math.trunc(raw));
  } catch {
    return 0;
  }
}

function setCropVariables(crop) {
  const root = document.documentElement;
  root.style.setProperty('--crop-left', `${crop.left * 100}%`);
  root.style.setProperty('--crop-top', `${crop.top * 100}%`);
  root.style.setProperty('--crop-width', `${crop.width * 100}%`);
  root.style.setProperty('--crop-height', `${crop.height * 100}%`);
}

function readCropFromInputs() {
  return {
    left: Number(inputs.left?.value || DEFAULT_CROP.left),
    top: Number(inputs.top?.value || DEFAULT_CROP.top),
    width: Number(inputs.width?.value || DEFAULT_CROP.width),
    height: Number(inputs.height?.value || DEFAULT_CROP.height)
  };
}

function writeCropToInputs(crop) {
  Object.entries(crop).forEach(([key, value]) => {
    const input = inputs[key];
    if (input) {
      input.value = value.toFixed(3);
    }
    const output = outputs[key];
    if (output) {
      output.value = value.toFixed(3);
      output.textContent = value.toFixed(3);
    }
  });
}

function buildStripUrl(recordId, crop) {
  const params = new URLSearchParams({
    left: crop.left.toFixed(3),
    top: crop.top.toFixed(3),
    width: crop.width.toFixed(3),
    height: crop.height.toFixed(3),
    preview: '1',
    v: String(previewNonce)
  });

  return `/images/${encodeURIComponent(recordId)}/strip?${params.toString()}`;
}

function encodeCropCode(crop) {
  const payload = JSON.stringify({ v: 1, crop });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary);
}

function updateCodeField(crop) {
  if (!codeField) {
    return;
  }

  codeField.textContent = encodeCropCode(crop);
}

function renderPreview() {
  const crop = readCropFromInputs();
  currentCrop = crop;
  previewNonce += 1;
  writeCropToInputs(crop);
  setCropVariables(crop);

  if (!selectedRecord?.id) {
    if (previewEmpty) {
      previewEmpty.hidden = false;
    }
    if (previewWorkspace) {
      previewWorkspace.hidden = true;
    }
    return;
  }

  if (previewEmpty) {
    previewEmpty.hidden = true;
  }
  if (previewWorkspace) {
    previewWorkspace.hidden = false;
  }
  if (fullPreviewImage) {
    fullPreviewImage.src = `/images/${encodeURIComponent(selectedRecord.id)}`;
  }
  if (selectedMeta) {
    selectedMeta.textContent = [
      selectedRecord.title || t('unknownHero'),
      typeof selectedRecord.wins === 'number' ? `${selectedRecord.wins}W` : null,
      typeof selectedRecord.battle_count === 'number'
        ? t('battles', { count: selectedRecord.battle_count })
        : null
    ]
      .filter(Boolean)
      .join(' · ');
  }
}

async function loadCropSettings() {
  const response = await fetch('/api/overlay/crop-config', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json();
}

async function loadRecords() {
  const endpoint = new URL('/api/stream/records/latest', window.location.origin);
  if (requestedOffset > 0) {
    endpoint.searchParams.set('offset', String(requestedOffset));
  }

  const response = await fetch(endpoint, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  return payload?.id ? payload : null;
}

async function saveCrop() {
  const crop = readCropFromInputs();
  const response = await fetch('/api/overlay/crop-config', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ crop })
  });

  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  currentCrop = payload.crop;
  writeCropToInputs(payload.crop);
  setCropVariables(payload.crop);
  updateCodeField(payload.crop);
  renderPreview();
  setStatus(t('statusSaved'));
}

async function copyCode() {
  const code = codeField?.textContent?.trim() || '';
  if (!code) {
    return;
  }

  await navigator.clipboard.writeText(code);
  setStatus(t('statusCopied'));
}

function bindInputHandlers() {
  Object.values(inputs).forEach((input) => {
    input?.addEventListener('input', () => {
      currentCrop = readCropFromInputs();
      writeCropToInputs(currentCrop);
      setCropVariables(currentCrop);
      updateCodeField(currentCrop);
      if (previewTimer) {
        window.clearTimeout(previewTimer);
      }
      previewTimer = window.setTimeout(() => {
        renderPreview();
      }, 120);
    });
  });

  saveButton?.addEventListener('click', async () => {
    try {
      await saveCrop();
    } catch (error) {
      reportFailure(error, 'statusSaveFailed');
    }
  });

  copyButton?.addEventListener('click', async () => {
    try {
      await copyCode();
    } catch (error) {
      reportFailure(error, 'statusCopyFailed');
    }
  });

}

async function initialize() {
  try {
    applyStaticTranslations();
    bindInputHandlers();
    const [settingsPayload, latestRecord] = await Promise.all([
      loadCropSettings(),
      loadRecords()
    ]);

    currentCrop = settingsPayload?.crop || { ...DEFAULT_CROP };
    writeCropToInputs(currentCrop);
    setCropVariables(currentCrop);
    updateCodeField(currentCrop);

    selectedRecord = latestRecord;
    renderPreview();

    setStatus(t(selectedRecord ? 'statusLoaded' : 'statusEmpty'));
  } catch (error) {
    reportFailure(error, 'statusLoadFailed');
  }
}

void initialize();
