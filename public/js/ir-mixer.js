// ── IR Mixer ──────────────────────────────────────────────
// Loads a dry WAV + IR WAV, allows real-time preview and
// batch export to 24-bit / 44100 Hz WAV files (zipped).

let dryBuffer = null;
let irBuffer  = null;
let previewCtx    = null;
let previewSource = null;
let previewGain   = null;

export function initIRMixer() {
  setupFileDrop('dry-drop', 'dry-file', 'dry-name', false, buf => {
    dryBuffer = buf;
    updateIRInfo();
    updatePreviewBtn();
    updateExportBtn();
  });
  setupFileDrop('ir-drop', 'ir-file', 'ir-name', true, buf => {
    irBuffer = buf;
    updateIRInfo();
    updatePreviewBtn();
    updateExportBtn();
  });

  const previewMix = document.getElementById('preview-mix');
  previewMix.addEventListener('input', () => {
    document.getElementById('preview-mix-val').textContent = previewMix.value + '%';
  });

  document.getElementById('preview-btn').addEventListener('click', startPreview);
  document.getElementById('stop-preview-btn').addEventListener('click', stopPreview);

  // Export config → live preview of percentage list
  ['exp-from','exp-to','exp-step'].forEach(id => {
    document.getElementById(id).addEventListener('input', updateExpList);
  });
  updateExpList();

  document.getElementById('export-btn').addEventListener('click', runExport);
}

// ── File drop setup ────────────────────────────────────────
function setupFileDrop(dropId, inputId, nameId, irOnly, onLoaded) {
  const drop  = document.getElementById(dropId);
  const input = document.getElementById(inputId);
  const label = document.getElementById(nameId);

  const handleFile = async file => {
    if (!file) return;
    if (irOnly && !file.name.toLowerCase().endsWith('.wav')) {
      alert('IR 파일은 WAV 형식이어야 합니다.'); return;
    }
    label.textContent = file.name;
    drop.classList.add('loaded');
    try {
      const buf = await decodeAudio(file);
      onLoaded(buf);
    } catch (e) {
      alert('오디오 디코딩 실패: ' + e.message);
      drop.classList.remove('loaded');
    }
  };

  input.addEventListener('change', () => handleFile(input.files[0]));

  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('drag-over'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag-over'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('drag-over');
    handleFile(e.dataTransfer.files[0]);
  });
}

async function decodeAudio(file) {
  const ctx = new AudioContext();
  const ab  = await file.arrayBuffer();
  const buf = await ctx.decodeAudioData(ab);
  await ctx.close();
  return buf;
}

// ── Info display ───────────────────────────────────────────
function updateIRInfo() {
  const el = document.getElementById('ir-info');
  const lines = [];
  if (dryBuffer) {
    lines.push(`Dry: ${fmtDur(dryBuffer.duration)} · ${dryBuffer.numberOfChannels}ch · ${dryBuffer.sampleRate} Hz`);
  }
  if (irBuffer) {
    lines.push(`IR:  ${fmtDur(irBuffer.duration)} · ${irBuffer.numberOfChannels}ch · ${irBuffer.sampleRate} Hz`);
  }
  if (dryBuffer && irBuffer && dryBuffer.sampleRate !== irBuffer.sampleRate) {
    lines.push('⚠ 샘플레이트 불일치 → 자동 리샘플링');
  }
  el.innerHTML = lines.join('<br>');
  el.classList.toggle('hidden', lines.length === 0);
}

function fmtDur(sec) {
  const m = Math.floor(sec / 60), s = (sec % 60).toFixed(1);
  return m ? `${m}m ${s}s` : `${s}s`;
}

// ── Export list preview ────────────────────────────────────
function getPercentages() {
  const from = Math.max(0, Math.min(100, parseInt(document.getElementById('exp-from').value) || 0));
  const to   = Math.max(0, Math.min(100, parseInt(document.getElementById('exp-to').value)   || 100));
  const step = Math.max(1, Math.min(100, parseInt(document.getElementById('exp-step').value) || 25));
  const pcts = [];
  for (let p = from; p <= to; p += step) pcts.push(p);
  if (!pcts.includes(to) && to > from) pcts.push(to);
  return [...new Set(pcts)].sort((a, b) => a - b);
}

function updateExpList() {
  const pcts = getPercentages();
  document.getElementById('exp-preview-list').textContent =
    `→ ${pcts.length} 파일: ${pcts.map(p => p + '%').join(', ')}`;
}

function updatePreviewBtn() {
  document.getElementById('preview-btn').disabled = !(dryBuffer && irBuffer);
}
function updateExportBtn() {
  document.getElementById('export-btn').disabled = !(dryBuffer && irBuffer);
}

// ── Real-time preview ──────────────────────────────────────
async function startPreview() {
  stopPreview();
  const mix = parseInt(document.getElementById('preview-mix').value) / 100;

  previewCtx = new AudioContext();

  // Dry source
  const drySrc = previewCtx.createBufferSource();
  drySrc.buffer = dryBuffer;
  const dryGain = previewCtx.createGain();
  dryGain.gain.value = 1 - mix;
  drySrc.connect(dryGain).connect(previewCtx.destination);

  // Wet source
  if (mix > 0) {
    const wetSrc = previewCtx.createBufferSource();
    wetSrc.buffer = dryBuffer;
    const convolver = previewCtx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = irBuffer;
    const wetGain = previewCtx.createGain();
    wetGain.gain.value = mix;
    wetSrc.connect(convolver).connect(wetGain).connect(previewCtx.destination);
    wetSrc.start(0);
  }

  drySrc.start(0);
  previewSource = drySrc;

  document.getElementById('stop-preview-btn').disabled = false;
  drySrc.onended = () => {
    document.getElementById('stop-preview-btn').disabled = true;
    previewCtx?.close();
    previewCtx = null;
  };
}

function stopPreview() {
  try { previewSource?.stop(); } catch(_) {}
  previewCtx?.close();
  previewCtx = null;
  previewSource = null;
  document.getElementById('stop-preview-btn').disabled = true;
}

// ── Mix & encode one file ──────────────────────────────────
async function mixToBuffer(wetMix, normalize, trim) {
  const SAMPLE_RATE = 44100;
  const numCh    = Math.max(dryBuffer.numberOfChannels, irBuffer.numberOfChannels);
  const irSec    = trim ? 0 : irBuffer.duration;
  const outLen   = Math.ceil((dryBuffer.duration + irSec) * SAMPLE_RATE);

  const ctx = new OfflineAudioContext(numCh, outLen, SAMPLE_RATE);

  // Dry path (always render, even at mix=1 to avoid silence glitch)
  const drySrc  = ctx.createBufferSource();
  drySrc.buffer = dryBuffer;
  const dryGain = ctx.createGain();
  dryGain.gain.value = Math.max(0, 1 - wetMix);
  drySrc.connect(dryGain).connect(ctx.destination);
  drySrc.start(0);

  // Wet path
  if (wetMix > 0) {
    const wetSrc  = ctx.createBufferSource();
    wetSrc.buffer = dryBuffer;
    const convolver = ctx.createConvolver();
    convolver.normalize = true;
    convolver.buffer = irBuffer;
    const wetGain = ctx.createGain();
    wetGain.gain.value = wetMix;
    wetSrc.connect(convolver).connect(wetGain).connect(ctx.destination);
    wetSrc.start(0);
  }

  const rendered = await ctx.startRendering();

  if (normalize) {
    return normalizeBuffer(rendered);
  }
  return rendered;
}

function normalizeBuffer(buf) {
  let peak = 0;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
    }
  }
  if (peak === 0 || peak >= 0.9999) return buf;

  const scale = 1 / peak;
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const data = buf.getChannelData(ch);
    for (let i = 0; i < data.length; i++) data[i] *= scale;
  }
  return buf;
}

// ── WAV 24-bit encoder ────────────────────────────────────
// Correctness notes:
// - PCM linear, little-endian, two's complement
// - Range: -8388608 .. 8388607 for 24-bit
// - Two's complement: (intVal & 0xFFFFFF) gives correct bit pattern
//   for both positive and negative values via JS32-bit bitwise math.
function encodeWav24(audioBuf) {
  const numCh     = audioBuf.numberOfChannels;
  const rate      = audioBuf.sampleRate;   // always 44100 (OfflineAudioContext)
  const len       = audioBuf.length;
  const BPS       = 24;
  const bytesPer  = 3;
  const dataSize  = len * numCh * bytesPer;
  const buf       = new ArrayBuffer(44 + dataSize);
  const v         = new DataView(buf);

  const str = (off, s) => [...s].forEach((c, i) => v.setUint8(off + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4,  36 + dataSize, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);                        // subchunk1 size (PCM)
  v.setUint16(20, 1,  true);                        // AudioFormat = PCM
  v.setUint16(22, numCh, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * numCh * bytesPer, true);   // ByteRate
  v.setUint16(32, numCh * bytesPer, true);          // BlockAlign
  v.setUint16(34, BPS, true);
  str(36, 'data');
  v.setUint32(40, dataSize, true);

  // Get channel data arrays once (avoid repeated getChannelData calls)
  const channels = [];
  for (let ch = 0; ch < numCh; ch++) channels.push(audioBuf.getChannelData(ch));

  let off = 44;
  for (let i = 0; i < len; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      // Clamp to [-1, 1], scale to 24-bit int, write two's-complement little-endian
      const s     = Math.max(-1, Math.min(1, channels[ch][i]));
      const int24 = s < 0
        ? Math.max(-8388608, Math.round(s * 8388608))
        : Math.min( 8388607, Math.round(s * 8388607));
      // Bitwise & 0xFFFFFF: JS operates on 32-bit signed int, then masks to 24 bits.
      // Negative two's complement is preserved correctly.
      const bits = int24 & 0xFFFFFF;
      v.setUint8(off++, bits         & 0xFF);
      v.setUint8(off++, (bits >>  8) & 0xFF);
      v.setUint8(off++, (bits >> 16) & 0xFF);
    }
  }
  return buf;
}

// ── Batch export ───────────────────────────────────────────
async function runExport() {
  const pcts      = getPercentages();
  const normalize = document.getElementById('exp-normalize').checked;
  const trim      = document.getElementById('exp-trim').checked;

  const progressEl = document.getElementById('export-progress');
  const barEl      = document.getElementById('export-bar');
  const statusEl   = document.getElementById('export-status');
  const exportBtn  = document.getElementById('export-btn');

  progressEl.classList.remove('hidden');
  exportBtn.disabled = true;

  const zip = new JSZip();
  const dryName = (document.getElementById('dry-name').textContent.replace(/\.[^.]+$/, '') || 'dry');

  for (let i = 0; i < pcts.length; i++) {
    const pct = pcts[i];
    statusEl.textContent = `Processing ${pct}% (${i + 1}/${pcts.length})…`;
    barEl.style.width    = ((i / pcts.length) * 100) + '%';

    // Yield to browser to update UI before heavy compute
    await new Promise(r => setTimeout(r, 0));

    try {
      const rendered = await mixToBuffer(pct / 100, normalize, trim);
      const wavData  = encodeWav24(rendered);
      const fname    = `${dryName}_mix${String(pct).padStart(3, '0')}.wav`;
      zip.file(fname, wavData);
    } catch (e) {
      alert(`${pct}% 처리 중 오류: ${e.message}`); break;
    }
  }

  barEl.style.width = '100%';
  statusEl.textContent = 'Zipping…';
  await new Promise(r => setTimeout(r, 0));

  const blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${dryName}_ir_mix.zip`;
  a.click();
  URL.revokeObjectURL(url);

  statusEl.textContent = '완료!';
  exportBtn.disabled = false;
  setTimeout(() => progressEl.classList.add('hidden'), 3000);
}
