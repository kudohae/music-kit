import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const sb = createClient(
  'https://dwfdinsmiqnbhzsldvws.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR3ZmRpbnNtaXFuYmh6c2xkdndzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NDkwNzIsImV4cCI6MjA5MjQyNTA3Mn0.G-C3PNUKZ-H1bj4u2noQqgA_649wm6HdnH4X6SKJKHg'
);

const BUCKET = 'music-files';

// ── Storage ────────────────────────────────────────────────
export const storage = {
  async upload(path, arrayBuffer, mimeType) {
    const { error } = await sb.storage.from(BUCKET)
      .upload(path, arrayBuffer, { contentType: mimeType, upsert: true });
    if (error) throw new Error('Storage upload failed: ' + error.message);
  },

  url(path) {
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  },

  async remove(paths) {
    if (!paths.length) return;
    const { error } = await sb.storage.from(BUCKET).remove(paths);
    if (error) throw new Error('Storage delete failed: ' + error.message);
  },

  async listFolder(prefix) {
    const { data, error } = await sb.storage.from(BUCKET).list(prefix);
    if (error || !data) return [];
    return data.map(f => `${prefix}/${f.name}`);
  },
};

// ── DB row ↔ JS object mappers ─────────────────────────────
function songFromRow(r) {
  return { id: r.id, title: r.title, artist: r.artist,
           fileType: r.file_type, files: r.files ?? [], createdAt: r.created_at };
}
function chartFromRow(r) {
  return { id: r.id, title: r.title, artist: r.artist,
           key: r.key, sections: r.sections ?? [], createdAt: r.created_at };
}
function setlistFromRow(r) {
  return { id: r.id, name: r.name, songs: r.songs ?? [], createdAt: r.created_at };
}

// ── Database ───────────────────────────────────────────────
export const db = {
  // Songs
  async getSongs() {
    const { data, error } = await sb.from('songs').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(songFromRow);
  },
  async upsertSong(song) {
    const { error } = await sb.from('songs').upsert({
      id: song.id, title: song.title, artist: song.artist ?? '',
      file_type: song.fileType, files: song.files,
    });
    if (error) throw new Error(error.message);
  },
  async deleteSong(id) {
    const { error } = await sb.from('songs').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // Chords
  async getChords() {
    const { data, error } = await sb.from('chords').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(chartFromRow);
  },
  async upsertChord(chart) {
    const { error } = await sb.from('chords').upsert({
      id: chart.id, title: chart.title, artist: chart.artist ?? '',
      key: chart.key ?? '', sections: chart.sections ?? [],
    });
    if (error) throw new Error(error.message);
  },
  async deleteChord(id) {
    const { error } = await sb.from('chords').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  // Setlists
  async getSetlists() {
    const { data, error } = await sb.from('setlists').select('*').order('created_at', { ascending: false });
    if (error) throw new Error(error.message);
    return data.map(setlistFromRow);
  },
  async upsertSetlist(sl) {
    const { error } = await sb.from('setlists').upsert({
      id: sl.id, name: sl.name, songs: sl.songs ?? [],
    });
    if (error) throw new Error(error.message);
  },
  async deleteSetlist(id) {
    const { error } = await sb.from('setlists').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },
};
