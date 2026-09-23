export type HandwritingTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'shape';

export type HandwritingShapeType = 'line' | 'rectangle' | 'ellipse' | 'arrow';

export type HandwritingEraserType = 'stroke' | 'area';

export interface HandwritingPoint {
  /** Normalized X coordinate (0 to 1 relative to container width) */
  x: number;
  /** Normalized Y coordinate (0 to 1 relative to container height) */
  y: number;
  /** Stylus pressure (0 to 1) */
  pressure?: number;
  /** Timestamp in ms */
  time?: number;
}

export interface HandwritingStroke {
  id: string;
  tool: HandwritingTool;
  shapeType?: HandwritingShapeType;
  color: string;
  /** Base width in pixels at standard 1000px width */
  width: number;
  /** Opacity (0 to 1) */
  opacity: number;
  points: HandwritingPoint[];
  /** 0-based page or section index */
  pageIndex: number;
  /** Canonical CFI if available */
  cfi?: string;
  createdAt: number;
  updatedAt: number;
}

export interface HandwritingPageData {
  pageIndex: number;
  strokes: HandwritingStroke[];
  aspectRatio?: number;
  updatedAt: number;
}

export interface HandwritingBookData {
  version: 1;
  bookHash: string;
  pages: Record<number, HandwritingStroke[]>;
  updatedAt: number;
}

export type HandwritingExportFormat = 'pdf' | 'svg' | 'png' | 'json';
