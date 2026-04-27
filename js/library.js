import { db, storage }    from './db.js';
import { navigate, emit } from './app.js';

let songs = [];

export function initLibrary() {
  document.getElementById('upload-btn').addEventListener('click', openModal);
  document.getElementById('close-upload-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-upload').addEventListener('click', closeModal);
  document.getElementById('confirm-upload').addEventListener('click', confirmUpload);

  const drop  = document.getElementById('upload-drop');
  const input = document.getElementById('upload-files');
  input.addEventListener('change', () => updateFileLabel(input.files));
  drop.addEventListener('dragover',  e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault(); drop.classList.remove('drag-over');
    const dt = new DataTransfer();
    for (const f of e.dataTransfer.files) dt.items.add(f);
    input.files = dt.files;
    updateFileLabel(input.files);
  });

  loadSongs();
}

export function getSongs() { return songs; }

async function loadSongs() {
  try {
    songs = await db.getSongs();
    renderSongs();
  } catch (e) { showError('라이브러리 로드 실패: ' + e.message); }
}

function renderSongs() {
  const list = document.getElementById('song-list');
  if (!songs.length) {
    list.innerHTML = '<div class="empty-state">아직 곡이 없습니다.<br>+ Add Song으로 추가하세요.</div>';
    return;
  }
  list.innerHTML = songs.map(s => `
    <div class="song-card" data-id="${s.id}">
      <div class="song-card-title">${esc(s.title)}</div>
      <div class="song-card-artist">${esc(s.artist || '—')}</div>
      <div class="song-card-meta">
        <span class="file-badge ${s.fileType}">${s.fileType.toUpperCase()}</span>
        <span style="font-size:10px;color:var(--muted)">${s.files.length}개 파일</span>
      </div>
      <button class="song-delete" data-delete="${s.id}" title="Delete">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.song-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-delete]')) return;
      const song = songs.find(s => s.id === card.dataset.id);
      if (song) { emit('open-song', song); navigate('viewer'); }
    });
  });
  list.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteSong(btn.dataset.delete))
  );
}

async function deleteSong(id) {
  if (!confirm('이 곡을 삭제하시겠습니까?')) return;
  try {
    // Delete storage files
    const song  = songs.find(s => s.id === id);
    if (song?.files?.length) {
      const paths = song.files.map(f => f.path);
      await storage.remove(paths);
    }
    await db.deleteSong(id);
    songs = songs.filter(s => s.id !== id);
    renderSongs();
    emit('songs-changed', songs);
  } catch (e) { showError('삭제 실패: ' + e.message); }
}

function openModal() {
  document.getElementById('upload-modal').classList.remove('hidden');
  document.getElementById('upload-title').value  = '';
  document.getElementById('upload-artist').value = '';
  document.getElementById('upload-files').value  = '';
  document.getElementById('upload-file-names').innerHTML =
    '클릭 또는 드래그<br><small>PDF · JPG (여러 장) · Guitar Pro</small>';
}
function closeModal() {
  document.getElementById('upload-modal').classList.add('hidden');
}
function updateFileLabel(files) {
  const el = document.getElementById('upload-file-names');
  el.textContent = !files.length ? '클릭 또는 드래그'
    : files.length === 1 ? files[0].name : `${files.length}개 파일 선택됨`;
}

async function confirmUpload() {
  const input = document.getElementById('upload-files');
  if (!input.files.length) { alert('파일을 선택해주세요.'); return; }

  const btn = document.getElementById('confirm-upload');
  btn.disabled = true; btn.textContent = 'Uploading…';

  try {
    const fileList = [...input.files].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true })
    );
    const first    = fileList[0];
    const songId   = Date.now().toString();
    const fileType = detectType(first.name);
    const title    = document.getElementById('upload-title').value.trim()
                     || first.name.replace(/\.[^.]+$/, '');

    // Upload each file to Supabase Storage
    const uploadedFiles = [];
    for (const file of fileList) {
      const path = `${songId}/${file.name}`;
      const ab   = await file.arrayBuffer();
      await storage.upload(path, ab, file.type || guessMime(file.name));
      uploadedFiles.push({ name: file.name, path, mimeType: file.type || guessMime(file.name) });
    }

    const song = {
      id: songId, title,
      artist:   document.getElementById('upload-artist').value.trim(),
      fileType, files: uploadedFiles,
    };
    await db.upsertSong(song);
    song.createdAt = new Date().toISOString();
    songs.unshift(song);
    renderSongs();
    emit('songs-changed', songs);
    closeModal();
  } catch (e) {
    showError('업로드 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Upload';
  }
}

function detectType(name) {
  const ext = name.split('.').pop().toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (['jpg','jpeg','png','webp'].includes(ext)) return 'jpg';
  if (['gp','gp3','gp4','gp5','gpx','gp7'].includes(ext)) return 'gp';
  return 'unknown';
}
function guessMime(name) {
  const ext = name.split('.').pop().toLowerCase();
  return { pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg',
           png:'image/png', webp:'image/webp' }[ext] || 'application/octet-stream';
}
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function showError(msg) { alert(msg); }
