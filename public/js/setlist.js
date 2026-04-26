import { api, on, emit } from './app.js';
import { getSongs } from './library.js';

let setlists    = [];
let allSongs    = [];
let editingId   = null;   // setlist being edited
let editSongs   = [];     // ordered song ids in current edit
let dragSrc     = null;

export function initSetlist() {
  document.getElementById('new-setlist-btn').addEventListener('click', newSetlist);
  document.getElementById('save-setlist-btn').addEventListener('click', saveSetlist);
  document.getElementById('close-setlist-btn').addEventListener('click', closeSetlistEditor);
  document.getElementById('perform-btn').addEventListener('click', startPerformance);

  on('navigate',      name => { if (name === 'setlist') loadAll(); });
  on('songs-changed', songs => { allSongs = songs; renderLibrarySongs(); });
}

async function loadAll() {
  try {
    [setlists, allSongs] = await Promise.all([
      api.get('/api/setlists'),
      api.get('/api/songs'),
    ]);
    renderSetlistList();
  } catch (e) { console.error(e); }
}

// ── Setlist list ───────────────────────────────────────────
function renderSetlistList() {
  const list = document.getElementById('setlist-list');
  if (!setlists.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">세트리스트가 없습니다.</div>';
    return;
  }
  list.innerHTML = setlists.map(sl => `
    <div class="setlist-card${editingId === sl.id ? ' active' : ''}" data-id="${sl.id}">
      <div class="setlist-card-name">${esc(sl.name || 'Untitled')}</div>
      <div class="setlist-card-count">${(sl.songs||[]).length}곡</div>
    </div>
  `).join('');

  list.querySelectorAll('.setlist-card').forEach(card => {
    card.addEventListener('click', () => {
      openSetlistEditor(setlists.find(s => s.id === card.dataset.id));
    });
  });
}

// ── Editor ────────────────────────────────────────────────
function newSetlist() {
  openSetlistEditor({ id: null, name: '', songs: [] });
}

function openSetlistEditor(sl) {
  editingId  = sl.id;
  editSongs  = [...(sl.songs || [])];

  document.getElementById('setlist-name').value = sl.name || '';
  document.getElementById('setlist-editor').classList.remove('hidden');
  document.getElementById('perform-btn').disabled = editSongs.length === 0;

  renderLibrarySongs();
  renderSetlistOrder();
  renderSetlistList(); // highlight active
}

function closeSetlistEditor() {
  editingId = null;
  document.getElementById('setlist-editor').classList.add('hidden');
  renderSetlistList();
}

function renderLibrarySongs() {
  const el = document.getElementById('sl-library-songs');
  const songs = allSongs.length ? allSongs : getSongs();
  if (!songs.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">라이브러리가 비어 있습니다.</div>';
    return;
  }
  el.innerHTML = songs.map(s => `
    <div class="sl-song-item in-list" data-id="${s.id}">
      <span class="sl-song-name">${esc(s.title)}</span>
      <button class="sl-add-btn" title="세트리스트에 추가" data-id="${s.id}">+</button>
    </div>
  `).join('');

  el.querySelectorAll('.sl-add-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editSongs.push(btn.dataset.id);
      document.getElementById('perform-btn').disabled = false;
      renderSetlistOrder();
    });
  });
}

function renderSetlistOrder() {
  const el    = document.getElementById('sl-order');
  const songs = allSongs.length ? allSongs : getSongs();

  if (!editSongs.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">라이브러리에서 곡을 추가하세요.</div>';
    return;
  }

  el.innerHTML = editSongs.map((id, i) => {
    const song = songs.find(s => s.id === id);
    return `
      <div class="sl-song-item" draggable="true" data-idx="${i}">
        <span class="sl-num">${i + 1}</span>
        <span class="sl-song-drag">⠿</span>
        <span class="sl-song-name">${song ? esc(song.title) : '(삭제된 곡)'}</span>
        <button class="sl-remove-btn" data-idx="${i}" title="제거">✕</button>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.sl-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      editSongs.splice(parseInt(btn.dataset.idx), 1);
      document.getElementById('perform-btn').disabled = editSongs.length === 0;
      renderSetlistOrder();
    });
  });

  // Drag-to-reorder
  el.querySelectorAll('.sl-song-item').forEach(item => {
    item.addEventListener('dragstart', e => {
      dragSrc = parseInt(item.dataset.idx);
      e.dataTransfer.effectAllowed = 'move';
    });
    item.addEventListener('dragover', e => {
      e.preventDefault();
      item.style.outline = '1px solid var(--accent)';
    });
    item.addEventListener('dragleave', () => item.style.outline = '');
    item.addEventListener('drop', e => {
      e.preventDefault();
      item.style.outline = '';
      const dst = parseInt(item.dataset.idx);
      if (dragSrc === null || dragSrc === dst) return;
      const [moved] = editSongs.splice(dragSrc, 1);
      editSongs.splice(dst, 0, moved);
      renderSetlistOrder();
    });
    item.addEventListener('dragend', () => {
      el.querySelectorAll('.sl-song-item').forEach(i => i.style.outline = '');
      dragSrc = null;
    });
  });
}

async function saveSetlist() {
  const payload = {
    name:  document.getElementById('setlist-name').value.trim() || 'Untitled',
    songs: editSongs,
  };
  try {
    if (editingId) {
      const updated = await api.put(`/api/setlists/${editingId}`, payload);
      const idx = setlists.findIndex(s => s.id === editingId);
      if (idx !== -1) setlists[idx] = updated; else setlists.push(updated);
    } else {
      const created = await api.post('/api/setlists', payload);
      setlists.push(created);
      editingId = created.id;
    }
    renderSetlistList();
  } catch (e) { alert('저장 실패: ' + e.message); }
}

// ── Performance mode ───────────────────────────────────────
function startPerformance() {
  if (!editSongs.length) return;
  const songs = (allSongs.length ? allSongs : getSongs());
  const perfSongs = editSongs
    .map(id => songs.find(s => s.id === id))
    .filter(s => s && s.fileType !== 'gp'); // GP not supported in perf mode

  if (!perfSongs.length) {
    alert('PDF/JPG 형식의 곡이 없습니다.\n(Guitar Pro 파일은 공연 모드를 지원하지 않습니다.)');
    return;
  }
  emit('start-performance', { setlist: perfSongs, index: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
