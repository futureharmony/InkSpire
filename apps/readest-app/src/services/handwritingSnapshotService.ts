import { eventDispatcher } from '@/utils/event';
import { isTauriAppPlatform } from '@/services/environment';
import { captureWebviewRegion } from '@/utils/bridge';
import { arrayBufferToThumbnailDataUrl } from '@/utils/handwriting';

const DB_NAME = 'HandwritingSnapshots';
const DB_VERSION = 1;
const STORE_NAME = 'snapshots';

export interface PageSnapshotEntry {
  key: string; // `${bookHash}_${pageIndex}`
  bookHash: string;
  pageIndex: number;
  dataUrl: string;
  updatedAt: number;
}

// In-memory cache for fast synchronous lookup
const memoryCache = new Map<string, string>();

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof window === 'undefined' || !window.indexedDB) {
    return Promise.reject(new Error('IndexedDB not available'));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = (e) => reject(e);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('bookHash', 'bookHash', { unique: false });
        store.createIndex('updatedAt', 'updatedAt', { unique: false });
      }
    };
  });
  return dbPromise;
}

/**
 * Get synchronously available snapshots from memory cache.
 */
export function getLoadedHandwritingSnapshots(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [k, v] of memoryCache.entries()) {
    result[k] = v;
  }
  return result;
}

/**
 * Save a thumbnail snapshot of a page into memory cache and IndexedDB.
 */
export async function saveHandwritingSnapshot(
  bookHash: string,
  pageIndex: number,
  dataUrl: string,
): Promise<void> {
  const key = `${bookHash}_${pageIndex}`;
  memoryCache.set(key, dataUrl);
  eventDispatcher.dispatch('handwriting-snapshot-updated', {
    bookHash,
    pageIndex,
    dataUrl,
  });

  if (typeof window === 'undefined' || !window.indexedDB) {
    return;
  }

  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const entry: PageSnapshotEntry = {
      key,
      bookHash,
      pageIndex,
      dataUrl,
      updatedAt: Date.now(),
    };
    store.put(entry);
  } catch (err) {
    // Keep in memoryCache even if IndexedDB write fails
    console.warn('[HandwritingSnapshot] Failed to write snapshot to IndexedDB:', err);
  }
}

/**
 * Retrieve a snapshot for a specific page.
 */
export async function getHandwritingSnapshot(
  bookHash: string,
  pageIndex: number,
): Promise<string | null> {
  const key = `${bookHash}_${pageIndex}`;
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const result = request.result as PageSnapshotEntry | undefined;
        if (result?.dataUrl) {
          memoryCache.set(key, result.dataUrl);
          resolve(result.dataUrl);
        } else {
          resolve(null);
        }
      };
      request.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

/**
 * Load all stored snapshots across all books.
 */
export async function getAllHandwritingSnapshots(): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const [k, v] of memoryCache.entries()) {
    result[k] = v;
  }
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    return new Promise((resolve) => {
      request.onsuccess = () => {
        const entries = (request.result as PageSnapshotEntry[]) || [];
        for (const entry of entries) {
          result[entry.key] = entry.dataUrl;
          memoryCache.set(entry.key, entry.dataUrl);
        }
        resolve(result);
      };
      request.onerror = () => resolve(result);
    });
  } catch {
    return result;
  }
}

/**
 * Delete a snapshot from cache and IndexedDB.
 */
export async function deleteHandwritingSnapshot(
  bookHash: string,
  pageIndex: number,
): Promise<void> {
  const key = `${bookHash}_${pageIndex}`;
  memoryCache.delete(key);
  try {
    const db = await openDatabase();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch {
    // ignore
  }
}

/**
 * Capture current reader page using Tauri native webview snapshot or canvas,
 * downscale to thumbnail and save in snapshot database.
 */
export async function captureAndSavePageSnapshot(
  bookHash: string,
  pageIndex: number,
  containerElement: HTMLElement | null,
): Promise<string | null> {
  if (!containerElement) return null;
  const rect = containerElement.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  // 1. Native webview capture on Tauri platforms (Android/iOS/Desktop)
  if (isTauriAppPlatform()) {
    try {
      const arrayBuffer = await captureWebviewRegion({
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      });
      const dataUrl = await arrayBufferToThumbnailDataUrl(arrayBuffer, 960);
      if (dataUrl) {
        await saveHandwritingSnapshot(bookHash, pageIndex, dataUrl);
        return dataUrl;
      }
    } catch (e) {
      console.warn('[HandwritingSnapshot] captureWebviewRegion failed:', e);
    }
  }

  // 2. Fallback: inspect parent container for PDF/image canvas
  try {
    const parent = containerElement.parentElement;
    const canvases = parent ? Array.from(parent.querySelectorAll('canvas')) : [];
    const sourceCanvas = canvases.find(
      (c) => c.width > 100 && c.height > 100 && c !== containerElement,
    );
    if (sourceCanvas) {
      const thumbCanvas = document.createElement('canvas');
      const targetW = 320;
      const targetH = Math.max(1, Math.round((sourceCanvas.height / sourceCanvas.width) * targetW));
      thumbCanvas.width = targetW;
      thumbCanvas.height = targetH;
      const ctx = thumbCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);
        const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.85);
        await saveHandwritingSnapshot(bookHash, pageIndex, dataUrl);
        return dataUrl;
      }
    }
  } catch {
    // ignore
  }

  return null;
}
