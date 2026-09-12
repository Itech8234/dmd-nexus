// Offline-first sync store (IndexedDB-backed). Mirrors the prior field PWA's
// queue semantics: every report/incident is written locally FIRST with a
// stable client_generated_id, then flushed to the real backend. The backend
// is idempotent on that id, so retries can never duplicate.

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open("ycomps-sync", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("queue")) {
        const store = db.createObjectStore("queue", { keyPath: "client_generated_id" });
        store.createIndex("by_type", "object_type", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

export interface QueuedItem {
  client_generated_id: string;
  object_type: "report" | "incident";
  payload: Record<string, unknown>;
  created_at: string;
}

export async function enqueueItem(item: QueuedItem): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    tx.objectStore("queue").put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listQueue(): Promise<QueuedItem[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("queue", "readonly").objectStore("queue").getAll();
    req.onsuccess = () => resolve((req.result as QueuedItem[]) || []);
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueued(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    tx.objectStore("queue").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearQueue(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("queue", "readwrite");
    tx.objectStore("queue").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
