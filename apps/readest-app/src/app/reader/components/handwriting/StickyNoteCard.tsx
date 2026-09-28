import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { LuPin, LuTrash2, LuMove, LuPenTool, LuType, LuEraser, LuChevronDown, LuChevronUp } from 'react-icons/lu';
import { HandwritingStickyNote, HandwritingStroke, StickyNoteColor } from '@/types/handwriting';
import { useHandwritingStore } from '@/store/handwritingStore';
import { persistPageStickyNotes } from '@/services/handwritingService';
import { renderStrokeToCanvas } from '@/utils/handwriting';
import { uniqueId } from '@/utils/misc';
import { useThemeStore } from '@/store/themeStore';

interface StickyNoteCardProps {
  note: HandwritingStickyNote;
  containerWidth: number;
  containerHeight: number;
  bookHash: string;
  pageIndex: number;
}

const COLOR_CONFIGS: Record<
  StickyNoteColor,
  {
    stripe: string;
    badge: string;
    quoteBg: string;
    quoteBorder: string;
    cardBg: string;
    canvasBg: string;
  }
> = {
  yellow: {
    stripe: 'border-l-amber-500 dark:border-l-amber-400',
    badge: 'bg-amber-500',
    quoteBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    quoteBorder: 'border-l-amber-500 dark:border-l-amber-400',
    cardBg: 'bg-amber-50/90 dark:bg-[#252219]/95',
    canvasBg: 'rgba(251, 191, 36, 0.05)',
  },
  green: {
    stripe: 'border-l-emerald-500 dark:border-l-emerald-400',
    badge: 'bg-emerald-500',
    quoteBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    quoteBorder: 'border-l-emerald-500 dark:border-l-emerald-400',
    cardBg: 'bg-emerald-50/90 dark:bg-[#18261e]/95',
    canvasBg: 'rgba(16, 185, 129, 0.05)',
  },
  blue: {
    stripe: 'border-l-sky-500 dark:border-l-sky-400',
    badge: 'bg-sky-500',
    quoteBg: 'bg-sky-500/10 dark:bg-sky-400/10',
    quoteBorder: 'border-l-sky-500 dark:border-l-sky-400',
    cardBg: 'bg-sky-50/90 dark:bg-[#18222d]/95',
    canvasBg: 'rgba(14, 165, 233, 0.05)',
  },
  pink: {
    stripe: 'border-l-rose-500 dark:border-l-rose-400',
    badge: 'bg-rose-500',
    quoteBg: 'bg-rose-500/10 dark:bg-rose-400/10',
    quoteBorder: 'border-l-rose-500 dark:border-l-rose-400',
    cardBg: 'bg-rose-50/90 dark:bg-[#281a1f]/95',
    canvasBg: 'rgba(244, 63, 94, 0.05)',
  },
  slate: {
    stripe: 'border-l-slate-400 dark:border-l-slate-400',
    badge: 'bg-slate-400',
    quoteBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    quoteBorder: 'border-l-slate-400 dark:border-l-slate-400',
    cardBg: 'bg-slate-100/90 dark:bg-[#1e232b]/95',
    canvasBg: 'rgba(148, 163, 184, 0.05)',
  },
};

const COLOR_OPTIONS: StickyNoteColor[] = ['yellow', 'green', 'blue', 'pink', 'slate'];

export const StickyNoteCard: React.FC<StickyNoteCardProps> = ({
  note,
  containerWidth,
  containerHeight,
  bookHash,
  pageIndex,
}) => {
  const { isDarkMode } = useThemeStore();
  const [content, setContent] = useState(note.content);
  // Default mode: handwriting doodle if no text content, or toggleable
  const [inputMode, setInputMode] = useState<'draw' | 'type'>('draw');
  const [isQuoteExpanded, setIsQuoteExpanded] = useState(false);
  const [cardStrokes, setCardStrokes] = useState<HandwritingStroke[]>(note.strokes || []);

  const updateStickyNote = useHandwritingStore((state) => state.updateStickyNote);
  const removeStickyNote = useHandwritingStore((state) => state.removeStickyNote);
  const getStickyNotes = useHandwritingStore((state) => state.getStickyNotes);
  const currentColor = useHandwritingStore((state) => state.currentColor);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initX: number;
    initY: number;
  } | null>(null);
  const [position, setPosition] = useState({ x: note.x, y: note.y });

  // Note drawing canvas
  const noteCanvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingInNote = useRef(false);
  const currentNoteStroke = useRef<Array<{ x: number; y: number; pressure: number }>>([]);

  // Sync state with note prop
  useEffect(() => {
    setPosition({ x: note.x, y: note.y });
    setContent(note.content);
    setCardStrokes(note.strokes || []);
  }, [note.x, note.y, note.content, note.strokes]);

  // Redraw handwritten strokes inside note canvas
  const redrawNoteCanvas = () => {
    const canvas = noteCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const stroke of cardStrokes) {
      renderStrokeToCanvas(ctx, stroke, canvas.width, canvas.height, isDarkMode);
    }
  };

  useEffect(() => {
    redrawNoteCanvas();
  }, [cardStrokes, isDarkMode, inputMode]);

  const handleDragStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      initX: position.x,
      initY: position.y,
    };
  };

  const handleDragMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    const dx = (e.clientX - dragStartRef.current.clientX) / Math.max(1, containerWidth);
    const dy = (e.clientY - dragStartRef.current.clientY) / Math.max(1, containerHeight);
    const newX = Math.max(0.01, Math.min(0.85, dragStartRef.current.initX + dx));
    const newY = Math.max(0.01, Math.min(0.85, dragStartRef.current.initY + dy));
    setPosition({ x: newX, y: newY });
  };

  const handleDragEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragStartRef.current) return;
    e.stopPropagation();
    dragStartRef.current = null;
    updateStickyNote(bookHash, pageIndex, note.id, { x: position.x, y: position.y });
    const currentNotes = getStickyNotes(bookHash, pageIndex);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
  };

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setContent(val);
    updateStickyNote(bookHash, pageIndex, note.id, { content: val });
    const currentNotes = getStickyNotes(bookHash, pageIndex);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
  };

  const handleColorChange = (c: StickyNoteColor) => {
    updateStickyNote(bookHash, pageIndex, note.id, { color: c });
    const currentNotes = getStickyNotes(bookHash, pageIndex);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
  };

  const handleTogglePin = () => {
    const nextPinned = !note.isPinned;
    updateStickyNote(bookHash, pageIndex, note.id, { isPinned: nextPinned });
    const currentNotes = getStickyNotes(bookHash, pageIndex);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
  };

  const handleDelete = () => {
    removeStickyNote(bookHash, pageIndex, note.id);
    const currentNotes = getStickyNotes(bookHash, pageIndex).filter((n) => n.id !== note.id);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
  };

  // Note handwriting pointer handlers
  const handleNotePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.stopPropagation();
    const canvas = noteCanvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);
    isDrawingInNote.current = true;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    currentNoteStroke.current = [{ x, y, pressure: e.pressure || 0.6 }];
  };

  const handleNotePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingInNote.current) return;
    e.stopPropagation();
    const canvas = noteCanvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    currentNoteStroke.current.push({ x, y, pressure: e.pressure || 0.6 });

    // Live preview on canvas
    const ctx = canvas.getContext('2d');
    if (ctx && currentNoteStroke.current.length > 1) {
      const pts = currentNoteStroke.current;
      const p1 = pts[pts.length - 2]!;
      const p2 = pts[pts.length - 1]!;
      ctx.beginPath();
      ctx.strokeStyle = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
      ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
      ctx.stroke();
    }
  };

  const handleNotePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!isDrawingInNote.current) return;
    e.stopPropagation();
    isDrawingInNote.current = false;
    const canvas = noteCanvasRef.current;
    if (canvas) {
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }

    if (currentNoteStroke.current.length > 1) {
      const strokeColor = currentColor === '#000000' && isDarkMode ? '#ffffff' : currentColor;
      const newStroke: HandwritingStroke = {
        id: uniqueId(),
        tool: 'pen',
        color: strokeColor,
        width: 3,
        opacity: 0.95,
        points: currentNoteStroke.current,
        pageIndex,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updatedStrokes = [...cardStrokes, newStroke];
      setCardStrokes(updatedStrokes);
      updateStickyNote(bookHash, pageIndex, note.id, { strokes: updatedStrokes });
      const currentNotes = getStickyNotes(bookHash, pageIndex);
      persistPageStickyNotes(bookHash, pageIndex, currentNotes);
    }
    currentNoteStroke.current = [];
  };

  const handleClearNoteStrokes = () => {
    setCardStrokes([]);
    updateStickyNote(bookHash, pageIndex, note.id, { strokes: [] });
    const currentNotes = getStickyNotes(bookHash, pageIndex);
    persistPageStickyNotes(bookHash, pageIndex, currentNotes);
    redrawNoteCanvas();
  };

  const colorConfig = COLOR_CONFIGS[note.color || 'yellow'];
  const pixelLeft = position.x * containerWidth;
  const pixelTop = position.y * containerHeight;

  // Minimized state: sleek pin marker on margin or page
  if (note.isPinned) {
    return (
      <div
        className='absolute z-30 cursor-pointer pointer-events-auto transition-transform hover:scale-105 active:scale-95 flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-lg border border-base-content/15 bg-base-100/90 dark:bg-base-200/90 text-base-content backdrop-blur-md'
        style={{
          left: `${pixelLeft}px`,
          top: `${pixelTop}px`,
        }}
        onClick={handleTogglePin}
        title={note.selectedText || note.content || '便签'}
      >
        <span className={clsx('w-2 h-2 rounded-full flex-shrink-0', colorConfig.badge)} />
        <LuPin className='w-3 h-3 rotate-45 opacity-70' />
        <span className='text-xs font-medium max-w-[120px] truncate opacity-90'>
          {note.content || note.selectedText || '手写便签'}
        </span>
      </div>
    );
  }

  // Expanded Sticky Note Card
  return (
    <div
      className={clsx(
        'absolute z-30 pointer-events-auto flex flex-col rounded-2xl shadow-2xl backdrop-blur-xl transition-shadow duration-150',
        'w-72 max-w-[92vw] overflow-hidden',
        colorConfig.cardBg,
        'border border-base-content/15 border-l-4 text-base-content',
        colorConfig.stripe,
      )}
      style={{
        left: `${pixelLeft}px`,
        top: `${pixelTop}px`,
      }}
    >
      {/* Card Header with drag handle, colors, handwriting/type toggle, pin, delete */}
      <div
        className='flex items-center justify-between px-3 py-2 border-b border-base-content/10 cursor-move select-none bg-base-content/5'
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className='flex items-center gap-1.5'>
          <LuMove className='w-3.5 h-3.5 opacity-40 mr-0.5' />
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type='button'
              onClick={() => handleColorChange(c)}
              className={clsx(
                'w-3.5 h-3.5 rounded-full transition-transform',
                COLOR_CONFIGS[c].badge,
                note.color === c
                  ? 'ring-2 ring-offset-1 ring-base-content/40 scale-110'
                  : 'opacity-60 hover:opacity-100',
              )}
            />
          ))}
        </div>

        <div className='flex items-center gap-1 text-base-content/75'>
          {/* Mode toggle: Handwriting vs Keyboard Type */}
          <button
            type='button'
            onClick={() => setInputMode((m) => (m === 'draw' ? 'type' : 'draw'))}
            className={clsx(
              'p-1 rounded-lg transition-colors flex items-center gap-0.5 text-xs font-medium',
              inputMode === 'draw'
                ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400 font-semibold'
                : 'hover:bg-base-content/10',
            )}
            title={inputMode === 'draw' ? '切换为键盘输入' : '切换为手写模式'}
          >
            {inputMode === 'draw' ? (
              <LuPenTool className='w-3.5 h-3.5' />
            ) : (
              <LuType className='w-3.5 h-3.5' />
            )}
          </button>

          {inputMode === 'draw' && cardStrokes.length > 0 && (
            <button
              type='button'
              onClick={handleClearNoteStrokes}
              className='p-1 rounded-lg hover:bg-base-content/10 opacity-70 hover:opacity-100 transition-colors'
              title='清除卡片手写'
            >
              <LuEraser className='w-3.5 h-3.5' />
            </button>
          )}

          <button
            type='button'
            onClick={handleTogglePin}
            className='p-1 rounded-lg hover:bg-base-content/10 transition-colors'
            title='收起到边栏'
          >
            <LuPin className='w-3.5 h-3.5 opacity-80' />
          </button>
          <button
            type='button'
            onClick={handleDelete}
            className='p-1 rounded-lg hover:bg-error/20 text-error transition-colors'
            title='删除便签'
          >
            <LuTrash2 className='w-3.5 h-3.5' />
          </button>
        </div>
      </div>

      {/* Selected text quote with expand/collapse */}
      {note.selectedText && (
        <div
          className={clsx(
            'px-3 py-1.5 text-xs font-serif italic border-l-2 opacity-95 mx-2.5 mt-2 rounded transition-all',
            colorConfig.quoteBg,
            colorConfig.quoteBorder,
          )}
        >
          <div className='flex items-start justify-between gap-1'>
            <div className={clsx('leading-relaxed', !isQuoteExpanded && 'line-clamp-3')}>
              “{note.selectedText}”
            </div>
            {note.selectedText.length > 60 && (
              <button
                type='button'
                onClick={() => setIsQuoteExpanded((v) => !v)}
                className='text-[10px] opacity-60 hover:opacity-100 p-0.5 shrink-0 ml-1'
                title={isQuoteExpanded ? '收起' : '展开全文'}
              >
                {isQuoteExpanded ? (
                  <LuChevronUp className='w-3 h-3' />
                ) : (
                  <LuChevronDown className='w-3 h-3' />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Note Body: Default to Handwriting Canvas, or Keyboard Textarea */}
      <div className='p-2.5 flex-1 flex flex-col relative min-h-[110px]'>
        {inputMode === 'draw' ? (
          <div className='relative w-full h-32 rounded-xl border border-base-content/10 bg-base-100/50 dark:bg-black/20 overflow-hidden touch-none cursor-crosshair'>
            <canvas
              ref={noteCanvasRef}
              width={260}
              height={128}
              className='w-full h-full'
              onPointerDown={handleNotePointerDown}
              onPointerMove={handleNotePointerMove}
              onPointerUp={handleNotePointerUp}
              onPointerCancel={handleNotePointerUp}
            />
            {cardStrokes.length === 0 && !isDrawingInNote.current && (
              <div className='absolute inset-0 flex items-center justify-center pointer-events-none text-xs text-base-content/30 gap-1.5 select-none font-sans'>
                <LuPenTool className='w-3.5 h-3.5 opacity-40' />
                <span>使用手写笔直接在此书写...</span>
              </div>
            )}
          </div>
        ) : (
          <textarea
            value={content}
            onChange={handleContentChange}
            placeholder='在此输入文字笔记...'
            rows={4}
            className='w-full bg-transparent resize-none text-xs sm:text-sm font-sans focus:outline-none placeholder:text-base-content/35 text-base-content leading-relaxed p-1'
            autoFocus
          />
        )}
      </div>

      {/* Footer info timestamp */}
      <div className='px-3 pb-2 flex justify-between items-center text-[10px] text-base-content/40 select-none'>
        <span>第 {pageIndex + 1} 页</span>
        <span>
          {new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </span>
      </div>
    </div>
  );
};

export default StickyNoteCard;
