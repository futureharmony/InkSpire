import { beforeEach, describe, expect, test } from 'vitest';
import { useHandwritingStore } from '@/store/handwritingStore';
import { HandwritingStroke } from '@/types/handwriting';

describe('Handwriting Store', () => {
  const sampleStroke: HandwritingStroke = {
    id: 's-1',
    tool: 'pen',
    color: '#3b82f6',
    width: 4,
    opacity: 1,
    pageIndex: 0,
    createdAt: 1000,
    updatedAt: 1000,
    points: [{ x: 0.1, y: 0.1 }],
  };

  beforeEach(() => {
    useHandwritingStore.setState({
      activeBookKey: null,
      currentTool: 'pen',
      currentShape: 'line',
      currentColor: '#2563eb',
      currentWidth: 3,
      currentOpacity: 1.0,
      eraserType: 'stroke',
      eraserRadius: 16,
      stylusOnly: true,
      currentPageIndex: 0,
      bookStrokes: {},
      undoStacks: {},
      redoStacks: {},
    });
  });

  test('toggles active book key', () => {
    const store = useHandwritingStore.getState();
    expect(store.activeBookKey).toBeNull();

    store.toggleHandwriting('book-1');
    expect(useHandwritingStore.getState().activeBookKey).toBe('book-1');

    store.toggleHandwriting('book-1');
    expect(useHandwritingStore.getState().activeBookKey).toBeNull();

    store.toggleHandwriting('book-1', true);
    expect(useHandwritingStore.getState().activeBookKey).toBe('book-1');
  });

  test('switches tools and sets appropriate opacity', () => {
    const store = useHandwritingStore.getState();

    store.setTool('pencil');
    expect(useHandwritingStore.getState().currentTool).toBe('pencil');
    expect(useHandwritingStore.getState().currentOpacity).toBe(1.0);

    store.setTool('highlighter');
    expect(useHandwritingStore.getState().currentTool).toBe('highlighter');
    expect(useHandwritingStore.getState().currentOpacity).toBe(0.35);

    store.setShape('rectangle');
    expect(useHandwritingStore.getState().currentTool).toBe('shape');
    expect(useHandwritingStore.getState().currentShape).toBe('rectangle');
  });

  test('adds strokes and manages undo / redo stack', () => {
    const store = useHandwritingStore.getState();
    const bookHash = 'hash-1';
    const pageIndex = 0;

    expect(store.canUndo(bookHash, pageIndex)).toBe(false);
    expect(store.canRedo(bookHash, pageIndex)).toBe(false);

    // Add first stroke
    store.addStroke(bookHash, pageIndex, sampleStroke);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(1);
    expect(useHandwritingStore.getState().canUndo(bookHash, pageIndex)).toBe(true);
    expect(useHandwritingStore.getState().canRedo(bookHash, pageIndex)).toBe(false);

    // Add second stroke
    const stroke2: HandwritingStroke = { ...sampleStroke, id: 's-2' };
    store.addStroke(bookHash, pageIndex, stroke2);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(2);

    // Undo second stroke
    store.undo(bookHash, pageIndex);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(1);
    expect(useHandwritingStore.getState().canRedo(bookHash, pageIndex)).toBe(true);

    // Redo second stroke
    store.redo(bookHash, pageIndex);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(2);
    expect(useHandwritingStore.getState().canRedo(bookHash, pageIndex)).toBe(false);

    // Remove a stroke
    store.removeStroke(bookHash, pageIndex, 's-1');
    const remaining = useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex);
    expect(remaining.length).toBe(1);
    expect(remaining[0]?.id).toBe('s-2');

    // Clear page
    store.clearPage(bookHash, pageIndex);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(0);

    // Undo clear
    store.undo(bookHash, pageIndex);
    expect(useHandwritingStore.getState().getPageStrokes(bookHash, pageIndex).length).toBe(1);
  });

  test('toggles stylus-only palm rejection', () => {
    const store = useHandwritingStore.getState();
    expect(store.stylusOnly).toBe(true);

    store.setStylusOnly(false);
    expect(useHandwritingStore.getState().stylusOnly).toBe(false);

    store.setStylusOnly(true);
    expect(useHandwritingStore.getState().stylusOnly).toBe(true);
  });
});
