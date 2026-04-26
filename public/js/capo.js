// ── Capo Calculator ────────────────────────────────────────
// Given a sounding key and capo position, calculates which
// open chord shapes to play.

const NOTES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
const NOTE_LABELS = ['C','C#/Db','D','D#/Eb','E','F','F#/Gb','G','G#/Ab','A','A#/Bb','B'];

// Diatonic degrees for major and minor scales (semitone offsets from root)
const MAJOR_DEGREES = [
  { degree: 'I',    semi: 0,  quality: 'maj', roman: 'I'    },
  { degree: 'ii',   semi: 2,  quality: 'min', roman: 'ii'   },
  { degree: 'iii',  semi: 4,  quality: 'min', roman: 'iii'  },
  { degree: 'IV',   semi: 5,  quality: 'maj', roman: 'IV'   },
  { degree: 'V',    semi: 7,  quality: 'maj', roman: 'V'    },
  { degree: 'vi',   semi: 9,  quality: 'min', roman: 'vi'   },
  { degree: 'vii°', semi: 11, quality: 'dim', roman: 'vii°' },
];
const MINOR_DEGREES = [
  { degree: 'i',    semi: 0,  quality: 'min', roman: 'i'    },
  { degree: 'ii°',  semi: 2,  quality: 'dim', roman: 'ii°'  },
  { degree: 'III',  semi: 3,  quality: 'maj', roman: 'III'  },
  { degree: 'iv',   semi: 5,  quality: 'min', roman: 'iv'   },
  { degree: 'v',    semi: 7,  quality: 'min', roman: 'v'    },
  { degree: 'VI',   semi: 8,  quality: 'maj', roman: 'VI'   },
  { degree: 'VII',  semi: 10, quality: 'maj', roman: 'VII'  },
];

// Open chord shapes well-known on guitar (for display hints)
const EASY_SHAPES = new Set(['C','D','E','G','A','Am','Em','Dm','E7','A7','D7','G7','Bm','B7','Cadd9','Dsus2','Esus4']);

let selectedKey   = 0;  // index into NOTES
let selectedCapo  = 0;  // 0 = no capo
let selectedScale = 'major';

export function initCapo() {
  buildKeyGrid();
  buildCapoGrid();
  buildScaleBtns();
  renderResult();
}

function buildKeyGrid() {
  const grid = document.getElementById('key-grid');
  grid.innerHTML = NOTES.map((n, i) => `
    <button class="key-btn${i === selectedKey ? ' active' : ''}" data-key="${i}">
      ${NOTE_LABELS[i]}
    </button>
  `).join('');
  grid.querySelectorAll('.key-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedKey = parseInt(btn.dataset.key);
      grid.querySelectorAll('.key-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderResult();
    });
  });
}

function buildCapoGrid() {
  const grid = document.getElementById('capo-grid');
  const items = [0,1,2,3,4,5,6,7].map(n =>
    `<button class="capo-btn${n === selectedCapo ? ' active' : ''}" data-capo="${n}">
      ${n === 0 ? 'None' : n}
    </button>`
  ).join('');
  grid.innerHTML = items;
  grid.querySelectorAll('.capo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedCapo = parseInt(btn.dataset.capo);
      grid.querySelectorAll('.capo-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderResult();
    });
  });
}

function buildScaleBtns() {
  document.querySelectorAll('.scale-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedScale = btn.dataset.scale;
      document.querySelectorAll('.scale-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderResult();
    });
  });
}

function noteName(idx) {
  return NOTES[((idx % 12) + 12) % 12];
}

function chordName(noteIdx, quality) {
  const n = noteName(noteIdx);
  if (quality === 'maj') return n;
  if (quality === 'min') return n + 'm';
  if (quality === 'dim') return n + '°';
  return n;
}

function renderResult() {
  const result  = document.getElementById('capo-result');
  const degrees = selectedScale === 'major' ? MAJOR_DEGREES : MINOR_DEGREES;

  // Shape key = sounding key - capo semitones
  const shapeKeyIdx = ((selectedKey - selectedCapo) % 12 + 12) % 12;
  const shapeKey    = noteName(shapeKeyIdx);
  const soundingKey = noteName(selectedKey);

  const rows = degrees.map(d => {
    const soundingIdx = (selectedKey + d.semi) % 12;
    const shapeIdx    = (shapeKeyIdx + d.semi) % 12;
    const soundingChord = chordName(soundingIdx, d.quality);
    const shapeChord    = chordName(shapeIdx, d.quality);
    const isEasy = EASY_SHAPES.has(shapeChord);
    return `
      <tr>
        <td class="td-degree">${d.degree}</td>
        <td class="td-shape">${shapeChord}${isEasy ? '' : '<sup style="color:var(--muted);font-size:8px"> barre</sup>'}</td>
        <td class="td-sounds">${soundingChord}</td>
        <td class="td-quality">${d.quality}</td>
      </tr>
    `;
  }).join('');

  const noCapo = selectedCapo === 0;
  const scaleLabel = selectedScale === 'major' ? 'Major' : 'Minor';

  result.innerHTML = `
    <div class="capo-result-box">
      <div class="capo-result-title">
        ${noCapo ? `Key of ${soundingKey} ${scaleLabel} · No capo`
                 : `Sounds in ${soundingKey} ${scaleLabel} · Capo ${selectedCapo}번줄`}
      </div>
      ${noCapo ? '' : `
        <div class="capo-result-key">
          Play in <strong>${shapeKey} ${scaleLabel}</strong> shapes
        </div>
      `}
      <table class="chord-table">
        <thead>
          <tr>
            <th>Degree</th>
            <th>Play (shape)</th>
            <th>Sounds as</th>
            <th>Quality</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      ${noCapo ? '' : `
        <div class="capo-note">
          Capo ${selectedCapo}번줄 → 열린 줄이 ${soundingKey}로 울립니다.<br>
          ${shapeKey} 포지션의 코드 폼을 그대로 사용하면 ${soundingKey}로 들립니다.
        </div>
      `}
    </div>
  `;
}
