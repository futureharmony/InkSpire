import React, { useRef, useState } from 'react';
import { LuDownload, LuUpload, LuFileText, LuImage, LuCode, LuX } from 'react-icons/lu';
import { useTranslation } from '@/hooks/useTranslation';
import { useBookDataStore } from '@/store/bookDataStore';
import { useHandwritingStore } from '@/store/handwritingStore';
import { useThemeStore } from '@/store/themeStore';
import {
  exportBookAsJson,
  exportBookAsPdf,
  exportPageAsPng,
  exportPageAsSvg,
  importBookFromJson,
} from '@/utils/handwriting';
import { persistPageHandwriting } from '@/services/handwritingService';
import { eventDispatcher } from '@/utils/event';
import ModalPortal from '@/components/ModalPortal';

interface HandwritingExportDialogProps {
  bookKey: string;
  isOpen: boolean;
  onClose: () => void;
  containerWidth: number;
  containerHeight: number;
}

export const HandwritingExportDialog: React.FC<HandwritingExportDialogProps> = ({
  bookKey,
  isOpen,
  onClose,
  containerWidth,
  containerHeight,
}) => {
  const _ = useTranslation();
  const { isDarkMode } = useThemeStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);

  const bookHash = bookKey.split('-')[0]!;
  const bookData = useBookDataStore((s) => s.getBookData(bookKey));
  const bookTitle = bookData?.book?.title || 'Book-Notes';

  const { currentPageIndex, bookStrokes, loadBookStrokes } = useHandwritingStore();
  const allPages = bookStrokes[bookHash] || {};
  const currentStrokes = allPages[currentPageIndex] || [];
  const totalPagesWithNotes = Object.keys(allPages).filter(
    (k) => allPages[Number(k)] && allPages[Number(k)]!.length > 0,
  ).length;

  if (!isOpen) return null;

  const handleExportPagePng = () => {
    if (currentStrokes.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('Current page has no handwriting notes'),
        type: 'warning',
      });
      return;
    }
    exportPageAsPng(
      currentStrokes,
      containerWidth || 1000,
      containerHeight || 1400,
      `${bookTitle}-page-${currentPageIndex + 1}.png`,
      isDarkMode,
    );
    eventDispatcher.dispatch('toast', {
      message: _('Page exported as PNG'),
      type: 'success',
    });
    onClose();
  };

  const handleExportPageSvg = () => {
    if (currentStrokes.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('Current page has no handwriting notes'),
        type: 'warning',
      });
      return;
    }
    exportPageAsSvg(
      currentStrokes,
      containerWidth || 1000,
      containerHeight || 1400,
      `${bookTitle}-page-${currentPageIndex + 1}.svg`,
      isDarkMode,
    );
    eventDispatcher.dispatch('toast', {
      message: _('Page exported as SVG'),
      type: 'success',
    });
    onClose();
  };

  const handleExportAllPdf = async () => {
    if (totalPagesWithNotes === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No handwriting notes in this book to export'),
        type: 'warning',
      });
      return;
    }
    try {
      setIsExporting(true);
      await exportBookAsPdf(
        bookTitle,
        allPages,
        containerWidth || 1000,
        containerHeight || 1400,
        `${bookTitle}-handwriting.pdf`,
        isDarkMode,
      );
      eventDispatcher.dispatch('toast', {
        message: _('Exported notebook as PDF'),
        type: 'success',
      });
      onClose();
    } catch (e) {
      console.error(e);
      eventDispatcher.dispatch('toast', {
        message: _('Failed to export PDF'),
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportAllJson = () => {
    if (totalPagesWithNotes === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No handwriting notes in this book to export'),
        type: 'warning',
      });
      return;
    }
    exportBookAsJson(bookHash, allPages, `${bookTitle}-notes.json`);
    eventDispatcher.dispatch('toast', {
      message: _('Exported notes as JSON backup'),
      type: 'success',
    });
    onClose();
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const imported = importBookFromJson(text);
        if (!imported || !imported.pages) {
          throw new Error('Invalid JSON format');
        }
        loadBookStrokes(bookHash, imported.pages);
        // Persist each imported page to booknotes
        for (const [pageStr, strokes] of Object.entries(imported.pages)) {
          persistPageHandwriting(bookKey, bookHash, Number(pageStr), strokes);
        }
        eventDispatcher.dispatch('toast', {
          message: _('Handwriting notes imported successfully'),
          type: 'success',
        });
        onClose();
      } catch (err) {
        console.error(err);
        eventDispatcher.dispatch('toast', {
          message: _('Failed to import JSON file'),
          type: 'error',
        });
      }
    };
    reader.readAsText(file);
  };

  return (
    <ModalPortal>
      <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4'>
        <div className='relative w-full max-w-md rounded-2xl bg-base-100 p-6 shadow-2xl border border-base-300 animate-in fade-in zoom-in-95 duration-150'>
          <div className='flex items-center justify-between pb-4 border-b border-base-200'>
            <h3 className='text-lg font-bold text-base-content flex items-center gap-2'>
              <LuDownload className='text-primary' />
              {_('Export & Import Handwriting')}
            </h3>
            <button
              onClick={onClose}
              className='btn btn-sm btn-ghost btn-circle'
              aria-label={_('Close')}
            >
              <LuX size={18} />
            </button>
          </div>

          <div className='py-4 space-y-4'>
            {/* Current Page Export Section */}
            <div>
              <p className='text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2'>
                {_('Current Page (Page {{page}})', { page: currentPageIndex + 1 })}
              </p>
              <div className='grid grid-cols-2 gap-2'>
                <button
                  onClick={handleExportPagePng}
                  disabled={currentStrokes.length === 0}
                  className='btn btn-outline btn-sm h-12 flex flex-col items-center justify-center gap-1 normal-case'
                >
                  <LuImage size={18} />
                  <span>{_('Export PNG')}</span>
                </button>
                <button
                  onClick={handleExportPageSvg}
                  disabled={currentStrokes.length === 0}
                  className='btn btn-outline btn-sm h-12 flex flex-col items-center justify-center gap-1 normal-case'
                >
                  <LuCode size={18} />
                  <span>{_('Export SVG (Vector)')}</span>
                </button>
              </div>
            </div>

            {/* Whole Book Export Section */}
            <div>
              <p className='text-xs font-semibold text-base-content/60 uppercase tracking-wider mb-2'>
                {_('All Notes ({{count}} pages)', { count: totalPagesWithNotes })}
              </p>
              <div className='grid grid-cols-2 gap-2'>
                <button
                  onClick={handleExportAllPdf}
                  disabled={totalPagesWithNotes === 0 || isExporting}
                  className='btn btn-primary btn-sm h-12 flex flex-col items-center justify-center gap-1 normal-case'
                >
                  <LuFileText size={18} />
                  <span>{isExporting ? _('Generating...') : _('Export PDF Notebook')}</span>
                </button>
                <button
                  onClick={handleExportAllJson}
                  disabled={totalPagesWithNotes === 0}
                  className='btn btn-outline btn-sm h-12 flex flex-col items-center justify-center gap-1 normal-case'
                >
                  <LuDownload size={18} />
                  <span>{_('Backup JSON')}</span>
                </button>
              </div>
            </div>

            {/* Import JSON Section */}
            <div className='pt-2 border-t border-base-200'>
              <input
                ref={fileInputRef}
                type='file'
                accept='.json'
                onChange={handleImportJson}
                className='hidden'
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className='btn btn-ghost btn-sm w-full flex items-center justify-center gap-2 text-base-content/70 hover:text-base-content'
              >
                <LuUpload size={16} />
                <span>{_('Import Notes from JSON file')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </ModalPortal>
  );
};
export default HandwritingExportDialog;
