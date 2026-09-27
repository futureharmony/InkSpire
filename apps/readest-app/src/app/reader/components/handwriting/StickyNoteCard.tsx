import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import { LuPin, LuTrash2, LuMove } from 'react-icons/lu';
import { HandwritingStickyNote, StickyNoteColor } from '@/types/handwriting';
import { useHandwritingStore } from '@/store/handwritingStore';
import { persistPageStickyNotes } from '@/services/handwritingService';

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
  }
> = {
  yellow: {
    stripe: 'border-l-amber-500 dark:border-l-amber-400',
    badge: 'bg-amber-500',
    quoteBg: 'bg-amber-500/10 dark:bg-amber-400/10',
    quoteBorder: 'border-l-amber-500 dark:border-l-amber-400',
  },
  green: {
    stripe: 'border-l-emerald-500 dark:border-l-emerald-400',
    badge: 'bg-emerald-500',
    quoteBg: 'bg-emerald-500/10 dark:bg-emerald-400/10',
    quoteBorder: 'border-l-emerald-500 dark:border-l-emerald-400',
  },
  blue: {
    stripe: 'border-l-sky-500 dark:border-l-sky-400',
    badge: 'bg-sky-500',
    quoteBg: 'bg-sky-500/10 dark:bg-sky-400/10',
    quoteBorder: 'border-l-sky-500 dark:border-l-sky-400',
  },
  pink: {
    stripe: 'border-l-rose-500 dark:border-l-rose-400',
    badge: 'bg-rose-500',
    quoteBg: 'bg-rose-500/10 dark:bg-rose-400/10',
    quoteBorder: 'border-l-rose-500 dark:border-l-rose-400',
  },
  slate: {
    stripe: 'border-l-slate-400 dark:border-l-slate-400',
    badge: 'bg-slate-400',
    quoteBg: 'bg-slate-500/10 dark:bg-slate-400/10',
    quoteBorder: 'border-l-slate-400 dark:border-l-slate-400',
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
  const [content, setContent] = useState(note.content);
  const updateStickyNote = useHandwritingStore((state) => state.updateStickyNote);
  const removeStickyNote = useHandwritingStore((state) => state.removeStickyNote);
  const getStickyNotes = useHandwritingStore((state) => state.getStickyNotes);

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    initX: number;
    initY: number;
  } | null>(null);
  const [position, setPosition] = useState({ x: note.x, y: note.y });

  // Update position and content if props change
  useEffect(() => {
    setPosition({ x: note.x, y: note.y });
    setContent(note.content);
  }, [note.x, note.y, note.content]);

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
    const newX = Math.max(0.02, Math.min(0.85, dragStartRef.current.initX + dx));
    const newY = Math.max(0.02, Math.min(0.85, dragStartRef.current.initY + dy));
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
          {note.content || note.selectedText || '便签'}
        </span>
      </div>
    );
  }

  // Expanded Sticky Note Card
  return (
    <div
      className={clsx(
        'absolute z-30 pointer-events-auto flex flex-col rounded-2xl shadow-2xl backdrop-blur-xl transition-shadow duration-150',
        'w-64 max-w-[90vw] overflow-hidden',
        'bg-base-100/95 dark:bg-base-200/95 text-base-content',
        'border border-base-content/15 border-l-4',
        colorConfig.stripe,
      )}
      style={{
        left: `${pixelLeft}px`,
        top: `${pixelTop}px`,
      }}
    >
      {/* Card Header with drag handle, colors, pin, delete */}
      <div
        className='flex items-center justify-between px-3 py-2 border-b border-base-content/10 cursor-move select-none bg-base-200/40 dark:bg-base-300/30'
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

        <div className='flex items-center gap-1 text-base-content/70'>
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

      {/* Selected text quote if any */}
      {note.selectedText && (
        <div
          className={clsx(
            'px-3 py-2 text-xs font-serif italic border-l-2 opacity-90 line-clamp-3 mx-2.5 mt-2 rounded',
            colorConfig.quoteBg,
            colorConfig.quoteBorder,
          )}
        >
          “{note.selectedText}”
        </div>
      )}

      {/* Note Body Textarea */}
      <div className='p-3 flex-1 flex flex-col'>
        <textarea
          value={content}
          onChange={handleContentChange}
          placeholder='在此记录灵感、批注或书摘...'
          rows={3}
          className='w-full bg-transparent resize-none text-xs sm:text-sm font-sans focus:outline-none placeholder:text-base-content/35 text-base-content leading-relaxed'
          autoFocus={!content}
        />
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
