// IndexedDB-backed write queue for daily logs submitted while offline.
// This used to be localStorage-backed, but photos are now required on
// every log — a File/Blob can't be JSON-serialized, and base64-encoding an
// 8MB photo into localStorage would blow past its ~5-10MB per-origin quota
// on the very first queued log. IndexedDB stores Blobs natively and has a
// far larger quota, so it's the only realistic fit once photos are
// mandatory. Inventory's PWA only caches GET reads — it has no offline
// write path at all — so this remains genuinely new behavior beyond what
// inventory does, just on a different storage layer than before.
import { createDailyLog } from '../api/dailyLogs'

const DB_NAME    = 'jccs-projects-offline'
const STORE_NAME = 'daily-log-queue'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME, { keyPath: 'queuedId' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function enqueueDailyLog(payload, photos) {
  const db = await openDB()
  const queuedId = `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).put({ queuedId, payload, photos })
    tx.oncomplete = () => resolve(queuedId)
    tx.onerror = () => reject(tx.error)
  })
}

export async function getQueuedDailyLogs() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const req = tx.objectStore(STORE_NAME).getAll()
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

export async function getQueuedCount() {
  try {
    return (await getQueuedDailyLogs()).length
  } catch {
    return 0
  }
}

function removeFromQueue(queuedId) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    tx.objectStore(STORE_NAME).delete(queuedId)
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
  }))
}

// Tries to submit every queued log in order. Stops at the first failure
// (network still down, or a real validation error) so nothing gets silently
// dropped — the remainder stays queued for the next attempt.
export async function flushDailyLogQueue() {
  let items
  try {
    items = await getQueuedDailyLogs()
  } catch {
    return 0
  }
  let synced = 0
  for (const item of items) {
    try {
      await createDailyLog(item.payload, item.photos)
      await removeFromQueue(item.queuedId)
      synced++
    } catch {
      break
    }
  }
  return synced
}
