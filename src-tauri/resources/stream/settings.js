const DEFAULT_CROP = {
  left: 0.342,
  top: 0.313,
  width: 0.58,
  height: 0.22
};

const pageStatus = document.getElementById('page-status');
const previewEmpty = document.getElementById('preview-empty');
const previewWorkspace = document.getElementById('preview-workspace');
const fullPreviewImage = document.getElementById('full-preview-image');
const selectedMeta = document.getElementById('selected-meta');
const codeField = document.getElementById('settings-code');
const saveButton = document.getElementById('save-button');
const copyButton = document.getElementById('copy-button');
const badgeHeroInput = document.getElementById('badge-hero');
const badgeWinsInput = document.getElementById('badge-wins');
const badgeBattlesInput = document.getElementById('badge-battles');
const badgeWinsValue = document.getElementById('badge-wins-value');
const badgeBattlesValue = document.getElementById('badge-battles-value');
const badgePreviewCard = document.querySelector('.badge-preview-card');
const badgePreviewScore = document.getElementById('badge-preview-score');
const badgePreviewWins = document.getElementById('badge-preview-wins');
const badgePreviewBattles = document.getElementById('badge-preview-battles');
const badgePreviewInfo = document.getElementById('badge-preview-info');

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

let records = [];
let selectedId = null;
let currentCrop = { ...DEFAULT_CROP };
let previewNonce = 0;
let previewTimer = null;

function setStatus(message) {
  if (pageStatus) {
    pageStatus.textContent = message;
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

function getVictoryTier(wins, battles) {
  if (!Number.isFinite(wins)) {
    return 'tier-unknown-preview';
  }
  if (wins === 10 && battles === 10) {
    return 'tier-diamond-preview';
  }
  if (wins >= 10 && battles > 10) {
    return 'tier-gold-preview';
  }
  if (wins >= 7) {
    return 'tier-silver-preview';
  }
  if (wins >= 4) {
    return 'tier-bronze-preview';
  }
  return 'tier-misfortune-preview';
}

function getHeroBadgeStyle(heroName) {
  const map = {
    Vanessa: { shortCode: 'VAN', background: 'rgb(192, 33, 33)', text: '#ffffff', assetKey: 'van' },
    Pygmalien: { shortCode: 'PYG', background: 'rgb(39, 103, 192)', text: '#ffffff', assetKey: 'pyg' },
    Dooley: { shortCode: 'DOO', background: 'rgb(225, 154, 8)', text: '#ffffff', assetKey: 'doo' },
    Mak: { shortCode: 'MAK', background: 'rgb(190, 230, 91)', text: 'rgb(26, 31, 38)', assetKey: 'mak' },
    Jules: { shortCode: 'JUL', background: 'rgb(180, 52, 236)', text: '#ffffff', assetKey: 'jul' },
    Karnok: { shortCode: 'KAR', background: 'rgb(59, 136, 156)', text: '#ffffff', assetKey: 'kar' },
    Stelle: { shortCode: 'STE', background: 'rgb(255, 235, 24)', text: 'rgb(26, 31, 38)', assetKey: 'ste' }
  };

  return map[heroName] || { shortCode: 'UNK', background: 'rgb(57, 73, 97)', text: '#ffffff', assetKey: 'unk' };
}

function getWinsBadgeAsset(wins, battles) {
  if (!Number.isFinite(wins) || wins < 0) {
    return '/assets/badges/wins/wins-0-mis.svg';
  }
  const safeWins = Math.max(0, Math.min(10, Math.trunc(wins)));
  if (safeWins === 10) {
    if (Number.isFinite(battles) && Math.trunc(battles) === 10) {
      return '/assets/badges/wins/wins-10-dia.svg';
    }
    return '/assets/badges/wins/wins-10-gld.svg';
  }
  if (safeWins >= 7) {
    return `/assets/badges/wins/wins-${safeWins}-slv.svg`;
  }
  if (safeWins >= 4) {
    return `/assets/badges/wins/wins-${safeWins}-brz.svg`;
  }
  return `/assets/badges/wins/wins-${safeWins}-mis.svg`;
}

function getInfoBadgeAsset(heroKey, battles) {
  const safeHeroKey = typeof heroKey === 'string' && heroKey ? heroKey : 'unk';
  const safeBattles = Number.isFinite(battles) ? Math.max(0, Math.min(20, Math.trunc(battles))) : 0;
  return `/assets/badges/info/info-${safeHeroKey}-${safeBattles}.svg`;
}

function renderBadgePreview() {
  if (
    !badgeHeroInput ||
    !badgeWinsInput ||
    !badgeBattlesInput ||
    !badgePreviewCard ||
    !badgePreviewScore ||
    !badgePreviewWins ||
    !badgePreviewBattles ||
    !badgePreviewInfo
  ) {
    return;
  }

  let wins = Number(badgeWinsInput.value || 0);
  let battles = Number(badgeBattlesInput.value || 0);
  if (wins > battles) {
    battles = wins;
    badgeBattlesInput.value = String(battles);
  }

  const hero = badgeHeroInput.value;
  const heroStyle = getHeroBadgeStyle(hero);

  if (badgeWinsValue) {
    badgeWinsValue.textContent = String(wins);
  }
  if (badgeBattlesValue) {
    badgeBattlesValue.textContent = String(battles);
  }

  badgePreviewWins.innerHTML = `<img class="badge-preview-svg" src="${getWinsBadgeAsset(wins, battles)}" alt="${wins} wins" />`;
  badgePreviewBattles.innerHTML = `<img class="badge-preview-svg" src="${getInfoBadgeAsset(heroStyle.assetKey, battles)}" alt="${battles} battles with ${heroStyle.shortCode}" />`;
}

function renderPreview() {
  const selectedRecord = records.find((record) => record.id === selectedId) || null;
  const crop = readCropFromInputs();
  currentCrop = crop;
  previewNonce += 1;
  writeCropToInputs(crop);
  setCropVariables(crop);

  if (!selectedRecord || !selectedRecord.image_url) {
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
    fullPreviewImage.src = selectedRecord.image_url;
  }
  if (selectedMeta) {
    selectedMeta.textContent = [
      selectedRecord.title || 'Unknown hero',
      typeof selectedRecord.wins === 'number' ? `${selectedRecord.wins}W` : null,
      typeof selectedRecord.battle_count === 'number'
        ? `${selectedRecord.battle_count} battles`
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
  const response = await fetch('/api/records/recent?limit=12', { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  const payload = await response.json();
  return Array.isArray(payload) ? payload.filter((record) => record?.image_url) : [];
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
  setStatus('Crop saved. Overlay will use this code on the next refresh.');
}

async function copyCode() {
  const code = codeField?.textContent?.trim() || '';
  if (!code) {
    return;
  }

  await navigator.clipboard.writeText(code);
  setStatus('Base64 settings code copied to clipboard.');
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
      setStatus(error instanceof Error ? error.message : 'Failed to save crop.');
    }
  });

  copyButton?.addEventListener('click', async () => {
    try {
      await copyCode();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to copy code.');
    }
  });

  badgeHeroInput?.addEventListener('change', renderBadgePreview);
  badgeWinsInput?.addEventListener('input', renderBadgePreview);
  badgeBattlesInput?.addEventListener('input', renderBadgePreview);
}

async function initialize() {
  try {
    bindInputHandlers();
    const [settingsPayload, recentRecords] = await Promise.all([
      loadCropSettings(),
      loadRecords()
    ]);

    currentCrop = settingsPayload?.crop || { ...DEFAULT_CROP };
    writeCropToInputs(currentCrop);
    setCropVariables(currentCrop);
    updateCodeField(currentCrop);

    records = recentRecords;
    selectedId = records[0]?.id ?? null;
    renderPreview();
    renderBadgePreview();

    setStatus(
      records.length > 0
        ? 'Loaded recent screenshots. Adjust the crop on the source image, then save or copy the code.'
        : 'No recent screenshot samples yet. Finish a run, then refresh this page.'
    );
  } catch (error) {
    setStatus(
      error instanceof Error
        ? error.message
        : 'Failed to load calibration data.'
    );
  }
}

void initialize();
