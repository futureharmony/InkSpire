import { describe, expect, test } from 'vitest';
import { extractTextFromStroke } from '@/utils/lassoTextSelector';
import { HandwritingPoint } from '@/types/handwriting';

describe('lassoTextSelector', () => {
  test('returns null when points are fewer than 2 or view is null', () => {
    expect(extractTextFromStroke([], 1000, 1000, null)).toBeNull();
    expect(extractTextFromStroke([{ x: 0.1, y: 0.1 }], 1000, 1000, null)).toBeNull();
  });

  test('extracts text when DOM nodes fall within stroke bounding box', () => {
    // Setup a mock document and FoliateView
    const mockContainer = document.createElement('div');
    const p1 = document.createElement('p');
    p1.textContent = '天地玄黄 宇宙洪荒 日月盈昃 辰宿列张';
    // Mock getBoundingClientRect for p1
    p1.getBoundingClientRect = () => ({
      left: 100,
      top: 100,
      right: 500,
      bottom: 150,
      width: 400,
      height: 50,
      x: 100,
      y: 100,
      toJSON: () => {},
    });
    mockContainer.appendChild(p1);
    document.body.appendChild(mockContainer);

    const mockView = {
      container: mockContainer,
      renderer: {
        getContents: () => [{ doc: document }],
      },
      querySelectorAll: (sel: string) => mockContainer.querySelectorAll(sel),
      querySelector: (sel: string) => mockContainer.querySelector(sel),
    } as any;

    // Stroke circling around (100, 100) -> (500, 150) normalized to 1000x1000
    const points: HandwritingPoint[] = [
      { x: 0.08, y: 0.08 },
      { x: 0.52, y: 0.08 },
      { x: 0.52, y: 0.18 },
      { x: 0.08, y: 0.18 },
    ];

    const result = extractTextFromStroke(points, 1000, 1000, mockView);
    expect(result).not.toBeNull();
    expect(result?.text).toContain('天地玄黄');
    expect(result?.boundingRect.left).toBeCloseTo(0.08, 1);
    expect(result?.boundingRect.right).toBeCloseTo(0.52, 1);
  });
});
