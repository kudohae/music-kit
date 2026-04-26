import { initLibrary }   from './library.js';
import { initViewer }    from './viewer.js';
import { initIRMixer }   from './ir-mixer.js';
import { initChords }    from './chord-chart.js';
import { initSetlist }   from './setlist.js';
import { initCapo }      from './capo.js';

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── Events ─────────────────────────────────────────────────
const _handlers = {};
export function on(event, fn)     { (_handlers[event] ??= []).push(fn); }
export function emit(event, data) { (_handlers[event] ?? []).forEach(fn => fn(data)); }

// ── Navigation ─────────────────────────────────────────────
const SECTIONS = ['library', 'viewer', 'ir-mixer', 'chords', 'setlist', 'capo'];

export function navigate(name) {
  if (!SECTIONS.includes(name)) return;
  document.querySelectorAll('.section').forEach(el => el.classList.add('hidden'));
  document.getElementById(`${name}-section`).classList.remove('hidden');
  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.classList.toggle('active', btn.dataset.section === name)
  );
  emit('navigate', name);
}

// ── Init ───────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initLibrary();
  initViewer();
  initIRMixer();
  initChords();
  initSetlist();
  initCapo();

  document.querySelectorAll('.nav-btn').forEach(btn =>
    btn.addEventListener('click', () => navigate(btn.dataset.section))
  );

  document.addEventListener('keydown', e => {
    const tag = document.activeElement?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'PageDown') { e.preventDefault(); emit('page-next'); }
    if (e.key === 'PageUp')   { e.preventDefault(); emit('page-prev'); }
    if (e.key === 'Escape')   { emit('esc'); }
  });
});
