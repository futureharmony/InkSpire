import { FoliateView } from '@/types/view';
import { HandwritingPoint } from '@/types/handwriting';

export interface ExtractedTextResult {
  text: string;
  cfi?: string;
  boundingRect: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
}

/**
 * Extract text from the underlying book content that falls within the bounding
 * box or polygon defined by a set of normalized stylus stroke points.
 */
export function extractTextFromStroke(
  points: HandwritingPoint[],
  containerWidth: number,
  containerHeight: number,
  view?: FoliateView | null,
): ExtractedTextResult | null {
  if (points.length < 2 || !view) return null;

  // 1. Calculate bounding box of the stroke in pixel coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pt of points) {
    const px = pt.x * containerWidth;
    const py = pt.y * containerHeight;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }

  const boxWidth = maxX - minX;
  const boxHeight = maxY - minY;

  // Too tiny to be an intentional text selection
  if (boxWidth < 15 && boxHeight < 15) return null;

  try {
    const contents = view?.renderer?.getContents?.() ?? [];
    let extractedText = '';

    for (const content of contents) {
      const doc = content.doc;
      if (!doc) continue;

      const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
      const iframeRect = iframe?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: containerWidth, height: containerHeight };

      // Sample a grid of points within the box to find intersecting text
      const samplePoints: { x: number; y: number }[] = [];
      const numStepsX = Math.min(8, Math.max(3, Math.floor(boxWidth / 30)));
      const numStepsY = Math.min(5, Math.max(2, Math.floor(boxHeight / 25)));

      for (let i = 0; i <= numStepsX; i++) {
        for (let j = 0; j <= numStepsY; j++) {
          const sx = minX + (boxWidth * i) / numStepsX;
          const sy = minY + (boxHeight * j) / numStepsY;
          samplePoints.push({ x: sx - iframeRect.left, y: sy - iframeRect.top });
        }
      }

      // Collect unique text nodes and ranges
      const foundTexts: string[] = [];
      const seenNodes = new Set<Node>();

      for (const sp of samplePoints) {
        let range: Range | null = null;
        if (doc.caretPositionFromPoint) {
          const pos = doc.caretPositionFromPoint(sp.x, sp.y);
          if (pos && pos.offsetNode && pos.offsetNode.nodeType === Node.TEXT_NODE) {
            if (!seenNodes.has(pos.offsetNode)) {
              seenNodes.add(pos.offsetNode);
              const nodeText = pos.offsetNode.textContent?.trim();
              if (nodeText && nodeText.length > 0) {
                foundTexts.push(nodeText);
              }
            }
          }
        } else if (doc.caretRangeFromPoint) {
          range = doc.caretRangeFromPoint(sp.x, sp.y);
          if (range && range.startContainer && range.startContainer.nodeType === Node.TEXT_NODE) {
            if (!seenNodes.has(range.startContainer)) {
              seenNodes.add(range.startContainer);
              const nodeText = range.startContainer.textContent?.trim();
              if (nodeText && nodeText.length > 0) {
                foundTexts.push(nodeText);
              }
            }
          }
        }
      }

      if (foundTexts.length > 0) {
        extractedText = foundTexts.join(' ').replace(/\s+/g, ' ').trim();
        break;
      }

      // Fallback 1: check elements under the center of the stroke
      const midX = (minX + maxX) / 2 - iframeRect.left;
      const midY = (minY + maxY) / 2 - iframeRect.top;
      const el = doc.elementFromPoint?.(midX, midY);
      if (el && el.textContent) {
        const text = el.textContent.trim().replace(/\s+/g, ' ');
        if (text.length > 0 && text.length < 500) {
          extractedText = text;
          break;
        }
      }

      // Fallback 2: tree walker intersecting stroke bounding box
      if (!extractedText && doc.body) {
        const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
        let node: Node | null;
        const rectMatches: string[] = [];
        while ((node = walker.nextNode())) {
          const parentEl = node.parentElement;
          if (!parentEl) continue;
          const r = parentEl.getBoundingClientRect?.();
          if (r && r.right >= minX && r.left <= maxX && r.bottom >= minY && r.top <= maxY) {
            const t = node.textContent?.trim();
            if (t && !rectMatches.includes(t)) {
              rectMatches.push(t);
            }
          }
        }
        if (rectMatches.length > 0) {
          extractedText = rectMatches.join(' ').replace(/\s+/g, ' ').trim();
          break;
        }
      }
    }

    if (!extractedText) {
      // PDF or Canvas fallback: try window selection or default prompt
      const sel = window.getSelection()?.toString()?.trim();
      if (sel) extractedText = sel;
    }

    if (extractedText) {
      return {
        text: extractedText.slice(0, 300),
        boundingRect: {
          left: minX / containerWidth,
          top: minY / containerHeight,
          right: maxX / containerWidth,
          bottom: maxY / containerHeight,
        },
      };
    }
  } catch (err) {
    console.warn('[LassoTextSelector] Failed to extract text:', err);
  }

  return null;
}
