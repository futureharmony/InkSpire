import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useThemeStore } from '@/store/themeStore';
import { HandwritingShapeType, HandwritingTool } from '@/types/handwriting';
import { persistPageHandwriting } from '@/services/handwritingService';
import { Insets } from '@/types/misc';
import HandwritingExportDialog from './HandwritingExportDialog';

interface HandwritingToolbarProps {
  bookKey: string;
  containerWidth: number;
  containerHeight: number;
  contentInsets?: Insets;
}

const COLOR_PRESETS = [
  '#000000',
  '#ef4444', // Red
  '#3b82f6', // Blue
  '#22c55e', // Green
  '#eab308', // Yellow
  '#a855f7', // Purple
  '#f97316', // Orange
];

export const HandwritingToolbar: React.FC<HandwritingToolbarProps> = ({
  bookKey,
  containerWidth,
  containerHeight,
  contentInsets,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [activeSubMenu, setActiveSubMenu] = useState<'pen' | 'pencil' | 'highlighter' | 'eraser' | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const subMenuRef = useRef<HTMLDivElement>(null);

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

  // Close menus on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (
        toolbarRef.current &&
        !toolbarRef.current.contains(e.target as Node) &&
        subMenuRef.current &&
        !subMenuRef.current.contains(e.target as Node)
      ) {
        setActiveSubMenu(null);
        setShowShapeMenu(false);
      }
    };
    window.addEventListener('pointerdown', handleOutsideClick);
    return () => window.removeEventListener('pointerdown', handleOutsideClick);
  }, []);

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
    setActiveSubMenu(null);
  };

  const handleToolClick = (tool: HandwritingTool) => {
    setShowShapeMenu(false);
    if (tool === 'shape') {
      setActiveSubMenu(null);
      setShowShapeMenu((v) => !v);
      return;
    }

    if (currentTool === tool) {
      // Second click on active tool -> toggle floating sub-toolbar
      setActiveSubMenu((prev) => (prev === tool ? null : (tool as 'pen' | 'pencil' | 'highlighter' | 'eraser')));
    } else {
      // First click on inactive tool -> activate tool
      setTool(tool);
      setActiveSubMenu(null);
    }
  };

  const activeColor =
    currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

  const topOffset = Math.max(12, (contentInsets?.top || 0) + 8);

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
      {/* Primary Handwriting Toolbar */}
      <div
        ref={toolbarRef}
        className='pointer-events-auto absolute left-1/2 -translate-x-1/2 z-50 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-base-100/95 backdrop-blur-md shadow-2xl border border-base-300/80 animate-in fade-in slide-in-from-top-4 duration-200 select-none'
        style={{ top: `${topOffset}px` }}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerMove={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Tool Selector Group */}
        <div className='flex items-center gap-1 bg-base-200/60 p-1 rounded-xl'>
          {/* 钢笔 Fountain Pen */}
          <button
            title={_('Fountain Pen (Smooth & Pressure)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all relative',
              currentTool === 'pen'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => handleToolClick('pen')}
          >
            <LuPenTool size={16} />
            {currentTool === 'pen' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 铅笔 Pencil */}
          <button
            title={_('Pencil (Textured & Light)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all relative',
              currentTool === 'pencil'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => handleToolClick('pencil')}
          >
            <LuPencil size={16} />
            {currentTool === 'pencil' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 荧光笔 Highlighter */}
          <button
            title={_('Highlighter (Multiply Blend)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all relative',
              currentTool === 'highlighter'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => handleToolClick('highlighter')}
          >
            <LuHighlighter size={16} />
            {currentTool === 'highlighter' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 橡皮擦 Eraser */}
          <button
            title={_('Stroke Eraser')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all relative',
              currentTool === 'eraser'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => handleToolClick('eraser')}
          >
            <LuEraser size={16} />
            {currentTool === 'eraser' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 套索选字与便签 Lasso Tool */}
          <button
            title={_('Lasso Text Selection & Sticky Notes')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all relative',
              currentTool === 'lasso'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => handleToolClick('lasso')}
          >
            <LuLassoSelect size={16} />
            {currentTool === 'lasso' && (
              <span className='absolute bottom-0.5 right-0.5 w-1 h-1 rounded-full bg-primary-content' />
            )}
          </button>

          {/* 形状 Shapes */}
          <div className='relative'>
            <button
              title={_('Shapes Tool (Line, Rectangle, Circle, Arrow)')}
              className={clsx(
                'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all',
                currentTool === 'shape'
                  ? 'bg-primary text-primary-content shadow-xs scale-105'
                  : 'text-base-content/80 hover:bg-base-300',
              )}
              onClick={() => handleToolClick('shape')}
            >
              <LuShapes size={16} />
            </button>

            {showShapeMenu && (
              <div className='absolute top-full mt-2 left-0 z-50 flex items-center gap-1 p-1 bg-base-100 rounded-xl shadow-xl border border-base-300 animate-in fade-in zoom-in-95'>
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
          </div>
        </div>

        {/* Divider */}
        <div className='w-px h-5 bg-base-300/80 mx-0.5' />

        {/* Color Palette (hidden for eraser) */}
        {currentTool !== 'eraser' && (
          <div className='flex items-center gap-1'>
            {COLOR_PRESETS.map((hex) => {
              const displayHex = hex === '#000000' && isDarkMode ? '#ffffff' : hex;
              const isSelected = currentColor === hex || (hex === '#000000' && currentColor === '#ffffff');
              return (
                <button
                  key={hex}
                  className={clsx(
                    'w-5 h-5 rounded-full transition-transform hover:scale-110 flex items-center justify-center border border-black/10',
                    isSelected && 'ring-2 ring-primary ring-offset-1 ring-offset-base-100 scale-110',
                  )}
                  style={{ backgroundColor: displayHex }}
                  onClick={() => setColor(hex === '#000000' && isDarkMode ? '#ffffff' : hex)}
                  title={hex}
                />
              );
            })}

            {/* Custom Color Picker */}
            <label
              title={_('Custom Color')}
              className='relative w-5 h-5 rounded-full cursor-pointer overflow-hidden border border-base-300 flex items-center justify-center bg-linear-to-tr from-rose-500 via-emerald-400 to-indigo-500'
            >
              <input
                type='color'
                value={activeColor}
                onChange={(e) => setColor(e.target.value)}
                className='opacity-0 absolute inset-0 cursor-pointer w-full h-full'
              />
            </label>
          </div>
        )}

        {/* Divider */}
        {currentTool !== 'eraser' && (
          <div className='w-px h-5 bg-base-300/80 mx-0.5' />
        )}

        {/* Palm Rejection / Stylus Only Toggle */}
        <button
          title={
            stylusOnly
              ? _('Stylus Only Mode (Touch gestures paginate)')
              : _('Finger Drawing Allowed')
          }
          className={clsx(
            'btn btn-ghost btn-xs h-8 px-2 rounded-lg gap-1 text-xs font-medium',
            stylusOnly ? 'bg-primary/10 text-primary' : 'text-base-content/70',
          )}
          onClick={() => setStylusOnly(!stylusOnly)}
        >
          {stylusOnly ? <LuPenTool size={14} /> : <LuHand size={14} />}
          <span className='hidden sm:inline'>
            {stylusOnly ? _('Stylus Only') : _('Finger Draw')}
          </span>
        </button>

        {/* Undo / Redo */}
        <div className='flex items-center gap-0.5'>
          <button
            title={_('Undo (Ctrl+Z)')}
            disabled={!undoAvailable}
            className='btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-base-content/80 disabled:opacity-30'
            onClick={handleUndo}
          >
            <LuUndo2 size={16} />
          </button>
          <button
            title={_('Redo (Ctrl+Y)')}
            disabled={!redoAvailable}
            className='btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-base-content/80 disabled:opacity-30'
            onClick={handleRedo}
          >
            <LuRedo2 size={16} />
          </button>
        </div>

        {/* Clear Page */}
        <button
          title={_('Clear Current Page')}
          className='btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-error hover:bg-error/10'
          onClick={handleClearPage}
        >
          <LuTrash2 size={16} />
        </button>

        {/* Export / Import */}
        <button
          title={_('Export / Import Handwriting')}
          className='btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-base-content/80 hover:bg-base-200'
          onClick={() => setShowExportDialog(true)}
        >
          <LuDownload size={16} />
        </button>

        {/* Close Button */}
        <button
          title={_('Close Handwriting Toolbar')}
          className='btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg text-base-content/60 hover:text-base-content hover:bg-base-200'
          onClick={() => toggleHandwriting(bookKey, false)}
        >
          <LuX size={16} />
        </button>
      </div>

      {/* Floating Sub-Toolbar: Below primary toolbar, never on the same horizontal row */}
      {activeSubMenu && (
        <div
          ref={subMenuRef}
          className='pointer-events-auto absolute left-1/2 -translate-x-1/2 z-50 p-3.5 rounded-2xl bg-base-100/95 backdrop-blur-md shadow-2xl border border-base-300/80 animate-in fade-in zoom-in-95 duration-150 select-none'
          style={{ top: `${topOffset + 48}px` }}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Sub-toolbar for Pen / Pencil / Highlighter: Continuous Stroke Width Slider */}
          {(activeSubMenu === 'pen' || activeSubMenu === 'pencil' || activeSubMenu === 'highlighter') && (
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
            <div className='flex flex-col gap-2.5 min-w-64'>
              <div className='text-xs font-medium text-base-content/80'>
                {_('Eraser Mode')}
              </div>

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
        </div>
      )}

      {showExportDialog && (
        <HandwritingExportDialog
          bookKey={bookKey}
          isOpen={showExportDialog}
          onClose={() => setShowExportDialog(false)}
          containerWidth={containerWidth}
          containerHeight={containerHeight}
        />
      )}
    </>
  );
};
export default HandwritingToolbar;

