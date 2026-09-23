import { BookNote } from '@/types/book';
import { HandwritingStroke, HandwritingBookData } from '@/types/handwriting';
import { useBookDataStore } from '@/store/bookDataStore';
import { useHandwritingStore } from '@/store/handwritingStore';

const LOCAL_STORAGE_PREFIX = 'inkspire_hw_';

/** Get local cache key for a book */
export function getHandwritingStorageKey(bookHash: string): string {
  return `${LOCAL_STORAGE_PREFIX}${bookHash}`;
}

/** Load handwriting strokes from localStorage cache */
export function loadHandwritingFromLocal(
  bookHash: string,
): Record<number, HandwritingStroke[]> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(getHandwritingStorageKey(bookHash));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as HandwritingBookData;
    return parsed?.pages || {};
  } catch (e) {
    console.warn('[HandwritingService] Failed to load from localStorage:', e);
    return {};
  }
}

/** Save handwriting strokes to localStorage cache */
export function saveHandwritingToLocal(
  bookHash: string,
  pages: Record<number, HandwritingStroke[]>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const data: HandwritingBookData = {
      version: 1,
      bookHash,
      pages,
      updatedAt: Date.now(),
    };
    localStorage.setItem(getHandwritingStorageKey(bookHash), JSON.stringify(data));
  } catch (e) {
    console.warn('[HandwritingService] Failed to save to localStorage:', e);
  }
}

/** Extract all handwriting strokes from book's booknotes array */
export function extractHandwritingFromBooknotes(
  booknotes: BookNote[] = [],
): Record<number, HandwritingStroke[]> {
  const result: Record<number, HandwritingStroke[]> = {};

  for (const note of booknotes) {
    if (note.type !== 'handwriting' || note.deletedAt) continue;
    try {
      const pageIndex = (note.page !== undefined ? note.page - 1 : 0);
      if (!note.note) continue;
      const parsed = JSON.parse(note.note);
      const strokes: HandwritingStroke[] = Array.isArray(parsed)
        ? parsed
        : parsed?.strokes || [];
      if (strokes.length > 0) {
        result[pageIndex] = strokes;
      }
    } catch (e) {
      console.warn('[HandwritingService] Error parsing handwriting note:', e);
    }
  }

  return result;
}

/**
 * Merge handwriting strokes into booknotes, ensuring it participates in
 * book persistence and sync with zero complex setup.
 */
export function mergeHandwritingIntoBooknotes(
  bookHash: string,
  pageIndex: number,
  strokes: HandwritingStroke[],
  existingBooknotes: BookNote[] = [],
  cfi = '',
): BookNote[] {
  const noteId = `hw-${bookHash}-p${pageIndex + 1}`;
  const now = Date.now();

  const notePayload = JSON.stringify(strokes);

  // If no strokes, mark existing handwriting note as deleted
  if (strokes.length === 0) {
    return existingBooknotes.map((note) =>
      note.id === noteId || (note.type === 'handwriting' && note.page === pageIndex + 1)
        ? { ...note, deletedAt: now }
        : note,
    );
  }

  const existingIndex = existingBooknotes.findIndex(
    (n) => n.id === noteId || (n.type === 'handwriting' && n.page === pageIndex + 1),
  );

  const snippets = strokes
    .map((s) => s.textAnchor?.textSnippet?.trim())
    .filter(Boolean);
  const snippetPreview =
    snippets.length > 0 ? `: "${snippets[0]!.slice(0, 80)}"` : '';

  const effectiveCfi =
    cfi ||
    strokes.find((s) => s.cfi)?.cfi ||
    strokes.find((s) => s.textAnchor?.cfi)?.textAnchor?.cfi ||
    `epubcfi(/6/2[page-${pageIndex + 1}]!/4)`;

  const updatedNote: BookNote = {
    id: noteId,
    type: 'handwriting',
    bookHash,
    page: pageIndex + 1,
    cfi: effectiveCfi,
    note: notePayload,
    text: `[Handwriting Note: Page ${pageIndex + 1} (${strokes.length} strokes)${snippetPreview}]`,
    createdAt: existingIndex >= 0 ? existingBooknotes[existingIndex]!.createdAt : now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    const next = [...existingBooknotes];
    next[existingIndex] = updatedNote;
    return next;
  }

  return [...existingBooknotes, updatedNote];
}

/** Initialize handwriting for a book: merges localStorage and booknotes */
export function initBookHandwriting(bookKey: string, bookHash: string): void {
  const config = useBookDataStore.getState().getConfig(bookKey);
  const fromNotes = extractHandwritingFromBooknotes(config?.booknotes || []);
  const fromLocal = loadHandwritingFromLocal(bookHash);

  // Merge: prefer newer or combined
  const merged: Record<number, HandwritingStroke[]> = {
    ...fromNotes,
    ...fromLocal,
  };

  useHandwritingStore.getState().loadBookStrokes(bookHash, merged);
}

/** Commit page handwriting changes to both localStorage and booknotes */
export function persistPageHandwriting(
  bookKey: string,
  bookHash: string,
  pageIndex: number,
  strokes: HandwritingStroke[],
  cfi?: string,
): void {
  // 1. Update store
  const store = useHandwritingStore.getState();
  const allBookPages = store.bookStrokes[bookHash] || {};
  const updatedPages = {
    ...allBookPages,
    [pageIndex]: strokes,
  };

  // 2. Save to local storage cache immediately
  saveHandwritingToLocal(bookHash, updatedPages);

  // 3. Save into bookDataStore booknotes
  const bookDataStore = useBookDataStore.getState();
  const currentConfig = bookDataStore.getConfig(bookKey);
  const currentBooknotes = currentConfig?.booknotes || [];

  const updatedBooknotes = mergeHandwritingIntoBooknotes(
    bookHash,
    pageIndex,
    strokes,
    currentBooknotes,
    cfi,
  );

  bookDataStore.updateBooknotes(bookKey, updatedBooknotes);
}
