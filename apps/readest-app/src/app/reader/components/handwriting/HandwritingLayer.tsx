import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LuUndo2, LuRedo2 } from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { useReaderStore } from '@/store/readerStore';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useThemeStore } from '@/store/themeStore';
import { useBookProgress } from '@/store/readerProgressStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useSidebarStore } from '@/store/sidebarStore';
import { eventDispatcher } from '@/utils/event';
import { Insets } from '@/types/misc';
import {
  HandwritingPoint,
  HandwritingStroke,
  HandwritingStickyNote,
  HandwritingTextAnchor,
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
  extractVisiblePageText,
  REFERENCE_WIDTH,
} from '@/utils/handwriting';
import {
  initBookHandwriting,
  persistPageHandwriting,
  persistPageStickyNotes,
} from '@/services/handwritingService';
import { captureAndSavePageSnapshot } from '@/services/handwritingSnapshotService';
import { extractTextFromStroke, ExtractedTextResult } from '@/utils/lassoTextSelector';
import {
  detectScratchOutGesture,
  detectClosedLoopGesture,
  snapUnderlineToText,
  resolveTextAnchorDelta,
} from '@/utils/gestureRecognizer';
import { StickyNoteCard } from './StickyNoteCard';
import { LassoActionMenu } from './LassoActionMenu';
import { uniqueId } from '@/utils/misc';

function segmentIntersectsBox(
  p1: HandwritingPoint,
  p2: HandwritingPoint,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): boolean {
  if (p1.x >= minX && p1.x <= maxX && p1.y >= minY && p1.y <= maxY) return true;
  if (p2.x >= minX && p2.x <= maxX && p2.y >= minY && p2.y <= maxY) return true;

  const intersect = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    x3: number,
    y3: number,
    x4: number,
    y4: number,
  ) => {
    const denom = (y4 - y3) * (x2 - x1) - (x4 - x3) * (y2 - y1);
    if (denom === 0) return false;
    const ua = ((x4 - x3) * (y1 - y3) - (y4 - y3) * (x1 - x3)) / denom;
    const ub = ((x2 - x1) * (y1 - y3) - (y2 - y1) * (x1 - x3)) / denom;
    return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
  };

  return (
    intersect(p1.x, p1.y, p2.x, p2.y, minX, minY, maxX, minY) ||
    intersect(p1.x, p1.y, p2.x, p2.y, minX, maxY, maxX, maxY) ||
    intersect(p1.x, p1.y, p2.x, p2.y, minX, minY, minX, maxY) ||
    intersect(p1.x, p1.y, p2.x, p2.y, maxX, minY, maxX, maxY)
  );
}

interface HandwritingLayerProps {
  bookKey: string;
  contentInsets: Insets;
}

export const HandwritingLayer: React.FC<HandwritingLayerProps> = ({ bookKey, contentInsets }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const currentStrokePoints = useRef<HandwritingPoint[]>([]);
  const isDrawing = useRef(false);
  const touchStartPos = useRef<{ x: number; y: number; time: number } | null>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 1200 });
  const [lassoSelection, setLassoSelection] = useState<ExtractedTextResult | null>(null);
  const [glowSelection, setGlowSelection] = useState<{
    rect: { left: number; top: number; right: number; bottom: number };
    timestamp: number;
  } | null>(null);
  const glowTimer = useRef<NodeJS.Timeout | null>(null);
  const [gestureToast, setGestureToast] = useState<'undo' | 'redo' | null>(null);
  const gestureToastTimer = useRef<NodeJS.Timeout | null>(null);
  const activeTouchesRef = useRef<
    Map<number, { startX: number; startY: number; currX: number; currY: number; time: number }>
  >(new Map());
  const maxTouchCountRef = useRef<number>(0);
  const [anchorOffsets, setAnchorOffsets] = useState<Record<string, { dx: number; dy: number }>>(
    {},
  );

  const _ = useTranslation();
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
    undo,
    redo,
  } = useHandwritingStore();

  const triggerGestureToast = useCallback((type: 'undo' | 'redo') => {
    setGestureToast(type);
    if (gestureToastTimer.current) clearTimeout(gestureToastTimer.current);
    gestureToastTimer.current = setTimeout(() => {
      setGestureToast(null);
    }, 1200);
  }, []);

  const isActive = activeBookKey === bookKey;
  const currentStrokes = getPageStrokes(bookHash, currentPageIndex);

  const captureTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const schedulePageSnapshot = useCallback(
    (pageIdx: number) => {
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
      captureTimeoutRef.current = setTimeout(async () => {
        try {
          await captureAndSavePageSnapshot(bookHash, pageIdx, containerRef.current);
        } catch {
          // ignore
        }
      }, 120);
    },
    [bookHash],
  );

  useEffect(() => {
    return () => {
      if (captureTimeoutRef.current) clearTimeout(captureTimeoutRef.current);
    };
  }, []);

  // When changing to a page with notes, capture snapshot if not already done
  useEffect(() => {
    const strokes = getPageStrokes(bookHash, currentPageIndex);
    const sticky = getStickyNotes(bookHash, currentPageIndex);
    if (strokes.length > 0 || sticky.length > 0) {
      schedulePageSnapshot(currentPageIndex);
    }
  }, [currentPageIndex, bookHash, getPageStrokes, getStickyNotes, schedulePageSnapshot]);

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
      (typeof progress.page === 'number' && progress.page > 0 ? progress.page - 1 : 0);
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

  // Phase 2: Semantic Paragraph Anchoring - recompute anchor offsets when reflow happens
  const updateAnchorOffsets = useCallback(() => {
    if (!view || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const strokes = getPageStrokes(bookHash, currentPageIndex);
    const newOffsets: Record<string, { dx: number; dy: number }> = {};

    for (const stroke of strokes) {
      if (stroke.textAnchor) {
        const delta = resolveTextAnchorDelta(stroke.textAnchor, view, rect);
        if (delta && (Math.abs(delta.dx) > 0.5 || Math.abs(delta.dy) > 0.5)) {
          newOffsets[stroke.id] = delta;
        }
      }
    }

    setAnchorOffsets(newOffsets);
  }, [view, bookHash, currentPageIndex, getPageStrokes]);

  useEffect(() => {
    updateAnchorOffsets();
  }, [currentPageIndex, dimensions.width, dimensions.height, updateAnchorOffsets]);

  useEffect(() => {
    if (!view) return;
    const handleRelocate = () => {
      setTimeout(updateAnchorOffsets, 60);
    };
    view.addEventListener('relocate', handleRelocate);
    return () => view.removeEventListener('relocate', handleRelocate);
  }, [view, updateAnchorOffsets]);

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
            undefined,
            dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
          );
          schedulePageSnapshot(currentPageIndex);
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
              undefined,
              dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
            );
            schedulePageSnapshot(currentPageIndex);
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
      schedulePageSnapshot,
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

    const activeColor = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

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
    renderStrokeToCanvas(ctx, tempStroke, dimensions.width, dimensions.height, isDarkMode);
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
        const p = fromNormalizedPoint(
          currentStrokePoints.current[i]!,
          dimensions.width,
          dimensions.height,
        );
        if (i === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    const activeColor = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

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
    renderStrokeToCanvas(ctx, tempStroke, dimensions.width, dimensions.height, isDarkMode);
  };

  // Multi-finger gesture recognition: Two-finger tap = Undo, Three-finger tap = Redo
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    const now = Date.now();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      activeTouchesRef.current.set(t.identifier, {
        startX: t.clientX,
        startY: t.clientY,
        currX: t.clientX,
        currY: t.clientY,
        time: now,
      });
    }

    const currentCount = e.touches.length;
    maxTouchCountRef.current = Math.max(maxTouchCountRef.current, currentCount);

    // If 2 or more fingers touch, immediately abort any ink drawing from previous single touch!
    if (currentCount >= 2) {
      if (isDrawing.current) {
        isDrawing.current = false;
        currentStrokePoints.current = [];
        const ctx = canvasRef.current?.getContext('2d');
        ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
      }
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      const record = activeTouchesRef.current.get(t.identifier);
      if (record) {
        record.currX = t.clientX;
        record.currY = t.clientY;
      }
    }
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isActive) return;
    const endedTouches: Array<{
      startX: number;
      startY: number;
      currX: number;
      currY: number;
      time: number;
    }> = [];
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i]!;
      const record = activeTouchesRef.current.get(t.identifier);
      if (record) {
        endedTouches.push(record);
        activeTouchesRef.current.delete(t.identifier);
      }
    }

    if (e.touches.length === 0) {
      const touchCount = maxTouchCountRef.current;
      maxTouchCountRef.current = 0;

      if (touchCount === 2 || touchCount === 3) {
        let isTap = true;
        const now = Date.now();
        for (const rec of endedTouches) {
          const duration = now - rec.time;
          const dist = Math.hypot(rec.currX - rec.startX, rec.currY - rec.startY);
          if (duration > 380 || dist > 35) {
            isTap = false;
            break;
          }
        }

        if (isTap) {
          if (touchCount === 2) {
            undo(bookHash, currentPageIndex);
            const updated = getPageStrokes(bookHash, currentPageIndex);
            persistPageHandwriting(
              bookKey,
              bookHash,
              currentPageIndex,
              updated,
              progress?.location,
              undefined,
              dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
            );
            schedulePageSnapshot(currentPageIndex);
            triggerGestureToast('undo');
            try {
              navigator.vibrate?.(18);
            } catch {
              // ignore
            }
            return;
          } else if (touchCount === 3) {
            redo(bookHash, currentPageIndex);
            const updated = getPageStrokes(bookHash, currentPageIndex);
            persistPageHandwriting(
              bookKey,
              bookHash,
              currentPageIndex,
              updated,
              progress?.location,
              undefined,
              dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
            );
            schedulePageSnapshot(currentPageIndex);
            triggerGestureToast('redo');
            try {
              navigator.vibrate?.([15, 20]);
            } catch {
              // ignore
            }
            return;
          }
        }
      }
    }
  };

  const handleTouchCancel = (e: React.TouchEvent<HTMLCanvasElement>) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      activeTouchesRef.current.delete(e.changedTouches[i]!.identifier);
    }
    if (e.touches.length === 0) {
      maxTouchCountRef.current = 0;
    }
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

    // 1. Gesture Recognition: Circle to Clip with Glow Animation & Action Menu
    const loop = detectClosedLoopGesture(points, dimensions.width, dimensions.height);
    if (loop.isClosedLoop) {
      const extracted = extractTextFromStroke(points, dimensions.width, dimensions.height, view);
      if (extracted && extracted.text.trim().length > 0) {
        // Micro-interaction 1: Tactile vibration feedback
        try {
          navigator.vibrate?.([20, 35]);
        } catch {
          // ignore
        }

        // Micro-interaction 2: Breathing glow highlight over selected text
        setGlowSelection({
          rect: extracted.boundingRect,
          timestamp: Date.now(),
        });
        if (glowTimer.current) clearTimeout(glowTimer.current);
        glowTimer.current = setTimeout(() => {
          setGlowSelection(null);
        }, 2500);

        // Micro-interaction 3: Summon refined action menu (Note / Highlight / AI / Copy)
        setLassoSelection(extracted);

        // Dissolve ink stroke smoothly into the glow
        currentStrokePoints.current = [];
        const ctx = canvas?.getContext('2d');
        ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
        return;
      }
    }

    // 2. Gesture Recognition: Scratch-out to Erase (temporarily disabled per user request)
    const ENABLE_SCRATCH_OUT_GESTURE = false;
    if (ENABLE_SCRATCH_OUT_GESTURE) {
      const scratch = detectScratchOutGesture(points, dimensions.width, dimensions.height);
      if (scratch.isScratch && scratch.bbox) {
        const { minX, minY, maxX, maxY } = scratch.bbox;
        const strokes = getPageStrokes(bookHash, currentPageIndex);
        const remainingStrokes = strokes.filter((s) => {
          for (let i = 0; i < s.points.length; i++) {
            const pt = s.points[i]!;
            if (pt.x >= minX && pt.x <= maxX && pt.y >= minY && pt.y <= maxY) {
              return false;
            }
            if (i > 0) {
              const prev = s.points[i - 1]!;
              if (segmentIntersectsBox(prev, pt, minX, minY, maxX, maxY)) {
                return false;
              }
            }
          }
          return true;
        });

        if (remainingStrokes.length !== strokes.length) {
          setPageStrokes(bookHash, currentPageIndex, remainingStrokes);
          persistPageHandwriting(
            bookKey,
            bookHash,
            currentPageIndex,
            remainingStrokes,
            progress?.location,
            undefined,
            dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
          );
          schedulePageSnapshot(currentPageIndex);
        }

        currentStrokePoints.current = [];
        const ctx = canvas?.getContext('2d');
        ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
        return;
      }
    }

    // Lasso text selection mode: inspect underlying text and summon menu
    if (currentTool === 'lasso') {
      const pts = [...points];
      currentStrokePoints.current = [];
      const ctx = canvas?.getContext('2d');
      ctx?.clearRect(0, 0, dimensions.width, dimensions.height);

      if (pts.length > 2) {
        const extracted = extractTextFromStroke(pts, dimensions.width, dimensions.height, view);
        if (extracted && extracted.text.trim().length > 0) {
          setLassoSelection(extracted);
        }
      }
      return;
    }

    const activeColor = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

    // 3. Smart Underline / Highlighter Snap to Underlying Text Line
    let strokePoints = points;
    let textAnchor: HandwritingTextAnchor | undefined;

    if (currentTool === 'pen' || currentTool === 'highlighter' || currentTool === 'pencil') {
      const snapped = snapUnderlineToText(
        points,
        view,
        dimensions.width,
        dimensions.height,
        canvasRef.current?.getBoundingClientRect(),
        currentTool === 'highlighter',
      );
      if (snapped) {
        strokePoints = snapped.snappedPoints;
        textAnchor = snapped.textAnchor;
      }
    }

    if (!textAnchor) {
      textAnchor = extractTextAnchorForStroke(
        view,
        {
          id: '',
          tool: currentTool,
          shapeType: currentTool === 'shape' ? currentShape : undefined,
          color: activeColor,
          width: currentWidth,
          opacity: currentOpacity,
          points: strokePoints,
          pageIndex: currentPageIndex,
          createdAt: 0,
          updatedAt: 0,
        },
        dimensions.width,
        dimensions.height,
        canvasRef.current?.getBoundingClientRect(),
      );
    }

    const newStroke: HandwritingStroke = {
      id: uniqueId(),
      tool: currentTool,
      shapeType: currentTool === 'shape' ? currentShape : undefined,
      color: activeColor,
      width: currentWidth,
      opacity: currentOpacity,
      points: [...strokePoints],
      pageIndex: currentPageIndex,
      cfi: textAnchor?.cfi || progress?.location,
      textAnchor,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const pageText = extractVisiblePageText(view, canvasRef.current?.getBoundingClientRect());

    addStroke(bookHash, currentPageIndex, newStroke);

    const updated = getPageStrokes(bookHash, currentPageIndex);
    persistPageHandwriting(
      bookKey,
      bookHash,
      currentPageIndex,
      updated,
      progress?.location,
      pageText,
      dimensions.height > 0 ? dimensions.width / dimensions.height : undefined,
    );
    schedulePageSnapshot(currentPageIndex);

    currentStrokePoints.current = [];
    const ctx = canvas?.getContext('2d');
    ctx?.clearRect(0, 0, dimensions.width, dimensions.height);
  };

  const handleCreateStickyNote = (text: string, x: number, y: number) => {
    const normX = x > 1 ? x / dimensions.width : x;
    const normY = y > 1 ? y / dimensions.height : y;
    let noteX: number;
    if (normX > 0.5) {
      noteX = Math.min(0.76, normX + 0.02);
    } else {
      noteX = Math.max(0.04, normX - 0.22);
    }
    const noteY = Math.max(0.04, Math.min(0.78, normY));
    const newNote: HandwritingStickyNote = {
      id: uniqueId(),
      bookHash,
      pageIndex: currentPageIndex,
      x: noteX,
      y: noteY,
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
    schedulePageSnapshot(currentPageIndex);
    setLassoSelection(null);
    setGlowSelection(null);
  };

  const handleHighlightText = (_text: string) => {
    if (!lassoSelection) return;
    const b = lassoSelection.boundingRect;
    const midY = (b.top + b.bottom) / 2;
    const highlightStroke: HandwritingStroke = {
      id: uniqueId(),
      tool: 'highlighter',
      color: currentColor === '#000000' ? '#eab308' : currentColor,
      width: Math.max(12, currentWidth * 2.2),
      opacity: isDarkMode ? 0.45 : 0.35,
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
    persistPageHandwriting(bookKey, bookHash, currentPageIndex, updated, progress?.location);
    schedulePageSnapshot(currentPageIndex);
    setLassoSelection(null);
    setGlowSelection(null);
  };

  const handleAskAI = useCallback(
    (text: string) => {
      setLassoSelection(null);
      setGlowSelection(null);
      useSidebarStore.getState().setSideBarVisible(true);
      const config = useBookDataStore.getState().getConfig(bookKey);
      if (config?.viewSettings) {
        useBookDataStore.getState().setConfig(bookKey, {
          viewSettings: { ...config.viewSettings, sideBarTab: 'ai' },
        });
      }
      const preview = text.length > 20 ? `${text.slice(0, 20)}...` : text;
      eventDispatcher.dispatch('toast', {
        type: 'info',
        timeout: 2500,
        message: `${_('AI')}: "${preview}"`,
      });
    },
    [bookKey, _],
  );

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
    const highlighters = strokes.filter((s) => s.tool === 'highlighter');
    const regularStrokes = strokes.filter((s) => s.tool !== 'highlighter');

    const renderSingleStroke = (stroke: HandwritingStroke) => {
      if (stroke.points.length === 0) return null;
      const baseWidth = Math.max(1, stroke.width * strokeScale);
      const strokeWidth = stroke.tool === 'highlighter' ? baseWidth * 2.5 : baseWidth;
      const opacity = stroke.tool === 'highlighter' ? 0.35 : stroke.opacity || 1.0;
      const blendStyle: React.CSSProperties =
        stroke.tool === 'highlighter' ? { mixBlendMode: isDarkMode ? 'screen' : 'multiply' } : {};

      const offset = anchorOffsets[stroke.id];
      const transformAttr = offset
        ? `translate(${offset.dx.toFixed(1)}, ${offset.dy.toFixed(1)})`
        : undefined;

      let content: React.ReactNode = null;

      if (stroke.tool === 'shape') {
        const p1 = fromNormalizedPoint(stroke.points[0]!, width, height);
        const p2 = fromNormalizedPoint(stroke.points[stroke.points.length - 1]!, width, height);

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

          content = (
            <>
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
            </>
          );
        } else if (stroke.shapeType === 'rectangle') {
          const rx = Math.min(p1.x, p2.x);
          const ry = Math.min(p1.y, p2.y);
          const rw = Math.abs(p2.x - p1.x);
          const rh = Math.abs(p2.y - p1.y);
          content = (
            <rect
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
        } else if (stroke.shapeType === 'ellipse') {
          const cx = (p1.x + p2.x) / 2;
          const cy = (p1.y + p2.y) / 2;
          const rx = Math.abs(p2.x - p1.x) / 2;
          const ry = Math.abs(p2.y - p1.y) / 2;
          content = (
            <ellipse
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
      } else if (stroke.tool === 'pen') {
        const d = strokeToCalligraphicPath(stroke, width, height);
        content = (
          <path
            d={d}
            fill={stroke.color}
            stroke={stroke.color}
            strokeWidth={0.5}
            opacity={stroke.opacity || 1.0}
          />
        );
      } else if (stroke.tool === 'pencil') {
        const d = strokeToSvgPath(stroke, width, height);
        const pencilWidth = Math.max(0.75, baseWidth * 0.5);
        content = (
          <path
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
      } else if (stroke.tool === 'highlighter') {
        const d = strokeToSvgPath(stroke, width, height);
        const highlighterWidth = baseWidth * 2.8;
        content = (
          <path
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
      } else {
        const d = strokeToSvgPath(stroke, width, height);
        content = (
          <path
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
      }

      return (
        <g key={`${keyPrefix}_${stroke.id}`} transform={transformAttr}>
          {content}
        </g>
      );
    };

    return (
      <>
        <g
          id={`${keyPrefix}-highlighters-underlay`}
          style={{ mixBlendMode: isDarkMode ? 'screen' : 'multiply' }}
        >
          {highlighters.map(renderSingleStroke)}
        </g>
        <g id={`${keyPrefix}-regular-strokes`}>{regularStrokes.map(renderSingleStroke)}</g>
      </>
    );
  };

  const svgDefs = (
    <defs>
      <filter id='inkspire-pencil-grain' x='-20%' y='-20%' width='140%' height='140%'>
        <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' result='noise' />
        <feDisplacementMap
          in='SourceGraphic'
          in2='noise'
          scale='1.4'
          xChannelSelector='R'
          yChannelSelector='G'
          result='displaced'
        />
        <feColorMatrix
          type='matrix'
          values='1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.88 0'
          in='displaced'
          result='grain'
        />
        <feBlend in='SourceGraphic' in2='grain' mode='multiply' />
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

      {/* 3. Breathing Glow Animation Overlay on Circle-to-Clip Selection */}
      {glowSelection && (
        <div
          className='absolute pointer-events-none z-30 transition-opacity duration-700 animate-pulse'
          style={{
            left: `${glowSelection.rect.left * width}px`,
            top: `${glowSelection.rect.top * height}px`,
            width: `${Math.max(20, (glowSelection.rect.right - glowSelection.rect.left) * width)}px`,
            height: `${Math.max(16, (glowSelection.rect.bottom - glowSelection.rect.top) * height)}px`,
            background:
              'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.28) 0%, rgba(59, 130, 246, 0.08) 70%, transparent 100%)',
            borderRadius: '8px',
            boxShadow: '0 0 16px 4px rgba(59, 130, 246, 0.35)',
          }}
        />
      )}

      {/* 4. Lasso Action Menu for Selected Text */}
      {lassoSelection && (
        <LassoActionMenu
          selection={lassoSelection}
          containerWidth={width}
          containerHeight={height}
          onCreateStickyNote={handleCreateStickyNote}
          onHighlightText={handleHighlightText}
          onAskAI={handleAskAI}
          onClose={() => {
            setLassoSelection(null);
            setGlowSelection(null);
          }}
        />
      )}

      {/* 5. Sleek HUD Toast for Multi-Touch Gestures (Two-finger Undo / Three-finger Redo) */}
      {gestureToast && (
        <div className='pointer-events-none absolute top-12 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-base-100/95 dark:bg-base-200/95 text-base-content shadow-xl border border-base-300 dark:border-base-700 text-xs font-semibold backdrop-blur-md animate-in fade-in zoom-in-95 duration-150'>
          {gestureToast === 'undo' ? (
            <>
              <LuUndo2 className='w-3.5 h-3.5 text-primary' />
              <span>{_('Undone')}</span>
            </>
          ) : (
            <>
              <LuRedo2 className='w-3.5 h-3.5 text-primary' />
              <span>{_('Redone')}</span>
            </>
          )}
        </div>
      )}

      {/* 6. Active drawing canvas layer */}
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
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      />
    </div>
  );
};
export default HandwritingLayer;
