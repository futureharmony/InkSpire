import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useReaderStore } from '@/store/readerStore';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useThemeStore } from '@/store/themeStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { Insets } from '@/types/misc';
import {
  HandwritingPoint,
  HandwritingStroke,
  HandwritingStickyNote,
} from '@/types/handwriting';
import {
  fromNormalizedPoint,
  renderStrokeToCanvas,
  snapLine,
  strokeIntersectsEraser,
  eraseStrokePartially,
  strokeToSvgPath,
  strokeToCalligraphicPath,
  toNormalizedPoint,
  extractTextAnchorForStroke,
  REFERENCE_WIDTH,
} from '@/utils/handwriting';
import {
  initBookHandwriting,
  persistPageHandwriting,
  persistPageStickyNotes,
} from '@/services/handwritingService';
import { extractTextFromStroke, ExtractedTextResult } from '@/utils/lassoTextSelector';
import HandwritingToolbar from './HandwritingToolbar';
import { StickyNoteCard } from './StickyNoteCard';
import { LassoActionMenu } from './LassoActionMenu';
import { uniqueId } from '@/utils/misc';

interface HandwritingLayerProps {
  bookKey: string;
  contentInsets: Insets;
}

export const HandwritingLayer: React.FC<HandwritingLayerProps> = ({
  bookKey,
  contentInsets,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStrokePoints = useRef<HandwritingPoint[]>([]);
  const isDrawing = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 1200 });
  const [lassoSelection, setLassoSelection] = useState<ExtractedTextResult | null>(null);

  const bookHash = bookKey.split('-')[0]!;
  const view = useReaderStore((s) => s.getView(bookKey));
  const { isDarkMode } = useThemeStore();
  const progress = useBookProgress(bookKey);
  const bookData = useBookDataStore((s) => s?.booksData?.[bookHash]);
  const isFixedLayout = bookData?.isFixedLayout ?? false;

  const {
    activeBookKey,
    currentTool,
    currentShape,
    currentColor,
    currentWidth,
    currentOpacity,
    eraserType,
    eraserRadius,
    stylusOnly,
    currentPageIndex,
    setCurrentPageIndex,
    addStroke,
    removeStroke,
    setPageStrokes,
    getPageStrokes,
    addStickyNote,
    getStickyNotes,
  } = useHandwritingStore();

  const isActive = activeBookKey === bookKey;
  const currentStrokes = getPageStrokes(bookHash, currentPageIndex);

  // Initialize book handwriting data once
  useEffect(() => {
    initBookHandwriting(bookKey, bookHash);
  }, [bookKey, bookHash]);

  // Synchronize page index reactively from useBookProgress
  useEffect(() => {
    if (!progress) return;
    const pageInfo = isFixedLayout ? progress.section : progress.pageinfo;
    const currentIdx =
      pageInfo?.current ??
      (typeof progress.page === 'number' && progress.page > 0
        ? progress.page - 1
        : 0);
    if (
      typeof currentIdx === 'number' &&
      !Number.isNaN(currentIdx) &&
      currentIdx !== currentPageIndex
    ) {
      setCurrentPageIndex(currentIdx);
    }
  }, [progress, isFixedLayout, currentPageIndex, setCurrentPageIndex]);

  // Track page index from Foliate relocate events
  useEffect(() => {
    if (!view) return;
    const handleRelocate = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;
      let index: number | undefined;
      if (typeof detail.index === 'number') {
        index = detail.index;
      } else if (isFixedLayout && detail.section && typeof detail.section.current === 'number') {
        index = detail.section.current;
      } else if (detail.location && typeof detail.location.current === 'number') {
        index = detail.location.current;
      } else if (detail.section && typeof detail.section.current === 'number') {
        index = detail.section.current;
      } else if (typeof detail.page === 'number') {
        index = detail.page - 1;
      }
      if (typeof index === 'number' && !Number.isNaN(index) && index !== currentPageIndex) {
        setCurrentPageIndex(index);
      }
    };

    view.addEventListener('relocate', handleRelocate);
    return () => {
      view.removeEventListener('relocate', handleRelocate);
    };
  }, [view, isFixedLayout, currentPageIndex, setCurrentPageIndex]);

  // Clear active drawing canvas buffer when changing pages
  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
    }
    currentStrokePoints.current = [];
    isDrawing.current = false;
  }, [currentPageIndex, dimensions.width, dimensions.height]);

  // Keep dimensions synced with container
  useEffect(() => {
    const updateSize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setDimensions({
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Eraser helper: supports both full stroke eraser and partial eraser
  const handleEraserAt = useCallback(
    (point: HandwritingPoint) => {
      const { width, height } = dimensions;
      const strokes = getPageStrokes(bookHash, currentPageIndex);

      if (eraserType === 'partial') {
        // Partial mode: only erase covered part, keep remaining parts
        let hasModified = false;
        const newStrokes: HandwritingStroke[] = [];

        for (const stroke of strokes) {
          const splitResult = eraseStrokePartially(stroke, point, width, height, eraserRadius);
          if (splitResult !== null) {
            hasModified = true;
            newStrokes.push(...splitResult);
          } else {
            newStrokes.push(stroke);
          }
        }

        if (hasModified) {
          setPageStrokes(bookHash, currentPageIndex, newStrokes);
          persistPageHandwriting(
            bookKey,
            bookHash,
            currentPageIndex,
            newStrokes,
            progress?.location,
          );
        }
      } else {
        // Stroke mode (default): clear entire stroke on touch
        for (const stroke of strokes) {
          if (strokeIntersectsEraser(stroke, point, width, height, eraserRadius)) {
            removeStroke(bookHash, currentPageIndex, stroke.id);
            const updated = getPageStrokes(bookHash, currentPageIndex).filter(
              (s) => s.id !== stroke.id,
            );
            persistPageHandwriting(
              bookKey,
              bookHash,
              currentPageIndex,
              updated,
              progress?.location,
            );
            break;
          }
        }
      }
    },
    [
      bookHash,
      bookKey,
      currentPageIndex,
      dimensions,
      eraserRadius,
      eraserType,
      getPageStrokes,
      progress?.location,
      removeStroke,
      setPageStrokes,
    ],
  );

  // Pointer event handlers on active drawing canvas
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;

    // Dismiss existing lasso selection on new interaction
    if (lassoSelection) {
      setLassoSelection(null);
    }

    // Palm rejection: if stylusOnly is true, track touch for gestures, don't draw
    if (stylusOnly && e.pointerType === 'touch') {
      touchStartPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      try {
        canvasRef.current?.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    isDrawing.current = true;
    const pt = toNormalizedPoint(e.clientX, e.clientY, rect, e.pressure);
    currentStrokePoints.current = [pt];

    if (currentTool === 'eraser') {
      handleEraserAt(pt);
      return;
    }

    // Capture pointer
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }

    // Render initial point on active canvas
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (currentTool === 'lasso') {
      return;
    }

    const activeColor =
      currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

    const tempStroke: HandwritingStroke = {
      id: 'temp',
      tool: currentTool,
      shapeType: currentTool === 'shape' ? currentShape : undefined,
      color: activeColor,
      width: currentWidth,
      opacity: currentOpacity,
      points: currentStrokePoints.current,
      pageIndex: currentPageIndex,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    renderStrokeToCanvas(ctx, tempStroke, dimensions.width, dimensions.height);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;

    if (stylusOnly && e.pointerType === 'touch') {
      // Track touch for swipe gesture, no drawing
      return;
    }

    if (!isDrawing.current) return;

    e.preventDefault();
    e.stopPropagation();

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    const pt = toNormalizedPoint(e.clientX, e.clientY, rect, e.pressure);

    if (currentTool === 'eraser') {
      handleEraserAt(pt);
      return;
    }

    currentStrokePoints.current.push(pt);

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, dimensions.width, dimensions.height);

    if (currentTool === 'lasso') {
      ctx.save();
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      for (let i = 0; i < currentStrokePoints.current.length; i++) {
        const p = fromNormalizedPoint(currentStrokePoints.current[i]!, dimensions.width, dimensions.height);
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    const activeColor =
      currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

    const tempStroke: HandwritingStroke = {
      id: 'temp',
      tool: currentTool,
      shapeType: currentTool === 'shape' ? currentShape : undefined,
      color: activeColor,
      width: currentWidth,
      opacity: currentOpacity,
      points: currentStrokePoints.current,
      pageIndex: currentPageIndex,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    renderStrokeToCanvas(ctx, tempStroke, dimensions.width, dimensions.height);
  };

  const finishDrawing = (e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isActive) return;

    // Handle touch swipe & tap gesture when stylusOnly is active
    if (stylusOnly && e?.pointerType === 'touch' && touchStartPos.current) {
      try {
        if (e && canvasRef.current?.hasPointerCapture(e.pointerId)) {
          canvasRef.current.releasePointerCapture(e.pointerId);
        }
      } catch {
        // ignore
      }
      const deltaX = e.clientX - touchStartPos.current.x;
      const deltaY = e.clientY - touchStartPos.current.y;
      const duration = Date.now() - touchStartPos.current.time;
      touchStartPos.current = null;

      if (duration < 800 && Math.abs(deltaY) < 160) {
        if (deltaX < -50) {
          // Native Foliate turn forward (page index synced by relocate)
          view?.next();
          return;
        } else if (deltaX > 50) {
          // Native Foliate turn backward (page index synced by relocate)
          view?.prev();
          return;
        } else if (Math.abs(deltaX) < 25 && Math.abs(deltaY) < 25) {
          // Tap: block margin tap turn; only center tap toggles navigation
          const rect = canvasRef.current?.getBoundingClientRect();
          if (rect) {
            const relX = (e.clientX - rect.left) / rect.width;
            if (relX >= 0.25 && relX <= 0.75) {
              const hovered = useReaderStore.getState().hoveredBookKey;
              useReaderStore.getState().setHoveredBookKey(hovered === bookKey ? '' : bookKey);
            }
          }
          return;
        }
      }
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;

    const canvas = canvasRef.current;
    if (canvas && e) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    if (currentTool === 'eraser') {
      currentStrokePoints.current = [];
      return;
    }

    const points = currentStrokePoints.current;
    if (points.length === 0) return;

    // Lasso text selection mode: inspect underlying text and summon menu
    if (currentTool === 'lasso') {
      const pts = [...points];
      currentStrokePoints.current = [];
      const ctx = canvas?.getContext('2d');
      ctx?.clearRect(0, 0, dimensions.width, dimensions.height);

      if (pts.length > 2) {
        const extracted = extractTextFromStroke(
          pts,
          dimensions.width,
          dimensions.height,
          view,
        );
        if (extracted && extracted.text.trim().length > 0) {
          setLassoSelection(extracted);
        }
      }
      return;
    }

    const activeColor =
      currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

    // Extract underlying text anchor if book has extractable text
    const textAnchor = extractTextAnchorForStroke(
      view,
      {
        id: '',
        tool: currentTool,
        shapeType: currentTool === 'shape' ? currentShape : undefined,
        color: activeColor,
        width: currentWidth,
        opacity: currentOpacity,
        points,
        pageIndex: currentPageIndex,
        createdAt: 0,
        updatedAt: 0,
      },
      dimensions.width,
      dimensions.height,
      canvasRef.current?.getBoundingClientRect(),
    );

    const newStroke: HandwritingStroke = {
      id: uniqueId(),
      tool: currentTool,
      shapeType: currentTool === 'shape' ? currentShape : undefined,
      color: activeColor,
      width: currentWidth,
      opacity: currentOpacity,
      points: [...points],
      pageIndex: currentPageIndex,
      cfi: textAnchor?.cfi || progress?.location,
      textAnchor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    addStroke(bookHash, currentPageIndex, newStroke);

    const updated = [...getPageStrokes(bookHash, currentPageIndex), newStroke];
    persistPageHandwriting(
      bookKey,
      bookHash,
      currentPageIndex,
      updated,
      progress?.location,
    );

    currentStrokePoints.current = [];
    const ctx = canvas?.getContext('2d');
    ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
  };

  const handleCreateStickyNote = (text: string, x: number, y: number) => {
    const newNote: HandwritingStickyNote = {
      id: uniqueId(),
      bookHash,
      pageIndex: currentPageIndex,
      x: Math.max(0.05, Math.min(0.75, x)),
      y: Math.max(0.05, Math.min(0.75, y)),
      color: 'yellow',
      content: '',
      selectedText: text,
      isPinned: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addStickyNote(bookHash, currentPageIndex, newNote);
    persistPageStickyNotes(bookHash, currentPageIndex, [
      ...getStickyNotes(bookHash, currentPageIndex),
      newNote,
    ]);
    setLassoSelection(null);
  };

  const handleHighlightText = (_text: string) => {
    if (!lassoSelection) return;
    const b = lassoSelection.boundingRect;
    const midY = (b.top + b.bottom) / 2;
    const highlightStroke: HandwritingStroke = {
      id: uniqueId(),
      tool: 'highlighter',
      color: '#facc15',
      width: 14,
      opacity: 0.35,
      points: [
        { x: b.left, y: midY, pressure: 0.8 },
        { x: b.right, y: midY, pressure: 0.8 },
      ],
      pageIndex: currentPageIndex,
      cfi: progress?.location,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addStroke(bookHash, currentPageIndex, highlightStroke);
    const updated = [...getPageStrokes(bookHash, currentPageIndex), highlightStroke];
    persistPageHandwriting(
      bookKey,
      bookHash,
      currentPageIndex,
      updated,
      progress?.location,
    );
    setLassoSelection(null);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    finishDrawing(e);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    finishDrawing(e);
  };

  const { width, height } = dimensions;
  const strokeScale = width / REFERENCE_WIDTH;

  // Reusable stroke renderer for current and adjacent pages
  const renderStrokes = (strokes: HandwritingStroke[], keyPrefix: string) => {
    return strokes.map((stroke) => {
      if (stroke.points.length === 0) return null;
      const baseWidth = Math.max(1, stroke.width * strokeScale);
      const strokeWidth =
        stroke.tool === 'highlighter' ? baseWidth * 2.5 : baseWidth;
      const opacity =
        stroke.tool === 'highlighter' ? 0.35 : stroke.opacity || 1.0;
      const blendStyle: React.CSSProperties =
        stroke.tool === 'highlighter'
          ? { mixBlendMode: isDarkMode ? 'screen' : 'multiply' }
          : {};

      if (stroke.tool === 'shape') {
        const p1 = fromNormalizedPoint(stroke.points[0]!, width, height);
        const p2 = fromNormalizedPoint(
          stroke.points[stroke.points.length - 1]!,
          width,
          height,
        );

        if (stroke.shapeType === 'line' || stroke.shapeType === 'arrow') {
          const snapped = snapLine(p1.x, p1.y, p2.x, p2.y);
          const x2 = snapped.x2;
          const y2 = snapped.y2;

          let arrowHead: React.ReactNode = null;
          if (stroke.shapeType === 'arrow') {
            const headLength = Math.max(12, strokeWidth * 3.5);
            const angle = Math.atan2(y2 - p1.y, x2 - p1.x);
            const lx = x2 - headLength * Math.cos(angle - Math.PI / 6);
            const ly = y2 - headLength * Math.sin(angle - Math.PI / 6);
            const rx = x2 - headLength * Math.cos(angle + Math.PI / 6);
            const ry = y2 - headLength * Math.sin(angle + Math.PI / 6);
            arrowHead = (
              <polygon
                points={`${x2},${y2} ${lx},${ly} ${rx},${ry}`}
                fill={stroke.color}
                opacity={opacity}
              />
            );
          }

          return (
            <g key={`${keyPrefix}_${stroke.id}`}>
              <line
                x1={p1.x}
                y1={p1.y}
                x2={x2}
                y2={y2}
                stroke={stroke.color}
                strokeWidth={strokeWidth}
                strokeLinecap='round'
                opacity={opacity}
              />
              {arrowHead}
            </g>
          );
        }

        if (stroke.shapeType === 'rectangle') {
          const rx = Math.min(p1.x, p2.x);
          const ry = Math.min(p1.y, p2.y);
          const rw = Math.abs(p2.x - p1.x);
          const rh = Math.abs(p2.y - p1.y);
          return (
            <rect
              key={`${keyPrefix}_${stroke.id}`}
              x={rx}
              y={ry}
              width={rw}
              height={rh}
              fill='none'
              stroke={stroke.color}
              strokeWidth={strokeWidth}
              strokeLinejoin='round'
              opacity={opacity}
            />
          );
        }

        if (stroke.shapeType === 'ellipse') {
          const cx = (p1.x + p2.x) / 2;
          const cy = (p1.y + p2.y) / 2;
          const rx = Math.abs(p2.x - p1.x) / 2;
          const ry = Math.abs(p2.y - p1.y) / 2;
          return (
            <ellipse
              key={`${keyPrefix}_${stroke.id}`}
              cx={cx}
              cy={cy}
              rx={rx}
              ry={ry}
              fill='none'
              stroke={stroke.color}
              strokeWidth={strokeWidth}
              opacity={opacity}
            />
          );
        }
      }

      // Freehand tools: pen (calligraphic filled ribbon), pencil (fine textured line), highlighter (broad translucent)
      if (stroke.tool === 'pen') {
        const d = strokeToCalligraphicPath(stroke, width, height);
        return (
          <path
            key={`${keyPrefix}_${stroke.id}`}
            d={d}
            fill={stroke.color}
            stroke={stroke.color}
            strokeWidth={0.5}
            opacity={stroke.opacity || 1.0}
          />
        );
      }

      if (stroke.tool === 'pencil') {
        const d = strokeToSvgPath(stroke, width, height);
        const pencilWidth = Math.max(0.75, baseWidth * 0.5);
        return (
          <path
            key={`${keyPrefix}_${stroke.id}`}
            d={d}
            fill='none'
            stroke={stroke.color}
            strokeWidth={pencilWidth}
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity={0.78}
            filter='url(#inkspire-pencil-grain)'
          />
        );
      }

      if (stroke.tool === 'highlighter') {
        const d = strokeToSvgPath(stroke, width, height);
        const highlighterWidth = baseWidth * 2.8;
        return (
          <path
            key={`${keyPrefix}_${stroke.id}`}
            d={d}
            fill='none'
            stroke={stroke.color}
            strokeWidth={highlighterWidth}
            strokeLinecap='round'
            strokeLinejoin='round'
            opacity={0.35}
            style={blendStyle}
          />
        );
      }

      const d = strokeToSvgPath(stroke, width, height);
      return (
        <path
          key={`${keyPrefix}_${stroke.id}`}
          d={d}
          fill='none'
          stroke={stroke.color}
          strokeWidth={strokeWidth}
          strokeLinecap='round'
          strokeLinejoin='round'
          opacity={opacity}
          style={blendStyle}
        />
      );
    });
  };

  const svgDefs = (
    <defs>
      <filter id='inkspire-pencil-grain' x='-20%' y='-20%' width='140%' height='140%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' result='noise' />
        <feDisplacementMap in='SourceGraphic' in2='noise' scale='1.2' xChannelSelector='R' yChannelSelector='G' result='displaced' />
        <feColorMatrix type='matrix' values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.85 0' in='displaced' />
      </filter>
    </defs>
  );

  return (
    <div
      ref={containerRef}
      className='absolute inset-0 pointer-events-none z-20 overflow-hidden'
      style={{
        paddingTop: contentInsets.top,
        paddingRight: contentInsets.right,
        paddingBottom: contentInsets.bottom,
        paddingLeft: contentInsets.left,
      }}
    >
      {/* 1. Synchronized SVG Layer for current page strokes */}
      <svg
        className='absolute inset-0 w-full h-full pointer-events-none'
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio='none'
      >
        {svgDefs}
        {renderStrokes(currentStrokes, 'curr')}
      </svg>

      {/* 2. Interactive Sticky Notes */}
      {getStickyNotes(bookHash, currentPageIndex).map((note) => (
        <StickyNoteCard
          key={note.id}
          note={note}
          containerWidth={width}
          containerHeight={height}
          bookHash={bookHash}
          pageIndex={currentPageIndex}
        />
      ))}

      {/* 3. Lasso Action Menu for Selected Text */}
      {lassoSelection && (
        <LassoActionMenu
          selection={lassoSelection}
          containerWidth={width}
          containerHeight={height}
          onCreateStickyNote={handleCreateStickyNote}
          onHighlightText={handleHighlightText}
          onClose={() => setLassoSelection(null)}
        />
      )}

      {/* 4. Active drawing canvas layer */}
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className={
          isActive
            ? 'absolute inset-0 w-full h-full pointer-events-auto cursor-crosshair touch-none'
            : 'hidden pointer-events-none'
        }
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
      />

      {/* 5. Floating Handwriting Toolbar */}
      <HandwritingToolbar
        bookKey={bookKey}
        containerWidth={width}
        containerHeight={height}
        contentInsets={contentInsets}
      />
    </div>
  );
};
export default HandwritingLayer;
