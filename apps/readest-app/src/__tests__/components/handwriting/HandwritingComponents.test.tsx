import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { HandwritingToggler } from '@/app/reader/components/handwriting/HandwritingToggler';
import { HandwritingToolbar } from '@/app/reader/components/handwriting/HandwritingToolbar';
import { HandwritingLayer } from '@/app/reader/components/handwriting/HandwritingLayer';
import { HandwritingOverviewDialog } from '@/app/reader/components/handwriting/HandwritingOverviewDialog';
import { queryHandwritingPages } from '@/services/handwritingService';
import { useHandwritingStore } from '@/store/handwritingStore';
import { HandwritingStroke } from '@/types/handwriting';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, opts?: Record<string, string>) =>
    opts ? s.replace(/\{\{(\w+)\}\}/g, (_m, key) => opts[key] ?? '') : s,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService: { isMobile: false } }),
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

const mockView = {
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  next: vi.fn(),
  prev: vi.fn(),
  goTo: vi.fn(),
};

vi.mock('@/store/readerStore', () => {
  const mockState = {
    getView: () => mockView,
    hoveredBookKey: null,
    setHoveredBookKey: vi.fn(),
  };
  const hook = (fn?: (state: unknown) => unknown) => (fn ? fn(mockState) : mockState);
  hook.getState = () => mockState;
  return { useReaderStore: hook };
});

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

      // Verify pointer events and class on toolbar root
      const toolbarRoot = container.firstChild as HTMLElement;
      expect(toolbarRoot.className).toContain('header-handwriting-toolbar');
      expect(toolbarRoot.className).toContain('pointer-events-auto');

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

    it('isolates strokes across pages: page 5 strokes do not show on page 6 and return on page 5', () => {
      const bookHash = bookKey.split('-')[0]!;

      // Add stroke to page 5 (0-indexed pageIndex = 4)
      useHandwritingStore.getState().addStroke(bookHash, 4, {
        id: 'stroke-page-5',
        tool: 'pen',
        color: '#2563eb',
        width: 3,
        opacity: 1,
        pageIndex: 4,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.3 },
        ],
      });

      // Add stroke to page 6 (0-indexed pageIndex = 5)
      useHandwritingStore.getState().addStroke(bookHash, 5, {
        id: 'stroke-page-6',
        tool: 'pen',
        color: '#dc2626',
        width: 3,
        opacity: 1,
        pageIndex: 5,
        createdAt: 2000,
        updatedAt: 2000,
        points: [
          { x: 0.5, y: 0.5 },
          { x: 0.6, y: 0.6 },
        ],
      });

      // 1. Start at Page 5 (pageIndex = 4)
      useHandwritingStore.getState().setCurrentPageIndex(4);
      const { container, rerender } = render(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      // Verify page 5 stroke is visible and page 6 stroke is NOT visible
      let paths = container.querySelectorAll('svg path');
      expect(paths.length).toBe(1);
      expect(paths[0]?.getAttribute('stroke')).toBe('#2563eb');

      // 2. Turn to Page 6 (pageIndex = 5)
      useHandwritingStore.getState().setCurrentPageIndex(5);
      rerender(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      // Verify page 6 stroke is visible, page 5 stroke has disappeared
      paths = container.querySelectorAll('svg path');
      expect(paths.length).toBe(1);
      expect(paths[0]?.getAttribute('stroke')).toBe('#dc2626');

      // 3. Turn back to Page 5 (pageIndex = 4)
      useHandwritingStore.getState().setCurrentPageIndex(4);
      rerender(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      // Verify page 5 stroke returns intact
      paths = container.querySelectorAll('svg path');
      expect(paths.length).toBe(1);
      expect(paths[0]?.getAttribute('stroke')).toBe('#2563eb');
    });

    it('renders pencil strokes with finer width, 0.78 opacity, and inkspire-pencil-grain filter', () => {
      const bookHash = bookKey.split('-')[0]!;
      useHandwritingStore.getState().addStroke(bookHash, 0, {
        id: 'stroke-pencil-1',
        tool: 'pencil',
        color: '#4b5563',
        width: 3,
        opacity: 0.78,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.4, y: 0.4 },
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
      expect(path?.getAttribute('stroke')).toBe('#4b5563');
      expect(path?.getAttribute('opacity')).toBe('0.78');
      expect(path?.getAttribute('filter')).toBe('url(#inkspire-pencil-grain)');
      // Pencil width is finer than base (width 3 * 0.5 = 1.5 at standard width)
      expect(Number(path?.getAttribute('stroke-width'))).toBeLessThan(3);
    });

    it('blocks margin tap page-turn while allowing horizontal swipe page-turn in handwriting mode', () => {
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      useHandwritingStore.getState().setStylusOnly(true);

      mockView.next.mockClear();
      mockView.prev.mockClear();

      const { container } = render(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      const canvas = container.querySelector('canvas')!;
      expect(canvas).toBeDefined();

      // 1. Touch tap on right margin (clientX = 780 of 800 width, relX > 0.75)
      fireEvent.pointerDown(canvas, {
        clientX: 780,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });
      fireEvent.pointerUp(canvas, {
        clientX: 780,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });

      // Assert next() is NOT called (margin tap is blocked!)
      expect(mockView.next).not.toHaveBeenCalled();

      // 2. Touch tap on left margin (clientX = 50 of 800 width, relX < 0.25)
      fireEvent.pointerDown(canvas, {
        clientX: 50,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });
      fireEvent.pointerUp(canvas, {
        clientX: 50,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });

      // Assert prev() is NOT called (margin tap is blocked!)
      expect(mockView.prev).not.toHaveBeenCalled();

      // 3. Horizontal swipe left (deltaX = -80 < -50)
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });
      fireEvent.pointerUp(canvas, {
        clientX: 320,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });

      // Swipe left DOES call next()
      expect(mockView.next).toHaveBeenCalledTimes(1);

      // 4. Horizontal swipe right (deltaX = +80 > 50)
      fireEvent.pointerDown(canvas, {
        clientX: 400,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });
      fireEvent.pointerUp(canvas, {
        clientX: 480,
        clientY: 300,
        pointerType: 'touch',
        pressure: 0,
      });

      // Swipe right DOES call prev()
      expect(mockView.prev).toHaveBeenCalledTimes(1);
    });

    it('opens floating sub-toolbar on second click with continuous width slider and dual eraser modes', () => {
      const bookKey = 'subtool-test-1';
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      useHandwritingStore.getState().setTool('pen');

      const { getByTitle, getByText, container } = render(
        <HandwritingToolbar bookKey={bookKey} containerWidth={1000} containerHeight={1000} />,
      );

      // First click on active pen -> toggles sub-toolbar
      const penBtn = getByTitle('Fountain Pen (Smooth & Pressure)');
      fireEvent.click(penBtn);

      // Sub-toolbar appears with continuous width slider
      const slider = container.querySelector('input[type="range"]') as HTMLInputElement;
      expect(slider).not.toBeNull();
      fireEvent.change(slider, { target: { value: '5.5' } });
      expect(useHandwritingStore.getState().currentWidth).toBe(5.5);

      // Switch to eraser and double click it
      const eraserBtn = getByTitle('Stroke Eraser');
      fireEvent.click(eraserBtn); // activates eraser
      fireEvent.click(eraserBtn); // opens eraser sub-toolbar

      // Sub-toolbar provides dual modes: Full Stroke vs Partial Area
      expect(getByText('Eraser Mode')).toBeDefined();
      const partialModeBtn = getByText('Partial (Area)');
      fireEvent.click(partialModeBtn);
      expect(useHandwritingStore.getState().eraserType).toBe('partial');

      const strokeModeBtn = getByText('Stroke (Full)');
      fireEvent.click(strokeModeBtn);
      expect(useHandwritingStore.getState().eraserType).toBe('stroke');
    });

    it('collapses color choices into single button and opens color sub-toolbar', () => {
      const bookKey = 'color-test';
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      useHandwritingStore.getState().setTool('pen');
      useHandwritingStore.getState().setColor('#000000');

      const { getByTitle, getByText, container } = render(
        <HandwritingToolbar bookKey={bookKey} containerWidth={1000} containerHeight={1000} />,
      );

      // Main toolbar has single color button
      const colorBtn = getByTitle('Color');
      expect(colorBtn).toBeDefined();

      // Click color button to open sub-toolbar
      fireEvent.click(colorBtn);
      expect(getByText('Stroke Color')).toBeDefined();
      expect(getByText('Custom Color')).toBeDefined();

      // Select preset color from sub-toolbar
      const redPreset = getByTitle('#ef4444');
      fireEvent.click(redPreset);
      expect(useHandwritingStore.getState().currentColor).toBe('#ef4444');

      // Change custom color
      const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
      expect(colorInput).not.toBeNull();
      fireEvent.change(colorInput, { target: { value: '#123456' } });
      expect(useHandwritingStore.getState().currentColor).toBe('#123456');

      // Toggle color button again closes sub-toolbar
      fireEvent.click(colorBtn);
      expect(container.querySelector('input[type="color"]')).toBeNull();
    });

    it('adapts layout responsively for wide/landscape and compact/portrait screens', () => {
      const bookKey = 'responsive-test';
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      useHandwritingStore.getState().setTool('pen');
      useHandwritingStore.getState().setStylusOnly(true);

      // 1. Wide / Landscape (e.g. 900px): Shows direct Clear & Export buttons, and text on stylus button
      const wideRender = render(<HandwritingToolbar bookKey={bookKey} headerWidth={900} />);
      expect(wideRender.getByText('Stylus Only')).toBeDefined();
      expect(wideRender.getByTitle('Clear Current Page')).toBeDefined();
      expect(wideRender.getByTitle('Export / Import Handwriting')).toBeDefined();
      expect(wideRender.queryByTitle('More Options')).toBeNull();
      wideRender.unmount();

      // 2. Compact / Portrait (e.g. 400px): Stylus button hides text, secondary tools tuck into More menu
      const compactRender = render(<HandwritingToolbar bookKey={bookKey} headerWidth={400} />);
      expect(compactRender.queryByText('Stylus Only')).toBeNull();
      // More options button exists
      const moreBtn = compactRender.getByTitle('More Options');
      expect(moreBtn).toBeDefined();

      // Click more button to open compact dropdown
      fireEvent.click(moreBtn);
      expect(compactRender.getByText('Clear Current Page')).toBeDefined();
      expect(compactRender.getByText('Shapes Tool (Line, Rectangle, Circle, Arrow)')).toBeDefined();
      expect(compactRender.getByText('Lasso Text Selection & Sticky Notes')).toBeDefined();
      compactRender.unmount();
    });

    it('partial eraser splits stroke into segments in HandwritingLayer', () => {
      const bookKey = 'partial-layer-test';
      const bookHash = 'partial';
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      useHandwritingStore.getState().setTool('eraser');
      useHandwritingStore.getState().setEraserType('partial');
      useHandwritingStore.getState().setEraserRadius(40);
      useHandwritingStore.getState().setCurrentPageIndex(0);

      // Setup a long stroke across x=100..900, y=500
      const stroke: HandwritingStroke = {
        id: 'stroke-to-split',
        tool: 'pen',
        color: '#000000',
        width: 4,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.5 },
          { x: 0.3, y: 0.5 },
          { x: 0.5, y: 0.5 },
          { x: 0.7, y: 0.5 },
          { x: 0.9, y: 0.5 },
        ],
      };
      useHandwritingStore.getState().addStroke(bookHash, 0, stroke);

      const { container } = render(
        <HandwritingLayer
          bookKey={bookKey}
          contentInsets={{ top: 0, right: 0, bottom: 0, left: 0 }}
        />,
      );

      const canvas = container.querySelector('canvas')!;
      canvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 1000,
        height: 1000,
        right: 1000,
        bottom: 1000,
        x: 0,
        y: 0,
        toJSON: () => {},
      });

      // Erase at center (500, 500)
      fireEvent.pointerDown(canvas, {
        clientX: 500,
        clientY: 500,
        pointerType: 'pen',
        pressure: 0.5,
      });

      // Partial eraser should split the stroke into 2 segments instead of dropping it
      const strokesAfter = useHandwritingStore.getState().getPageStrokes(bookHash, 0);
      expect(strokesAfter.length).toBe(2);
    });
  });

  describe('HandwritingOverviewDialog & Query Engine', () => {
    const bookHash = 'book123';

    beforeEach(() => {
      if (typeof localStorage !== 'undefined') {
        localStorage.clear();
      }
      useHandwritingStore.setState({
        bookStrokes: {},
        stickyNotes: {},
        activeBookKey: null,
      });
      const strokeP0: HandwritingStroke = {
        id: 's0',
        tool: 'pen',
        color: '#000000',
        width: 3,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [{ x: 0.1, y: 0.1 }],
      };
      const strokeP1_1: HandwritingStroke = {
        id: 's1-1',
        tool: 'highlighter',
        color: '#eab308',
        width: 12,
        opacity: 0.35,
        pageIndex: 1,
        createdAt: 2000,
        updatedAt: 3000,
        points: [
          { x: 0.2, y: 0.2 },
          { x: 0.8, y: 0.2 },
        ],
        textAnchor: { cfi: 'epubcfi(/6/4[chap1]!/4/2/1:0)', textSnippet: 'Chapter 1 Title' },
      };
      const strokeP1_2: HandwritingStroke = {
        id: 's1-2',
        tool: 'pencil',
        color: '#64748b',
        width: 2,
        opacity: 0.78,
        pageIndex: 1,
        createdAt: 2500,
        updatedAt: 3500,
        points: [{ x: 0.3, y: 0.3 }],
      };

      useHandwritingStore.getState().addStroke(bookHash, 0, strokeP0);
      useHandwritingStore.getState().addStroke(bookHash, 1, strokeP1_1);
      useHandwritingStore.getState().addStroke(bookHash, 1, strokeP1_2);
    });

    it('queries handwriting pages and supports filtering by tool and content', () => {
      // All pages for this book
      const all = queryHandwritingPages({ bookHash });
      expect(all.length).toBe(2);

      // Filter by tool: highlighter
      const highlighterOnly = queryHandwritingPages({ bookHash, tool: 'highlighter' });
      expect(highlighterOnly.length).toBe(1);
      expect(highlighterOnly[0]?.pageIndex).toBe(1);

      // Filter by text anchor content
      const anchorsOnly = queryHandwritingPages({ bookHash, filterKind: 'anchors' });
      expect(anchorsOnly.length).toBe(1);
      expect(anchorsOnly[0]?.textSnippets).toContain('Chapter 1 Title');

      // Sort by strokes-desc
      const sortedByStrokes = queryHandwritingPages({ bookHash, sortOrder: 'strokes-desc' });
      expect(sortedByStrokes[0]?.pageIndex).toBe(1); // Page 1 has 2 strokes
      expect(sortedByStrokes[1]?.pageIndex).toBe(0); // Page 0 has 1 stroke
    });

    it('renders HandwritingOverviewDialog and allows jumping to page', () => {
      const handleClose = vi.fn();
      const { getByText, getAllByTitle, getAllByText } = render(
        <HandwritingOverviewDialog
          bookKey={`${bookHash}-key`}
          isOpen={true}
          onClose={handleClose}
        />,
      );

      // Title & page count badge
      expect(getByText('Handwriting Notes')).toBeTruthy();
      expect(getAllByText('2 pages').length).toBeGreaterThanOrEqual(1);

      // Page indicators
      expect(getByText('Page 1')).toBeTruthy();
      expect(getByText('Page 2')).toBeTruthy();

      // Click "Go to Page" on page 2 (pageIndex: 1)
      const jumpButtons = getAllByTitle('Go to Page');
      expect(jumpButtons.length).toBe(2);
      fireEvent.click(jumpButtons[0]!); // Go to page

      // Foliate view goTo called and dialog closed
      expect(mockView.goTo).toHaveBeenCalled();
      expect(handleClose).toHaveBeenCalled();
    });

    it('displays book page content behind strokes and renders snapshot image when available', async () => {
      const { saveHandwritingSnapshot } = await import('@/services/handwritingSnapshotService');

      // Save a simulated page snapshot for page 0
      await saveHandwritingSnapshot(bookHash, 0, 'data:image/jpeg;base64,mockJpegSnapshotData');

      const { container } = render(
        <HandwritingOverviewDialog bookKey={`${bookHash}-key`} isOpen={true} onClose={vi.fn()} />,
      );

      // Card for Page 1 (with snapshot) should render an img tag with the snapshot dataUrl
      const img = container.querySelector('img[src="data:image/jpeg;base64,mockJpegSnapshotData"]');
      expect(img).toBeTruthy();

      // Card for Page 2 (without snapshot) should render simulated book page text
      expect(container.textContent).toContain('Test Book');
      expect(container.textContent).toContain('Chapter 1 Title');
    });

    it('deletes a page note, immediately removes it from overview list and updates store', async () => {
      const { getByText, getAllByTitle, queryByText } = render(
        <HandwritingOverviewDialog bookKey={`${bookHash}-key`} isOpen={true} onClose={vi.fn()} />,
      );

      expect(getByText('Page 1')).toBeTruthy();
      expect(getByText('Page 2')).toBeTruthy();

      // Click trash button on first card (Page 2, since default sort is updated-desc)
      const trashButtons = getAllByTitle('Clear Page Notes');
      expect(trashButtons.length).toBe(2);
      fireEvent.click(trashButtons[0]!);

      // Confirm button appears with Cancel option
      const deleteBtn = getByText('Delete');
      const cancelBtn = getByText('Cancel');
      expect(deleteBtn).toBeTruthy();
      expect(cancelBtn).toBeTruthy();

      // Click delete to clear page note
      fireEvent.click(deleteBtn);

      // Page 2 is immediately removed from the overview!
      expect(queryByText('Page 2')).toBeNull();
      expect(getByText('Page 1')).toBeTruthy();
    });

    it('opens preview modal when clicking a note and allows previous/next note navigation', async () => {
      const { getByText, getByTitle, queryByTitle } = render(
        <HandwritingOverviewDialog bookKey={`${bookHash}-key`} isOpen={true} onClose={vi.fn()} />,
      );

      // Click Page 2 card
      const page2Card = getByText('Page 2');
      fireEvent.click(page2Card);

      // Carousel preview modal opens
      expect(getByText('Open in Reader')).toBeTruthy();
      const prevBtn = getByTitle('Previous Note (Left Arrow)');
      const nextBtn = getByTitle('Next Note (Right Arrow)');
      expect(prevBtn).toBeTruthy();
      expect(nextBtn).toBeTruthy();

      // Navigate to previous note
      fireEvent.click(prevBtn);

      // Close preview modal
      const closeBtn = getByTitle('Close');
      fireEvent.click(closeBtn);
      expect(queryByTitle('Close')).toBeNull();
    });
  });
});
