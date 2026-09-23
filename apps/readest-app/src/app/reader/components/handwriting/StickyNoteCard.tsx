import React, { useState, useRef, useEffect } from 'react';
import clsx from 'clsx';
import {
  LuPin,
  LuTrash2,
  LuMove,
} from 'react-icons/lu';
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

const COLOR_CLASSES: Record<StickyNoteColor, { bg: string; border: string; badge: string; accent: string }> = {
  yellow: {
    bg: 'bg-amber-50 dark:bg-amber-950/80 text-amber-950 dark:text-amber-100',
    border: 'border-amber-300 dark:border-amber-700/60 shadow-amber-500/10',
    badge: 'bg-amber-400',
    accent: 'bg-amber-100 dark:bg-amber-900/50',
  },
  green: {
    bg: 'bg-emerald-50 dark:bg-emerald-950/80 text-emerald-950 dark:text-emerald-100',
    border: 'border-emerald-300 dark:border-emerald-700/60 shadow-emerald-500/10',
    badge: 'bg-emerald-400',
    accent: 'bg-emerald-100 dark:bg-emerald-900/50',
  },
  blue: {
    bg: 'bg-sky-50 dark:bg-sky-950/80 text-sky-950 dark:text-sky-100',
    border: 'border-sky-300 dark:border-sky-700/60 shadow-sky-500/10',
    badge: 'bg-sky-400',
    accent: 'bg-sky-100 dark:bg-sky-900/50',
  },
  pink: {
    bg: 'bg-rose-50 dark:bg-rose-950/80 text-rose-950 dark:text-rose-100',
    border: 'border-rose-300 dark:border-rose-700/60 shadow-rose-500/10',
    badge: 'bg-rose-400',
    accent: 'bg-rose-100 dark:bg-rose-900/50',
  },
  slate: {
    bg: 'bg-slate-50 dark:bg-slate-900/90 text-slate-900 dark:text-slate-100',
    border: 'border-slate-300 dark:border-slate-700/60 shadow-slate-500/10',
    badge: 'bg-slate-400',
    accent: 'bg-slate-200/60 dark:bg-slate-800/60',
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

  const dragStartRef = useRef<{ clientX: number; clientY: number; initX: number; initY: number } | null>(null);
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

  const colors = COLOR_CLASSES[note.color || 'yellow'];

  const pixelLeft = position.x * containerWidth;
  const pixelTop = position.y * containerHeight;

  // Minimized state: sleek pin marker on margin or page
  if (note.isPinned) {
    return (
      <div
        className={clsx(
          'absolute z-30 cursor-pointer pointer-events-auto transition-transform hover:scale-110 active:scale-95',
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full shadow-md border backdrop-blur-sm',
          colors.bg,
          colors.border,
        )}
        style={{
          left: `${pixelLeft}px`,
          top: `${pixelTop}px`,
        }}
        onClick={handleTogglePin}
        title={note.selectedText || note.content || '便签'}
      >
        <span className={clsx('w-2 h-2 rounded-full', colors.badge)} />
        <LuPin className='w-3 h-3 rotate-45 opacity-80' />
        <span className='text-xs font-medium max-w-[100px] truncate'>
          {note.content || note.selectedText || '便签'}
        </span>
      </div>
    );
  }

  // Expanded Sticky Note Card
  return (
    <div
      className={clsx(
        'absolute z-30 pointer-events-auto flex flex-col rounded-xl shadow-xl border backdrop-blur-md',
        'w-64 max-w-[90vw] transition-shadow duration-150',
        colors.bg,
        colors.border,
      )}
      style={{
        left: `${pixelLeft}px`,
        top: `${pixelTop}px`,
      }}
    >
      {/* Card Header with drag handle, colors, pin, delete */}
      <div
        className='flex items-center justify-between px-2.5 py-1.5 border-b border-black/10 dark:border-white/10 cursor-move select-none'
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className='flex items-center gap-1'>
          <LuMove className='w-3.5 h-3.5 opacity-50 mr-0.5' />
          {COLOR_OPTIONS.map((c) => (
            <button
              key={c}
              type='button'
              onClick={() => handleColorChange(c)}
              className={clsx(
                'w-3.5 h-3.5 rounded-full transition-transform',
                COLOR_CLASSES[c].badge,
                note.color === c ? 'ring-2 ring-offset-1 ring-black/40 dark:ring-white/60 scale-110' : 'opacity-70 hover:opacity-100',
              )}
            />
          ))}
        </div>

        <div className='flex items-center gap-1'>
          <button
            type='button'
            onClick={handleTogglePin}
            className='p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors'
            title='收起到边栏'
          >
            <LuPin className='w-3.5 h-3.5 opacity-70' />
          </button>
          <button
            type='button'
            onClick={handleDelete}
            className='p-1 rounded hover:bg-red-500/20 text-red-600 dark:text-red-400 transition-colors'
            title='删除便签'
          >
            <LuTrash2 className='w-3.5 h-3.5' />
          </button>
        </div>
      </div>

      {/* Selected text quote if any */}
      {note.selectedText && (
        <div className={clsx('px-3 py-1.5 text-xs font-serif italic border-b border-black/5 dark:border-white/5 opacity-85 line-clamp-3', colors.accent)}>
          “{note.selectedText}”
        </div>
      )}

      {/* Note Body Textarea */}
      <div className='p-2.5 flex-1 flex flex-col'>
        <textarea
          value={content}
          onChange={handleContentChange}
          placeholder='在此记录灵感、批注或书摘...'
          rows={3}
          className='w-full bg-transparent resize-none text-xs sm:text-sm font-sans focus:outline-none placeholder:text-black/35 dark:placeholder:text-white/35 leading-relaxed'
          autoFocus={!content}
        />
      </div>

      {/* Footer info timestamp */}
      <div className='px-2.5 pb-1.5 flex justify-between items-center text-[10px] opacity-45 select-none'>
        <span>第 {pageIndex + 1} 页</span>
        <span>{new Date(note.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
      </div>
    </div>
  );
};

export default StickyNoteCard;
