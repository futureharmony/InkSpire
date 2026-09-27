import { HandwritingPoint, HandwritingTextAnchor } from '@/types/handwriting';
import { getCaretPointFromPoint, getWordRangeFromPoint, getRangeRectInWebview } from '@/utils/sel';

export interface ScratchOutResult {
  isScratch: boolean;
  bbox?: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
}

export interface ClosedLoopResult {
  isClosedLoop: boolean;
  center: { x: number; y: number };
  bbox: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };
  area: number;
}

export interface SnappedUnderlineResult {
  snappedPoints: HandwritingPoint[];
  textAnchor?: HandwritingTextAnchor;
  textSnippet?: string;
}

/**
 * Detects scratch-out / scribble gesture to erase content.
 * A scratch-out gesture consists of rapid alternating horizontal/zig-zag reversals in X
 * within a confined vertical boundary and short time duration.
 */
export function detectScratchOutGesture(
  points: HandwritingPoint[],
  width: number,
  height: number,
): ScratchOutResult {
  if (points.length < 8) {
    return { isScratch: false };
  }

  // Check duration: scratch-outs are typically quick, under 2500ms
  const firstTime = points[0]?.time;
  const lastTime = points[points.length - 1]?.time;
  if (firstTime && lastTime && lastTime - firstTime > 2500) {
    return { isScratch: false };
  }

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    const px = pt.x * width;
    const py = pt.y * height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;

  // Must span a reasonable distance (at least 15px in one dimension, or hypot >= 20px)
  if (Math.hypot(boxW, boxH) < 20 || (boxW < 15 && boxH < 15)) {
    return { isScratch: false };
  }

  // Track reversals across both X and Y axes (alternating back-and-forth scribbles)
  let reversalsX = 0;
  let prevDirX = 0;
  let lastAnchorX = points[0]!.x * width;
  let totalHorizontalTravel = 0;

  let reversalsY = 0;
  let prevDirY = 0;
  let lastAnchorY = points[0]!.y * height;
  let totalVerticalTravel = 0;

  for (let i = 1; i < points.length; i++) {
    const currentX = points[i]!.x * width;
    const dx = currentX - lastAnchorX;
    if (Math.abs(dx) >= 5) {
      const currentDirX = dx > 0 ? 1 : -1;
      totalHorizontalTravel += Math.abs(dx);
      if (prevDirX !== 0 && currentDirX !== prevDirX) {
        reversalsX++;
      }
      prevDirX = currentDirX;
      lastAnchorX = currentX;
    }

    const currentY = points[i]!.y * height;
    const dy = currentY - lastAnchorY;
    if (Math.abs(dy) >= 5) {
      const currentDirY = dy > 0 ? 1 : -1;
      totalVerticalTravel += Math.abs(dy);
      if (prevDirY !== 0 && currentDirY !== prevDirY) {
        reversalsY++;
      }
      prevDirY = currentDirY;
      lastAnchorY = currentY;
    }
  }

  const isHorizontalScratch = reversalsX >= 3 && totalHorizontalTravel >= boxW * 1.3;
  const isVerticalScratch = reversalsY >= 3 && totalVerticalTravel >= boxH * 1.3;
  const isDiagonalScratch =
    reversalsX + reversalsY >= 4 &&
    totalHorizontalTravel + totalVerticalTravel >= Math.hypot(boxW, boxH) * 1.3;

  if (isHorizontalScratch || isVerticalScratch || isDiagonalScratch) {
    // Proportional comfortable padding to cover erased strokes cleanly
    const padPxX = Math.max(12, boxW * 0.15);
    const padPxY = Math.max(12, boxH * 0.15);
    return {
      isScratch: true,
      bbox: {
        minX: Math.max(0, (minX - padPxX) / width),
        minY: Math.max(0, (minY - padPxY) / height),
        maxX: Math.min(1, (maxX + padPxX) / width),
        maxY: Math.min(1, (maxY + padPxY) / height),
      },
    };
  }

  return { isScratch: false };
}

/**
 * Detects whether a stroke forms a closed loop / lasso circle around content.
 * Used for "Circle to Clip / 边注卡片" interaction.
 */
export function detectClosedLoopGesture(
  points: HandwritingPoint[],
  width: number,
  height: number,
): ClosedLoopResult {
  const emptyResult: ClosedLoopResult = {
    isClosedLoop: false,
    center: { x: 0, y: 0 },
    bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
    area: 0,
  };

  if (points.length < 10) {
    return emptyResult;
  }

  const n = points.length;
  const p0 = points[0]!;
  const pN = points[n - 1]!;

  const startX = p0.x * width;
  const startY = p0.y * height;
  const endX = pN.x * width;
  const endY = pN.y * height;

  // Calculate perimeter and bounding box
  let perimeter = 0;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const px = points[i]!.x * width;
    const py = points[i]!.y * height;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;

    if (i > 0) {
      const prevX = points[i - 1]!.x * width;
      const prevY = points[i - 1]!.y * height;
      perimeter += Math.hypot(px - prevX, py - prevY);
    }
  }

  const boxW = maxX - minX;
  const boxH = maxY - minY;

  // Too small to be a meaningful lasso circle around text
  if (boxW < 25 || boxH < 18 || perimeter < 75) {
    return emptyResult;
  }

  // End point must be close to start point
  const endDist = Math.hypot(endX - startX, endY - startY);
  const closureThreshold = Math.max(35, perimeter * 0.28);
  if (endDist > closureThreshold) {
    return emptyResult;
  }

  // Calculate polygon area using Shoelace formula
  let shoelaceSum = 0;
  for (let i = 0; i < n; i++) {
    const nextIdx = (i + 1) % n;
    const xi = points[i]!.x * width;
    const yi = points[i]!.y * height;
    const xNext = points[nextIdx]!.x * width;
    const yNext = points[nextIdx]!.y * height;
    shoelaceSum += xi * yNext - xNext * yi;
  }
  const area = Math.abs(shoelaceSum) / 2;

  // Circle must enclose non-trivial area
  if (area < 1000) {
    return emptyResult;
  }

  // Calculate net turning angle
  let totalAngle = 0;
  for (let i = 1; i < n - 1; i++) {
    const v1x = points[i]!.x - points[i - 1]!.x;
    const v1y = points[i]!.y - points[i - 1]!.y;
    const v2x = points[i + 1]!.x - points[i]!.x;
    const v2y = points[i + 1]!.y - points[i]!.y;
    const cross = v1x * v2y - v1y * v2x;
    const dot = v1x * v2x + v1y * v2y;
    totalAngle += Math.atan2(cross, dot);
  }

  // A simple closed loop should turn approximately ~2π (360°)
  if (Math.abs(totalAngle) < 1.1 * Math.PI) {
    return emptyResult;
  }

  const centerX = (minX + maxX) / 2 / width;
  const centerY = (minY + maxY) / 2 / height;

  return {
    isClosedLoop: true,
    center: { x: centerX, y: centerY },
    bbox: {
      minX: minX / width,
      minY: minY / height,
      maxX: maxX / width,
      maxY: maxY / height,
    },
    area,
  };
}

/**
 * Snaps a drawn stroke to underlying text line:
 * - Underline (pen): snaps horizontally right beneath text baseline.
 * - Highlighter: straightens along the text line's vertical center and horizontal extent.
 */
export function snapUnderlineToText(
  points: HandwritingPoint[],
  view: unknown,
  width: number,
  height: number,
  containerRect?: { left: number; top: number; width: number; height: number } | null,
  isHighlighter = false,
): SnappedUnderlineResult | null {
  if (points.length < 3 || !view) return null;

  const pFirst = points[0]!;
  const pLast = points[points.length - 1]!;

  const startPxX = pFirst.x * width;
  const startPxY = pFirst.y * height;
  const endPxX = pLast.x * width;
  const endPxY = pLast.y * height;

  const dx = endPxX - startPxX;
  const dy = endPxY - startPxY;
  const spanX = Math.abs(dx);

  // Must be reasonably horizontal
  if (spanX < 30 || Math.abs(dy) / spanX > 0.35) {
    return null;
  }

  // Ensure intermediate points don't deviate wildly from a line
  const midY = (startPxY + endPxY) / 2;
  let maxDev = 0;
  for (const pt of points) {
    const py = pt.y * height;
    const dev = Math.abs(py - midY);
    if (dev > maxDev) maxDev = dev;
  }
  if (maxDev > 35) {
    return null;
  }

  const foliateView = view as {
    renderer?: {
      getContents?: () => Array<{ doc: Document; index: number }>;
    };
    getCFI?: (sectionIndex: number, range: Range) => string;
  };

  const getContents = foliateView.renderer?.getContents;
  if (typeof getContents !== 'function') return null;

  const contents = getContents.call(foliateView.renderer);
  if (!Array.isArray(contents) || contents.length === 0) return null;

  const cLeft = containerRect?.left ?? 0;
  const cTop = containerRect?.top ?? 0;

  // Probe at start, middle, and end of the stroke
  const probePoints = [
    { x: cLeft + (startPxX + endPxX) / 2, y: cTop + (startPxY + endPxY) / 2 },
    { x: cLeft + startPxX, y: cTop + startPxY },
    { x: cLeft + endPxX, y: cTop + endPxY },
  ];

  let bestRange: Range | null = null;
  let bestSectionIndex: number | undefined;

  for (const probe of probePoints) {
    for (const item of contents) {
      const { doc, index: secIdx } = item;
      if (!doc) continue;

      const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
      if (
        frame &&
        (probe.x < frame.left ||
          probe.x > frame.right ||
          probe.y < frame.top ||
          probe.y > frame.bottom)
      ) {
        continue;
      }

      const docX = probe.x - (frame?.left ?? 0);
      const docY = probe.y - (frame?.top ?? 0);

      try {
        let range: Range | null = getWordRangeFromPoint(doc, docX, docY);
        if (!range) {
          const caret = getCaretPointFromPoint(doc, docX, docY);
          if (caret?.node && caret.node.nodeType === Node.TEXT_NODE) {
            range = doc.createRange();
            const textNode = caret.node as Text;
            range.setStart(textNode, 0);
            range.setEnd(textNode, textNode.length);
          }
        }

        if (range && range.toString().trim().length > 0) {
          bestRange = range;
          bestSectionIndex = secIdx;
          break;
        }
      } catch {
        // ignore probe error
      }
    }
    if (bestRange) break;
  }

  if (!bestRange) return null;

  const rangeRect = getRangeRectInWebview(bestRange);
  if (!rangeRect) return null;

  // Normalized bounds of the text line
  const textLeft = Math.max(0, Math.min(1, (rangeRect.left - cLeft) / width));
  const textRight = Math.max(0, Math.min(1, (rangeRect.right - cLeft) / width));
  const textTop = Math.max(0, Math.min(1, (rangeRect.top - cTop) / height));
  const textBottom = Math.max(0, Math.min(1, (rangeRect.bottom - cTop) / height));

  const textSnippet = bestRange.toString().trim();
  let cfi: string | undefined;
  if (typeof foliateView.getCFI === 'function' && typeof bestSectionIndex === 'number') {
    try {
      cfi = foliateView.getCFI(bestSectionIndex, bestRange);
    } catch {
      // ignore
    }
  }

  const textAnchor: HandwritingTextAnchor = {
    textSnippet: textSnippet.slice(0, 80),
    cfi,
    sectionIndex: bestSectionIndex,
    boundingRect: {
      left: textLeft,
      top: textTop,
      right: textRight,
      bottom: textBottom,
    },
  };

  // Determine snapped Y and horizontal extents
  let snappedY: number;
  if (isHighlighter) {
    // Highlighter snaps to text vertical center
    snappedY = (textTop + textBottom) / 2;
  } else {
    // Underline snaps right under baseline
    snappedY = Math.min(0.99, textBottom + 0.003);
  }

  // Keep the user's drawn horizontal span (do not clamp to a single word's bounds)
  const startX = pFirst.x;
  const endX = pLast.x;

  // Generate 7 cleanly interpolated points along the snapped line
  const count = 7;
  const snappedPoints: HandwritingPoint[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    snappedPoints.push({
      x: startX + t * (endX - startX),
      y: snappedY,
      pressure: isHighlighter ? 0.8 : 0.65,
      time: Date.now() + i * 2,
    });
  }

  return {
    snappedPoints,
    textAnchor,
    textSnippet,
  };
}

/**
 * Resolves current reflow offset (deltaX, deltaY) for an anchored stroke or note.
 * When EPUB reflow happens (font size, margins, line-height change), the text shifts.
 * This computes the pixel translation needed to keep the stroke locked to the text.
 */
export function resolveTextAnchorDelta(
  anchor: HandwritingTextAnchor | undefined,
  view: unknown,
  containerRect: { left: number; top: number; width: number; height: number },
): { dx: number; dy: number } | null {
  if (!anchor || !anchor.boundingRect || !view) return null;

  const foliateView = view as {
    renderer?: {
      getContents?: () => Array<{ doc: Document; index: number }>;
    };
    resolveCFI?: (cfi: string) => Range | null;
  };

  const cLeft = containerRect.left;
  const cTop = containerRect.top;
  const cWidth = containerRect.width;
  const cHeight = containerRect.height;

  // 1. Resolve via CFI if available
  if (anchor.cfi && typeof foliateView.resolveCFI === 'function') {
    try {
      const range = foliateView.resolveCFI(anchor.cfi);
      if (range) {
        const rect = getRangeRectInWebview(range);
        if (rect && rect.right > rect.left) {
          const currentNormLeft = (rect.left - cLeft) / cWidth;
          const currentNormTop = (rect.top - cTop) / cHeight;
          const dx = (currentNormLeft - anchor.boundingRect.left) * cWidth;
          const dy = (currentNormTop - anchor.boundingRect.top) * cHeight;
          return { dx, dy };
        }
      }
    } catch {
      // fallback to snippet search
    }
  }

  // 2. Fallback: search document contents for text snippet
  const getContents = foliateView.renderer?.getContents;
  if (typeof getContents === 'function' && anchor.textSnippet) {
    try {
      const contents = getContents.call(foliateView.renderer);
      const querySnippet = anchor.textSnippet.slice(0, 30).trim();

      for (const item of contents) {
        if (
          typeof anchor.sectionIndex === 'number' &&
          typeof item.index === 'number' &&
          item.index !== anchor.sectionIndex
        ) {
          continue;
        }

        const doc = item.doc;
        if (!doc || !doc.body) continue;

        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;

        while ((node = walker.nextNode())) {
          const text = node.textContent;
          if (text && text.includes(querySnippet)) {
            const range = doc.createRange();
            const startIdx = text.indexOf(querySnippet);
            range.setStart(node, startIdx);
            range.setEnd(node, startIdx + querySnippet.length);

            const rect = getRangeRectInWebview(range);
            if (rect && rect.right > rect.left) {
              const currentNormLeft = (rect.left - cLeft) / cWidth;
              const currentNormTop = (rect.top - cTop) / cHeight;
              const dx = (currentNormLeft - anchor.boundingRect.left) * cWidth;
              const dy = (currentNormTop - anchor.boundingRect.top) * cHeight;
              return { dx, dy };
            }
          }
        }
      }
    } catch {
      // ignore
    }
  }

  return null;
}
