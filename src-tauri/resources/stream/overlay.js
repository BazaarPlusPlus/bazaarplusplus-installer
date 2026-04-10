const root = document.getElementById('overlay-root');
const title = document.getElementById('overlay-title');
const detail = document.getElementById('overlay-detail');
const kicker = document.getElementById('overlay-kicker');
const time = document.getElementById('overlay-time');
const signal = document.getElementById('overlay-signal');
const status = document.getElementById('overlay-status');
const cardShell = document.getElementById('overlay-card-shell');
const cardStage = document.getElementById('overlay-card-stage');
const cardImage = document.getElementById('overlay-card-image');

const CROP = {
  left: 0.342,
  top: 0.313,
  width: 0.58,
  height: 0.22
};

let lastRecordKey = null;
let lastImageUrl = null;

function setClassNames(...tokens) {
  if (!root) {
    return;
  }

  root.className = ['overlay', ...tokens].join(' ');
}

function markUpdated() {
  if (!root) {
    return;
  }

  root.classList.remove('is-updated');
  window.requestAnimationFrame(() => {
    root.classList.add('is-updated');
    window.setTimeout(() => root.classList.remove('is-updated'), 700);
  });
}

function renderEmpty(message) {
  if (!title || !detail || !kicker || !time || !signal || !status) {
    return;
  }

  setClassNames('empty');
  kicker.textContent = 'Latest Record';
  title.textContent = 'No records yet';
  detail.textContent =
    message ?? 'Start a match and the overlay will update automatically.';
  time.textContent = 'Awaiting first result';
  signal.textContent = 'Local feed idle';
  status.textContent = 'Waiting';
  hideCardPreview();
}

function renderRecord(record, options = {}) {
  if (!title || !detail || !kicker || !time || !signal || !status) {
    return;
  }

  const { stale = false, updated = false } = options;
  const stateClass = stale ? 'stale' : 'live';

  setClassNames(stateClass);
  kicker.textContent = stale ? 'Latest Record Cached' : 'Latest Record';
  title.textContent = record.title || 'Untitled record';
  detail.textContent = record.subtitle || 'No subtitle available.';
  time.textContent = record.captured_at || 'Capture time unavailable';
  signal.textContent = stale ? 'Connection lost, showing cached data' : 'Local SQLite feed live';
  status.textContent = stale ? 'Retrying' : 'Live';
  updateCardPreview(record.image_url ?? null);

  if (updated) {
    markUpdated();
  }
}

function getRecordKey(record) {
  return [
    record?.id ?? '',
    record?.captured_at ?? '',
    record?.title ?? '',
    record?.image_url ?? ''
  ].join('::');
}

function hideCardPreview() {
  if (!cardShell || !cardImage) {
    return;
  }

  cardShell.hidden = true;
  cardImage.removeAttribute('src');
  lastImageUrl = null;
}

function applyCardCrop() {
  if (!cardStage || !cardImage || !cardImage.naturalWidth || !cardImage.naturalHeight) {
    return;
  }

  const stageAspectRatio =
    (cardImage.naturalWidth * CROP.width) / (cardImage.naturalHeight * CROP.height);

  document.documentElement.style.setProperty(
    '--crop-stage-aspect-ratio',
    stageAspectRatio.toFixed(4)
  );
}

function updateCardPreview(imageUrl) {
  if (!cardShell || !cardImage) {
    return;
  }

  if (!imageUrl) {
    hideCardPreview();
    return;
  }

  cardShell.hidden = false;

  if (lastImageUrl === imageUrl) {
    if (cardImage.complete) {
      applyCardCrop();
    }
    return;
  }

  lastImageUrl = imageUrl;
  cardImage.onload = () => {
    applyCardCrop();
  };
  cardImage.src = imageUrl;
}

async function refresh() {
  try {
    const response = await fetch('/api/records/latest', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`unexpected status ${response.status}`);
    }

    const payload = await response.json();
    if (!payload) {
      lastRecordKey = null;
      renderEmpty();
      return;
    }

    const nextKey = getRecordKey(payload);
    const updated = nextKey !== lastRecordKey;
    lastRecordKey = nextKey;
    renderRecord(payload, { updated });
  } catch {
    if (lastRecordKey) {
      setClassNames('live', 'stale');
      if (signal) {
        signal.textContent = 'Connection lost, showing cached data';
      }
      if (status) {
        status.textContent = 'Retrying';
      }
      return;
    }

    renderEmpty('Waiting for the local stream service.');
  }
}

renderEmpty();
void refresh();
window.setInterval(refresh, 4000);
