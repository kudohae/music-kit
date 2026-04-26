import { idb }          from './db.js';
import { on, emit }    from './app.js';
import { getSongs }    from './library.js';

let setlists  = [];
let allSongs  = [];
let editingId = null;
let editSongs = [];
let dragSrc   = null;

export function initSetlist() {
  document.getElementById('new-setlist-btn').addEventListener('click', newSetlist);
  document.getElementById('save-setlist-btn').addEventListener('click', saveSetlist);
  document.getElementById('close-setlist-btn').addEventListener('click', closeEditor);
  document.getElementById('perform-btn').addEventListener('click', startPerformance);
  on('navigate',      name  => { if (name === 'setlist') loadAll(); });
  on('songs-changed', songs => { allSongs = songs; renderLibrarySongs(); });
}

async function loadAll() {
  [setlists, allSongs] = await Promise.all([idb.getAll('setlists'), idb.getAll('songs')]);
  renderSetlistList();
}

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
  list.querySelectorAll('.setlist-card').forEach(card =>
    card.addEventListener('click', () => openEditor(setlists.find(s => s.id === card.dataset.id)))
  );
}

function newSetlist()  { openEditor({ id: null, name: '', songs: [] }); }

function openEditor(sl) {
  editingId  = sl.id;
  editSongs  = [...(sl.songs || [])];
  document.getElementById('setlist-name').value = sl.name || '';
  document.getElementById('setlist-editor').classList.remove('hidden');
  document.getElementById('perform-btn').disabled = editSongs.length === 0;
  renderLibrarySongs();
  renderSetlistOrder();
  renderSetlistList();
}

function closeEditor() {
  editingId = null;
  document.getElementById('setlist-editor').classList.add('hidden');
  renderSetlistList();
}

function songs() { return allSongs.length ? allSongs : getSongs(); }

function renderLibrarySongs() {
  const el = document.getElementById('sl-library-songs');
  const list = songs();
  if (!list.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">라이브러리가 비어 있습니다.</div>';
    return;
  }
  el.innerHTML = list.map(s => `
    <div class="sl-song-item in-list">
      <span class="sl-song-name">${esc(s.title)}</span>
      <button class="sl-add-btn" data-id="${s.id}" title="추가">+</button>
    </div>
  `).join('');
  el.querySelectorAll('.sl-add-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      editSongs.push(btn.dataset.id);
      document.getElementById('perform-btn').disabled = false;
      renderSetlistOrder();
    })
  );
}

function renderSetlistOrder() {
  const el   = document.getElementById('sl-order');
  const list = songs();
  if (!editSongs.length) {
    el.innerHTML = '<div style="font-size:11px;color:var(--muted);padding:8px">라이브러리에서 곡을 추가하세요.</div>';
    return;
  }
  el.innerHTML = editSongs.map((id, i) => {
    const s = list.find(x => x.id === id);
    return `
      <div class="sl-song-item" draggable="true" data-idx="${i}">
        <span class="sl-num">${i + 1}</span>
        <span class="sl-song-drag">⠿</span>
        <span class="sl-song-name">${s ? esc(s.title) : '(삭제된 곡)'}</span>
        <button class="sl-remove-btn" data-idx="${i}" title="제거">✕</button>
      </div>
    `;
  }).join('');
  el.querySelectorAll('.sl-remove-btn').forEach(btn =>
    btn.addEventListener('click', () => {
      editSongs.splice(+btn.dataset.idx, 1);
      document.getElementById('perform-btn').disabled = editSongs.length === 0;
      renderSetlistOrder();
    })
  );
  el.querySelectorAll('.sl-song-item').forEach(item => {
    item.addEventListener('dragstart', e => { dragSrc = +item.dataset.idx; e.dataTransfer.effectAllowed = 'move'; });
    item.addEventListener('dragover',  e => { e.preventDefault(); item.style.outline = '1px solid var(--accent)'; });
    item.addEventListener('dragleave', () => item.style.outline = '');
    item.addEventListener('drop', e => {
      e.preventDefault(); item.style.outline = '';
      const dst = +item.dataset.idx;
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
    id:        editingId || Date.now().toString(),
    name:      document.getElementById('setlist-name').value.trim() || 'Untitled',
    songs:     editSongs,
    createdAt: new Date().toISOString(),
  };
  await idb.put('setlists', payload);
  const idx = setlists.findIndex(s => s.id === payload.id);
  if (idx !== -1) setlists[idx] = payload; else setlists.push(payload);
  editingId = payload.id;
  renderSetlistList();
}

function startPerformance() {
  const list = songs();
  const perfSongs = editSongs
    .map(id => list.find(s => s.id === id))
    .filter(s => s && s.fileType !== 'gp');
  if (!perfSongs.length) {
    alert('PDF/JPG 형식의 곡이 없습니다.\n(Guitar Pro 파일은 공연 모드를 지원하지 않습니다.)');
    return;
  }
  emit('start-performance', { setlist: perfSongs, index: 0 });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
