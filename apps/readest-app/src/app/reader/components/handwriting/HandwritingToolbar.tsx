import React, { useState } from 'react';
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
} from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useThemeStore } from '@/store/themeStore';
import { HandwritingShapeType } from '@/types/handwriting';
import { persistPageHandwriting } from '@/services/handwritingService';
import HandwritingExportDialog from './HandwritingExportDialog';

interface HandwritingToolbarProps {
  bookKey: string;
  containerWidth: number;
  containerHeight: number;
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

const WIDTH_PRESETS = [
  { label: 'Fine', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Bold', value: 8 },
  { label: 'Thick', value: 16 },
];

export const HandwritingToolbar: React.FC<HandwritingToolbarProps> = ({
  bookKey,
  containerWidth,
  containerHeight,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const [showShapeMenu, setShowShapeMenu] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);

  const bookHash = bookKey.split('-')[0]!;

  const {
    activeBookKey,
    currentTool,
    currentShape,
    currentColor,
    currentWidth,
    stylusOnly,
    currentPageIndex,
    toggleHandwriting,
    setTool,
    setShape,
    setColor,
    setWidth,
    setStylusOnly,
    undo,
    redo,
    canUndo,
    canRedo,
    clearPage,
    getPageStrokes,
  } = useHandwritingStore();

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
  };

  const activeColor =
    currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;

  return (
    <>
      <div className='absolute top-3 left-1/2 -translate-x-1/2 z-45 flex items-center gap-1.5 px-3 py-1.5 rounded-2xl bg-base-100/90 backdrop-blur-md shadow-2xl border border-base-300/80 animate-in fade-in slide-in-from-top-4 duration-200 select-none'>
        {/* Tool Selector Group */}
        <div className='flex items-center gap-1 bg-base-200/60 p-1 rounded-xl'>
          {/* 钢笔 Fountain Pen */}
          <button
            title={_('Fountain Pen (Smooth & Pressure)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all',
              currentTool === 'pen'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => setTool('pen')}
          >
            <LuPenTool size={16} />
          </button>

          {/* 铅笔 Pencil */}
          <button
            title={_('Pencil (Textured & Light)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all',
              currentTool === 'pencil'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => setTool('pencil')}
          >
            <LuPencil size={16} />
          </button>

          {/* 荧光笔 Highlighter */}
          <button
            title={_('Highlighter (Multiply Blend)')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all',
              currentTool === 'highlighter'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => setTool('highlighter')}
          >
            <LuHighlighter size={16} />
          </button>

          {/* 橡皮擦 Eraser */}
          <button
            title={_('Stroke Eraser')}
            className={clsx(
              'btn btn-ghost btn-xs h-8 w-8 p-0 rounded-lg transition-all',
              currentTool === 'eraser'
                ? 'bg-primary text-primary-content shadow-xs scale-105'
                : 'text-base-content/80 hover:bg-base-300',
            )}
            onClick={() => setTool('eraser')}
          >
            <LuEraser size={16} />
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
              onClick={() => setShowShapeMenu((v) => !v)}
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

        {/* Stroke Width Selector */}
        {currentTool !== 'eraser' && (
          <div className='flex items-center gap-1.5'>
            {WIDTH_PRESETS.map((preset) => {
              const isSelected = currentWidth === preset.value;
              return (
                <button
                  key={preset.value}
                  title={_(preset.label)}
                  className={clsx(
                    'w-6 h-6 rounded-lg flex items-center justify-center transition-all',
                    isSelected ? 'bg-base-300/80 shadow-xs' : 'hover:bg-base-200/50',
                  )}
                  onClick={() => setWidth(preset.value)}
                >
                  <div
                    className='rounded-full bg-base-content'
                    style={{
                      width: Math.min(14, Math.max(3, preset.value * 0.8)),
                      height: Math.min(14, Math.max(3, preset.value * 0.8)),
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* Divider */}
        <div className='w-px h-5 bg-base-300/80 mx-0.5' />

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
