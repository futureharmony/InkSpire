import { describe, it, expect, vi } from 'vitest';
import {
  detectScratchOutGesture,
  detectClosedLoopGesture,
  snapUnderlineToText,
  resolveTextAnchorDelta,
} from '@/utils/gestureRecognizer';
import { HandwritingPoint, HandwritingTextAnchor } from '@/types/handwriting';

describe('gestureRecognizer', () => {
  describe('detectScratchOutGesture', () => {
    it('detects a rapid back-and-forth zig-zag scribble as scratch-out', () => {
      // 4 horizontal reversals across X: 100 -> 180 -> 110 -> 175 -> 105 -> 180
      const width = 1000;
      const height = 1500;
      const now = Date.now();
      const points: HandwritingPoint[] = [
        { x: 0.1, y: 0.2, time: now },
        { x: 0.14, y: 0.202, time: now + 30 },
        { x: 0.18, y: 0.204, time: now + 60 },
        { x: 0.15, y: 0.205, time: now + 90 },
        { x: 0.11, y: 0.206, time: now + 120 },
        { x: 0.14, y: 0.208, time: now + 150 },
        { x: 0.175, y: 0.21, time: now + 180 },
        { x: 0.14, y: 0.212, time: now + 210 },
        { x: 0.105, y: 0.214, time: now + 240 },
        { x: 0.15, y: 0.216, time: now + 270 },
        { x: 0.18, y: 0.218, time: now + 300 },
      ];

      const result = detectScratchOutGesture(points, width, height);
      expect(result.isScratch).toBe(true);
      expect(result.bbox).toBeDefined();
      if (result.bbox) {
        expect(result.bbox.minX).toBeLessThanOrEqual(0.1);
        expect(result.bbox.maxX).toBeGreaterThanOrEqual(0.18);
        expect(result.bbox.minY).toBeLessThanOrEqual(0.2);
        expect(result.bbox.maxY).toBeGreaterThanOrEqual(0.218);
      }
    });

    it('rejects unidirectional normal strokes (e.g. underline or cursive line)', () => {
      const width = 1000;
      const height = 1500;
      const now = Date.now();
      const points: HandwritingPoint[] = [
        { x: 0.1, y: 0.2, time: now },
        { x: 0.12, y: 0.2, time: now + 20 },
        { x: 0.15, y: 0.2, time: now + 40 },
        { x: 0.18, y: 0.201, time: now + 60 },
        { x: 0.22, y: 0.201, time: now + 80 },
        { x: 0.26, y: 0.202, time: now + 100 },
        { x: 0.3, y: 0.202, time: now + 120 },
        { x: 0.35, y: 0.203, time: now + 140 },
      ];

      const result = detectScratchOutGesture(points, width, height);
      expect(result.isScratch).toBe(false);
    });

    it('rejects strokes that took too long (deliberate drawing, not scratch gesture)', () => {
      const width = 1000;
      const height = 1500;
      const now = Date.now();
      const points: HandwritingPoint[] = [
        { x: 0.1, y: 0.2, time: now },
        { x: 0.18, y: 0.2, time: now + 400 },
        { x: 0.11, y: 0.205, time: now + 800 },
        { x: 0.175, y: 0.21, time: now + 1200 },
        { x: 0.105, y: 0.215, time: now + 1600 },
        { x: 0.18, y: 0.22, time: now + 2000 },
        { x: 0.11, y: 0.225, time: now + 2400 },
        { x: 0.18, y: 0.23, time: now + 2800 },
      ];

      const result = detectScratchOutGesture(points, width, height);
      expect(result.isScratch).toBe(false);
    });

    it('never detects a circular or lasso loop as scratch-out', () => {
      const width = 1000;
      const height = 1500;
      const cx = 0.3;
      const cy = 0.4;
      const rx = 0.1;
      const ry = 0.08;
      const n = 28;
      const points: HandwritingPoint[] = [];

      for (let i = 0; i < n; i++) {
        const theta = (i / (n - 1)) * 2 * Math.PI;
        points.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
          time: Date.now() + i * 20,
        });
      }

      const result = detectScratchOutGesture(points, width, height);
      expect(result.isScratch).toBe(false);
    });

    it('rejects wobbly hand-drawn loops with slight tremors as scratch-out', () => {
      const width = 1000;
      const height = 1500;
      const cx = 0.3;
      const cy = 0.4;
      const rx = 0.1;
      const ry = 0.08;
      const n = 32;
      const points: HandwritingPoint[] = [];

      for (let i = 0; i < n; i++) {
        const theta = (i / (n - 1)) * 2 * Math.PI;
        // Introduce small jitter/tremor typical of hand-drawn circles
        const jitterX = (i % 2 === 0 ? 0.003 : -0.003);
        const jitterY = (i % 3 === 0 ? 0.003 : -0.003);
        points.push({
          x: cx + rx * Math.cos(theta) + jitterX,
          y: cy + ry * Math.sin(theta) + jitterY,
          time: Date.now() + i * 15,
        });
      }

      const result = detectScratchOutGesture(points, width, height);
      expect(result.isScratch).toBe(false);
    });
  });

  describe('detectClosedLoopGesture', () => {
    it('detects a closed circular or elliptical lasso loop', () => {
      const width = 1000;
      const height = 1500;
      const cx = 0.3;
      const cy = 0.4;
      const rx = 0.1;
      const ry = 0.08;
      const n = 24;
      const points: HandwritingPoint[] = [];

      for (let i = 0; i < n; i++) {
        const theta = (i / (n - 1)) * 2 * Math.PI;
        points.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        });
      }

      const result = detectClosedLoopGesture(points, width, height);
      expect(result.isClosedLoop).toBe(true);
      expect(result.center.x).toBeCloseTo(cx, 1);
      expect(result.center.y).toBeCloseTo(cy, 1);
      expect(result.area).toBeGreaterThan(1000);
      expect(result.bbox.minX).toBeLessThan(cx);
      expect(result.bbox.maxX).toBeGreaterThan(cx);
    });

    it('rejects an open curved stroke (e.g. crescent or C-shape)', () => {
      const width = 1000;
      const height = 1500;
      const cx = 0.3;
      const cy = 0.4;
      const rx = 0.1;
      const ry = 0.08;
      const n = 18;
      const points: HandwritingPoint[] = [];

      // Only 180 degrees arc
      for (let i = 0; i < n; i++) {
        const theta = (i / (n - 1)) * Math.PI;
        points.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        });
      }

      const result = detectClosedLoopGesture(points, width, height);
      expect(result.isClosedLoop).toBe(false);
    });

    it('rejects a tiny closed loop (e.g. cursive loop in letter e or l)', () => {
      const width = 1000;
      const height = 1500;
      const cx = 0.3;
      const cy = 0.4;
      const rx = 0.005; // 5px radius
      const ry = 0.004;
      const n = 16;
      const points: HandwritingPoint[] = [];

      for (let i = 0; i < n; i++) {
        const theta = (i / (n - 1)) * 2 * Math.PI;
        points.push({
          x: cx + rx * Math.cos(theta),
          y: cy + ry * Math.sin(theta),
        });
      }

      const result = detectClosedLoopGesture(points, width, height);
      expect(result.isClosedLoop).toBe(false);
    });
  });

  describe('snapUnderlineToText', () => {
    it('snaps horizontal underline to underlying text baseline', () => {
      const width = 1000;
      const height = 1500;

      // Mock Foliate view with text line
      const mockRange = {
        toString: () => 'The quick brown fox jumps over the lazy dog',
        getBoundingClientRect: () => ({
          left: 100,
          right: 500,
          top: 300,
          bottom: 330,
          width: 400,
          height: 30,
        }),
        startContainer: { nodeType: 1 } as Node,
        commonAncestorContainer: { nodeType: 1 } as Node,
      } as unknown as Range;

      const mockDoc = {
        defaultView: {
          frameElement: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1500 }),
          },
          getComputedStyle: () => ({ transform: 'none' }),
        },
      } as unknown as Document;

      const mockView = {
        renderer: {
          getContents: () => [{ doc: mockDoc, index: 2 }],
        },
        getCFI: vi.fn(() => 'epubcfi(/6/4[chap01]!/4/2/1:0)'),
      };

      // Mock getWordRangeFromPoint
      const points: HandwritingPoint[] = [
        { x: 0.12, y: 0.225 },
        { x: 0.22, y: 0.226 },
        { x: 0.32, y: 0.224 },
        { x: 0.42, y: 0.225 },
        { x: 0.48, y: 0.226 },
      ];

      // Spy on caret/word resolution by injecting doc methods or using view fallback
      (mockDoc as unknown as Record<string, unknown>)['caretPositionFromPoint'] = () => null;
      (mockDoc as unknown as Record<string, unknown>)['createRange'] = () => mockRange;
      (mockDoc as unknown as Record<string, unknown>)['caretRangeFromPoint'] = () => mockRange;

      const result = snapUnderlineToText(points, mockView, width, height, {
        left: 0,
        top: 0,
        width,
        height,
      });

      expect(result).toBeDefined();
      if (result) {
        expect(result.snappedPoints.length).toBe(7);
        // Snapped Y should be right at text bottom (330/1500 = 0.22)
        expect(result.snappedPoints[0]!.y).toBeGreaterThanOrEqual(330 / 1500);
        expect(result.textAnchor).toBeDefined();
        expect(result.textAnchor?.textSnippet).toContain('The quick brown fox');
        expect(result.textAnchor?.cfi).toBe('epubcfi(/6/4[chap01]!/4/2/1:0)');
      }
    });

    it('snaps highlighter along text vertical center', () => {
      const width = 1000;
      const height = 1500;

      const mockRange = {
        toString: () => 'Important quote to highlight',
        getBoundingClientRect: () => ({
          left: 100,
          right: 400,
          top: 200,
          bottom: 240,
          width: 300,
          height: 40,
        }),
        startContainer: { nodeType: 1 } as Node,
        commonAncestorContainer: { nodeType: 1 } as Node,
      } as unknown as Range;

      const mockDoc = {
        defaultView: {
          frameElement: {
            getBoundingClientRect: () => ({ left: 0, top: 0, width: 1000, height: 1500 }),
          },
          getComputedStyle: () => ({ transform: 'none' }),
        },
      } as unknown as Document;

      const mockView = {
        renderer: {
          getContents: () => [{ doc: mockDoc, index: 1 }],
        },
        getCFI: vi.fn(() => 'epubcfi(/6/2!/4/2:5)'),
      };

      (mockDoc as unknown as Record<string, unknown>)['caretRangeFromPoint'] = () => mockRange;

      const points: HandwritingPoint[] = [
        { x: 0.11, y: 0.145 },
        { x: 0.25, y: 0.147 },
        { x: 0.38, y: 0.146 },
      ];

      const result = snapUnderlineToText(
        points,
        mockView,
        width,
        height,
        { left: 0, top: 0, width, height },
        true, // isHighlighter = true
      );

      expect(result).toBeDefined();
      if (result) {
        // Vertical center: (200 + 240)/2 / 1500 = 220 / 1500 = 0.14666...
        expect(result.snappedPoints[0]!.y).toBeCloseTo(220 / 1500, 2);
      }
    });
  });

  describe('resolveTextAnchorDelta', () => {
    it('calculates pixel delta when text moves due to reflow (font size / layout change)', () => {
      const containerRect = { left: 0, top: 0, width: 1000, height: 1500 };

      // Anchor created when text was at left=100 (0.10), top=200 (0.1333)
      const anchor: HandwritingTextAnchor = {
        textSnippet: 'Reflow paragraph test',
        cfi: 'epubcfi(/6/2!/4/10)',
        sectionIndex: 0,
        boundingRect: {
          left: 0.1,
          top: 0.13333,
          right: 0.5,
          bottom: 0.16,
        },
      };

      // Current layout after font size increased: text moved to left=120, top=240
      const currentRange = {
        getBoundingClientRect: () => ({
          left: 120,
          right: 560,
          top: 240,
          bottom: 280,
          width: 440,
          height: 40,
        }),
        startContainer: { nodeType: 1 } as Node,
        commonAncestorContainer: { nodeType: 1 } as Node,
      } as unknown as Range;

      const mockView = {
        resolveCFI: vi.fn(() => currentRange),
      };

      const delta = resolveTextAnchorDelta(anchor, mockView, containerRect);
      expect(delta).toBeDefined();
      if (delta) {
        // dx = 120 - 100 = 20px
        expect(delta.dx).toBeCloseTo(20, 0);
        // dy = 240 - 200 = 40px
        expect(delta.dy).toBeCloseTo(40, 0);
      }
    });

    it('returns null if anchor has no boundingRect or view is undefined', () => {
      const delta1 = resolveTextAnchorDelta(
        undefined,
        {},
        { left: 0, top: 0, width: 100, height: 100 },
      );
      expect(delta1).toBeNull();

      const delta2 = resolveTextAnchorDelta(
        { textSnippet: 'Snippet' },
        {},
        { left: 0, top: 0, width: 100, height: 100 },
      );
      expect(delta2).toBeNull();
    });
  });
});
