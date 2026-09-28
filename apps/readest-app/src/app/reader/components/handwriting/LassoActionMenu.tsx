import React from 'react';
import clsx from 'clsx';
import { LuStickyNote, LuHighlighter, LuCopy, LuX, LuCheck, LuSparkles } from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { ExtractedTextResult } from '@/utils/lassoTextSelector';

interface LassoActionMenuProps {
  selection: ExtractedTextResult;
  containerWidth: number;
  containerHeight: number;
  onCreateStickyNote: (text: string, x: number, y: number) => void;
  onHighlightText: (text: string) => void;
  onAskAI?: (text: string) => void;
  onClose: () => void;
}

export const LassoActionMenu: React.FC<LassoActionMenuProps> = ({
  selection,
  containerWidth,
  containerHeight,
  onCreateStickyNote,
  onHighlightText,
  onAskAI,
  onClose,
}) => {
  const _ = useTranslation();
  const [copied, setCopied] = React.useState(false);

  const rect = selection.boundingRect;
  const menuX = Math.max(
    10,
    Math.min(containerWidth - 280, (rect.left + rect.right) * containerWidth * 0.5 - 120),
  );
  const menuY = Math.max(10, rect.top * containerHeight - 52);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(selection.text);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        onClose();
      }, 800);
    } catch {
      // ignore
    }
  };

  return (
    <div
      className={clsx(
        'absolute z-40 pointer-events-auto flex items-center gap-1 p-1 rounded-2xl shadow-2xl',
        'bg-base-100/98 backdrop-blur-xl border border-base-300 dark:border-base-700 animate-in fade-in zoom-in-95 duration-150',
      )}
      style={{
        left: `${menuX}px`,
        top: `${menuY}px`,
      }}
    >
      <button
        type='button'
        onClick={() => onCreateStickyNote(selection.text, rect.right, rect.top)}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-amber-500/15 hover:text-amber-600 dark:hover:text-amber-400 transition-colors'
        title={_('Add sticky note for selected text')}
      >
        <LuStickyNote className='w-3.5 h-3.5 text-amber-500' />
        <span>{_('Note')}</span>
      </button>

      <button
        type='button'
        onClick={() => onHighlightText(selection.text)}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-blue-500/15 hover:text-blue-600 dark:hover:text-blue-400 transition-colors'
        title={_('Highlight selected text')}
      >
        <LuHighlighter className='w-3.5 h-3.5 text-blue-500' />
        <span>{_('Highlight')}</span>
      </button>

      {onAskAI && (
        <button
          type='button'
          onClick={() => onAskAI(selection.text)}
          className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-400 text-indigo-500 transition-colors'
          title={_('Ask AI to explain or summarize')}
        >
          <LuSparkles className='w-3.5 h-3.5 text-indigo-500 animate-pulse' />
          <span>{_('AI Explaining')}</span>
        </button>
      )}

      <button
        type='button'
        onClick={handleCopy}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium hover:bg-base-200 transition-colors'
        title={_('Copy text')}
      >
        {copied ? (
          <LuCheck className='w-3.5 h-3.5 text-emerald-500' />
        ) : (
          <LuCopy className='w-3.5 h-3.5 opacity-70' />
        )}
        <span>{copied ? _('Copied') : _('Copy')}</span>
      </button>

      <div className='w-px h-4 bg-base-300 dark:bg-base-700 mx-0.5' />

      <button
        type='button'
        onClick={onClose}
        className='p-1.5 rounded-lg hover:bg-base-200 opacity-60 hover:opacity-100 transition-colors'
        title='关闭'
      >
        <LuX className='w-3.5 h-3.5' />
      </button>
    </div>
  );
};

export default LassoActionMenu;
