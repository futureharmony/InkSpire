import { describe, expect, test } from 'vitest';
import {
  toNormalizedPoint,
  fromNormalizedPoint,
  distanceToSegment,
  strokeIntersectsEraser,
  snapLine,
  strokeToSvgPath,
  strokesToSvg,
  importBookFromJson,
} from '@/utils/handwriting';
import { HandwritingStroke } from '@/types/handwriting';

describe('Handwriting Utils', () => {
  describe('Coordinate normalization', () => {
    test('converts client coordinates to normalized 0..1 coordinates', () => {
      const rect = { left: 100, top: 200, width: 400, height: 600 };
      const norm = toNormalizedPoint(300, 500, rect, 0.7);

      expect(norm.x).toBeCloseTo(0.5);
      expect(norm.y).toBeCloseTo(0.5);
      expect(norm.pressure).toBe(0.7);
    });

    test('clamps out-of-bound coordinates to 0..1', () => {
      const rect = { left: 0, top: 0, width: 100, height: 100 };
      const norm1 = toNormalizedPoint(-50, -50, rect);
      expect(norm1.x).toBe(0);
      expect(norm1.y).toBe(0);

      const norm2 = toNormalizedPoint(150, 200, rect);
      expect(norm2.x).toBe(1);
      expect(norm2.y).toBe(1);
    });

    test('re-scales normalized point back to pixel dimensions', () => {
      const pt = { x: 0.25, y: 0.75, pressure: 0.8 };
      const px = fromNormalizedPoint(pt, 800, 1000);

      expect(px.x).toBe(200);
      expect(px.y).toBe(750);
      expect(px.pressure).toBe(0.8);
    });
  });

  describe('Geometry and Hit Testing', () => {
    test('calculates distance from point to segment', () => {
      // Point directly on segment
      expect(distanceToSegment(50, 0, 0, 0, 100, 0)).toBe(0);
      // Point 10px perpendicular above midpoint
      expect(distanceToSegment(50, 10, 0, 0, 100, 0)).toBe(10);
      // Point beyond start
      expect(distanceToSegment(-10, 0, 0, 0, 100, 0)).toBe(10);
      // Point beyond end
      expect(distanceToSegment(110, 0, 0, 0, 100, 0)).toBe(10);
    });

    test('detects when eraser intersects a freehand stroke', () => {
      const stroke: HandwritingStroke = {
        id: 's1',
        tool: 'pen',
        color: '#000000',
        width: 4,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.3 },
        ],
      };

      const width = 1000;
      const height = 1000;

      // Point directly on the line at (150, 150)
      const hit = strokeIntersectsEraser(
        stroke,
        { x: 0.15, y: 0.15 },
        width,
        height,
        16,
      );
      expect(hit).toBe(true);

      // Point far away at (800, 800)
      const miss = strokeIntersectsEraser(
        stroke,
        { x: 0.8, y: 0.8 },
        width,
        height,
        16,
      );
      expect(miss).toBe(false);
    });

    test('detects when eraser intersects a shape (rectangle)', () => {
      const stroke: HandwritingStroke = {
        id: 's2',
        tool: 'shape',
        shapeType: 'rectangle',
        color: '#3b82f6',
        width: 2,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.5, y: 0.5 },
        ],
      };

      const width = 1000;
      const height = 1000;

      // Top edge at y=100, x=300
      expect(
        strokeIntersectsEraser(stroke, { x: 0.3, y: 0.1 }, width, height, 10),
      ).toBe(true);

      // Inside center (hollow) -> miss
      expect(
        strokeIntersectsEraser(stroke, { x: 0.3, y: 0.3 }, width, height, 10),
      ).toBe(false);
    });

    test('snaps line to horizontal or vertical when angle is close', () => {
      // Almost horizontal (dy=2, dx=100)
      const snapH = snapLine(0, 50, 100, 52);
      expect(snapH.y2).toBeCloseTo(50);

      // Almost vertical (dx=2, dy=100)
      const snapV = snapLine(50, 0, 52, 100);
      expect(snapV.x2).toBeCloseTo(50);
    });
  });

  describe('SVG generation', () => {
    test('generates valid SVG path data from stroke points', () => {
      const stroke: HandwritingStroke = {
        id: 's3',
        tool: 'pen',
        color: '#ef4444',
        width: 3,
        opacity: 1,
        pageIndex: 0,
        createdAt: 1000,
        updatedAt: 1000,
        points: [
          { x: 0.1, y: 0.1 },
          { x: 0.2, y: 0.2 },
          { x: 0.3, y: 0.2 },
          { x: 0.4, y: 0.3 },
        ],
      };

      const path = strokeToSvgPath(stroke, 1000, 1000);
      expect(path).toContain('M 100 100');
      expect(path).toContain('Q');
      expect(path).toContain('L 400 300');
    });

    test('generates full standalone SVG document with all strokes', () => {
      const strokes: HandwritingStroke[] = [
        {
          id: 's1',
          tool: 'pen',
          color: '#000000',
          width: 2,
          opacity: 1,
          pageIndex: 0,
          createdAt: 1000,
          updatedAt: 1000,
          points: [
            { x: 0.1, y: 0.1 },
            { x: 0.2, y: 0.2 },
          ],
        },
        {
          id: 's2',
          tool: 'shape',
          shapeType: 'rectangle',
          color: '#3b82f6',
          width: 4,
          opacity: 1,
          pageIndex: 0,
          createdAt: 1000,
          updatedAt: 1000,
          points: [
            { x: 0.3, y: 0.3 },
            { x: 0.6, y: 0.7 },
          ],
        },
      ];

      const svg = strokesToSvg(strokes, 800, 1200);
      expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 800 1200"');
      expect(svg).toContain('<path');
      expect(svg).toContain('<rect');
    });
  });

  describe('JSON Serialization and Deserialization', () => {
    test('roundtrips handwriting data to and from JSON', () => {
      const pages: Record<number, HandwritingStroke[]> = {
        0: [
          {
            id: 'stroke-1',
            tool: 'pen',
            color: '#2563eb',
            width: 3,
            opacity: 1,
            pageIndex: 0,
            createdAt: 123456,
            updatedAt: 123456,
            points: [{ x: 0.1, y: 0.2, pressure: 0.6 }],
          },
        ],
      };

      const jsonStr = JSON.stringify({
        version: 1,
        bookHash: 'book-hash-abc',
        pages,
      });

      const parsed = importBookFromJson(jsonStr);
      expect(parsed).not.toBeNull();
      expect(parsed?.bookHash).toBe('book-hash-abc');
      expect(parsed?.pages[0]?.length).toBe(1);
      expect(parsed?.pages[0]?.[0]?.id).toBe('stroke-1');
      expect(parsed?.pages[0]?.[0]?.color).toBe('#2563eb');
    });

    test('gracefully handles invalid JSON', () => {
      expect(importBookFromJson('invalid json')).toBeNull();
      expect(importBookFromJson('null')).toBeNull();
    });
  });
});
