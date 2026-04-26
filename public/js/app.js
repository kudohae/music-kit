// ── Core app: navigation, API, events ──────────────────────
import { initLibrary }    from './library.js';
import { initViewer, openSongInViewer } from './viewer.js';
import { initIRMixer }    from './ir-mixer.js';
import { initChords }     from './chord-chart.js';
import { initSetlist }    from './setlist.js';
import { initCapo }       from './capo.js';

// PDF.js worker
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Events (simple pub/sub) ────────────────────────────────
const _handlers = {};
export function on(event, fn)   { (_handlers[event] ??= []).push(fn); }
export function emit(event, data) { (_handlers[event] ?? []).forEach(fn => fn(data)); }

// ── Navigation ─────────────────────────────────────────────
const SECTIONS = ['library', 'viewer', 'ir-mixer', 'chords', 'setlist', 'capo'];
let _current = 'library';

export function navigate(name) {
  if (!SECTIONS.includes(name)) return;
  document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
  document.getElementById(`${name}-section`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === name);
  });
  _current = name;
  emit('navigate', name);
}

export function currentSection() { return _current; }

// ── API helpers ────────────────────────────────────────────
export const api = {
  async get(path) {
    const r = await fetch(path);
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async post(path, body) {
    const isForm = body instanceof FormData;
    const r = await fetch(path, {
      method: 'POST',
      headers: isForm ? {} : { 'Content-Type': 'application/json' },
      body: isForm ? body : JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async put(path, body) {
    const r = await fetch(path, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
  async del(path) {
    const r = await fetch(path, { method: 'DELETE' });
    if (!r.ok) throw new Error(await r.text());
    return r.json();
  },
};

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLibrary();
  initViewer();
  initIRMixer();
  initChords();
  initSetlist();
  initCapo();

  // Sidebar navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.section));
  });

  // Global keyboard: viewer page nav
  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'PageDown') { e.preventDefault(); emit('page-next'); }
    if (e.key === 'PageUp')   { e.preventDefault(); emit('page-prev'); }
    if (e.key === 'Escape')   { emit('esc'); }
  });
});

// Re-export openSongInViewer so setlist.js can use it
export { openSongInViewer };
