import { on, emit, navigate } from './app.js';

// ── State ──────────────────────────────────────────────────
const state = {
  song:        null,
  fileType:    null,
  pages:       [],       // URLs (jpg) or nothing (pdf uses pdfDoc)
  pdfDoc:      null,
  currentPage: 1,
  totalPages:  0,
  viewMode:    'single', // 'single' | 'double'
  zoomPct:     100,
  atApi:       null,
  loopOn:      false,
  prevTime:    -1,
};

// Performance mode state (managed by setlist.js via events)
const perf = {
  active:      false,
  setlist:     null,   // [{song, ...}]
  songIndex:   0,
};

export function initViewer() {
  // Toolbar buttons
  document.getElementById('view-single-btn').addEventListener('click', () => setViewMode('single'));
  document.getElementById('view-double-btn').addEventListener('click', () => setViewMode('double'));
  document.getElementById('prev-page-btn').addEventListener('click', () => prevPage());
  document.getElementById('next-page-btn').addEventListener('click', () => nextPage());

  const zoomInput = document.getElementById('viewer-zoom');
  const zoomVal   = document.getElementById('viewer-zoom-val');
  zoomInput.addEventListener('input', () => {
    state.zoomPct = parseInt(zoomInput.value);
    zoomVal.textContent = state.zoomPct + '%';
    rerenderCurrentPages();
  });

  // Drop-to-open in viewer area
  const sheetView = document.getElementById('sheet-view');
  sheetView.addEventListener('dragover', e => e.preventDefault());
  sheetView.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) openLocalFile(f);
  });

  // GP Player bar
  document.getElementById('play-btn').addEventListener('click', () => state.atApi?.playPause());
  document.getElementById('stop-btn').addEventListener('click', () => state.atApi?.stop());
  document.getElementById('loop-btn').addEventListener('click', () => {
    state.loopOn = !state.loopOn;
    if (state.atApi) state.atApi.isLooping = state.loopOn;
    document.getElementById('loop-btn').classList.toggle('on', state.loopOn);
  });
  document.getElementById('tempo-range').addEventListener('input', e => {
    const v = parseInt(e.target.value);
    document.getElementById('tempo-val').textContent = v + '%';
    if (state.atApi) state.atApi.playbackSpeed = v / 100;
  });
  document.getElementById('progress-bg').addEventListener('click', e => {
    if (!state.atApi || !state.atApi.score) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.atApi.tickPosition = Math.floor(ratio * state.atApi.score.masterBars.length * 3840);
  });

  // Global page navigation (PgUp / PgDn from app.js)
  on('page-next', () => { if (perf.active) perfNextPage(); else nextPage(); });
  on('page-prev', () => { if (perf.active) perfPrevPage(); else prevPage(); });
  on('esc',       () => { if (perf.active) exitPerf(); });

  // Open song event from library
  on('open-song', song => openSongInViewer(song));

  // Performance mode
  on('start-performance', ({ setlist, index }) => startPerf(setlist, index ?? 0));
  document.getElementById('perf-exit').addEventListener('click', exitPerf);
}

// ── Public: open a song ────────────────────────────────────
export function openSongInViewer(song) {
  state.song = song;
  state.fileType = song.fileType;
  state.currentPage = 1;
  document.getElementById('viewer-song-name').textContent = `${song.title}${song.artist ? ' — ' + song.artist : ''}`;

  if (song.fileType === 'gp') {
    showGPView();
    loadGP(song.files[0].path);
  } else {
    showSheetView();
    if (song.fileType === 'pdf') {
      loadPDF(song.files[0].path);
    } else {
      loadImages(song.files.map(f => f.path));
    }
  }
}

// ── Sheet view (PDF / JPG) ─────────────────────────────────
function showSheetView() {
  document.getElementById('sheet-view').classList.remove('hidden');
  document.getElementById('gp-view').classList.add('hidden');
  document.getElementById('player-bar').classList.add('hidden');
  document.getElementById('sheet-drop').classList.add('hidden');
}

function showGPView() {
  document.getElementById('sheet-view').classList.add('hidden');
  document.getElementById('gp-view').classList.remove('hidden');
}

async function loadPDF(url) {
  try {
    const doc = await pdfjsLib.getDocument(url).promise;
    state.pdfDoc    = doc;
    state.totalPages = doc.numPages;
    state.pages     = [];
    await renderCurrentPages();
  } catch (e) { alert('PDF 로드 실패: ' + e.message); }
}

function loadImages(urls) {
  state.pdfDoc     = null;
  state.pages      = urls;
  state.totalPages = urls.length;
  renderCurrentPages();
}

async function openLocalFile(file) {
  const ext = file.name.split('.').pop().toLowerCase();
  const url = URL.createObjectURL(file);
  state.song = { title: file.name, artist: '', fileType: '', files: [{ path: url, name: file.name }] };
  document.getElementById('viewer-song-name').textContent = file.name;

  if (ext === 'pdf') {
    state.fileType = 'pdf'; showSheetView(); await loadPDF(url);
  } else if (['jpg','jpeg','png','webp'].includes(ext)) {
    state.fileType = 'jpg'; showSheetView(); loadImages([url]);
  } else if (['gp','gp3','gp4','gp5','gpx','gp7'].includes(ext)) {
    state.fileType = 'gp'; showGPView();
    const reader = new FileReader();
    reader.onload = e => { ensureAlphaTab(); state.atApi.load(new Uint8Array(e.target.result)); };
    reader.readAsArrayBuffer(file);
  }
}

async function renderCurrentPages() {
  const container = state.song && perf.active
    ? document.getElementById('perf-page-container')
    : document.getElementById('page-container');

  container.innerHTML = '';
  const isDouble = state.viewMode === 'double';
  container.className = `page-container ${isDouble ? 'double' : 'single'}`;

  const pagesToShow = isDouble
    ? [state.currentPage, state.currentPage + 1].filter(p => p <= state.totalPages)
    : [state.currentPage];

  const scale = state.zoomPct / 100;

  if (state.pdfDoc) {
    // PDF rendering
    for (const num of pagesToShow) {
      const page     = await state.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: scale * 1.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      container.appendChild(canvas);
    }
  } else {
    // Image rendering
    for (const idx of pagesToShow.map(p => p - 1)) {
      if (idx >= state.pages.length) break;
      const img = document.createElement('img');
      img.src   = state.pages[idx];
      img.style.width = isDouble ? `calc(50% - 6px)` : `${Math.min(100, scale * 100)}%`;
      container.appendChild(img);
    }
  }

  updatePageInfo();
}

function updatePageInfo() {
  const step = state.viewMode === 'double' ? 2 : 1;
  const end  = state.viewMode === 'double'
    ? Math.min(state.currentPage + 1, state.totalPages)
    : state.currentPage;
  const label = state.viewMode === 'double' && state.totalPages > 1
    ? `${state.currentPage}–${end} / ${state.totalPages}`
    : `${state.currentPage} / ${state.totalPages}`;
  document.getElementById('page-indicator').textContent = label;
}

async function nextPage() {
  if (!state.totalPages) return;
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage + step - 1 < state.totalPages) {
    state.currentPage += step;
    await rerenderCurrentPages();
  }
}

async function prevPage() {
  if (!state.totalPages) return;
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage > 1) {
    state.currentPage = Math.max(1, state.currentPage - step);
    await rerenderCurrentPages();
  }
}

async function rerenderCurrentPages() {
  if (state.fileType !== 'gp') await renderCurrentPages();
}

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('view-single-btn').classList.toggle('on', mode === 'single');
  document.getElementById('view-double-btn').classList.toggle('on', mode === 'double');
  if (state.currentPage % 2 === 0 && mode === 'double') state.currentPage--;
  rerenderCurrentPages();
}

// ── GP Viewer (alphaTab) ───────────────────────────────────
function ensureAlphaTab() {
  if (state.atApi) return;
  const atMain = document.getElementById('at-main');

  state.atApi = new alphaTab.AlphaTabApi(atMain, {
    core:    { engine: 'svg', logLevel: 0 },
    display: { layoutMode: alphaTab.LayoutMode.Page, scale: 1.0 },
    player:  {
      enablePlayer:          true,
      enableCursor:          true,
      enableUserInteraction: true,
      soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
      scrollElement: document.getElementById('gp-score-wrap'),
    },
  });

  const api = state.atApi;

  api.scoreLoaded.on(s => {
    buildGPTrackList(s);
    document.getElementById('gp-loading').classList.add('hidden');
    document.getElementById('gp-drop').classList.add('hidden');
    document.getElementById('player-bar').classList.remove('hidden');
    document.getElementById('play-btn').disabled = true;
    document.getElementById('loop-btn').disabled = false;
  });

  api.renderStarted.on(() => document.getElementById('gp-loading').classList.remove('hidden'));
  api.renderFinished.on(() => document.getElementById('gp-loading').classList.add('hidden'));

  api.soundFontLoad.on(e => {
    const pct = Math.floor((e.loaded / e.total) * 100);
    document.getElementById('sf-status').textContent = `SF ${pct}%`;
  });

  api.playerReady.on(() => {
    document.getElementById('sf-status').textContent = '';
    document.getElementById('play-btn').disabled = false;
    document.getElementById('stop-btn').disabled = false;
  });

  api.playerStateChanged.on(e => {
    const playing = e.state === (alphaTab.synth?.PlayerState?.Playing ?? 1);
    document.getElementById('ico-play').style.display  = playing ? 'none' : '';
    document.getElementById('ico-pause').style.display = playing ? '' : 'none';
    if (e.stopped) {
      document.getElementById('stop-btn').disabled = true;
      document.getElementById('progress-fill').style.width = '0%';
      document.getElementById('time-cur').textContent = '0:00';
      state.prevTime = -1;
    } else {
      document.getElementById('stop-btn').disabled = false;
    }
  });

  api.playerPositionChanged.on(e => {
    const curSec = (e.currentTime / 1000) | 0;
    if (curSec !== state.prevTime) {
      state.prevTime = curSec;
      document.getElementById('time-cur').textContent   = fmtTime(e.currentTime);
      document.getElementById('time-total').textContent = fmtTime(e.endTime);
    }
    if (e.endTime > 0)
      document.getElementById('progress-fill').style.width =
        Math.min(100, (e.currentTime / e.endTime) * 100) + '%';
  });

  api.playerFinished.on(() => {
    document.getElementById('ico-play').style.display  = '';
    document.getElementById('ico-pause').style.display = 'none';
    document.getElementById('progress-fill').style.width = '0%';
    document.getElementById('time-cur').textContent = '0:00';
    document.getElementById('stop-btn').disabled = true;
    state.prevTime = -1;
  });
}

function loadGP(url) {
  ensureAlphaTab();
  try { state.atApi.stop(); } catch(_) {}
  document.getElementById('gp-loading').classList.remove('hidden');
  document.getElementById('player-bar').classList.add('hidden');
  fetch(url)
    .then(r => r.arrayBuffer())
    .then(buf => state.atApi.load(new Uint8Array(buf)))
    .catch(e => { document.getElementById('gp-loading').classList.add('hidden'); alert('GP 로드 실패: ' + e.message); });
}

function buildGPTrackList(score) {
  const list = document.getElementById('gp-track-list');
  list.innerHTML = score.tracks.map((t, i) => `
    <div class="track-item${i === 0 ? ' active' : ''}" data-track="${i}">
      <span class="track-num">${i + 1}</span>
      <span class="track-name">${t.name || 'Track ' + (i + 1)}</span>
    </div>
  `).join('');
  list.querySelectorAll('.track-item').forEach(item => {
    item.addEventListener('click', () => {
      list.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      state.atApi.renderTracks([score.tracks[parseInt(item.dataset.track)]]);
    });
  });
}

function fmtTime(ms) {
  const s = (ms / 1000) | 0;
  return ((s / 60) | 0) + ':' + String(s % 60).padStart(2, '0');
}

// ── Performance Mode ───────────────────────────────────────
function startPerf(setlist, index) {
  perf.active    = true;
  perf.setlist   = setlist;
  perf.songIndex = index;
  document.getElementById('perf-overlay').classList.remove('hidden');
  loadPerfSong();
}

async function loadPerfSong() {
  const song = perf.setlist[perf.songIndex];
  state.song      = song;
  state.fileType  = song.fileType;
  state.currentPage = 1;

  document.getElementById('perf-song-pos').textContent  = `${perf.songIndex + 1} / ${perf.setlist.length}`;
  document.getElementById('perf-song-name').textContent = song.title;

  if (song.fileType === 'pdf') {
    await loadPDF(song.files[0].path);
  } else {
    loadImages(song.files.map(f => f.path));
  }
  updatePerfPageInfo();
  // Render into perf container
  const perfContainer = document.getElementById('perf-page-container');
  perfContainer.innerHTML = '';
  perfContainer.className = `page-container ${state.viewMode}`;

  const pagesToShow = state.viewMode === 'double'
    ? [1, 2].filter(p => p <= state.totalPages)
    : [1];

  if (state.pdfDoc) {
    for (const num of pagesToShow) {
      const page     = await state.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      perfContainer.appendChild(canvas);
    }
  } else {
    for (const idx of pagesToShow.map(p => p - 1)) {
      if (idx >= state.pages.length) break;
      const img = document.createElement('img');
      img.src   = state.pages[idx];
      perfContainer.appendChild(img);
    }
  }
}

function updatePerfPageInfo() {
  document.getElementById('perf-page-pos').textContent = `${state.currentPage} / ${state.totalPages}`;
}

async function perfNextPage() {
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage + step - 1 < state.totalPages) {
    state.currentPage += step;
    await renderPerfCurrentPages();
    updatePerfPageInfo();
  } else if (perf.songIndex < perf.setlist.length - 1) {
    perf.songIndex++;
    await loadPerfSong();
  }
}

async function perfPrevPage() {
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage > 1) {
    state.currentPage = Math.max(1, state.currentPage - step);
    await renderPerfCurrentPages();
    updatePerfPageInfo();
  } else if (perf.songIndex > 0) {
    perf.songIndex--;
    await loadPerfSong();
  }
}

async function renderPerfCurrentPages() {
  const container = document.getElementById('perf-page-container');
  container.innerHTML = '';
  const isDouble = state.viewMode === 'double';
  container.className = `page-container ${isDouble ? 'double' : 'single'}`;
  const pagesToShow = isDouble
    ? [state.currentPage, state.currentPage + 1].filter(p => p <= state.totalPages)
    : [state.currentPage];

  if (state.pdfDoc) {
    for (const num of pagesToShow) {
      const page     = await state.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      container.appendChild(canvas);
    }
  } else {
    for (const idx of pagesToShow.map(p => p - 1)) {
      if (idx >= state.pages.length) break;
      const img = document.createElement('img');
      img.src   = state.pages[idx];
      container.appendChild(img);
    }
  }
}

function exitPerf() {
  perf.active = false;
  document.getElementById('perf-overlay').classList.add('hidden');
  document.getElementById('perf-page-container').innerHTML = '';
}
