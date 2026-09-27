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
 * Standard ray-casting algorithm to test whether a 2D point is inside a closed polygon.
 */
function isPointInPolygon(px: number, py: number, polygon: { x: number; y: number }[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x;
    const yi = polygon[i]!.y;
    const xj = polygon[j]!.x;
    const yj = polygon[j]!.y;
    const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
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

  // 1. Calculate bounding box of the stroke in container pixel coordinates
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  const polygonPoints: { x: number; y: number }[] = [];

  for (const pt of points) {
    const px = pt.x * containerWidth;
    const py = pt.y * containerHeight;
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
    polygonPoints.push({ x: px, y: py });
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
      if (!doc || !doc.body) continue;

      const iframe = doc.defaultView?.frameElement as HTMLIFrameElement | null;
      let frameLeft = 0;
      let frameTop = 0;
      let scaleX = 1;
      let scaleY = 1;

      if (iframe) {
        const fr = iframe.getBoundingClientRect();
        frameLeft = fr.left;
        frameTop = fr.top;
        const transform = getComputedStyle(iframe).transform;
        const match = transform.match(/matrix\((.+)\)/);
        const [sx, , , sy] = match?.[1]?.split(/\s*,\s*/)?.map((x) => parseFloat(x)) ?? [];
        if (Number.isFinite(sx) && sx! > 0) scaleX = sx!;
        if (Number.isFinite(sy) && sy! > 0) scaleY = sy!;
      }

      const toWebviewRect = (r: { left: number; top: number; right: number; bottom: number }) => ({
        left: scaleX * r.left + frameLeft,
        right: scaleX * r.right + frameLeft,
        top: scaleY * r.top + frameTop,
        bottom: scaleY * r.bottom + frameTop,
      });

      const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
      let node: Node | null;
      const collectedPieces: { text: string; top: number; left: number }[] = [];
      const fallbackTexts: string[] = [];

      while ((node = walker.nextNode())) {
        const textContent = node.textContent;
        if (!textContent || !textContent.trim()) continue;

        const parent = node.parentElement;
        if (parent) {
          const style = parent.ownerDocument.defaultView?.getComputedStyle(parent);
          if (style && (style.display === 'none' || style.visibility === 'hidden')) {
            continue;
          }
        }

        // Probe visual line boxes for this text node
        const probe = doc.createRange();
        let clientRects: DOMRect[] = [];
        try {
          probe.selectNodeContents(node);
          clientRects = Array.from(probe.getClientRects());
        } catch {
          // ignore probe error
        }

        // In environments without getClientRects (e.g. jsdom in tests), fallback to parent element rect
        if (clientRects.length === 0) {
          const parentRect = parent?.getBoundingClientRect?.();
          if (parentRect && parentRect.width > 0 && parentRect.height > 0) {
            const wr = toWebviewRect(parentRect);
            if (
              wr.right >= 0 &&
              wr.left <= containerWidth &&
              wr.bottom >= 0 &&
              wr.top <= containerHeight &&
              wr.right >= minX &&
              wr.left <= maxX &&
              wr.bottom >= minY &&
              wr.top <= maxY
            ) {
              const trimmed = textContent.trim();
              if (trimmed && !fallbackTexts.includes(trimmed)) {
                fallbackTexts.push(trimmed);
              }
            }
          }
          continue;
        }

        // Filter text nodes: must have at least one line box intersecting the lasso on the visible screen
        let nodeIntersectsLasso = false;
        for (const cr of clientRects) {
          const wr = toWebviewRect(cr);
          // Discard offscreen rects (e.g. columns on previous/next pages)
          if (
            wr.right < -5 ||
            wr.left > containerWidth + 5 ||
            wr.bottom < -5 ||
            wr.top > containerHeight + 5
          ) {
            continue;
          }
          if (wr.right >= minX && wr.left <= maxX && wr.bottom >= minY && wr.top <= maxY) {
            nodeIntersectsLasso = true;
            break;
          }
        }

        if (!nodeIntersectsLasso) continue;

        // Segment text into words or characters
        const len = textContent.length;
        let hasIntl = typeof Intl !== 'undefined' && typeof Intl.Segmenter !== 'undefined';
        const segments: { start: number; end: number; text: string }[] = [];

        if (hasIntl) {
          try {
            const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });
            for (const seg of segmenter.segment(textContent)) {
              if (seg.segment.trim().length > 0) {
                segments.push({
                  start: seg.index,
                  end: seg.index + seg.segment.length,
                  text: seg.segment,
                });
              }
            }
          } catch {
            hasIntl = false;
          }
        }

        if (!hasIntl || segments.length === 0) {
          for (let i = 0; i < len; i++) {
            if (textContent[i]?.trim()) {
              segments.push({ start: i, end: i + 1, text: textContent[i]! });
            }
          }
        }

        let nodeMatchedText = '';
        for (const seg of segments) {
          try {
            probe.setStart(node, seg.start);
            probe.setEnd(node, seg.end);
            const segRects = Array.from(probe.getClientRects());
            if (segRects.length === 0) continue;

            for (const sr of segRects) {
              const wr = toWebviewRect(sr);
              if (wr.right < -5 || wr.left > containerWidth + 5) continue;

              const midX = (wr.left + wr.right) / 2;
              const midY = (wr.top + wr.bottom) / 2;

              const insidePoly =
                polygonPoints.length >= 3 && isPointInPolygon(midX, midY, polygonPoints);
              const insideBbox = midX >= minX && midX <= maxX && midY >= minY && midY <= maxY;

              if (insidePoly || (polygonPoints.length < 3 && insideBbox)) {
                nodeMatchedText += seg.text;
                break;
              }
            }
          } catch {
            // ignore range error
          }
        }

        if (nodeMatchedText.trim().length > 0) {
          collectedPieces.push({
            text: nodeMatchedText.trim(),
            top: clientRects[0] ? toWebviewRect(clientRects[0]).top : 0,
            left: clientRects[0] ? toWebviewRect(clientRects[0]).left : 0,
          });
        }
      }

      if (collectedPieces.length > 0) {
        extractedText = collectedPieces
          .map((p) => p.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
        break;
      }

      if (fallbackTexts.length > 0) {
        extractedText = fallbackTexts.join(' ').replace(/\s+/g, ' ').trim();
        break;
      }
    }

    if (!extractedText) {
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
