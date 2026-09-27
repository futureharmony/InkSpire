import { BookNote } from '@/types/book';
import {
  HandwritingStroke,
  HandwritingBookData,
  HandwritingStickyNote,
  HandwritingPageSummary,
  HandwritingQueryOptions,
} from '@/types/handwriting';
import { useBookDataStore } from '@/store/bookDataStore';
import { useHandwritingStore } from '@/store/handwritingStore';
import { deleteHandwritingSnapshot } from './handwritingSnapshotService';

const LOCAL_STORAGE_PREFIX = 'inkspire_hw_';

/** Get local cache key for a book */
export function getHandwritingStorageKey(bookHash: string): string {
  return `${LOCAL_STORAGE_PREFIX}${bookHash}`;
}

/** Load handwriting strokes and sticky notes from localStorage cache */
export function loadHandwritingFromLocal(bookHash: string): {
  pages: Record<number, HandwritingStroke[]>;
  stickyNotes: Record<number, HandwritingStickyNote[]>;
  pageTexts: Record<number, string>;
  aspectRatios: Record<number, number>;
} {
  if (typeof window === 'undefined')
    return { pages: {}, stickyNotes: {}, pageTexts: {}, aspectRatios: {} };
  try {
    const raw = localStorage.getItem(getHandwritingStorageKey(bookHash));
    if (!raw) return { pages: {}, stickyNotes: {}, pageTexts: {}, aspectRatios: {} };
    const parsed = JSON.parse(raw) as HandwritingBookData;
    return {
      pages: parsed?.pages || {},
      stickyNotes: parsed?.stickyNotes || {},
      pageTexts: parsed?.pageTexts || {},
      aspectRatios: parsed?.aspectRatios || {},
    };
  } catch (e) {
    console.warn('[HandwritingService] Failed to load from localStorage:', e);
    return { pages: {}, stickyNotes: {}, pageTexts: {}, aspectRatios: {} };
  }
}

/** Save handwriting strokes, sticky notes and page text to localStorage cache */
export function saveHandwritingToLocal(
  bookHash: string,
  pages: Record<number, HandwritingStroke[]>,
  stickyNotes?: Record<number, HandwritingStickyNote[]>,
  pageTexts?: Record<number, string>,
  aspectRatios?: Record<number, number>,
): void {
  if (typeof window === 'undefined') return;
  try {
    const current = loadHandwritingFromLocal(bookHash);
    const data: HandwritingBookData = {
      version: 1,
      bookHash,
      pages,
      stickyNotes: stickyNotes || current.stickyNotes || {},
      pageTexts: pageTexts || current.pageTexts || {},
      aspectRatios: aspectRatios || current.aspectRatios || {},
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
      const pageIndex = note.page !== undefined ? note.page - 1 : 0;
      if (!note.note) continue;
      const parsed = JSON.parse(note.note);
      const strokes: HandwritingStroke[] = Array.isArray(parsed) ? parsed : parsed?.strokes || [];
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

  const snippets = strokes.map((s) => s.textAnchor?.textSnippet?.trim()).filter(Boolean);
  const snippetPreview = snippets.length > 0 ? `: "${snippets[0]!.slice(0, 80)}"` : '';

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
  const mergedStrokes: Record<number, HandwritingStroke[]> = {
    ...fromNotes,
    ...fromLocal.pages,
  };

  useHandwritingStore.getState().loadBookStrokes(bookHash, mergedStrokes);
  if (fromLocal.stickyNotes) {
    useHandwritingStore.getState().loadBookStickyNotes(bookHash, fromLocal.stickyNotes);
  }
}

/** Commit page sticky notes changes to local storage cache */
export function persistPageStickyNotes(
  bookHash: string,
  pageIndex: number,
  notes: HandwritingStickyNote[],
): void {
  const store = useHandwritingStore.getState();
  const allStrokes = store.bookStrokes[bookHash] || {};
  const allNotes = store.stickyNotes[bookHash] || {};
  const updatedNotes = {
    ...allNotes,
    [pageIndex]: notes,
  };
  saveHandwritingToLocal(bookHash, allStrokes, updatedNotes);
}

/** Delete all handwriting and sticky notes for a specific page across store, local storage, and booknotes */
export function deletePageHandwriting(bookHash: string, pageIndex: number, bookKey?: string): void {
  // 1. Update active store
  const store = useHandwritingStore.getState();
  const currentPages = { ...(store.bookStrokes[bookHash] || {}) };
  delete currentPages[pageIndex];

  const currentSticky = { ...(store.stickyNotes[bookHash] || {}) };
  delete currentSticky[pageIndex];

  useHandwritingStore.setState((state) => ({
    bookStrokes: {
      ...state.bookStrokes,
      [bookHash]: currentPages,
    },
    stickyNotes: {
      ...state.stickyNotes,
      [bookHash]: currentSticky,
    },
  }));

  // 2. Update localStorage cache
  if (typeof window !== 'undefined') {
    try {
      const current = loadHandwritingFromLocal(bookHash);
      delete current.pages[pageIndex];
      delete current.stickyNotes[pageIndex];
      if (current.pageTexts) delete current.pageTexts[pageIndex];
      if (current.aspectRatios) delete current.aspectRatios[pageIndex];

      if (
        Object.keys(current.pages).length === 0 &&
        Object.keys(current.stickyNotes).length === 0
      ) {
        localStorage.removeItem(getHandwritingStorageKey(bookHash));
      } else {
        saveHandwritingToLocal(
          bookHash,
          current.pages,
          current.stickyNotes,
          current.pageTexts,
          current.aspectRatios,
        );
      }
    } catch (e) {
      console.warn('[HandwritingService] Failed to delete page from localStorage:', e);
    }
  }

  // 3. Update bookDataStore booknotes
  const bookDataStore = useBookDataStore.getState();
  const keysToUpdate = new Set<string>();
  if (bookKey) keysToUpdate.add(bookKey);
  keysToUpdate.add(bookHash);
  keysToUpdate.add(`${bookHash}-0`);

  for (const k of keysToUpdate) {
    const config = bookDataStore.getConfig(k);
    if (config?.booknotes && config.booknotes.length > 0) {
      const now = Date.now();
      const updatedNotes = config.booknotes.map((note) =>
        (note.bookHash === bookHash || !note.bookHash) &&
        (note.id === `hw-${bookHash}-p${pageIndex + 1}` ||
          (note.type === 'handwriting' && note.page === pageIndex + 1))
          ? { ...note, deletedAt: now }
          : note,
      );
      bookDataStore.updateBooknotes(k, updatedNotes);
    }
  }

  // 4. Delete snapshot
  deleteHandwritingSnapshot(bookHash, pageIndex);
}

/** Commit page handwriting changes to both localStorage and booknotes */
export function persistPageHandwriting(
  bookKey: string,
  bookHash: string,
  pageIndex: number,
  strokes: HandwritingStroke[],
  cfi?: string,
  pageText?: string,
  aspectRatio?: number,
): void {
  // 1. Update store
  const store = useHandwritingStore.getState();
  const allBookPages = store.bookStrokes[bookHash] || {};
  const updatedPages = {
    ...allBookPages,
    [pageIndex]: strokes,
  };

  useHandwritingStore.setState((state) => ({
    bookStrokes: {
      ...state.bookStrokes,
      [bookHash]: updatedPages,
    },
  }));

  // 2. Save to local storage cache immediately with optional pageText and aspectRatio
  const current = loadHandwritingFromLocal(bookHash);
  const updatedLocalPages = {
    ...current.pages,
    ...updatedPages,
  };
  const updatedAspectRatios = { ...current.aspectRatios };
  if (strokes.length === 0) {
    delete updatedLocalPages[pageIndex];
    delete updatedAspectRatios[pageIndex];
  } else if (aspectRatio && aspectRatio > 0) {
    updatedAspectRatios[pageIndex] = aspectRatio;
  }
  const updatedPageTexts = { ...current.pageTexts };
  if (pageText && pageText.trim()) {
    updatedPageTexts[pageIndex] = pageText.trim();
  }
  saveHandwritingToLocal(
    bookHash,
    updatedLocalPages,
    undefined,
    updatedPageTexts,
    updatedAspectRatios,
  );

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

/**
 * Discover all bookHashes that contain handwriting data
 */
export function getAllHandwritingBookHashes(): string[] {
  const hashes = new Set<string>();

  // 1. From active handwriting store
  const storeStrokes = useHandwritingStore.getState().bookStrokes;
  for (const h of Object.keys(storeStrokes)) {
    if (Object.keys(storeStrokes[h] || {}).length > 0) hashes.add(h);
  }
  const storeNotes = useHandwritingStore.getState().stickyNotes;
  for (const h of Object.keys(storeNotes)) {
    if (Object.keys(storeNotes[h] || {}).length > 0) hashes.add(h);
  }

  // 2. From localStorage keys
  if (typeof window !== 'undefined') {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(LOCAL_STORAGE_PREFIX)) {
          hashes.add(key.slice(LOCAL_STORAGE_PREFIX.length));
        }
      }
    } catch {
      // ignore
    }
  }

  return Array.from(hashes);
}

/**
 * Get all note-containing pages with structured metadata for a specific book or all books
 */
export function getHandwritingPageSummaries(filterBookHash?: string): HandwritingPageSummary[] {
  const targetHashes = filterBookHash ? [filterBookHash] : getAllHandwritingBookHashes();
  const summaries: HandwritingPageSummary[] = [];
  const store = useHandwritingStore.getState();
  const bookDataStore = useBookDataStore.getState();

  for (const bookHash of targetHashes) {
    // Resolve book title
    const bookData =
      bookDataStore.getBookData(bookHash) || bookDataStore.getBookData(`${bookHash}-0`);
    const bookTitle = bookData?.book?.title || `Book (${bookHash.slice(0, 8)})`;

    // Merge strokes from store and localStorage
    const local = loadHandwritingFromLocal(bookHash);
    const storePages = store.bookStrokes[bookHash] || {};
    const mergedPages: Record<number, HandwritingStroke[]> = {
      ...local.pages,
      ...storePages,
    };

    // Merge sticky notes
    const storeSticky = store.stickyNotes[bookHash] || {};
    const mergedSticky: Record<number, HandwritingStickyNote[]> = {
      ...local.stickyNotes,
      ...storeSticky,
    };

    const allPageIndexes = new Set<number>([
      ...Object.keys(mergedPages).map(Number),
      ...Object.keys(mergedSticky).map(Number),
    ]);

    for (const pageIndex of allPageIndexes) {
      const strokes = mergedPages[pageIndex] || [];
      const stickyNotes = mergedSticky[pageIndex] || [];

      if (strokes.length === 0 && stickyNotes.length === 0) continue;

      const toolsUsed = Array.from(new Set(strokes.map((s) => s.tool)));
      const colorsUsed = Array.from(new Set(strokes.map((s) => s.color)));

      const textSnippets: string[] = [];
      for (const s of strokes) {
        if (s.textAnchor?.textSnippet?.trim()) {
          textSnippets.push(s.textAnchor.textSnippet.trim());
        }
      }
      for (const n of stickyNotes) {
        if (n.content?.trim()) textSnippets.push(n.content.trim());
        if (n.selectedText?.trim()) textSnippets.push(n.selectedText.trim());
      }

      const allCreated = [
        ...strokes.map((s) => s.createdAt),
        ...stickyNotes.map((n) => n.createdAt),
      ].filter((t) => typeof t === 'number' && t > 0);

      const allUpdated = [
        ...strokes.map((s) => s.updatedAt),
        ...stickyNotes.map((n) => n.updatedAt),
      ].filter((t) => typeof t === 'number' && t > 0);

      const createdAt = allCreated.length > 0 ? Math.min(...allCreated) : Date.now();
      const updatedAt = allUpdated.length > 0 ? Math.max(...allUpdated) : createdAt;

      const effectiveCfi =
        strokes.find((s) => s.cfi)?.cfi || strokes.find((s) => s.textAnchor?.cfi)?.textAnchor?.cfi;

      const pageText = local.pageTexts?.[pageIndex] || '';
      const aspectRatio = local.aspectRatios?.[pageIndex];

      summaries.push({
        id: `${bookHash}_${pageIndex}`,
        bookHash,
        bookTitle,
        pageIndex,
        pageNumber: pageIndex + 1,
        cfi: effectiveCfi,
        strokes,
        stickyNotes,
        strokeCount: strokes.length,
        stickyNoteCount: stickyNotes.length,
        toolsUsed,
        colorsUsed,
        textSnippets,
        pageText,
        aspectRatio,
        createdAt,
        updatedAt,
      });
    }
  }

  return summaries;
}

/**
 * Filter and sort handwriting pages according to options
 */
export function queryHandwritingPages(
  options: HandwritingQueryOptions = {},
): HandwritingPageSummary[] {
  let list = getHandwritingPageSummaries(options.bookHash);

  // 1. Content Filter
  if (options.filterKind === 'strokes') {
    list = list.filter((p) => p.strokeCount > 0);
  } else if (options.filterKind === 'stickynotes') {
    list = list.filter((p) => p.stickyNoteCount > 0);
  } else if (options.filterKind === 'anchors') {
    list = list.filter((p) => p.textSnippets.length > 0);
  }

  // 2. Tool Filter
  if (options.tool && options.tool !== 'all') {
    const selectedTool = options.tool;
    list = list.filter((p) => p.toolsUsed.includes(selectedTool));
  }

  // 3. Color Filter
  if (options.color) {
    list = list.filter((p) => p.colorsUsed.includes(options.color!));
  }

  // 4. Date Range Filter
  if (options.dateRange && options.dateRange !== 'all') {
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const threshold =
      options.dateRange === 'today'
        ? now - oneDay
        : options.dateRange === 'week'
          ? now - 7 * oneDay
          : now - 30 * oneDay;
    list = list.filter((p) => p.updatedAt >= threshold);
  }

  // 5. Search Query Filter
  if (options.searchQuery && options.searchQuery.trim().length > 0) {
    const q = options.searchQuery.trim().toLowerCase();
    list = list.filter((p) => {
      if (p.bookTitle.toLowerCase().includes(q)) return true;
      if (String(p.pageNumber) === q) return true;
      return p.textSnippets.some((snippet) => snippet.toLowerCase().includes(q));
    });
  }

  // 6. Sorting
  const sortOrder = options.sortOrder || 'updated-desc';
  list.sort((a, b) => {
    switch (sortOrder) {
      case 'updated-desc':
        return b.updatedAt - a.updatedAt;
      case 'updated-asc':
        return a.updatedAt - b.updatedAt;
      case 'created-desc':
        return b.createdAt - a.createdAt;
      case 'page-asc':
        return a.bookHash === b.bookHash
          ? a.pageIndex - b.pageIndex
          : a.bookTitle.localeCompare(b.bookTitle);
      case 'page-desc':
        return a.bookHash === b.bookHash
          ? b.pageIndex - a.pageIndex
          : b.bookTitle.localeCompare(a.bookTitle);
      case 'strokes-desc':
        return b.strokeCount - a.strokeCount;
      default:
        return b.updatedAt - a.updatedAt;
    }
  });

  return list;
}
