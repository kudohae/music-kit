import { on, emit } from './app.js';
import { storage }  from './db.js';

const state = {
  song: null, fileType: null,
  pdfDoc: null, pages: [],
  currentPage: 1, totalPages: 0,
  viewMode: 'single', zoomPct: 100,
  atApi: null, loopOn: false, prevTime: -1,
};

const perf = { active: false, setlist: [], songIndex: 0 };

export function initViewer() {
  document.getElementById('view-single-btn').addEventListener('click', () => setViewMode('single'));
  document.getElementById('view-double-btn').addEventListener('click', () => setViewMode('double'));
  document.getElementById('prev-page-btn').addEventListener('click', prevPage);
  document.getElementById('next-page-btn').addEventListener('click', nextPage);

  const zoomEl = document.getElementById('viewer-zoom');
  zoomEl.addEventListener('input', () => {
    state.zoomPct = parseInt(zoomEl.value);
    document.getElementById('viewer-zoom-val').textContent = state.zoomPct + '%';
    rerenderCurrentPages();
  });

  const sheetView = document.getElementById('sheet-view');
  sheetView.addEventListener('dragover', e => e.preventDefault());
  sheetView.addEventListener('drop', e => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) openLocalFile(f);
  });

  // GP player controls
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
    if (!state.atApi?.score) return;
    const rect  = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    state.atApi.tickPosition = Math.floor(ratio * state.atApi.score.masterBars.length * 3840);
  });

  on('open-song',         song => openSongInViewer(song));
  on('page-next',         ()   => perf.active ? perfNextPage() : nextPage());
  on('page-prev',         ()   => perf.active ? perfPrevPage() : prevPage());
  on('esc',               ()   => { if (perf.active) exitPerf(); });
  on('start-performance', opts => startPerf(opts.setlist, opts.index ?? 0));

  document.getElementById('perf-exit').addEventListener('click', exitPerf);
}

export async function openSongInViewer(song) {
  state.song      = song;
  state.fileType  = song.fileType;
  state.currentPage = 1;
  document.getElementById('viewer-song-name').textContent =
    song.title + (song.artist ? ' — ' + song.artist : '');

  if (song.fileType === 'gp') {
    showGPView();
    await loadGPFromStorage(song.files[0]);
  } else {
    showSheetView();
    const urls = song.files.map(f => storage.url(f.path));
    if (song.fileType === 'pdf') await loadPDF(urls[0]);
    else                         loadImages(urls);
  }
}

// ── Sheet view ─────────────────────────────────────────────
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
    state.pdfDoc     = await pdfjsLib.getDocument(url).promise;
    state.totalPages = state.pdfDoc.numPages;
    state.pages      = [];
    await renderCurrentPages(getPageContainer());
  } catch (e) { alert('PDF 로드 실패: ' + e.message); }
}

function loadImages(urls) {
  state.pdfDoc     = null;
  state.pages      = urls;
  state.totalPages = urls.length;
  renderCurrentPages(getPageContainer());
}

async function openLocalFile(file) {
  const ext  = file.name.split('.').pop().toLowerCase();
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  const url  = URL.createObjectURL(blob);

  state.song      = { title: file.name, artist: '', fileType: '', files: [] };
  state.currentPage = 1;
  document.getElementById('viewer-song-name').textContent = file.name;

  if (ext === 'pdf') {
    state.fileType = 'pdf'; showSheetView(); await loadPDF(url);
  } else if (['jpg','jpeg','png','webp'].includes(ext)) {
    state.fileType = 'jpg'; showSheetView(); loadImages([url]);
  } else if (['gp','gp3','gp4','gp5','gpx','gp7'].includes(ext)) {
    state.fileType = 'gp'; showGPView();
    const ab = await file.arrayBuffer();
    loadGPData(ab);
  }
}

function getPageContainer() { return document.getElementById('page-container'); }

async function renderCurrentPages(container) {
  container.innerHTML = '';
  const isDouble = state.viewMode === 'double';
  container.className = `page-container ${isDouble ? 'double' : 'single'}`;
  const scale = state.zoomPct / 100;

  const pagesToShow = isDouble
    ? [state.currentPage, state.currentPage + 1].filter(p => p <= state.totalPages)
    : [state.currentPage];

  if (state.pdfDoc) {
    for (const num of pagesToShow) {
      const page     = await state.pdfDoc.getPage(num);
      const viewport = page.getViewport({ scale: scale * 1.5 });
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      container.appendChild(canvas);
    }
  } else {
    for (const idx of pagesToShow.map(p => p - 1)) {
      if (idx >= state.pages.length) break;
      const img       = document.createElement('img');
      img.src         = state.pages[idx];
      img.style.width = isDouble ? 'calc(50% - 6px)' : `${Math.min(100, scale * 100)}%`;
      container.appendChild(img);
    }
  }
  updatePageInfo();
}

async function rerenderCurrentPages() {
  if (state.fileType !== 'gp') await renderCurrentPages(getPageContainer());
}

function updatePageInfo() {
  const end = state.viewMode === 'double'
    ? Math.min(state.currentPage + 1, state.totalPages) : state.currentPage;
  document.getElementById('page-indicator').textContent =
    state.viewMode === 'double' && state.totalPages > 1
      ? `${state.currentPage}–${end} / ${state.totalPages}`
      : `${state.currentPage} / ${state.totalPages}`;
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

function setViewMode(mode) {
  state.viewMode = mode;
  document.getElementById('view-single-btn').classList.toggle('on', mode === 'single');
  document.getElementById('view-double-btn').classList.toggle('on', mode === 'double');
  if (mode === 'double' && state.currentPage % 2 === 0) state.currentPage--;
  rerenderCurrentPages();
}

// ── GP / alphaTab ──────────────────────────────────────────
function ensureAlphaTab() {
  if (state.atApi) return;
  state.atApi = new alphaTab.AlphaTabApi(document.getElementById('at-main'), {
    core:    { engine: 'svg', logLevel: 0 },
    display: { layoutMode: alphaTab.LayoutMode.Page, scale: 1.0 },
    player:  {
      enablePlayer: true, enableCursor: true, enableUserInteraction: true,
      soundFont: 'https://cdn.jsdelivr.net/npm/@coderline/alphatab@latest/dist/soundfont/sonivox.sf2',
      scrollElement: document.getElementById('gp-score-wrap'),
    },
  });
  const api = state.atApi;
  const $   = id => document.getElementById(id);

  api.scoreLoaded.on(s => {
    buildTrackList(s);
    $('gp-loading').classList.add('hidden');
    $('gp-drop').classList.add('hidden');
    $('player-bar').classList.remove('hidden');
    $('play-btn').disabled = true;
    $('loop-btn').disabled = false;
  });
  api.renderStarted.on(()  => $('gp-loading').classList.remove('hidden'));
  api.renderFinished.on(() => $('gp-loading').classList.add('hidden'));
  api.soundFontLoad.on(e => {
    $('sf-status').textContent = `SF ${Math.floor((e.loaded / e.total) * 100)}%`;
  });
  api.playerReady.on(() => {
    $('sf-status').textContent = '';
    $('play-btn').disabled = false;
    $('stop-btn').disabled = false;
  });
  api.playerStateChanged.on(e => {
    const playing = e.state === (alphaTab.synth?.PlayerState?.Playing ?? 1);
    $('ico-play').style.display  = playing ? 'none' : '';
    $('ico-pause').style.display = playing ? ''     : 'none';
    if (e.stopped) {
      $('stop-btn').disabled = true;
      $('progress-fill').style.width = '0%';
      $('time-cur').textContent = '0:00';
      state.prevTime = -1;
    } else { $('stop-btn').disabled = false; }
  });
  api.playerPositionChanged.on(e => {
    const curSec = (e.currentTime / 1000) | 0;
    if (curSec !== state.prevTime) {
      state.prevTime = curSec;
      $('time-cur').textContent   = fmt(e.currentTime);
      $('time-total').textContent = fmt(e.endTime);
    }
    if (e.endTime > 0)
      $('progress-fill').style.width = Math.min(100, (e.currentTime / e.endTime) * 100) + '%';
  });
  api.playerFinished.on(() => {
    $('ico-play').style.display  = '';
    $('ico-pause').style.display = 'none';
    $('progress-fill').style.width = '0%';
    $('time-cur').textContent = '0:00';
    $('stop-btn').disabled = true;
    state.prevTime = -1;
  });
}

async function loadGPFromStorage(file) {
  ensureAlphaTab();
  try { state.atApi.stop(); } catch(_) {}
  document.getElementById('gp-loading').classList.remove('hidden');
  document.getElementById('player-bar').classList.add('hidden');
  try {
    const res = await fetch(storage.url(file.path));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ab  = await res.arrayBuffer();
    state.atApi.load(new Uint8Array(ab));
  } catch (e) {
    document.getElementById('gp-loading').classList.add('hidden');
    alert('GP 로드 실패: ' + e.message);
  }
}

function loadGPData(arrayBuffer) {
  ensureAlphaTab();
  try { state.atApi.stop(); } catch(_) {}
  document.getElementById('gp-loading').classList.remove('hidden');
  document.getElementById('player-bar').classList.add('hidden');
  state.atApi.load(new Uint8Array(arrayBuffer));
}

function buildTrackList(score) {
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

function fmt(ms) {
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

  const urls = song.files.map(f => storage.url(f.path));
  if (song.fileType === 'pdf') {
    state.pdfDoc     = await pdfjsLib.getDocument(urls[0]).promise;
    state.totalPages = state.pdfDoc.numPages;
    state.pages      = [];
  } else {
    state.pdfDoc    = null;
    state.pages     = urls;
    state.totalPages = urls.length;
  }
  await renderCurrentPages(document.getElementById('perf-page-container'));
  updatePerfInfo();
}

function updatePerfInfo() {
  document.getElementById('perf-page-pos').textContent = `${state.currentPage} / ${state.totalPages}`;
}

async function perfNextPage() {
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage + step - 1 < state.totalPages) {
    state.currentPage += step;
    await renderCurrentPages(document.getElementById('perf-page-container'));
    updatePerfInfo();
  } else if (perf.songIndex < perf.setlist.length - 1) {
    perf.songIndex++;
    await loadPerfSong();
  }
}

async function perfPrevPage() {
  const step = state.viewMode === 'double' ? 2 : 1;
  if (state.currentPage > 1) {
    state.currentPage = Math.max(1, state.currentPage - step);
    await renderCurrentPages(document.getElementById('perf-page-container'));
    updatePerfInfo();
  } else if (perf.songIndex > 0) {
    perf.songIndex--;
    await loadPerfSong();
  }
}

function exitPerf() {
  perf.active = false;
  document.getElementById('perf-overlay').classList.add('hidden');
  document.getElementById('perf-page-container').innerHTML = '';
}
