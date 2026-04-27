import { db }  from './db.js';
import { on }   from './app.js';

const TYPES = ['Intro','Verse','Pre-Chorus','Chorus','Bridge','Solo','Outro','Custom'];

let charts   = [];
let editing  = null;
let sections = [];
let dragSrc  = null;

export function initChords() {
  document.getElementById('new-chart-btn').addEventListener('click', newChart);
  document.getElementById('add-section-btn').addEventListener('click', addSection);
  document.getElementById('save-chart-btn').addEventListener('click', saveChart);
  document.getElementById('close-editor-btn').addEventListener('click', closeEditor);
  on('navigate', name => { if (name === 'chords') loadCharts(); });
}

async function loadCharts() {
  try { charts = await db.getChords(); renderList(); }
  catch (e) { alert('로드 실패: ' + e.message); }
}

function renderList() {
  const list = document.getElementById('chart-list');
  if (!charts.length) {
    list.innerHTML = '<div class="empty-state">코드 기록지가 없습니다.<br>+ New Chart로 추가하세요.</div>';
    return;
  }
  list.innerHTML = charts.map(c => `
    <div class="chart-card">
      <div class="chart-card-info">
        <div class="chart-card-title">${esc(c.title || 'Untitled')}</div>
        <div class="chart-card-sub">${esc(c.artist || '')}${c.key ? ' · Key of ' + c.key : ''} · ${(c.sections||[]).length}개 섹션</div>
      </div>
      <div class="chart-card-actions">
        <button class="btn edit-chart" data-id="${c.id}">Edit</button>
        <button class="btn del-chart"  data-id="${c.id}">✕</button>
      </div>
    </div>
  `).join('');
  list.querySelectorAll('.edit-chart').forEach(btn =>
    btn.addEventListener('click', () => openEditor(charts.find(c => c.id === btn.dataset.id)))
  );
  list.querySelectorAll('.del-chart').forEach(btn =>
    btn.addEventListener('click', () => deleteChart(btn.dataset.id))
  );
}

function newChart() { openEditor({ id: null, title: '', artist: '', key: '', sections: [] }); }

function openEditor(chart) {
  editing  = chart;
  sections = (chart.sections || []).map(s => ({ ...s }));
  document.getElementById('chart-title').value  = chart.title  || '';
  document.getElementById('chart-artist').value = chart.artist || '';
  document.getElementById('chart-key').value    = chart.key    || '';
  document.getElementById('chart-list').style.display = 'none';
  document.getElementById('chart-editor').classList.remove('hidden');
  renderSections();
}

function closeEditor() {
  editing = null;
  document.getElementById('chart-editor').classList.add('hidden');
  document.getElementById('chart-list').style.display = '';
}

async function saveChart() {
  const payload = {
    id:       editing.id || Date.now().toString(),
    title:    document.getElementById('chart-title').value.trim()  || 'Untitled',
    artist:   document.getElementById('chart-artist').value.trim(),
    key:      document.getElementById('chart-key').value,
    sections: sections.map(s => ({ id: s.id, type: s.type, name: s.name, chords: s.chords, notes: s.notes })),
    createdAt: editing.createdAt || new Date().toISOString(),
  };
  try {
    await db.upsertChord(payload);
    const idx = charts.findIndex(c => c.id === payload.id);
    if (idx !== -1) charts[idx] = payload; else charts.unshift(payload);
    closeEditor(); renderList();
  } catch (e) { alert('저장 실패: ' + e.message); }
}

async function deleteChart(id) {
  if (!confirm('이 기록지를 삭제하시겠습니까?')) return;
  try {
    await db.deleteChord(id);
    charts = charts.filter(c => c.id !== id);
    renderList();
  } catch (e) { alert('삭제 실패: ' + e.message); }
}

function addSection() {
  sections.push({ id: crypto.randomUUID(), type: 'Verse', name: 'Verse', chords: '', notes: '' });
  renderSections();
  document.getElementById('sections-container').lastElementChild
    ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function renderSections() {
  const container = document.getElementById('sections-container');
  container.innerHTML = sections.map((s, i) => `
    <div class="section-card" data-idx="${i}" draggable="true">
      <div class="section-card-header">
        <span class="section-drag-handle" title="드래그해서 순서 변경">⠿</span>
        <select class="section-type-select" data-idx="${i}">
          ${TYPES.map(t => `<option${t === s.type ? ' selected' : ''}>${t}</option>`).join('')}
        </select>
        <input class="section-name-input" placeholder="Section name" value="${esc(s.name)}" data-idx="${i}">
        <button class="section-delete" data-idx="${i}">✕</button>
      </div>
      <textarea class="section-chords-input" placeholder="코드 진행 (예: Am | G | C | F)" data-idx="${i}" rows="2">${esc(s.chords)}</textarea>
      <textarea class="section-notes-input" placeholder="메모 (선택)" data-idx="${i}" rows="1">${esc(s.notes)}</textarea>
    </div>
  `).join('');

  container.querySelectorAll('.section-type-select').forEach(el =>
    el.addEventListener('change', () => { sections[+el.dataset.idx].type = el.value; })
  );
  container.querySelectorAll('.section-name-input').forEach(el =>
    el.addEventListener('input', () => { sections[+el.dataset.idx].name = el.value; })
  );
  container.querySelectorAll('.section-chords-input').forEach(el => {
    el.addEventListener('input', () => { sections[+el.dataset.idx].chords = el.value; autoResize(el); });
    autoResize(el);
  });
  container.querySelectorAll('.section-notes-input').forEach(el =>
    el.addEventListener('input', () => { sections[+el.dataset.idx].notes = el.value; })
  );
  container.querySelectorAll('.section-delete').forEach(el =>
    el.addEventListener('click', () => { sections.splice(+el.dataset.idx, 1); renderSections(); })
  );
  container.querySelectorAll('.section-card').forEach(card => {
    card.addEventListener('dragstart', e => { dragSrc = +card.dataset.idx; e.dataTransfer.effectAllowed = 'move'; });
    card.addEventListener('dragover',  e => { e.preventDefault(); card.style.outline = '1px solid var(--accent)'; });
    card.addEventListener('dragleave', () => card.style.outline = '');
    card.addEventListener('drop', e => {
      e.preventDefault(); card.style.outline = '';
      const dst = +card.dataset.idx;
      if (dragSrc === null || dragSrc === dst) return;
      const [moved] = sections.splice(dragSrc, 1);
      sections.splice(dst, 0, moved);
      renderSections();
    });
    card.addEventListener('dragend', () => {
      container.querySelectorAll('.section-card').forEach(c => c.style.outline = '');
      dragSrc = null;
    });
  });
}

function autoResize(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
