import { create } from 'zustand';
import {
  HandwritingEraserType,
  HandwritingShapeType,
  HandwritingStroke,
  HandwritingTool,
} from '@/types/handwriting';

const MAX_HISTORY = 30;

interface HandwritingState {
  activeBookKey: string | null;
  currentTool: HandwritingTool;
  currentShape: HandwritingShapeType;
  currentColor: string;
  currentWidth: number;
  currentOpacity: number;
  eraserType: HandwritingEraserType;
  eraserRadius: number;
  stylusOnly: boolean;
  currentPageIndex: number;

  /** Map of bookHash -> pageIndex -> strokes */
  bookStrokes: Record<string, Record<number, HandwritingStroke[]>>;

  /** Undo history: key = `${bookHash}_${pageIndex}` */
  undoStacks: Record<string, HandwritingStroke[][]>;
  /** Redo history: key = `${bookHash}_${pageIndex}` */
  redoStacks: Record<string, HandwritingStroke[][]>;

  // Actions
  toggleHandwriting: (bookKey: string, force?: boolean) => void;
  setTool: (tool: HandwritingTool) => void;
  setShape: (shape: HandwritingShapeType) => void;
  setColor: (color: string) => void;
  setWidth: (width: number) => void;
  setEraserType: (type: HandwritingEraserType) => void;
  setEraserRadius: (radius: number) => void;
  setStylusOnly: (enabled: boolean) => void;
  setCurrentPageIndex: (pageIndex: number) => void;

  addStroke: (bookHash: string, pageIndex: number, stroke: HandwritingStroke) => void;
  removeStroke: (bookHash: string, pageIndex: number, strokeId: string) => void;
  clearPage: (bookHash: string, pageIndex: number) => void;

  undo: (bookHash: string, pageIndex: number) => void;
  redo: (bookHash: string, pageIndex: number) => void;
  canUndo: (bookHash: string, pageIndex: number) => boolean;
  canRedo: (bookHash: string, pageIndex: number) => boolean;

  getPageStrokes: (bookHash: string, pageIndex: number) => HandwritingStroke[];
  loadBookStrokes: (bookHash: string, pages: Record<number, HandwritingStroke[]>) => void;
}

const getStackKey = (bookHash: string, pageIndex: number) => `${bookHash}_${pageIndex}`;

export const useHandwritingStore = create<HandwritingState>((set, get) => ({
  activeBookKey: null,
  currentTool: 'pen',
  currentShape: 'line',
  currentColor: '#2563eb', // Modern blue default
  currentWidth: 3,
  currentOpacity: 1.0,
  eraserType: 'stroke',
  eraserRadius: 16,
  stylusOnly: true, // Palm rejection enabled by default
  currentPageIndex: 0,

  bookStrokes: {},
  undoStacks: {},
  redoStacks: {},

  toggleHandwriting: (bookKey: string, force?: boolean) => {
    set((state) => {
      const willBeActive = force !== undefined ? force : state.activeBookKey !== bookKey;
      return {
        activeBookKey: willBeActive ? bookKey : null,
      };
    });
  },

  setTool: (tool: HandwritingTool) => {
    set({
      currentTool: tool,
      currentOpacity: tool === 'highlighter' ? 0.35 : 1.0,
    });
  },

  setShape: (shape: HandwritingShapeType) => {
    set({ currentShape: shape, currentTool: 'shape' });
  },

  setColor: (color: string) => {
    set({ currentColor: color });
  },

  setWidth: (width: number) => {
    set({ currentWidth: width });
  },

  setEraserType: (type: HandwritingEraserType) => {
    set({ eraserType: type });
  },

  setEraserRadius: (radius: number) => {
    set({ eraserRadius: radius });
  },

  setStylusOnly: (enabled: boolean) => {
    set({ stylusOnly: enabled });
  },

  setCurrentPageIndex: (pageIndex: number) => {
    set({ currentPageIndex: pageIndex });
  },

  addStroke: (bookHash: string, pageIndex: number, stroke: HandwritingStroke) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const currentPages = get().bookStrokes[bookHash] || {};
    const currentStrokes = currentPages[pageIndex] || [];

    // Push to undo stack
    const undoList = get().undoStacks[stackKey] || [];
    const newUndoList = [...undoList, currentStrokes].slice(-MAX_HISTORY);

    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...currentPages,
          [pageIndex]: [...currentStrokes, stroke],
        },
      },
      undoStacks: {
        ...state.undoStacks,
        [stackKey]: newUndoList,
      },
      redoStacks: {
        ...state.redoStacks,
        [stackKey]: [], // Clear redo on new action
      },
    }));
  },

  removeStroke: (bookHash: string, pageIndex: number, strokeId: string) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const currentPages = get().bookStrokes[bookHash] || {};
    const currentStrokes = currentPages[pageIndex] || [];
    const filtered = currentStrokes.filter((s) => s.id !== strokeId);
    if (filtered.length === currentStrokes.length) return;

    const undoList = get().undoStacks[stackKey] || [];
    const newUndoList = [...undoList, currentStrokes].slice(-MAX_HISTORY);

    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...currentPages,
          [pageIndex]: filtered,
        },
      },
      undoStacks: {
        ...state.undoStacks,
        [stackKey]: newUndoList,
      },
      redoStacks: {
        ...state.redoStacks,
        [stackKey]: [],
      },
    }));
  },

  clearPage: (bookHash: string, pageIndex: number) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const currentPages = get().bookStrokes[bookHash] || {};
    const currentStrokes = currentPages[pageIndex] || [];
    if (currentStrokes.length === 0) return;

    const undoList = get().undoStacks[stackKey] || [];
    const newUndoList = [...undoList, currentStrokes].slice(-MAX_HISTORY);

    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...currentPages,
          [pageIndex]: [],
        },
      },
      undoStacks: {
        ...state.undoStacks,
        [stackKey]: newUndoList,
      },
      redoStacks: {
        ...state.redoStacks,
        [stackKey]: [],
      },
    }));
  },

  undo: (bookHash: string, pageIndex: number) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const undoList = get().undoStacks[stackKey] || [];
    if (undoList.length === 0) return;

    const previousState = undoList[undoList.length - 1]!;
    const remainingUndo = undoList.slice(0, -1);

    const currentPages = get().bookStrokes[bookHash] || {};
    const currentStrokes = currentPages[pageIndex] || [];

    const redoList = get().redoStacks[stackKey] || [];
    const newRedoList = [...redoList, currentStrokes].slice(-MAX_HISTORY);

    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...currentPages,
          [pageIndex]: previousState,
        },
      },
      undoStacks: {
        ...state.undoStacks,
        [stackKey]: remainingUndo,
      },
      redoStacks: {
        ...state.redoStacks,
        [stackKey]: newRedoList,
      },
    }));
  },

  redo: (bookHash: string, pageIndex: number) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const redoList = get().redoStacks[stackKey] || [];
    if (redoList.length === 0) return;

    const nextState = redoList[redoList.length - 1]!;
    const remainingRedo = redoList.slice(0, -1);

    const currentPages = get().bookStrokes[bookHash] || {};
    const currentStrokes = currentPages[pageIndex] || [];

    const undoList = get().undoStacks[stackKey] || [];
    const newUndoList = [...undoList, currentStrokes].slice(-MAX_HISTORY);

    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...currentPages,
          [pageIndex]: nextState,
        },
      },
      undoStacks: {
        ...state.undoStacks,
        [stackKey]: newUndoList,
      },
      redoStacks: {
        ...state.redoStacks,
        [stackKey]: remainingRedo,
      },
    }));
  },

  canUndo: (bookHash: string, pageIndex: number) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const list = get().undoStacks[stackKey];
    return !!(list && list.length > 0);
  },

  canRedo: (bookHash: string, pageIndex: number) => {
    const stackKey = getStackKey(bookHash, pageIndex);
    const list = get().redoStacks[stackKey];
    return !!(list && list.length > 0);
  },

  getPageStrokes: (bookHash: string, pageIndex: number) => {
    const pages = get().bookStrokes[bookHash];
    return (pages && pages[pageIndex]) || [];
  },

  loadBookStrokes: (bookHash: string, pages: Record<number, HandwritingStroke[]>) => {
    set((state) => ({
      bookStrokes: {
        ...state.bookStrokes,
        [bookHash]: {
          ...(state.bookStrokes[bookHash] || {}),
          ...pages,
        },
      },
    }));
  },
}));
