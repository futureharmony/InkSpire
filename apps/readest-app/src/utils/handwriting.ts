import {
  HandwritingPoint,
  HandwritingStroke,
  HandwritingTextAnchor,
} from '@/types/handwriting';
import {
  getCaretPointFromPoint,
  getWordRangeFromPoint,
  getRangeRectInWebview,
} from '@/utils/sel';

/** Standard reference width for stroke sizing */
export const REFERENCE_WIDTH = 1000;

/** Convert screen pointer coordinate to normalized 0..1 point */
export function toNormalizedPoint(
  clientX: number,
  clientY: number,
  rect: { left: number; top: number; width: number; height: number },
  pressure = 0.5,
): HandwritingPoint {
  const width = Math.max(1, rect.width);
  const height = Math.max(1, rect.height);
  const x = Math.max(0, Math.min(1, (clientX - rect.left) / width));
  const y = Math.max(0, Math.min(1, (clientY - rect.top) / height));
  return {
    x,
    y,
    pressure: Math.max(0.1, Math.min(1, pressure || 0.5)),
    time: Date.now(),
  };
}

/** Convert normalized point back to pixel coordinates */
export function fromNormalizedPoint(
  point: HandwritingPoint,
  width: number,
  height: number,
): { x: number; y: number; pressure: number } {
  return {
    x: point.x * width,
    y: point.y * height,
    pressure: point.pressure ?? 0.5,
  };
}

/** Distance from point (px, py) to line segment (x1, y1)-(x2, y2) */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    return Math.hypot(px - x1, py - y1);
  }
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const nearestX = x1 + t * dx;
  const nearestY = y1 + t * dy;
  return Math.hypot(px - nearestX, py - nearestY);
}

/** Check if an eraser circle intersects with a stroke */
export function strokeIntersectsEraser(
  stroke: HandwritingStroke,
  eraserPoint: HandwritingPoint,
  width: number,
  height: number,
  eraserRadiusPx: number,
): boolean {
  if (stroke.points.length === 0) return false;

  const ex = eraserPoint.x * width;
  const ey = eraserPoint.y * height;
  const strokeWidth = (stroke.width * width) / REFERENCE_WIDTH;
  const hitThreshold = eraserRadiusPx + strokeWidth / 2;

  // Single point check
  if (stroke.points.length === 1) {
    const p = stroke.points[0]!;
    return Math.hypot(p.x * width - ex, p.y * height - ey) <= hitThreshold;
  }

  // Handle shapes
  if (stroke.tool === 'shape') {
    const p1 = stroke.points[0]!;
    const p2 = stroke.points[stroke.points.length - 1]!;
    const x1 = p1.x * width;
    const y1 = p1.y * height;
    const x2 = p2.x * width;
    const y2 = p2.y * height;

    if (stroke.shapeType === 'line' || stroke.shapeType === 'arrow') {
      return distanceToSegment(ex, ey, x1, y1, x2, y2) <= hitThreshold;
    }
    if (stroke.shapeType === 'rectangle') {
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      const minY = Math.min(y1, y2);
      const maxY = Math.max(y1, y2);
      // Check 4 sides of rectangle
      return (
        distanceToSegment(ex, ey, minX, minY, maxX, minY) <= hitThreshold ||
        distanceToSegment(ex, ey, maxX, minY, maxX, maxY) <= hitThreshold ||
        distanceToSegment(ex, ey, maxX, maxY, minX, maxY) <= hitThreshold ||
        distanceToSegment(ex, ey, minX, maxY, minX, minY) <= hitThreshold
      );
    }
    if (stroke.shapeType === 'ellipse') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      if (rx === 0 || ry === 0) return false;
      const normalizedDist = Math.hypot((ex - cx) / rx, (ey - cy) / ry);
      return Math.abs(normalizedDist - 1) * Math.min(rx, ry) <= hitThreshold;
    }
  }

  // Freehand path segments check
  for (let i = 0; i < stroke.points.length - 1; i++) {
    const p1 = stroke.points[i]!;
    const p2 = stroke.points[i + 1]!;
    const x1 = p1.x * width;
    const y1 = p1.y * height;
    const x2 = p2.x * width;
    const y2 = p2.y * height;
    if (distanceToSegment(ex, ey, x1, y1, x2, y2) <= hitThreshold) {
      return true;
    }
  }

  return false;
}

/** Snap a line to 0, 45, 90, 135, 180 degrees if close */
export function snapLine(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  snapThresholdDegrees = 7,
): { x2: number; y2: number } {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length === 0) return { x2, y2 };

  let angle = Math.atan2(dy, dx) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  const snapAngles = [0, 45, 90, 135, 180, 225, 270, 315, 360];
  for (const snap of snapAngles) {
    if (Math.abs(angle - snap) <= snapThresholdDegrees) {
      const rad = (snap * Math.PI) / 180;
      return {
        x2: x1 + length * Math.cos(rad),
        y2: y1 + length * Math.sin(rad),
      };
    }
  }
  return { x2, y2 };
}

/** Render a single stroke onto a 2D canvas context */
export function renderStrokeToCanvas(
  ctx: CanvasRenderingContext2D,
  stroke: HandwritingStroke,
  width: number,
  height: number,
): void {
  if (stroke.points.length === 0) return;

  ctx.save();

  const strokeScale = width / REFERENCE_WIDTH;
  const baseWidth = Math.max(1, stroke.width * strokeScale);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (stroke.tool === 'highlighter') {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity || 0.35;
    ctx.globalCompositeOperation = 'multiply';
    ctx.lineWidth = baseWidth * 2.5;
  } else if (stroke.tool === 'pencil') {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity || 0.85;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = Math.max(0.75, baseWidth * 0.8);
  } else if (stroke.tool === 'pen') {
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = stroke.color;
    ctx.globalAlpha = stroke.opacity || 1.0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = baseWidth;
  } else {
    // Shapes
    ctx.strokeStyle = stroke.color;
    ctx.fillStyle = 'transparent';
    ctx.globalAlpha = stroke.opacity || 1.0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = baseWidth;
  }

  // Handle Shapes
  if (stroke.tool === 'shape') {
    const p1 = stroke.points[0]!;
    const p2 = stroke.points[stroke.points.length - 1]!;
    const x1 = p1.x * width;
    const y1 = p1.y * height;
    let x2 = p2.x * width;
    let y2 = p2.y * height;

    if (stroke.shapeType === 'line' || stroke.shapeType === 'arrow') {
      const snapped = snapLine(x1, y1, x2, y2);
      x2 = snapped.x2;
      y2 = snapped.y2;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      if (stroke.shapeType === 'arrow') {
        const headLength = Math.max(12, baseWidth * 3.5);
        const angle = Math.atan2(y2 - y1, x2 - x1);
        ctx.beginPath();
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle - Math.PI / 6),
          y2 - headLength * Math.sin(angle - Math.PI / 6),
        );
        ctx.moveTo(x2, y2);
        ctx.lineTo(
          x2 - headLength * Math.cos(angle + Math.PI / 6),
          y2 - headLength * Math.sin(angle + Math.PI / 6),
        );
        ctx.stroke();
      }
    } else if (stroke.shapeType === 'rectangle') {
      const rx = Math.min(x1, x2);
      const ry = Math.min(y1, y2);
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      ctx.beginPath();
      ctx.rect(rx, ry, rw, rh);
      ctx.stroke();
    } else if (stroke.shapeType === 'ellipse') {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, Math.max(1, rx), Math.max(1, ry), 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }

  // Freehand Pen / Pencil / Highlighter
  const points = stroke.points;
  if (points.length === 1) {
    const p = points[0]!;
    const px = p.x * width;
    const py = p.y * height;
    ctx.beginPath();
    ctx.arc(px, py, baseWidth / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  // Smooth quadratic bezier curves
  if (stroke.tool === 'pen') {
    // Dynamic pressure-sensitive calligraphic line
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const x1 = p1.x * width;
      const y1 = p1.y * height;
      const x2 = p2.x * width;
      const y2 = p2.y * height;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const pressure = p2.pressure ?? 0.5;
      const segmentWidth = Math.max(0.5, baseWidth * (0.4 + 0.8 * pressure));

      ctx.lineWidth = segmentWidth;
      ctx.beginPath();
      if (i === 0) {
        ctx.moveTo(x1, y1);
        ctx.lineTo(midX, midY);
      } else {
        const prevMidX = (points[i - 1]!.x * width + x1) / 2;
        const prevMidY = (points[i - 1]!.y * height + y1) / 2;
        ctx.moveTo(prevMidX, prevMidY);
        ctx.quadraticCurveTo(x1, y1, midX, midY);
      }
      ctx.stroke();
    }
  } else {
    // Standard smoothed path for pencil / highlighter
    ctx.beginPath();
    const first = points[0]!;
    ctx.moveTo(first.x * width, first.y * height);

    for (let i = 1; i < points.length - 1; i++) {
      const p1 = points[i]!;
      const p2 = points[i + 1]!;
      const xc = (p1.x * width + p2.x * width) / 2;
      const yc = (p1.y * height + p2.y * height) / 2;
      ctx.quadraticCurveTo(p1.x * width, p1.y * height, xc, yc);
    }
    const last = points[points.length - 1]!;
    ctx.lineTo(last.x * width, last.y * height);
    ctx.stroke();
  }

  ctx.restore();
}

/** Render all strokes for a page onto canvas */
export function renderStrokesToCanvas(
  ctx: CanvasRenderingContext2D,
  strokes: HandwritingStroke[],
  width: number,
  height: number,
): void {
  ctx.clearRect(0, 0, width, height);
  for (const stroke of strokes) {
    renderStrokeToCanvas(ctx, stroke, width, height);
  }
}

/** Generate an SVG path data string for a freehand stroke */
export function strokeToSvgPath(
  stroke: HandwritingStroke,
  width: number,
  height: number,
): string {
  const points = stroke.points;
  if (points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0]!;
    const x = p.x * width;
    const y = p.y * height;
    return `M ${x - 0.5} ${y} A 0.5 0.5 0 1 0 ${x + 0.5} ${y} Z`;
  }

  let d = `M ${points[0]!.x * width} ${points[0]!.y * height}`;
  for (let i = 1; i < points.length - 1; i++) {
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const xc = (p1.x * width + p2.x * width) / 2;
    const yc = (p1.y * height + p2.y * height) / 2;
    d += ` Q ${p1.x * width} ${p1.y * height}, ${xc} ${yc}`;
  }
  const last = points[points.length - 1]!;
  d += ` L ${last.x * width} ${last.y * height}`;
  return d;
}

/** Convert all strokes of a page into a standalone, scalable SVG string */
export function strokesToSvg(
  strokes: HandwritingStroke[],
  width: number,
  height: number,
  options?: { isDarkMode?: boolean; transparentBg?: boolean },
): string {
  const strokeScale = width / REFERENCE_WIDTH;
  const elements: string[] = [];

  for (const stroke of strokes) {
    if (stroke.points.length === 0) continue;
    const baseWidth = Math.max(1, stroke.width * strokeScale);
    const strokeWidth = stroke.tool === 'highlighter' ? baseWidth * 2.5 : baseWidth;
    const opacity = stroke.tool === 'highlighter' ? 0.35 : stroke.opacity || 1.0;
    const blendMode = stroke.tool === 'highlighter' ? 'mix-blend-mode: multiply;' : '';

    if (stroke.tool === 'shape') {
      const p1 = stroke.points[0]!;
      const p2 = stroke.points[stroke.points.length - 1]!;
      const x1 = p1.x * width;
      const y1 = p1.y * height;
      let x2 = p2.x * width;
      let y2 = p2.y * height;

      if (stroke.shapeType === 'line' || stroke.shapeType === 'arrow') {
        const snapped = snapLine(x1, y1, x2, y2);
        x2 = snapped.x2;
        y2 = snapped.y2;
        elements.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke.color}" stroke-width="${strokeWidth}" stroke-linecap="round" opacity="${opacity}" />`,
        );
        if (stroke.shapeType === 'arrow') {
          const headLength = Math.max(12, strokeWidth * 3.5);
          const angle = Math.atan2(y2 - y1, x2 - x1);
          const leftX = x2 - headLength * Math.cos(angle - Math.PI / 6);
          const leftY = y2 - headLength * Math.sin(angle - Math.PI / 6);
          const rightX = x2 - headLength * Math.cos(angle + Math.PI / 6);
          const rightY = y2 - headLength * Math.sin(angle + Math.PI / 6);
          elements.push(
            `<polygon points="${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}" fill="${stroke.color}" opacity="${opacity}" />`,
          );
        }
      } else if (stroke.shapeType === 'rectangle') {
        const rx = Math.min(x1, x2);
        const ry = Math.min(y1, y2);
        const rw = Math.abs(x2 - x1);
        const rh = Math.abs(y2 - y1);
        elements.push(
          `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="none" stroke="${stroke.color}" stroke-width="${strokeWidth}" stroke-linejoin="round" opacity="${opacity}" />`,
        );
      } else if (stroke.shapeType === 'ellipse') {
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        elements.push(
          `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="none" stroke="${stroke.color}" stroke-width="${strokeWidth}" opacity="${opacity}" />`,
        );
      }
    } else {
      const d = strokeToSvgPath(stroke, width, height);
      if (d) {
        elements.push(
          `<path d="${d}" fill="none" stroke="${stroke.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" style="${blendMode}" />`,
        );
      }
    }
  }

  const bgRect = options?.transparentBg
    ? ''
    : `<rect width="${width}" height="${height}" fill="${options?.isDarkMode ? '#1a1a1a' : '#ffffff'}" />`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  ${bgRect}
  ${elements.join('\n  ')}
</svg>`;
}

/** Trigger browser/webview file download */
export function downloadFile(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 100);
}

/** Export current page as SVG */
export function exportPageAsSvg(
  strokes: HandwritingStroke[],
  width: number,
  height: number,
  filename = 'handwriting-note.svg',
  isDarkMode = false,
): void {
  const svg = strokesToSvg(strokes, width, height, { isDarkMode });
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  downloadFile(blob, filename);
}

/** Export current page as PNG */
export function exportPageAsPng(
  strokes: HandwritingStroke[],
  width: number,
  height: number,
  filename = 'handwriting-note.png',
  isDarkMode = false,
): void {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Background
  ctx.fillStyle = isDarkMode ? '#1a1a1a' : '#ffffff';
  ctx.fillRect(0, 0, width, height);

  // Render strokes
  renderStrokesToCanvas(ctx, strokes, width, height);

  canvas.toBlob((blob) => {
    if (blob) downloadFile(blob, filename);
  }, 'image/png');
}

/** Export all handwriting data as JSON */
export function exportBookAsJson(
  bookHash: string,
  pages: Record<number, HandwritingStroke[]>,
  filename?: string,
): void {
  const data = {
    version: 1,
    bookHash,
    exportedAt: Date.now(),
    pages,
  };
  const jsonStr = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8' });
  downloadFile(blob, filename || `handwriting-${bookHash}.json`);
}

/** Parse and import handwriting data from JSON */
export function importBookFromJson(
  jsonString: string,
): { bookHash?: string; pages: Record<number, HandwritingStroke[]> } | null {
  try {
    const data = JSON.parse(jsonString);
    if (!data || typeof data !== 'object') return null;
    const pages = data.pages || {};
    return {
      bookHash: data.bookHash,
      pages,
    };
  } catch (e) {
    console.error('Failed to parse handwriting JSON:', e);
    return null;
  }
}

/**
 * Generate a standalone PDF containing all handwritten pages.
 * Converts each page's strokes into high-res images and embeds them into a standard PDF 1.4 document.
 */
export async function exportBookAsPdf(
  bookTitle: string,
  pages: Record<number, HandwritingStroke[]>,
  pageWidth = 800,
  pageHeight = 1100,
  filename?: string,
  isDarkMode = false,
): Promise<void> {
  const sortedPageIndices = Object.keys(pages)
    .map(Number)
    .sort((a, b) => a - b)
    .filter((idx) => pages[idx] && pages[idx]!.length > 0);

  if (sortedPageIndices.length === 0) {
    throw new Error('No handwritten notes to export');
  }

  // Convert each page to JPEG data
  const pageImages: { index: number; jpegDataUrl: string }[] = [];
  for (const pageIdx of sortedPageIndices) {
    const strokes = pages[pageIdx]!;
    const canvas = document.createElement('canvas');
    canvas.width = pageWidth;
    canvas.height = pageHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    ctx.fillStyle = isDarkMode ? '#1a1a1a' : '#ffffff';
    ctx.fillRect(0, 0, pageWidth, pageHeight);

    // Page header info
    ctx.fillStyle = isDarkMode ? '#888888' : '#777777';
    ctx.font = '14px sans-serif';
    ctx.fillText(`${bookTitle} - Page ${pageIdx + 1}`, 30, 35);
    ctx.strokeStyle = isDarkMode ? '#333333' : '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, 45);
    ctx.lineTo(pageWidth - 30, 45);
    ctx.stroke();

    renderStrokesToCanvas(ctx, strokes, pageWidth, pageHeight);

    const jpegDataUrl = canvas.toDataURL('image/jpeg', 0.92);
    pageImages.push({ index: pageIdx, jpegDataUrl });
  }

  // Build minimalist, valid multi-page PDF document
  const pdfBlob = createSimpleImagePdf(pageImages, pageWidth, pageHeight);
  downloadFile(pdfBlob, filename || `${bookTitle}-handwriting-notes.pdf`);
}

/** Construct a compliant binary PDF 1.4 file from array of JPEG images */
function createSimpleImagePdf(
  images: { index: number; jpegDataUrl: string }[],
  pageWidth: number,
  pageHeight: number,
): Blob {
  const parts: BlobPart[] = [];
  let offset = 0;
  const xref: number[] = [0];

  function addString(s: string) {
    const bytes = new TextEncoder().encode(s);
    parts.push(bytes.buffer as ArrayBuffer);
    offset += bytes.length;
  }

  function addBytes(b: Uint8Array) {
    parts.push(b.buffer as ArrayBuffer);
    offset += b.length;
  }

  function recordObject(objNum: number) {
    xref[objNum] = offset;
    addString(`${objNum} 0 obj\n`);
  }

  addString('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  const numPages = images.length;
  // Obj 1: Catalog
  recordObject(1);
  addString('<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');

  // Obj 2: Pages
  const pageObjRefs: string[] = [];
  for (let i = 0; i < numPages; i++) {
    pageObjRefs.push(`${3 + i * 3} 0 R`);
  }
  recordObject(2);
  addString(
    `<< /Type /Pages /Kids [${pageObjRefs.join(' ')}] /Count ${numPages} >>\nendobj\n`,
  );

  // For each page:
  // Obj 3 + i*3: Page
  // Obj 4 + i*3: Content stream
  // Obj 5 + i*3: Image XObject
  for (let i = 0; i < numPages; i++) {
    const pageObjNum = 3 + i * 3;
    const contentObjNum = 4 + i * 3;
    const imgObjNum = 5 + i * 3;
    const img = images[i]!;

    // Decode base64 JPEG
    const base64Data = img.jpegDataUrl.split(',')[1]!;
    const binaryStr = atob(base64Data);
    const jpegBytes = new Uint8Array(binaryStr.length);
    for (let b = 0; b < binaryStr.length; b++) {
      jpegBytes[b] = binaryStr.charCodeAt(b);
    }

    // Page Object
    recordObject(pageObjNum);
    addString(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Contents ${contentObjNum} 0 R /Resources << /XObject << /Im${i} ${imgObjNum} 0 R >> >> >>\nendobj\n`,
    );

    // Content Stream
    const contentStream = `q\n${pageWidth} 0 0 ${pageHeight} 0 0 cm\n/Im${i} Do\nQ\n`;
    recordObject(contentObjNum);
    addString(
      `<< /Length ${contentStream.length} >>\nstream\n${contentStream}\nendstream\nendobj\n`,
    );

    // Image XObject
    recordObject(imgObjNum);
    addString(
      `<< /Type /XObject /Subtype /Image /Width ${pageWidth} /Height ${pageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
    );
    addBytes(jpegBytes);
    addString('\nendstream\nendobj\n');
  }

  // Cross-reference table
  const startXref = offset;
  addString(`xref\n0 ${xref.length}\n`);
  addString('0000000000 65535 f \n');
  for (let i = 1; i < xref.length; i++) {
    const off = String(xref[i]!).padStart(10, '0');
    addString(`${off} 00000 n \n`);
  }

  // Trailer
  addString(
    `trailer\n<< /Size ${xref.length} /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`,
  );

  return new Blob(parts, { type: 'application/pdf' });
}

/**
 * Extracts underlying text anchor (snippet, CFI, section, normalized rect)
 * for a stroke by hit-testing into rendered document contents.
 */
export function extractTextAnchorForStroke(
  view: unknown,
  stroke: HandwritingStroke,
  containerWidth: number,
  containerHeight: number,
  containerRect?: { left: number; top: number; width: number; height: number } | null,
): HandwritingTextAnchor | undefined {
  if (!view || !stroke.points || stroke.points.length === 0) return undefined;

  const foliateView = view as {
    renderer?: {
      getContents?: () => Array<{ doc: Document; index: number }>;
    };
    getCFI?: (sectionIndex: number, range: Range) => string;
  };

  const getContents = foliateView.renderer?.getContents;
  if (typeof getContents !== 'function') return undefined;

  const contents = getContents.call(foliateView.renderer);
  if (!Array.isArray(contents) || contents.length === 0) return undefined;

  const cLeft = containerRect?.left ?? 0;
  const cTop = containerRect?.top ?? 0;

  // Compute bounding box and center
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const p of stroke.points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // Sample points to probe: Center, Start, and End
  const samplePoints: Array<{ x: number; y: number }> = [
    { x: cLeft + centerX * containerWidth, y: cTop + centerY * containerHeight },
    {
      x: cLeft + stroke.points[0]!.x * containerWidth,
      y: cTop + stroke.points[0]!.y * containerHeight,
    },
    {
      x: cLeft + stroke.points[stroke.points.length - 1]!.x * containerWidth,
      y: cTop + stroke.points[stroke.points.length - 1]!.y * containerHeight,
    },
  ];

  for (const sample of samplePoints) {
    for (const item of contents) {
      const { doc, index: sectionIndex } = item;
      if (!doc) continue;

      const frame = doc.defaultView?.frameElement?.getBoundingClientRect();
      if (
        frame &&
        (sample.x < frame.left ||
          sample.x > frame.right ||
          sample.y < frame.top ||
          sample.y > frame.bottom)
      ) {
        continue;
      }

      const docX = sample.x - (frame?.left ?? 0);
      const docY = sample.y - (frame?.top ?? 0);

      try {
        let range: Range | null = null;

        // Try getting word range from point
        range = getWordRangeFromPoint(doc, docX, docY);

        if (!range) {
          const caret = getCaretPointFromPoint(doc, docX, docY);
          if (caret?.node && caret.node.nodeType === Node.TEXT_NODE) {
            range = doc.createRange();
            const textNode = caret.node as Text;
            const start = Math.max(0, caret.offset - 15);
            const end = Math.min(textNode.length, caret.offset + 25);
            range.setStart(textNode, start);
            range.setEnd(textNode, end);
          }
        }

        if (range) {
          const text = range.toString().trim();
          if (text.length > 0) {
            let snippet = text;
            const containerNode = range.commonAncestorContainer;
            if (snippet.length < 20 && containerNode.textContent) {
              const fullText = containerNode.textContent.trim();
              if (fullText.length > 0) {
                snippet = fullText.slice(0, 80);
              }
            } else if (snippet.length > 80) {
              snippet = snippet.slice(0, 80);
            }

            let cfi: string | undefined;
            if (typeof foliateView.getCFI === 'function') {
              try {
                cfi = foliateView.getCFI(sectionIndex, range);
              } catch {
                // ignore
              }
            }

            let boundingRect:
              | { left: number; top: number; right: number; bottom: number }
              | undefined;
            try {
              const rangeRect = getRangeRectInWebview(range);
              if (rangeRect) {
                boundingRect = {
                  left: Math.max(0, Math.min(1, (rangeRect.left - cLeft) / containerWidth)),
                  top: Math.max(0, Math.min(1, (rangeRect.top - cTop) / containerHeight)),
                  right: Math.max(0, Math.min(1, (rangeRect.right - cLeft) / containerWidth)),
                  bottom: Math.max(0, Math.min(1, (rangeRect.bottom - cTop) / containerHeight)),
                };
              }
            } catch {
              // ignore rect calculation in environments lacking full layout
            }

            return {
              textSnippet: snippet,
              cfi,
              sectionIndex,
              boundingRect,
            };
          }
        }
      } catch {
        // hit testing in cross-origin / detached doc failed
      }
    }
  }

  return undefined;
}

