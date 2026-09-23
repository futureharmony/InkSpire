import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HandwritingToggler } from '@/app/reader/components/handwriting/HandwritingToggler';
import { HandwritingToolbar } from '@/app/reader/components/handwriting/HandwritingToolbar';
import { HandwritingLayer } from '@/app/reader/components/handwriting/HandwritingLayer';
import { useHandwritingStore } from '@/store/handwritingStore';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => opts[key] ?? '') : s,
}));

vi.mock('@/hooks/useResponsiveSize', () => ({
  useResponsiveSize: (s: number) => s,
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ isDarkMode: false }),
}));

vi.mock('@/store/bookDataStore', () => {
  const mockState = {
    getBookData: () => ({
      book: { title: 'Test Book' },
    }),
    getConfig: () => ({
      booknotes: [],
    }),
    updateBooknotes: vi.fn(),
  };
  const hook = (fn?: (state: unknown) => unknown) => (fn ? fn(mockState) : mockState);
  hook.getState = () => mockState;
  return { useBookDataStore: hook };
});

vi.mock('@/store/readerStore', () => ({
  useReaderStore: (fn?: (state: unknown) => unknown) => {
    const mockState = {
      getView: () => ({
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    };
    return fn ? fn(mockState) : mockState;
  },
}));

describe('Handwriting UI Components', () => {
  const bookKey = 'book123-key';

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

  afterEach(() => {
    cleanup();
  });

  describe('HandwritingToggler', () => {
    it('renders toggler button and toggles store activeBookKey on click', () => {
      const { getByRole } = render(<HandwritingToggler bookKey={bookKey} />);
      const btn = getByRole('button');

      expect(useHandwritingStore.getState().activeBookKey).toBeNull();

      fireEvent.click(btn);
      expect(useHandwritingStore.getState().activeBookKey).toBe(bookKey);

      fireEvent.click(btn);
      expect(useHandwritingStore.getState().activeBookKey).toBeNull();
    });
  });

  describe('HandwritingToolbar', () => {
    it('renders toolbar when active and allows tool switching', () => {
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);

      const { getByTitle, container } = render(
        <HandwritingToolbar
          bookKey={bookKey}
          containerWidth={800}
          containerHeight={1200}
          contentInsets={{ top: 60, right: 0, bottom: 40, left: 0 }}
        />,
      );

      // Verify pointer events and z-index on toolbar root
      const toolbarRoot = container.firstChild as HTMLElement;
      expect(toolbarRoot.className).toContain('pointer-events-auto');
      expect(toolbarRoot.className).toContain('z-50');
      expect(toolbarRoot.style.top).toBe('68px');

      // Switch to pencil
      const pencilBtn = getByTitle('Pencil (Textured & Light)');
      fireEvent.click(pencilBtn);
      expect(useHandwritingStore.getState().currentTool).toBe('pencil');

      // Switch to highlighter
      const highlighterBtn = getByTitle('Highlighter (Multiply Blend)');
      fireEvent.click(highlighterBtn);
      expect(useHandwritingStore.getState().currentTool).toBe('highlighter');
      expect(useHandwritingStore.getState().currentOpacity).toBe(0.35);

      // Switch to eraser
      const eraserBtn = getByTitle('Stroke Eraser');
      fireEvent.click(eraserBtn);
      expect(useHandwritingStore.getState().currentTool).toBe('eraser');

      // Toggle palm rejection / stylus only
      const palmBtn = getByTitle('Stylus Only Mode (Touch gestures paginate)');
      fireEvent.click(palmBtn);
      expect(useHandwritingStore.getState().stylusOnly).toBe(false);

      // Close toolbar
      const closeBtn = getByTitle('Close Handwriting Toolbar');
      fireEvent.click(closeBtn);
      expect(useHandwritingStore.getState().activeBookKey).toBeNull();
    });
  });

  describe('HandwritingLayer', () => {
    it('renders SVG overlay and canvas container with z-20', () => {
      const { container } = render(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      const layerRoot = container.firstChild as HTMLElement;
      expect(layerRoot.className).toContain('z-20');
      expect(container.querySelector('svg')).toBeDefined();
      expect(container.querySelector('canvas')).toBeDefined();
    });

    it('renders strokes when added to store', () => {
      const bookHash = bookKey.split('-')[0]!;
      useHandwritingStore.getState().addStroke(bookHash, 0, {
        id: 'stroke-1',
        tool: 'pen',
        color: '#ff0000',
        width: 4,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
      });

      const { container } = render(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      const path = container.querySelector('svg path');
      expect(path).toBeDefined();
      expect(path?.getAttribute('stroke')).toBe('#ff0000');
    });
  });
});
