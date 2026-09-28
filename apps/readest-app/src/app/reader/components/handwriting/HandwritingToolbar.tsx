import React, { useState, useEffect, useRef, useMemo } from 'react';
import clsx from 'clsx';
import {
  LuPenTool,
  LuPencil,
  LuHighlighter,
  LuEraser,
  LuShapes,
  LuUndo2,
  LuRedo2,
  LuTrash2,
  LuDownload,
  LuX,
  LuMinus,
  LuSquare,
  LuCircle,
  LuArrowRight,
  LuHand,
  LuScissors,
  LuLassoSelect,
  LuPalette,
  LuEllipsis,
  LuNotebookTabs,
} from 'react-icons/lu';
import { PiCaretLeft, PiCaretRight } from 'react-icons/pi';
import { useTranslation } from '@/hooks/useTranslation';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useReaderStore } from '@/store/readerStore';
import { useThemeStore } from '@/store/themeStore';
import { HandwritingShapeType, HandwritingTool } from '@/types/handwriting';
import { persistPageHandwriting } from '@/services/handwritingService';
import { Insets } from '@/types/misc';
import HandwritingExportDialog from './HandwritingExportDialog';
import HandwritingOverviewDialog from './HandwritingOverviewDialog';

export interface HandwritingToolbarProps {
  bookKey: string;
  headerWidth?: number;
  containerWidth?: number;
  containerHeight?: number;
  contentInsets?: Insets;
  onSubMenuOpenChange?: (isOpen: boolean) => void;
}

/**
 * Dynamic pen tip icons that preview active color and width on the toolbar button itself.
 */
const DynamicPenIcon: React.FC<{ color: string; width: number; active: boolean }> = ({
  color,
  width,
  active,
}) => {
  // Map width (1-10) to dot indicator radius/stroke thickness
  const dotSize = Math.max(3, Math.min(width * 0.9, 7.5));
  return (
    <div className='relative w-[18px] h-[18px] flex items-center justify-center'>
      <LuPenTool size={15} />
      {/* Dynamic ink indicator dot at the nib corner */}
      <span
        className='absolute -bottom-0.5 -right-0.5 rounded-full border shadow-xs transition-transform'
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          backgroundColor: color,
          borderColor: active ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.15)',
        }}
      />
    </div>
  );
};

const DynamicPencilIcon: React.FC<{ color: string; width: number; active: boolean }> = ({
  color,
  width,
  active,
}) => {
  const dotSize = Math.max(2.5, Math.min(width * 0.8, 6.5));
  return (
    <div className='relative w-[18px] h-[18px] flex items-center justify-center'>
      <LuPencil size={15} />
      <span
        className='absolute -bottom-0.5 -right-0.5 rounded-full border shadow-xs transition-transform'
        style={{
          width: `${dotSize}px`,
          height: `${dotSize}px`,
          backgroundColor: color,
          borderColor: active ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.15)',
        }}
      />
    </div>
  );
};

const DynamicHighlighterIcon: React.FC<{
  color: string;
  width: number;
  active: boolean;
  isDarkMode: boolean;
}> = ({ color, active }) => {
  return (
    <div className='relative w-[18px] h-[18px] flex items-center justify-center'>
      <LuHighlighter size={15} />
      {/* Highlighter chisel tip color bar */}
      <span
        className='absolute -bottom-0.5 -right-0.5 w-3 h-1.5 rounded-xs border shadow-xs transition-transform'
        style={{
          backgroundColor: color,
          opacity: 0.85,
          borderColor: active ? 'rgba(255,255,255,0.8)' : 'rgba(0,0,0,0.2)',
        }}
      />
    </div>
  );
};

const COLOR_PRESETS = [
  '#000000',
  '#64748b', // Slate Gray
  '#ef4444', // Red
  '#f97316', // Orange
  '#eab308', // Yellow
  '#22c55e', // Green
  '#3b82f6', // Blue
  '#a855f7', // Purple
];

export const HandwritingToolbar: React.FC<HandwritingToolbarProps> = ({
  bookKey,
  headerWidth,
  containerWidth,
  containerHeight,
  onSubMenuOpenChange,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showCompactMoreMenu, setShowCompactMoreMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showOverviewDialog, setShowOverviewDialog] = useState(false);
  const [showNoteNavDropdown, setShowNoteNavDropdown] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<
    'pen' | 'pencil' | 'highlighter' | 'eraser' | 'color' | null
  >(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);
  const shapeMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const noteNavDropdownRef = useRef<HTMLDivElement>(null);

  const bookHash = bookKey.split('-')[0]!;

  const {
    activeBookKey,
    currentTool,
    currentShape,
    currentColor,
    currentWidth,
    eraserType,
    eraserRadius,
    stylusOnly,
    currentPageIndex,
    toggleHandwriting,
    setTool,
    setShape,
    setColor,
    setWidth,
    setEraserType,
    setEraserRadius,
    setStylusOnly,
    undo,
    redo,
    canUndo,
    canRedo,
    clearPage,
    getPageStrokes,
  } = useHandwritingStore();

  const allBookStrokes = useHandwritingStore((s) => s.bookStrokes[bookHash]);
  const allBookSticky = useHandwritingStore((s) => s.stickyNotes[bookHash]);

  // Discover all pages with notes in current book in ascending order
  const notePages = useMemo(() => {
    const pagesSet = new Set<number>();
    if (allBookStrokes) {
      for (const [p, s] of Object.entries(allBookStrokes)) {
        if (s && s.length > 0) pagesSet.add(Number(p));
      }
    }
    if (allBookSticky) {
      for (const [p, n] of Object.entries(allBookSticky)) {
        if (n && n.length > 0) pagesSet.add(Number(p));
      }
    }
    return Array.from(pagesSet).sort((a, b) => a - b);
  }, [allBookStrokes, allBookSticky]);

  // Measure container width via ResizeObserver
  const [actualContainerWidth, setActualContainerWidth] = useState<number>(0);

  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return;
    const el = toolbarRef.current?.parentElement || toolbarRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry && entry.contentRect.width > 0) {
        setActualContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Responsive tiers:
  // When actualContainerWidth is measured, we know the exact width available for this toolbar.
  // Full wide needs >= 640px. Compact needs < 460px.
  // In synthetic tests where headerWidth is passed (e.g. 900 vs 400), we fallback to 720/520 thresholds.
  const effectiveWidth =
    actualContainerWidth > 0
      ? actualContainerWidth
      : headerWidth && headerWidth > 0
        ? headerWidth
        : containerWidth && containerWidth > 0
          ? containerWidth
          : typeof window !== 'undefined'
            ? window.innerWidth
            : 800;

  const isWide = actualContainerWidth > 0 ? actualContainerWidth >= 640 : effectiveWidth >= 720;
  const isCompact = actualContainerWidth > 0 ? actualContainerWidth < 460 : effectiveWidth < 520;

  const currentNoteIndex = notePages.indexOf(currentPageIndex);

  let hasPrevNote = false;
  let hasNextNote = false;
  let prevPageIndex: number | null = null;
  let nextPageIndex: number | null = null;
  let currentNoteBadge = '';

  if (notePages.length > 0) {
    if (currentNoteIndex >= 0) {
      hasPrevNote = currentNoteIndex > 0;
      hasNextNote = currentNoteIndex < notePages.length - 1;
      prevPageIndex = hasPrevNote ? notePages[currentNoteIndex - 1]! : null;
      nextPageIndex = hasNextNote ? notePages[currentNoteIndex + 1]! : null;
      currentNoteBadge = isCompact
        ? `${currentNoteIndex + 1}/${notePages.length}`
        : isWide
          ? `${_('Note')} ${currentNoteIndex + 1}/${notePages.length} · P.${currentPageIndex + 1}`
          : `${currentNoteIndex + 1}/${notePages.length} · P.${currentPageIndex + 1}`;
    } else {
      const prev = [...notePages].reverse().find((p: number) => p < currentPageIndex);
      const next = notePages.find((p: number) => p > currentPageIndex);
      hasPrevNote = prev !== undefined;
      hasNextNote = next !== undefined;
      prevPageIndex = prev ?? null;
      nextPageIndex = next ?? null;
      currentNoteBadge = isCompact
        ? `${notePages.length}P`
        : isWide
          ? `${notePages.length} ${_('notes')}`
          : `${notePages.length}P`;
    }
  }

  const handleGoToPrevNote = () => {
    if (prevPageIndex === null) return;
    const view = useReaderStore.getState().getView(bookKey);
    view?.goTo(prevPageIndex);
    useHandwritingStore.getState().setCurrentPageIndex(prevPageIndex);
  };

  const handleGoToNextNote = () => {
    if (nextPageIndex === null) return;
    const view = useReaderStore.getState().getView(bookKey);
    view?.goTo(nextPageIndex);
    useHandwritingStore.getState().setCurrentPageIndex(nextPageIndex);
  };

  const handleJumpToNotePage = (targetPageIndex: number) => {
    const view = useReaderStore.getState().getView(bookKey);
    view?.goTo(targetPageIndex);
    useHandwritingStore.getState().setCurrentPageIndex(targetPageIndex);
  };

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(target) &&
        subMenuRef.current &&
        !subMenuRef.current.contains(target) &&
        shapeMenuRef.current &&
        !shapeMenuRef.current.contains(target) &&
        moreMenuRef.current &&
        !moreMenuRef.current.contains(target) &&
        noteNavDropdownRef.current &&
        !noteNavDropdownRef.current.contains(target)
      ) {
        setActiveSubMenu(null);
        setShowShapeMenu(false);
        setShowCompactMoreMenu(false);
        setShowNoteNavDropdown(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

  // Notify parent HeaderBar if any sub-menu or modal is open so the header stays pinned
  useEffect(() => {
    const isAnyOpen =
      activeSubMenu !== null ||
      showShapeMenu ||
      showCompactMoreMenu ||
      showExportDialog ||
      showOverviewDialog ||
      showNoteNavDropdown;
    onSubMenuOpenChange?.(isAnyOpen);
  }, [
    activeSubMenu,
    showShapeMenu,
    showCompactMoreMenu,
    showExportDialog,
    showOverviewDialog,
    showNoteNavDropdown,
    onSubMenuOpenChange,
  ]);

  const isVisible = activeBookKey === bookKey;
  if (!isVisible) return null;

  const undoAvailable = canUndo(bookHash, currentPageIndex);
  const redoAvailable = canRedo(bookHash, currentPageIndex);

  const handleUndo = () => {
    undo(bookHash, currentPageIndex);
    const updated = getPageStrokes(bookHash, currentPageIndex);
    persistPageHandwriting(bookKey, bookHash, currentPageIndex, updated);
  };

  const handleRedo = () => {
    redo(bookHash, currentPageIndex);
    const updated = getPageStrokes(bookHash, currentPageIndex);
    persistPageHandwriting(bookKey, bookHash, currentPageIndex, updated);
  };

  const handleClearPage = () => {
    clearPage(bookHash, currentPageIndex);
    persistPageHandwriting(bookKey, bookHash, currentPageIndex, []);
  };

  const handleSelectShape = (shape: HandwritingShapeType) => {
    setShape(shape);
    setShowShapeMenu(false);
    setShowCompactMoreMenu(false);
    setActiveSubMenu(null);
  };

  const handleToolClick = (tool: HandwritingTool) => {
    setShowShapeMenu(false);
    setShowCompactMoreMenu(false);
    if (tool === 'shape') {
      setActiveSubMenu(null);
      setShowShapeMenu((v) => !v);
      return;
    }

    if (currentTool === tool) {
      // Second click on active tool -> toggle floating sub-toolbar
      setActiveSubMenu((prev) =>
        prev === tool ? null : (tool as 'pen' | 'pencil' | 'highlighter' | 'eraser'),
      );
    } else {
      // First click on inactive tool -> activate tool
      setTool(tool);
      setActiveSubMenu(null);
    }
  };

  const activeColor = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

  const getToolDisplayName = (tool: string) => {
    switch (tool) {
      case 'pen':
        return _('Fountain Pen');
      case 'pencil':
        return _('Pencil');
      case 'highlighter':
        return _('Highlighter');
      default:
        return '';
    }
  };

  return (
    <>
      {/* Primary Handwriting Toolbar - Integrated in HeaderBar */}
      <div
        ref={toolbarRef}
        className='header-handwriting-toolbar pointer-events-auto relative flex items-center gap-0.5 sm:gap-1 h-8 px-1.5 py-0.5 rounded-xl bg-base-200/60 border border-base-300/60 shadow-xs select-none shrink-0'
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tool Selector Group */}
        <div className='flex items-center gap-0.5 shrink-0'>
          {/* 钢笔 Fountain Pen */}
          <button
            title={_('Fountain Pen (Smooth & Pressure)')}
            aria-label={_('Fountain Pen (Smooth & Pressure)')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
              currentTool === 'pen'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300/70',
            )}
            onClick={() => handleToolClick('pen')}
          >
            <DynamicPenIcon
              color={currentColor}
              width={currentWidth}
              active={currentTool === 'pen'}
            />
            {currentTool === 'pen' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 铅笔 Pencil */}
          <button
            title={_('Pencil (Textured & Light)')}
            aria-label={_('Pencil (Textured & Light)')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
              currentTool === 'pencil'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300/70',
            )}
            onClick={() => handleToolClick('pencil')}
          >
            <DynamicPencilIcon
              color={currentColor}
              width={currentWidth}
              active={currentTool === 'pencil'}
            />
            {currentTool === 'pencil' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 荧光笔 Highlighter */}
          <button
            title={_('Highlighter (Multiply Blend)')}
            aria-label={_('Highlighter (Multiply Blend)')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
              currentTool === 'highlighter'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300/70',
            )}
            onClick={() => handleToolClick('highlighter')}
          >
            <DynamicHighlighterIcon
              color={currentColor}
              width={currentWidth}
              active={currentTool === 'highlighter'}
              isDarkMode={isDarkMode}
            />
            {currentTool === 'highlighter' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 橡皮擦 Eraser */}
          <button
            title={_('Stroke Eraser')}
            aria-label={_('Stroke Eraser')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
              currentTool === 'eraser'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300/70',
            )}
            onClick={() => handleToolClick('eraser')}
          >
            <LuEraser size={15} />
            {currentTool === 'eraser' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 套索与形状（宽屏/平板横竖屏直接显示，窄屏手机收纳在更多菜单） */}
          {!isCompact && (
            <>
              {/* 套索选字与便签 Lasso Tool */}
              <button
                title={_('Lasso Text Selection & Sticky Notes')}
                aria-label={_('Lasso Text Selection & Sticky Notes')}
                className={clsx(
                  'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
                  currentTool === 'lasso'
                    ? 'bg-primary text-primary-content shadow-xs scale-105'
                    : 'text-base-content/80 hover:bg-base-300/70',
                )}
                onClick={() => handleToolClick('lasso')}
              >
                <LuLassoSelect size={15} />
                {currentTool === 'lasso' && (
                  <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
                )}
              </button>

              {/* 形状 Shapes */}
              <button
                title={_('Shapes Tool (Line, Rectangle, Circle, Arrow)')}
                aria-label={_('Shapes Tool (Line, Rectangle, Circle, Arrow)')}
                className={clsx(
                  'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative shrink-0',
                  currentTool === 'shape'
                    ? 'bg-primary text-primary-content shadow-xs scale-105'
                    : 'text-base-content/80 hover:bg-base-300/70',
                )}
                onClick={() => handleToolClick('shape')}
              >
                <LuShapes size={15} />
                {currentTool === 'shape' && (
                  <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
                )}
              </button>
            </>
          )}
        </div>

        {/* Divider */}
        <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />

        {/* Single Color Picker Button (hidden for eraser) */}
        {currentTool !== 'eraser' && (
          <button
            title={_('Color')}
            aria-label={_('Color')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg transition-all relative flex items-center justify-center shrink-0',
              activeSubMenu === 'color'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300/70',
            )}
            onClick={() => {
              setShowShapeMenu(false);
              setShowCompactMoreMenu(false);
              setActiveSubMenu((prev) => (prev === 'color' ? null : 'color'));
            }}
          >
            <span
              className={clsx(
                'w-4 h-4 rounded-full border shadow-xs transition-transform',
                activeSubMenu === 'color'
                  ? 'border-primary-content/60 scale-105'
                  : 'border-base-content/25',
              )}
              style={{ backgroundColor: activeColor }}
            />
            {activeSubMenu === 'color' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>
        )}

        {/* Divider */}
        {currentTool !== 'eraser' && <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />}

        {/* Palm Rejection / Stylus Only Toggle */}
        <button
          title={
            stylusOnly
              ? _('Stylus Only Mode (Touch gestures paginate)')
              : _('Finger Drawing Allowed')
          }
          aria-label={_('Stylus Only Mode (Touch gestures paginate)')}
          className={clsx(
            'btn btn-ghost btn-xs h-7 rounded-lg gap-1 text-xs font-medium transition-all shrink-0',
            isWide ? 'px-2' : 'w-7 p-0',
            stylusOnly
              ? 'bg-primary/15 text-primary font-semibold'
              : 'text-base-content/70 hover:bg-base-300/70',
          )}
          onClick={() => setStylusOnly(!stylusOnly)}
        >
          {stylusOnly ? <LuPenTool size={14} /> : <LuHand size={14} />}
          {isWide && (
            <span className='inline text-[11px] whitespace-nowrap'>
              {stylusOnly ? _('Stylus Only') : _('Finger Draw')}
            </span>
          )}
        </button>

        {/* Divider */}
        <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />

        {/* Undo / Redo */}
        <div className='flex items-center gap-0.5 shrink-0'>
          <button
            title={_('Undo (Ctrl+Z)')}
            aria-label={_('Undo (Ctrl+Z)')}
            disabled={!undoAvailable}
            className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/80 disabled:opacity-30 shrink-0'
            onClick={handleUndo}
          >
            <LuUndo2 size={15} />
          </button>
          <button
            title={_('Redo (Ctrl+Y)')}
            aria-label={_('Redo (Ctrl+Y)')}
            disabled={!redoAvailable}
            className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/80 disabled:opacity-30 shrink-0'
            onClick={handleRedo}
          >
            <LuRedo2 size={15} />
          </button>
        </div>

        {/* In-Reader Handwriting Note Navigator (阅读界面内的手写笔记切换导航) */}
        {notePages.length > 0 && (
          <>
            <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />
            <div
              className='relative flex items-center bg-base-300/50 dark:bg-base-300/30 rounded-lg p-0.5 shrink-0'
              ref={noteNavDropdownRef}
            >
              <button
                type='button'
                title={_('Previous Note Page')}
                aria-label={_('Previous Note Page')}
                disabled={!hasPrevNote}
                className='btn btn-ghost btn-xs h-6 w-6 p-0 rounded-md text-base-content/70 hover:bg-base-200/90 disabled:opacity-25 shrink-0'
                onClick={handleGoToPrevNote}
              >
                <PiCaretLeft size={14} />
              </button>

              <button
                type='button'
                title={_('Click to jump to note pages')}
                className='btn btn-ghost btn-xs h-6 px-1.5 text-[11px] font-mono font-medium text-base-content/85 hover:bg-base-200/90 rounded-md shrink-0 whitespace-nowrap'
                onClick={() => setShowNoteNavDropdown((v) => !v)}
              >
                <span>{currentNoteBadge}</span>
              </button>

              <button
                type='button'
                title={_('Next Note Page')}
                aria-label={_('Next Note Page')}
                disabled={!hasNextNote}
                className='btn btn-ghost btn-xs h-6 w-6 p-0 rounded-md text-base-content/70 hover:bg-base-200/90 disabled:opacity-25 shrink-0'
                onClick={handleGoToNextNote}
              >
                <PiCaretRight size={14} />
              </button>

              {/* Fast Jump Popover directly in the reader */}
              {showNoteNavDropdown && (
                <div
                  className='pointer-events-auto absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-2 rounded-xl bg-base-100/98 backdrop-blur-md shadow-2xl border border-base-300 min-w-48 max-h-60 overflow-y-auto select-none text-xs'
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className='text-[10px] font-semibold text-base-content/50 uppercase tracking-wider px-2 py-1 border-b border-base-200/70 mb-1'>
                    {_('Handwritten Pages')} ({notePages.length})
                  </div>
                  {notePages.map((pIdx: number) => {
                    const isCur = pIdx === currentPageIndex;
                    const strokeCount = allBookStrokes?.[pIdx]?.length || 0;
                    return (
                      <button
                        key={pIdx}
                        type='button'
                        className={clsx(
                          'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors',
                          isCur
                            ? 'bg-primary text-primary-content font-medium'
                            : 'hover:bg-base-200 text-base-content/80',
                        )}
                        onClick={() => {
                          handleJumpToNotePage(pIdx);
                          setShowNoteNavDropdown(false);
                        }}
                      >
                        <span>{_('Page {{page}}', { page: pIdx + 1 })}</span>
                        <span
                          className={clsx(
                            'text-[10px] font-mono',
                            isCur ? 'text-primary-content/80' : 'text-base-content/50',
                          )}
                        >
                          {strokeCount > 0 ? `${strokeCount} ${_('strokes')}` : _('Sticky note')}
                        </span>
                      </button>
                    );
                  })}
                  <div className='w-full h-px bg-base-200/80 my-1' />
                  <button
                    type='button'
                    className='w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-primary hover:bg-primary/10 transition-colors font-medium text-[11px]'
                    onClick={() => {
                      setShowOverviewDialog(true);
                      setShowNoteNavDropdown(false);
                    }}
                  >
                    <LuNotebookTabs size={13} />
                    <span>{_('Open All Notes Overview')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Actions Group: Clear & Export (Direct buttons on wide/medium, ellipsis dropdown on compact) */}
        {!isCompact ? (
          <>
            <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />
            {/* Clear Page */}
            <button
              title={_('Clear Current Page')}
              aria-label={_('Clear Current Page')}
              className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-error hover:bg-error/10 shrink-0'
              onClick={handleClearPage}
            >
              <LuTrash2 size={15} />
            </button>

            {/* Export / Import */}
            <button
              title={_('Export / Import Handwriting')}
              aria-label={_('Export / Import Handwriting')}
              className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/80 hover:bg-base-300/70 shrink-0'
              onClick={() => setShowExportDialog(true)}
            >
              <LuDownload size={15} />
            </button>

            {/* Notes Overview */}
            <button
              title={_('All Notes Overview')}
              aria-label={_('All Notes Overview')}
              className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/80 hover:bg-base-300/70 shrink-0'
              onClick={() => setShowOverviewDialog(true)}
            >
              <LuNotebookTabs size={15} />
            </button>
          </>
        ) : (
          <>
            <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />
            {/* Compact More Actions Dropdown */}
            <div className='relative shrink-0' ref={moreMenuRef}>
              <button
                title={_('More Options')}
                aria-label={_('More Options')}
                className={clsx(
                  'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/80 shrink-0',
                  showCompactMoreMenu ? 'bg-base-300' : 'hover:bg-base-300/70',
                )}
                onClick={() => {
                  setActiveSubMenu(null);
                  setShowShapeMenu(false);
                  setShowCompactMoreMenu((v) => !v);
                }}
              >
                <LuEllipsis size={15} />
              </button>

              {showCompactMoreMenu && (
                <div className='absolute top-full mt-2 right-0 z-50 flex flex-col gap-1 p-1.5 min-w-44 bg-base-100/98 backdrop-blur-md rounded-xl shadow-2xl border border-base-300 animate-in fade-in zoom-in-95 select-none text-xs'>
                  <button
                    className={clsx(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors',
                      currentTool === 'lasso'
                        ? 'bg-primary text-primary-content font-medium'
                        : 'hover:bg-base-200 text-base-content/80',
                    )}
                    onClick={() => {
                      handleToolClick('lasso');
                      setShowCompactMoreMenu(false);
                    }}
                  >
                    <LuLassoSelect size={15} />
                    <span>{_('Lasso Text Selection & Sticky Notes')}</span>
                  </button>
                  <button
                    className={clsx(
                      'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left transition-colors',
                      currentTool === 'shape'
                        ? 'bg-primary text-primary-content font-medium'
                        : 'hover:bg-base-200 text-base-content/80',
                    )}
                    onClick={() => {
                      handleToolClick('shape');
                      setShowCompactMoreMenu(false);
                    }}
                  >
                    <LuShapes size={15} />
                    <span>{_('Shapes Tool (Line, Rectangle, Circle, Arrow)')}</span>
                  </button>
                  <div className='w-full h-px bg-base-200/80 my-0.5' />
                  <button
                    className='flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left text-error hover:bg-error/10 transition-colors'
                    onClick={() => {
                      handleClearPage();
                      setShowCompactMoreMenu(false);
                    }}
                  >
                    <LuTrash2 size={15} />
                    <span>{_('Clear Current Page')}</span>
                  </button>
                  <button
                    className='flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-base-200 text-base-content/80 transition-colors'
                    onClick={() => {
                      setShowExportDialog(true);
                      setShowCompactMoreMenu(false);
                    }}
                  >
                    <LuDownload size={15} />
                    <span>{_('Export / Import Handwriting')}</span>
                  </button>
                  <button
                    className='flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-left hover:bg-base-200 text-base-content/80 transition-colors'
                    onClick={() => {
                      setShowOverviewDialog(true);
                      setShowCompactMoreMenu(false);
                    }}
                  >
                    <LuNotebookTabs size={15} />
                    <span>{_('All Notes Overview')}</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Close Button */}
        <div className='w-px h-4 bg-base-300/80 mx-0.5 shrink-0' />
        <button
          title={_('Close Handwriting Toolbar')}
          aria-label={_('Close Handwriting Toolbar')}
          className='btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-300/70 shrink-0'
          onClick={() => toggleHandwriting(bookKey, false)}
        >
          <LuX size={15} />
        </button>
      </div>

      {/* Floating Sub-Toolbar: Positioned directly beneath HeaderBar */}
      {activeSubMenu && (
        <div
          ref={subMenuRef}
          className='pointer-events-auto absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 p-3.5 rounded-2xl bg-base-100/98 backdrop-blur-md shadow-2xl border border-base-300/80 animate-in fade-in zoom-in-95 duration-150 select-none max-w-[calc(100vw-32px)]'
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sub-toolbar for Pen / Pencil / Highlighter: Continuous Stroke Width Slider */}
          {(activeSubMenu === 'pen' ||
            activeSubMenu === 'pencil' ||
            activeSubMenu === 'highlighter') && (
            <div className='flex flex-col gap-2.5 min-w-56'>
              <div className='flex items-center justify-between text-xs'>
                <span className='font-medium text-base-content/80'>
                  {getToolDisplayName(activeSubMenu)} {_('Width')}
                </span>
                <span className='font-mono font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10'>
                  {currentWidth.toFixed(1)} px
                </span>
              </div>

              {/* Continuous Slider (无极调节) */}
              <div className='flex items-center gap-3'>
                <input
                  type='range'
                  min={0.5}
                  max={activeSubMenu === 'highlighter' ? 24 : 16}
                  step={0.5}
                  value={currentWidth}
                  onChange={(e) => setWidth(parseFloat(e.target.value))}
                  className='range range-primary range-xs flex-1 cursor-pointer'
                />
                {/* Dynamic Preview Dot */}
                <div
                  className='w-7 h-7 rounded-lg bg-base-200/80 flex items-center justify-center shrink-0 border border-base-300/50'
                  title={_('Width Preview')}
                >
                  <div
                    className='rounded-full bg-primary transition-all'
                    style={{
                      width: `${Math.min(22, Math.max(2, currentWidth * (activeSubMenu === 'highlighter' ? 1.0 : 1.4)))}px`,
                      height: `${Math.min(22, Math.max(2, currentWidth * (activeSubMenu === 'highlighter' ? 1.0 : 1.4)))}px`,
                      opacity: activeSubMenu === 'highlighter' ? 0.45 : 1,
                    }}
                  />
                </div>
              </div>

              {/* Quick Presets */}
              <div className='flex items-center justify-between pt-1 border-t border-base-200/80'>
                {[1, 2, 4, 8, 12].map((presetVal) => (
                  <button
                    key={presetVal}
                    className={clsx(
                      'btn btn-ghost btn-xs rounded-md text-[11px] px-2 h-6 font-mono transition-all',
                      currentWidth === presetVal
                        ? 'bg-primary/20 text-primary font-bold'
                        : 'text-base-content/70 hover:bg-base-200',
                    )}
                    onClick={() => setWidth(presetVal)}
                  >
                    {presetVal}px
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Sub-toolbar for Eraser: Dual Mode (Full Stroke vs Partial Area) + Radius Slider */}
          {activeSubMenu === 'eraser' && (
            <div className='flex flex-col gap-2.5 min-w-60'>
              <div className='text-xs font-medium text-base-content/80'>{_('Eraser Mode')}</div>

              {/* Dual Mode Switcher */}
              <div className='grid grid-cols-2 gap-1.5 p-1 bg-base-200/80 rounded-xl'>
                <button
                  type='button'
                  className={clsx(
                    'flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg text-xs transition-all cursor-pointer',
                    eraserType === 'stroke'
                      ? 'bg-base-100 text-primary font-semibold shadow-xs'
                      : 'text-base-content/70 hover:text-base-content',
                  )}
                  onClick={() => setEraserType('stroke')}
                >
                  <LuTrash2 size={16} />
                  <span>{_('Stroke (Full)')}</span>
                </button>
                <button
                  type='button'
                  className={clsx(
                    'flex flex-col items-center gap-1 py-1.5 px-2 rounded-lg text-xs transition-all cursor-pointer',
                    eraserType === 'partial'
                      ? 'bg-base-100 text-primary font-semibold shadow-xs'
                      : 'text-base-content/70 hover:text-base-content',
                  )}
                  onClick={() => setEraserType('partial')}
                >
                  <LuScissors size={16} />
                  <span>{_('Partial (Area)')}</span>
                </button>
              </div>

              {/* Mode Description Tip */}
              <div className='text-[11px] text-base-content/60 leading-tight px-0.5'>
                {eraserType === 'stroke'
                  ? _('Entire stroke is cleared from start to finish on touch.')
                  : _('Only the covered part is erased; other parts are kept.')}
              </div>

              {/* Continuous Eraser Size Slider */}
              <div className='flex flex-col gap-1 pt-1.5 border-t border-base-200/80'>
                <div className='flex items-center justify-between text-xs'>
                  <span className='text-base-content/70'>{_('Eraser Size')}</span>
                  <span className='font-mono font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10'>
                    {eraserRadius} px
                  </span>
                </div>
                <div className='flex items-center gap-2.5'>
                  <input
                    type='range'
                    min={8}
                    max={48}
                    step={2}
                    value={eraserRadius}
                    onChange={(e) => setEraserRadius(parseInt(e.target.value, 10))}
                    className='range range-primary range-xs flex-1 cursor-pointer'
                  />
                  <div
                    className='w-7 h-7 rounded-lg bg-base-200/80 flex items-center justify-center shrink-0 border border-base-300/50'
                    title={_('Eraser Size Preview')}
                  >
                    <div
                      className='rounded-full border border-base-content/40 bg-base-content/20'
                      style={{
                        width: `${Math.min(22, Math.max(6, eraserRadius * 0.5))}px`,
                        height: `${Math.min(22, Math.max(6, eraserRadius * 0.5))}px`,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Sub-toolbar for Color: Preset Palette + Custom Color Picker */}
          {activeSubMenu === 'color' && (
            <div className='flex flex-col gap-2.5 min-w-60'>
              <div className='flex items-center justify-between text-xs'>
                <span className='font-medium text-base-content/80'>{_('Stroke Color')}</span>
                <div className='flex items-center gap-1.5'>
                  <span
                    className='w-3.5 h-3.5 rounded-full border border-base-content/20 shadow-xs'
                    style={{ backgroundColor: activeColor }}
                  />
                  <span className='font-mono font-semibold text-primary px-1.5 py-0.5 rounded bg-primary/10 text-[11px]'>
                    {activeColor.toUpperCase()}
                  </span>
                </div>
              </div>

              {/* Preset Color Swatches */}
              <div className='flex items-center justify-between gap-1.5 py-1'>
                {COLOR_PRESETS.map((hex) => {
                  const displayHex = hex === '#000000' && isDarkMode ? '#ffffff' : hex;
                  const isSelected =
                    currentColor === hex || (hex === '#000000' && currentColor === '#ffffff');
                  return (
                    <button
                      key={hex}
                      type='button'
                      className={clsx(
                        'w-6 h-6 rounded-full transition-transform hover:scale-115 flex items-center justify-center border border-black/10 dark:border-white/10 shrink-0 cursor-pointer',
                        isSelected &&
                          'ring-2 ring-primary ring-offset-2 ring-offset-base-100 scale-110 shadow-xs',
                      )}
                      style={{ backgroundColor: displayHex }}
                      onClick={() => setColor(hex === '#000000' && isDarkMode ? '#ffffff' : hex)}
                      title={hex}
                    />
                  );
                })}
              </div>

              {/* Custom Color Option */}
              <div className='flex items-center justify-between pt-1.5 border-t border-base-200/80'>
                <label
                  title={_('Custom Color')}
                  className='flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs font-medium text-base-content/80 hover:bg-base-200/80 cursor-pointer transition-colors w-full'
                >
                  <span className='relative w-5 h-5 rounded-full overflow-hidden border border-base-300 flex items-center justify-center bg-linear-to-tr from-rose-500 via-emerald-400 to-indigo-500 shrink-0 shadow-xs'>
                    <input
                      type='color'
                      value={activeColor}
                      onInput={(e) => setColor((e.target as HTMLInputElement).value)}
                      onChange={(e) => setColor(e.target.value)}
                      className='opacity-0 absolute inset-0 cursor-pointer w-full h-full'
                    />
                  </span>
                  <span className='flex-1'>{_('Custom Color')}</span>
                  <LuPalette size={14} className='text-base-content/60' />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Shapes Dropdown Sub-menu */}
      {showShapeMenu && (
        <div
          ref={shapeMenuRef}
          className='pointer-events-auto absolute top-full mt-2 left-1/2 -translate-x-1/2 z-50 flex items-center gap-1 p-1 bg-base-100 rounded-xl shadow-xl border border-base-300 animate-in fade-in zoom-in-95 select-none'
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            title={_('Straight Line')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg',
              currentShape === 'line' && 'bg-base-300',
            )}
            onClick={() => handleSelectShape('line')}
          >
            <LuMinus size={15} />
          </button>
          <button
            title={_('Rectangle')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg',
              currentShape === 'rectangle' && 'bg-base-300',
            )}
            onClick={() => handleSelectShape('rectangle')}
          >
            <LuSquare size={14} />
          </button>
          <button
            title={_('Circle / Ellipse')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg',
              currentShape === 'ellipse' && 'bg-base-300',
            )}
            onClick={() => handleSelectShape('ellipse')}
          >
            <LuCircle size={14} />
          </button>
          <button
            title={_('Arrow')}
            className={clsx(
              'btn btn-ghost btn-xs h-7 w-7 p-0 rounded-lg',
              currentShape === 'arrow' && 'bg-base-300',
            )}
            onClick={() => handleSelectShape('arrow')}
          >
            <LuArrowRight size={15} />
          </button>
        </div>
      )}

      {showExportDialog && (
        <HandwritingExportDialog
          bookKey={bookKey}
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          containerWidth={containerWidth || effectiveWidth}
          containerHeight={
            containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 1200)
          }
        />
      )}

      {showOverviewDialog && (
        <HandwritingOverviewDialog
          bookKey={bookKey}
          isOpen={showOverviewDialog}
          onClose={() => setShowOverviewDialog(false)}
          containerWidth={containerWidth || effectiveWidth}
          containerHeight={
            containerHeight || (typeof window !== 'undefined' ? window.innerHeight : 1200)
          }
        />
      )}
    </>
  );
};
export default HandwritingToolbar;
