import { api, navigate, emit } from './app.js';

let songs = [];

export function initLibrary() {
  document.getElementById('upload-btn').addEventListener('click', openUploadModal);
  document.getElementById('close-upload-modal').addEventListener('click', closeUploadModal);
  document.getElementById('cancel-upload').addEventListener('click', closeUploadModal);
  document.getElementById('confirm-upload').addEventListener('click', confirmUpload);

  const uploadDrop = document.getElementById('upload-drop');
  const uploadFiles = document.getElementById('upload-files');
  uploadFiles.addEventListener('change', () => updateFileNames(uploadFiles.files));
  uploadDrop.addEventListener('dragover', e => { e.preventDefault(); uploadDrop.classList.add('drag-over'); });
  uploadDrop.addEventListener('dragleave', () => uploadDrop.classList.remove('drag-over'));
  uploadDrop.addEventListener('drop', e => {
    e.preventDefault();
    uploadDrop.classList.remove('drag-over');
    const dt = new DataTransfer();
    for (const f of e.dataTransfer.files) dt.items.add(f);
    uploadFiles.files = dt.files;
    updateFileNames(uploadFiles.files);
  });

  loadSongs();
}

export function getSongs() { return songs; }

async function loadSongs() {
  try {
    songs = await api.get('/api/songs');
    renderSongs();
  } catch (e) { console.error('Failed to load songs', e); }
}

function renderSongs() {
  const list = document.getElementById('song-list');
  if (!songs.length) {
    list.innerHTML = '<div class="empty-state">아직 곡이 없습니다.<br>+ Add Song으로 추가하세요.</div>';
    return;
  }
  list.innerHTML = songs.map(s => `
    <div class="song-card" data-id="${s.id}">
      <div class="song-card-title">${escHtml(s.title)}</div>
      <div class="song-card-artist">${escHtml(s.artist || '—')}</div>
      <div class="song-card-meta">
        <span class="file-badge ${s.fileType}">${s.fileType.toUpperCase()}</span>
        <span style="font-size:10px;color:var(--muted)">${s.files.length} file${s.files.length > 1 ? 's' : ''}</span>
      </div>
      <button class="song-delete" title="Delete" data-delete="${s.id}">✕</button>
    </div>
  `).join('');

  list.querySelectorAll('.song-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('[data-delete]')) return;
      const song = songs.find(s => s.id === card.dataset.id);
      if (song) openSong(song);
    });
  });

  list.querySelectorAll('[data-delete]').forEach(btn => {
    btn.addEventListener('click', () => deleteSong(btn.dataset.delete));
  });
}

function openSong(song) {
  emit('open-song', song);
  navigate('viewer');
}

async function deleteSong(id) {
  if (!confirm('이 곡을 삭제하시겠습니까?')) return;
  try {
    await api.del(`/api/songs/${id}`);
    songs = songs.filter(s => s.id !== id);
    renderSongs();
    emit('songs-changed', songs);
  } catch (e) { alert('삭제 실패: ' + e.message); }
}

function openUploadModal() {
  document.getElementById('upload-modal').classList.remove('hidden');
  document.getElementById('upload-title').value = '';
  document.getElementById('upload-artist').value = '';
  document.getElementById('upload-files').value = '';
  document.getElementById('upload-file-names').innerHTML = '클릭 또는 드래그<br><small>PDF · JPG (여러 장) · Guitar Pro</small>';
}

function closeUploadModal() {
  document.getElementById('upload-modal').classList.add('hidden');
}

function updateFileNames(files) {
  const el = document.getElementById('upload-file-names');
  if (!files.length) { el.textContent = '클릭 또는 드래그'; return; }
  el.textContent = files.length === 1 ? files[0].name : `${files.length}개 파일 선택됨`;
}

async function confirmUpload() {
  const files = document.getElementById('upload-files').files;
  if (!files.length) { alert('파일을 선택해주세요.'); return; }

  const fd = new FormData();
  fd.append('title',  document.getElementById('upload-title').value.trim());
  fd.append('artist', document.getElementById('upload-artist').value.trim());
  for (const f of files) fd.append('files', f);

  const btn = document.getElementById('confirm-upload');
  btn.disabled = true; btn.textContent = 'Uploading…';
  try {
    const song = await api.post('/api/songs', fd);
    songs.push(song);
    renderSongs();
    emit('songs-changed', songs);
    closeUploadModal();
  } catch (e) {
    alert('업로드 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = 'Upload';
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
