import React from 'react';
import clsx from 'clsx';
import {
  LuStickyNote,
  LuHighlighter,
  LuCopy,
  LuX,
  LuCheck,
} from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { ExtractedTextResult } from '@/utils/lassoTextSelector';

interface LassoActionMenuProps {
  selection: ExtractedTextResult;
  containerWidth: number;
  containerHeight: number;
  onCreateStickyNote: (text: string, x: number, y: number) => void;
  onHighlightText: (text: string) => void;
  onClose: () => void;
}

export const LassoActionMenu: React.FC<LassoActionMenuProps> = ({
  selection,
  containerWidth,
  containerHeight,
  onCreateStickyNote,
  onHighlightText,
  onClose,
}) => {
  const _ = useTranslation();
  const [copied, setCopied] = React.useState(false);

  const rect = selection.boundingRect;
  const menuX = Math.max(10, Math.min(containerWidth - 220, (rect.left + rect.right) * containerWidth * 0.5 - 100));
  const menuY = Math.max(10, rect.top * containerHeight - 50);

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
        'absolute z-40 pointer-events-auto flex items-center gap-1 p-1 rounded-xl shadow-2xl',
        'bg-base-100/95 backdrop-blur-md border border-base-300 dark:border-base-700 animate-in fade-in zoom-in-95 duration-150',
      )}
      style={{
        left: `${menuX}px`,
        top: `${menuY}px`,
      }}
    >
      <button
        type='button'
        onClick={() => onCreateStickyNote(selection.text, rect.right, rect.top)}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors'
        title={_('Add sticky note for selected text')}
      >
        <LuStickyNote className='w-3.5 h-3.5 text-amber-500' />
        <span>{_('Note')}</span>
      </button>

      <button
        type='button'
        onClick={() => onHighlightText(selection.text)}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-primary/10 hover:text-primary transition-colors'
        title={_('Highlight selected text')}
      >
        <LuHighlighter className='w-3.5 h-3.5 text-blue-500' />
        <span>{_('Highlight')}</span>
      </button>

      <button
        type='button'
        onClick={handleCopy}
        className='flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium hover:bg-base-200 transition-colors'
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
