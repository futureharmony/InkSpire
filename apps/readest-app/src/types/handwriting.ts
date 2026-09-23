export type HandwritingTool = 'pen' | 'pencil' | 'highlighter' | 'eraser' | 'shape' | 'lasso';

export type HandwritingShapeType = 'line' | 'rectangle' | 'ellipse' | 'arrow';

export type HandwritingEraserType = 'stroke' | 'partial' | 'area';

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

export interface HandwritingTextAnchor {
  /** The text snippet underlying or closest to the stroke (e.g. 1-100 characters) */
  textSnippet: string;
  /** Canonical CFI pointing directly to the anchor text range (if available) */
  cfi?: string;
  /** Section / spine index in the book */
  sectionIndex?: number;
  /** Normalized bounding rect of the text in view (0..1) */
  boundingRect?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
  };
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
  /** Extra association with underlying text if parseable */
  textAnchor?: HandwritingTextAnchor;
  createdAt: number;
  updatedAt: number;
}

export type StickyNoteColor = 'yellow' | 'green' | 'blue' | 'pink' | 'slate';

export interface HandwritingStickyNote {
  id: string;
  bookHash: string;
  pageIndex: number;
  /** Normalized coordinates (0..1) relative to page */
  x: number;
  y: number;
  /** Selected or underlying text snippet */
  selectedText?: string;
  /** Typed note text */
  content: string;
  /** Handwritten doodle strokes inside the sticky note card */
  strokes?: HandwritingStroke[];
  /** Color theme */
  color: StickyNoteColor;
  /** Minimized to margin pin */
  isPinned?: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HandwritingPageData {
  pageIndex: number;
  strokes: HandwritingStroke[];
  stickyNotes?: HandwritingStickyNote[];
  aspectRatio?: number;
  updatedAt: number;
}

export interface HandwritingBookData {
  version: 1;
  bookHash: string;
  pages: Record<number, HandwritingStroke[]>;
  stickyNotes?: Record<number, HandwritingStickyNote[]>;
  updatedAt: number;
}

export type HandwritingExportFormat = 'pdf' | 'svg' | 'png' | 'json';
