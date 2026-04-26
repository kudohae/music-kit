// IndexedDB wrapper
const DB_NAME    = 'musickit';
const DB_VERSION = 1;
const STORES     = ['songs', 'chords', 'setlists'];

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      for (const name of STORES)
        if (!db.objectStoreNames.contains(name))
          db.createObjectStore(name, { keyPath: 'id' });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = e => reject(e.target.error);
  });
}

function run(store, mode, fn) {
  return openDB().then(db => new Promise((resolve, reject) => {
    const tr  = db.transaction(store, mode);
    const req = fn(tr.objectStore(store));
    req.onsuccess = e => resolve(e.target.result);
    req.onerror   = e => reject(e.target.error);
  }));
}

export const idb = {
  getAll: store => run(store, 'readonly',  s => s.getAll()),
  get:   (store, id) => run(store, 'readonly',  s => s.get(id)),
  put:   (store, item) => run(store, 'readwrite', s => s.put(item)),
  del:   (store, id)   => run(store, 'readwrite', s => s.delete(id)),
};
