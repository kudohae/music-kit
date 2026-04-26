const express = require('express');
const multer  = require('multer');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

for (const dir of ['uploads', 'data']) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DB = {
  songs:    'data/songs.json',
  chords:   'data/chords.json',
  setlists: 'data/setlists.json',
};
for (const file of Object.values(DB)) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, '[]');
}

const read  = f => JSON.parse(fs.readFileSync(f, 'utf8'));
const write = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));

app.use(express.json());
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    cb(null, id + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

function detectFileType(originalname) {
  const ext = path.extname(originalname).toLowerCase();
  if (ext === '.pdf') return 'pdf';
  if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return 'jpg';
  if (['.gp', '.gp3', '.gp4', '.gp5', '.gpx', '.gp7'].includes(ext)) return 'gp';
  return 'unknown';
}

// ── Songs ──────────────────────────────────────────────────
app.get('/api/songs', (req, res) => res.json(read(DB.songs)));

app.post('/api/songs', upload.array('files'), (req, res) => {
  if (!req.files?.length) return res.status(400).json({ error: 'No files uploaded' });
  const songs = read(DB.songs);
  const firstFile = req.files[0];
  const fileType = detectFileType(firstFile.originalname);
  const song = {
    id:        Date.now().toString(),
    title:     req.body.title  || path.basename(firstFile.originalname, path.extname(firstFile.originalname)),
    artist:    req.body.artist || '',
    fileType,
    files:     req.files
                 .sort((a, b) => a.originalname.localeCompare(b.originalname, undefined, { numeric: true }))
                 .map(f => ({ name: f.originalname, path: '/uploads/' + f.filename })),
    createdAt: new Date().toISOString(),
  };
  songs.push(song);
  write(DB.songs, songs);
  res.json(song);
});

app.put('/api/songs/:id', (req, res) => {
  const songs = read(DB.songs);
  const idx   = songs.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  songs[idx] = { ...songs[idx], ...req.body };
  write(DB.songs, songs);
  res.json(songs[idx]);
});

app.delete('/api/songs/:id', (req, res) => {
  let songs = read(DB.songs);
  const song = songs.find(s => s.id === req.params.id);
  if (song) {
    for (const f of song.files) {
      const fp = path.join('uploads', path.basename(f.path));
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    }
    songs = songs.filter(s => s.id !== req.params.id);
    write(DB.songs, songs);
  }
  res.json({ ok: true });
});

// ── Chord Charts ───────────────────────────────────────────
app.get('/api/chords', (req, res) => res.json(read(DB.chords)));

app.post('/api/chords', (req, res) => {
  const charts = read(DB.chords);
  const chart  = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  charts.push(chart);
  write(DB.chords, charts);
  res.json(chart);
});

app.put('/api/chords/:id', (req, res) => {
  const charts = read(DB.chords);
  const idx    = charts.findIndex(c => c.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  charts[idx] = { ...charts[idx], ...req.body };
  write(DB.chords, charts);
  res.json(charts[idx]);
});

app.delete('/api/chords/:id', (req, res) => {
  let charts = read(DB.chords);
  charts = charts.filter(c => c.id !== req.params.id);
  write(DB.chords, charts);
  res.json({ ok: true });
});

// ── Setlists ───────────────────────────────────────────────
app.get('/api/setlists', (req, res) => res.json(read(DB.setlists)));

app.post('/api/setlists', (req, res) => {
  const lists = read(DB.setlists);
  const sl    = { id: Date.now().toString(), ...req.body, createdAt: new Date().toISOString() };
  lists.push(sl);
  write(DB.setlists, lists);
  res.json(sl);
});

app.put('/api/setlists/:id', (req, res) => {
  const lists = read(DB.setlists);
  const idx   = lists.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  lists[idx] = { ...lists[idx], ...req.body };
  write(DB.setlists, lists);
  res.json(lists[idx]);
});

app.delete('/api/setlists/:id', (req, res) => {
  let lists = read(DB.setlists);
  lists = lists.filter(s => s.id !== req.params.id);
  write(DB.setlists, lists);
  res.json({ ok: true });
});

app.listen(PORT, () => console.log(`MusicKit → http://localhost:${PORT}`));
