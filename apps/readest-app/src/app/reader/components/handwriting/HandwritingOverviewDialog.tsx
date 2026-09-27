import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import {
  PiNotePencil,
  PiMagnifyingGlass,
  PiDotsThreeOutline,
  PiBookOpen,
  PiTrash,
  PiArrowSquareOut,
  PiFilePdf,
  PiDownloadSimple,
  PiUploadSimple,
  PiImage,
  PiCode,
  PiSquaresFour,
  PiRows,
  PiCaretLeft,
  PiCaretRight,
  PiX,
} from 'react-icons/pi';
import { IoMdCloseCircle } from 'react-icons/io';
import { LuPenTool, LuPencil, LuHighlighter, LuShapes, LuStickyNote } from 'react-icons/lu';
import Dialog from '@/components/Dialog';
import BookCover from '@/components/BookCover';
import EmptyState from '../EmptyState';
import Dropdown from '@/components/Dropdown';
import Menu from '@/components/Menu';
import MenuItem from '@/components/MenuItem';
import { useTranslation } from '@/hooks/useTranslation';
import { useEnv } from '@/context/EnvContext';
import { useThemeStore } from '@/store/themeStore';
import { useReaderStore } from '@/store/readerStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useBookDataStore } from '@/store/bookDataStore';
import { useHandwritingStore } from '@/store/handwritingStore';
import {
  HandwritingFilterKind,
  HandwritingPageSummary,
  HandwritingQueryOptions,
  HandwritingSortOrder,
  HandwritingTool,
} from '@/types/handwriting';
import {
  deletePageHandwriting,
  getAllHandwritingBookHashes,
  persistPageHandwriting,
  queryHandwritingPages,
} from '@/services/handwritingService';
import {
  exportBookAsJson,
  exportBookAsPdf,
  exportPageAsPng,
  exportPageAsSvg,
  importBookFromJson,
  strokesToSvg,
} from '@/utils/handwriting';
import {
  getAllHandwritingSnapshots,
  getLoadedHandwritingSnapshots,
  captureAndSavePageSnapshot,
} from '@/services/handwritingSnapshotService';
import { navigateToReader } from '@/utils/nav';
import { eventDispatcher } from '@/utils/event';

export interface HandwritingOverviewDialogProps {
  bookKey?: string;
  isOpen: boolean;
  onClose: () => void;
  containerWidth?: number;
  containerHeight?: number;
}

export const HandwritingOverviewDialog: React.FC<HandwritingOverviewDialogProps> = ({
  bookKey,
  isOpen,
  onClose,
  containerWidth = 1000,
  containerHeight = 1400,
}) => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { isDarkMode, safeAreaInsets, statusBarHeight } = useThemeStore();
  const { getView } = useReaderStore();
  const currentBookHash = bookKey ? bookKey.split('-')[0] : null;

  const isMobileDevice =
    appService?.isMobile ||
    (typeof window !== 'undefined' &&
      (window.innerWidth < 768 || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)));

  const effectiveTopInset = Math.max(
    safeAreaInsets?.top || 0,
    statusBarHeight || 0,
    appService?.hasSafeAreaInset || isMobileDevice ? 24 : 0,
  );
  const effectiveBottomInset = Math.max(
    safeAreaInsets?.bottom || 0,
    appService?.hasSafeAreaInset || isMobileDevice ? 16 : 0,
  );

  // Reactively track store modifications so pages updates in real time
  const bookStrokes = useHandwritingStore((s) => s.bookStrokes);
  const bookStickyNotes = useHandwritingStore((s) => s.stickyNotes);
  const [refreshKey, setRefreshKey] = useState<number>(0);

  const [selectedBookHash, setSelectedBookHash] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grouped' | 'all'>('grouped');
  const [filterKind, setFilterKind] = useState<HandwritingFilterKind>('all');
  const [selectedTool, setSelectedTool] = useState<HandwritingTool | 'all'>('all');
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month'>('all');
  const [sortOrder, setSortOrder] = useState<HandwritingSortOrder>('updated-desc');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [confirmClearPageId, setConfirmClearPageId] = useState<string | null>(null);

  // Full-size Note Preview / Carousel Modal state
  const [previewPageSummary, setPreviewPageSummary] = useState<HandwritingPageSummary | null>(null);
  const [previewImageAspectRatio, setPreviewImageAspectRatio] = useState<number | null>(null);

  useEffect(() => {
    setPreviewImageAspectRatio(null);
  }, [previewPageSummary?.id]);

  const defaultAspectRatio =
    containerWidth && containerHeight && containerWidth > 0 && containerHeight > 0
      ? containerWidth / containerHeight
      : 28 / 41;

  const previewAspectRatio =
    previewPageSummary?.aspectRatio || previewImageAspectRatio || defaultAspectRatio;

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discover all available books with handwriting
  const availableBookHashes = useMemo(() => {
    return getAllHandwritingBookHashes();
  }, [isOpen, refreshKey, bookStrokes, bookStickyNotes]);

  const libraryStore = useLibraryStore();
  const bookDataStore = useBookDataStore();

  const booksMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const h of availableBookHashes) {
      const book = libraryStore.getBookByHash(h) || bookDataStore.getBookData(h)?.book;
      map.set(h, book?.title || `Book (${h.slice(0, 8)})`);
    }
    return map;
  }, [availableBookHashes, libraryStore, bookDataStore]);

  // Query pages based on options
  const queryOptions: HandwritingQueryOptions = useMemo(
    () => ({
      bookHash: selectedBookHash === 'all' ? undefined : selectedBookHash,
      filterKind,
      tool: selectedTool,
      dateRange,
      sortOrder,
      searchQuery,
    }),
    [selectedBookHash, filterKind, selectedTool, dateRange, sortOrder, searchQuery],
  );

  const pages = useMemo(() => {
    if (!isOpen) return [];
    return queryHandwritingPages(queryOptions);
  }, [isOpen, queryOptions, refreshKey, bookStrokes, bookStickyNotes]);

  // Group pages by bookHash when in grouped mode
  const pagesByBook = useMemo(() => {
    const map = new Map<string, HandwritingPageSummary[]>();
    for (const page of pages) {
      const list = map.get(page.bookHash) || [];
      list.push(page);
      map.set(page.bookHash, list);
    }
    return map;
  }, [pages]);

  const [snapshots, setSnapshots] = useState<Record<string, string>>(() =>
    getLoadedHandwritingSnapshots(),
  );

  useEffect(() => {
    if (!isOpen) return;
    getAllHandwritingSnapshots().then((snaps) => {
      setSnapshots(snaps);
    });

    const handleSnapshotUpdate = (e: Event) => {
      const detail = (e as CustomEvent<{ bookHash: string; pageIndex: number; dataUrl: string }>)
        .detail;
      if (detail) {
        setSnapshots((prev) => ({
          ...prev,
          [`${detail.bookHash}_${detail.pageIndex}`]: detail.dataUrl,
        }));
      }
    };

    eventDispatcher.on('handwriting-snapshot-updated', handleSnapshotUpdate);
    return () => {
      eventDispatcher.off('handwriting-snapshot-updated', handleSnapshotUpdate);
    };
  }, [isOpen]);

  // If opened while reading, trigger snapshot for the current page
  useEffect(() => {
    if (!isOpen || !bookKey || !currentBookHash) return;
    const currentIdx = useHandwritingStore.getState().currentPageIndex;
    const strokes = useHandwritingStore.getState().getPageStrokes(currentBookHash, currentIdx);
    if (strokes.length > 0) {
      const el = document.getElementById(`reader-content-${bookKey}`);
      if (el) {
        captureAndSavePageSnapshot(currentBookHash, currentIdx, el);
      }
    }
  }, [isOpen, bookKey, currentBookHash]);

  // Note preview carousel navigation
  const previewIndex = useMemo(() => {
    if (!previewPageSummary) return -1;
    return pages.findIndex((p) => p.id === previewPageSummary.id);
  }, [previewPageSummary, pages]);

  const hasPrevNote = previewIndex > 0;
  const hasNextNote = previewIndex >= 0 && previewIndex < pages.length - 1;

  const handlePrevNote = useCallback(() => {
    if (previewIndex > 0) {
      setPreviewPageSummary(pages[previewIndex - 1]!);
    }
  }, [previewIndex, pages]);

  const handleNextNote = useCallback(() => {
    if (previewIndex >= 0 && previewIndex < pages.length - 1) {
      setPreviewPageSummary(pages[previewIndex + 1]!);
    }
  }, [previewIndex, pages]);

  useEffect(() => {
    if (!previewPageSummary) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.stopPropagation();
        handlePrevNote();
      } else if (e.key === 'ArrowRight') {
        e.stopPropagation();
        handleNextNote();
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        setPreviewPageSummary(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewPageSummary, handlePrevNote, handleNextNote]);

  if (!isOpen) return null;

  // Jump to specific page and activate handwriting mode for immediate second-time writing
  const handleJumpToPage = (summary: HandwritingPageSummary) => {
    useHandwritingStore.getState().setTool('pen');
    if (bookKey && summary.bookHash === currentBookHash) {
      const view = getView(bookKey);
      if (summary.cfi) {
        view?.goTo(summary.cfi);
      } else {
        view?.goTo(summary.pageIndex);
      }
      useHandwritingStore.getState().setCurrentPageIndex(summary.pageIndex);
      useHandwritingStore.getState().toggleHandwriting(bookKey, true);
      onClose();
    } else {
      // Different book or opened from library: navigate to reader and jump
      eventDispatcher.dispatch('open-book-in-reader', {
        bookHash: summary.bookHash,
        cfi: summary.cfi,
      });
      navigateToReader(
        router,
        [summary.bookHash],
        summary.cfi ? `cfi=${encodeURIComponent(summary.cfi)}` : undefined,
      );
      useHandwritingStore.getState().toggleHandwriting(summary.bookHash, true);
      useHandwritingStore.getState().setCurrentPageIndex(summary.pageIndex);
      onClose();
    }
  };

  // Open book from group header
  const handleOpenBook = (targetBookHash: string) => {
    if (bookKey && targetBookHash === currentBookHash) {
      onClose();
    } else {
      eventDispatcher.dispatch('open-book-in-reader', { bookHash: targetBookHash });
      navigateToReader(router, [targetBookHash]);
      onClose();
    }
  };

  // Export single page PNG
  const handleExportPagePng = (summary: HandwritingPageSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (summary.strokes.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('Current page has no handwriting strokes to export'),
        type: 'warning',
      });
      return;
    }
    exportPageAsPng(
      summary.strokes,
      containerWidth,
      containerHeight,
      `${summary.bookTitle}-page-${summary.pageNumber}.png`,
      isDarkMode,
    );
    eventDispatcher.dispatch('toast', {
      message: _('Page exported as PNG'),
      type: 'success',
    });
  };

  // Export single page SVG
  const handleExportPageSvg = (summary: HandwritingPageSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (summary.strokes.length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('Current page has no handwriting strokes to export'),
        type: 'warning',
      });
      return;
    }
    exportPageAsSvg(
      summary.strokes,
      containerWidth,
      containerHeight,
      `${summary.bookTitle}-page-${summary.pageNumber}.svg`,
      isDarkMode,
    );
    eventDispatcher.dispatch('toast', {
      message: _('Page exported as SVG'),
      type: 'success',
    });
  };

  // Clear single page notes
  const handleClearPage = (summary: HandwritingPageSummary, e?: React.MouseEvent) => {
    e?.stopPropagation();
    deletePageHandwriting(
      summary.bookHash,
      summary.pageIndex,
      bookKey && summary.bookHash === currentBookHash ? bookKey : undefined,
    );
    setSnapshots((prev) => {
      const next = { ...prev };
      delete next[summary.id];
      return next;
    });
    setConfirmClearPageId(null);
    setRefreshKey((k) => k + 1);

    // If active in preview modal, move to next/prev note or close
    if (previewPageSummary?.id === summary.id) {
      const remaining = pages.filter((p) => p.id !== summary.id);
      if (remaining.length > 0) {
        const nextIdx = Math.min(previewIndex, remaining.length - 1);
        setPreviewPageSummary(remaining[nextIdx] || null);
      } else {
        setPreviewPageSummary(null);
      }
    }

    eventDispatcher.dispatch('toast', {
      message: _('Page notes cleared'),
      type: 'info',
    });
  };

  // Export all pages of selected book / all books as PDF
  const handleExportAllPdf = async () => {
    const targetHash =
      selectedBookHash !== 'all' ? selectedBookHash : currentBookHash || availableBookHashes[0];
    if (!targetHash) return;
    const bookTitle = booksMap.get(targetHash) || 'Notes';
    const store = useHandwritingStore.getState();
    const allPages = store.bookStrokes[targetHash] || {};

    if (Object.keys(allPages).length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No handwriting notes in this book to export'),
        type: 'warning',
      });
      return;
    }

    try {
      await exportBookAsPdf(
        bookTitle,
        allPages,
        containerWidth,
        containerHeight,
        `${bookTitle}-handwriting.pdf`,
        isDarkMode,
      );
      eventDispatcher.dispatch('toast', {
        message: _('Exported notebook as PDF'),
        type: 'success',
      });
    } catch (e) {
      console.error(e);
      eventDispatcher.dispatch('toast', {
        message: _('Failed to export PDF'),
        type: 'error',
      });
    }
  };

  // Export all as JSON backup
  const handleExportJson = () => {
    const targetHash =
      selectedBookHash !== 'all' ? selectedBookHash : currentBookHash || availableBookHashes[0];
    if (!targetHash) return;
    const bookTitle = booksMap.get(targetHash) || 'Notes';
    const store = useHandwritingStore.getState();
    const allPages = store.bookStrokes[targetHash] || {};

    if (Object.keys(allPages).length === 0) {
      eventDispatcher.dispatch('toast', {
        message: _('No handwriting notes in this book to export'),
        type: 'warning',
      });
      return;
    }

    exportBookAsJson(targetHash, allPages, `${bookTitle}-notes.json`);
    eventDispatcher.dispatch('toast', {
      message: _('Exported notes as JSON backup'),
      type: 'success',
    });
  };

  // Import JSON backup
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
        const targetHash =
          imported.bookHash || currentBookHash || availableBookHashes[0] || 'imported';
        useHandwritingStore.getState().loadBookStrokes(targetHash, imported.pages);
        for (const [pageStr, strokes] of Object.entries(imported.pages)) {
          persistPageHandwriting(
            bookKey && targetHash === currentBookHash ? bookKey : `${targetHash}-0`,
            targetHash,
            Number(pageStr),
            strokes,
          );
        }
        eventDispatcher.dispatch('toast', {
          message: _('Handwriting notes imported successfully'),
          type: 'success',
        });
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

  const handleResetFilters = () => {
    setSelectedBookHash('all');
    setFilterKind('all');
    setSelectedTool('all');
    setDateRange('all');
    setSortOrder('updated-desc');
    setSearchQuery('');
  };

  const hasActiveFilters =
    selectedBookHash !== 'all' ||
    filterKind !== 'all' ||
    selectedTool !== 'all' ||
    dateRange !== 'all' ||
    searchQuery.trim().length > 0;

  // Render a note card
  const renderNoteCard = (summary: HandwritingPageSummary) => {
    const snapshotUrl = snapshots[summary.id] || summary.pageSnapshot;
    const cardAspectRatio = summary.aspectRatio || defaultAspectRatio;

    const svgContent =
      summary.strokes.length > 0
        ? strokesToSvg(summary.strokes, 1000, Math.round(1000 / cardAspectRatio), {
            isDarkMode,
            transparentBg: true,
          })
        : null;

    return (
      <div
        key={summary.id}
        onClick={() => setPreviewPageSummary(summary)}
        className='group relative flex flex-col rounded-xl bg-base-100 border border-base-200/90 dark:border-base-300/60 shadow-xs hover:shadow-md hover:border-primary/40 transition-all duration-150 cursor-pointer overflow-hidden select-none'
      >
        {/* Book Page Thumbnail Area */}
        <div className='relative w-full aspect-[28/41] bg-[#faf9f6] dark:bg-[#1a1a1c] overflow-hidden flex items-center justify-center border-b border-base-200/60 dark:border-base-300/40 p-1'>
          <div
            className='relative w-full h-full flex items-center justify-center overflow-hidden rounded-md'
            style={{ aspectRatio: `${cardAspectRatio}` }}
          >
            {/* Layer 1: Background Book Page (Real snapshot if available, or simulated typography) */}
            {snapshotUrl ? (
              <img
                src={snapshotUrl}
                alt={_('Page {{page}}', { page: summary.pageNumber })}
                className='w-full h-full object-fill pointer-events-none transform transition-transform group-hover:scale-[1.02] duration-200'
                loading='lazy'
              />
            ) : (
              <div className='absolute inset-0 p-3 flex flex-col justify-between select-none pointer-events-none opacity-50 dark:opacity-40 bg-base-200/30'>
                {/* Header title */}
                <div className='text-[8px] uppercase tracking-wider text-base-content/50 text-center font-serif truncate border-b border-base-content/10 pb-1'>
                  {summary.bookTitle}
                </div>

                {/* Body paragraphs */}
                <div className='flex-1 py-1 text-[7px] leading-[1.35] text-base-content/70 font-serif overflow-hidden space-y-1'>
                  {summary.pageText ? (
                    summary.pageText
                      .split('\n\n')
                      .slice(0, 4)
                      .map((para, idx) => (
                        <p key={idx} className='line-clamp-3 text-justify indent-2'>
                          {para}
                        </p>
                      ))
                  ) : summary.textSnippets.length > 0 ? (
                    <p className='line-clamp-3 text-justify indent-2'>
                      {summary.textSnippets.join(' ')}
                    </p>
                  ) : (
                    <div className='space-y-1.5 pt-1 opacity-35'>
                      <div className='h-1.5 bg-base-content/40 rounded w-full' />
                      <div className='h-1.5 bg-base-content/40 rounded w-11/12' />
                      <div className='h-1.5 bg-base-content/40 rounded w-full' />
                    </div>
                  )}
                </div>

                {/* Footer page number */}
                <div className='text-[8px] text-base-content/50 text-center font-serif pt-1 border-t border-base-content/10'>
                  {summary.pageNumber}
                </div>
              </div>
            )}

            {/* Layer 2: Overlaid Vector SVG Strokes (100% sharp and 1:1 aligned) */}
            {svgContent && (
              <div
                className='absolute inset-0 w-full h-full pointer-events-none transform transition-transform group-hover:scale-[1.02] duration-200 [&>svg]:w-full [&>svg]:h-full [&>svg]:block'
                dangerouslySetInnerHTML={{ __html: svgContent }}
              />
            )}
          </div>

          {/* Page indicator tag (top-left) */}
          <div className='absolute top-2 start-2 bg-base-100/90 dark:bg-base-200/90 text-base-content/85 text-[11px] font-medium px-2 py-0.5 rounded-md shadow-xs backdrop-blur-xs'>
            {_('Page {{page}}', { page: summary.pageNumber })}
          </div>

          {/* Sticky notes count tag (top-right) */}
          {summary.stickyNoteCount > 0 && (
            <div className='absolute top-2 end-2 flex items-center gap-1 bg-amber-500/15 dark:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-[10px] font-semibold px-1.5 py-0.5 rounded-md backdrop-blur-xs'>
              <LuStickyNote size={11} />
              <span>{summary.stickyNoteCount}</span>
            </div>
          )}
        </div>

        {/* Card Details */}
        <div className='flex flex-col flex-1 p-2.5 gap-2'>
          {/* Book title in flat view */}
          {viewMode === 'all' && (
            <div
              className='text-xs font-medium text-base-content/85 truncate'
              title={summary.bookTitle}
            >
              {summary.bookTitle}
            </div>
          )}

          {/* Text snippet quote if any */}
          {summary.textSnippets.length > 0 && (
            <div className='text-[11px] text-base-content/70 line-clamp-1 italic bg-base-200/60 rounded px-1.5 py-0.5'>
              &ldquo;{summary.textSnippets[0]}&rdquo;
            </div>
          )}

          {/* Row 1: Strokes summary + Open in Reader link */}
          <div className='flex items-center justify-between text-xs text-base-content/70 mt-auto'>
            <div className='flex items-center gap-1.5 min-w-0'>
              <span className='font-normal truncate'>
                {summary.strokeCount} {_('strokes')}
              </span>
              {summary.colorsUsed.length > 0 && (
                <div className='flex items-center gap-0.5 shrink-0'>
                  {summary.colorsUsed.slice(0, 3).map((c, i) => (
                    <span
                      key={i}
                      className='w-2 h-2 rounded-full border border-base-content/20'
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>

            <button
              type='button'
              className='btn btn-primary btn-xs h-6 px-2.5 text-xs font-medium gap-1 rounded-md shadow-xs shrink-0'
              title={_('Go to Page')}
              onClick={(e) => {
                e.stopPropagation();
                handleJumpToPage(summary);
              }}
            >
              <PiNotePencil size={12} />
              <span>{_('Write')}</span>
            </button>
          </div>

          {/* Row 2: Action Toolbar with min-width and flex layout */}
          {confirmClearPageId === summary.id ? (
            <div
              className='flex items-center justify-end gap-1.5 pt-1.5 border-t border-base-200/70 dark:border-base-300/50'
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type='button'
                className='btn btn-ghost btn-xs h-6 min-w-[50px] px-2 text-[11px] rounded-md text-base-content/60 hover:bg-base-200'
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmClearPageId(null);
                }}
              >
                {_('Cancel')}
              </button>
              <button
                type='button'
                className='btn btn-error btn-xs h-6 min-w-[56px] px-2.5 text-[11px] font-medium rounded-md shadow-xs me-1'
                onClick={(e) => handleClearPage(summary, e)}
              >
                {_('Delete')}
              </button>
            </div>
          ) : (
            <div
              className='flex items-center justify-between pt-1.5 border-t border-base-200/70 dark:border-base-300/50'
              onClick={(e) => e.stopPropagation()}
            >
              <div className='flex items-center gap-1'>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs h-6 min-w-[42px] px-1.5 text-[11px] font-normal gap-1 rounded-md text-base-content/70 hover:bg-base-200'
                  title={_('Preview full size')}
                  onClick={(e) => {
                    e.stopPropagation();
                    setPreviewPageSummary(summary);
                  }}
                >
                  <PiMagnifyingGlass size={12} />
                  <span>{_('Preview')}</span>
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs h-6 min-w-[42px] px-1.5 text-[11px] font-normal gap-1 rounded-md text-base-content/70 hover:bg-base-200'
                  title={_('Export PNG')}
                  onClick={(e) => handleExportPagePng(summary, e)}
                >
                  <PiImage size={12} />
                  <span>PNG</span>
                </button>
                <button
                  type='button'
                  className='btn btn-ghost btn-xs h-6 min-w-[42px] px-1.5 text-[11px] font-normal gap-1 rounded-md text-base-content/70 hover:bg-base-200'
                  title={_('Export SVG')}
                  onClick={(e) => handleExportPageSvg(summary, e)}
                >
                  <PiCode size={12} />
                  <span>SVG</span>
                </button>
              </div>

              <button
                type='button'
                className='btn btn-ghost btn-xs h-6 w-6 p-0 rounded-md text-base-content/50 hover:text-error hover:bg-error/10 me-1'
                title={_('Clear Page Notes')}
                onClick={(e) => {
                  e.stopPropagation();
                  setConfirmClearPageId(summary.id);
                }}
              >
                <PiTrash size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <Dialog
      isOpen={isOpen}
      title={_('Handwriting Notes')}
      onClose={onClose}
      fullScreen
      contentClassName='min-h-0 flex-1 overflow-hidden! flex flex-col'
    >
      {/* Top Filter and Search Bar (matching Readest's native AnnotationsToolbar & LibraryHeader) */}
      <div className='flex flex-col gap-2.5 px-4 sm:px-6 py-2.5 border-b border-base-200/80 bg-base-100 shrink-0 select-none'>
        {/* Row 1: Search box + Book Selector + View Mode + More Menu */}
        <div className='flex items-center gap-2 sm:gap-3 flex-wrap sm:flex-nowrap'>
          {/* Search box styled exactly like Readest SearchBar */}
          <div className='relative flex-1 min-w-[180px] max-w-sm'>
            <PiMagnifyingGlass
              size={15}
              className='text-base-content/40 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none'
            />
            <input
              type='text'
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={_('Search notes, books or pages...')}
              className='bg-base-200/80 text-base-content placeholder:text-base-content/50 h-8 w-full rounded-full pe-8 ps-8 text-xs focus:outline-hidden focus:ring-1 focus:ring-base-content/20'
            />
            {searchQuery && (
              <button
                type='button'
                onClick={() => setSearchQuery('')}
                className='text-base-content/40 hover:text-base-content/70 absolute end-2.5 top-1/2 -translate-y-1/2'
                aria-label={_('Clear Search')}
              >
                <IoMdCloseCircle size={15} />
              </button>
            )}
          </div>

          {/* Book Filter Dropdown */}
          <select
            value={selectedBookHash}
            onChange={(e) => setSelectedBookHash(e.target.value)}
            className='select select-xs h-8 bg-base-200/70 border-none rounded-full text-xs max-w-[180px] sm:max-w-[220px]'
          >
            <option value='all'>{_('All Books')}</option>
            {availableBookHashes.map((hash) => (
              <option key={hash} value={hash}>
                {booksMap.get(hash) || hash.slice(0, 10)}
              </option>
            ))}
          </select>

          {/* View Mode Toggle (Grouped by Book vs All Notes Grid) */}
          <div className='flex items-center bg-base-200/70 rounded-full p-0.5 text-xs'>
            <button
              type='button'
              onClick={() => setViewMode('grouped')}
              className={clsx(
                'btn btn-ghost h-7 min-h-7 rounded-full px-2.5 text-xs gap-1 font-normal',
                viewMode === 'grouped'
                  ? 'bg-base-100 text-base-content shadow-xs font-medium'
                  : 'text-base-content/70',
              )}
              title={_('Group by Book')}
            >
              <PiRows size={14} />
              <span className='hidden md:inline'>{_('By Book')}</span>
            </button>
            <button
              type='button'
              onClick={() => setViewMode('all')}
              className={clsx(
                'btn btn-ghost h-7 min-h-7 rounded-full px-2.5 text-xs gap-1 font-normal',
                viewMode === 'all'
                  ? 'bg-base-100 text-base-content shadow-xs font-medium'
                  : 'text-base-content/70',
              )}
              title={_('All Notes Grid')}
            >
              <PiSquaresFour size={14} />
              <span className='hidden md:inline'>{_('All')}</span>
            </button>
          </div>

          {/* Right Action Menu: PDF export, Backup, Import */}
          <div className='ms-auto flex items-center gap-1'>
            <span className='text-xs text-base-content/60 hidden sm:inline me-1'>
              {`${pages.length} ${pages.length === 1 ? _('page') : _('pages')}`}
            </span>

            <Dropdown
              label={_('Options')}
              className='dropdown-bottom dropdown-end'
              buttonClassName='btn btn-ghost h-8 min-h-8 w-8 p-0 rounded-full'
              toggleButton={<PiDotsThreeOutline size={16} />}
            >
              <Menu className='dropdown-content z-50 mt-1 shadow-2xl bg-base-100 rounded-box border border-base-200/80 min-w-48 p-1.5'>
                <MenuItem
                  label={_('Export Book as PDF')}
                  Icon={<PiFilePdf size={16} />}
                  onClick={handleExportAllPdf}
                />
                <MenuItem
                  label={_('Backup Notes (JSON)')}
                  Icon={<PiDownloadSimple size={16} />}
                  onClick={handleExportJson}
                />
                <MenuItem
                  label={_('Restore Notes (JSON)')}
                  Icon={<PiUploadSimple size={16} />}
                  onClick={() => fileInputRef.current?.click()}
                />
              </Menu>
            </Dropdown>
            <input
              ref={fileInputRef}
              type='file'
              accept='.json'
              className='hidden'
              onChange={handleImportJson}
            />
          </div>
        </div>

        {/* Row 2: Filter Pills (Content Kind, Tools, Sort Order) */}
        <div className='flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 text-xs'>
          {/* Kind Filter Pills */}
          <button
            type='button'
            onClick={() => setFilterKind('all')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 rounded-full px-3 text-xs font-normal shrink-0',
              filterKind === 'all'
                ? 'bg-base-300 text-base-content font-medium'
                : 'bg-base-200/50 text-base-content/70',
            )}
          >
            {_('All Notes')}
          </button>
          <button
            type='button'
            onClick={() => setFilterKind('strokes')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 rounded-full px-3 text-xs font-normal gap-1 shrink-0',
              filterKind === 'strokes'
                ? 'bg-base-300 text-base-content font-medium'
                : 'bg-base-200/50 text-base-content/70',
            )}
          >
            <LuPenTool size={11} />
            {_('Handwriting')}
          </button>
          <button
            type='button'
            onClick={() => setFilterKind('stickynotes')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 rounded-full px-3 text-xs font-normal gap-1 shrink-0',
              filterKind === 'stickynotes'
                ? 'bg-base-300 text-base-content font-medium'
                : 'bg-base-200/50 text-base-content/70',
            )}
          >
            <LuStickyNote size={11} />
            {_('Sticky Notes')}
          </button>

          <span className='bg-base-300 mx-1 h-3.5 w-px shrink-0' />

          {/* Tools Filter Pills */}
          <button
            type='button'
            onClick={() => setSelectedTool('all')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 rounded-full px-2.5 text-xs font-normal shrink-0',
              selectedTool === 'all'
                ? 'bg-base-300 text-base-content font-medium'
                : 'text-base-content/70',
            )}
          >
            {_('All Tools')}
          </button>
          <button
            type='button'
            onClick={() => setSelectedTool('pen')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 w-7 p-0 rounded-full shrink-0',
              selectedTool === 'pen' ? 'bg-base-300 text-base-content' : 'text-base-content/70',
            )}
            title={_('Fountain Pen')}
          >
            <LuPenTool size={12} />
          </button>
          <button
            type='button'
            onClick={() => setSelectedTool('pencil')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 w-7 p-0 rounded-full shrink-0',
              selectedTool === 'pencil' ? 'bg-base-300 text-base-content' : 'text-base-content/70',
            )}
            title={_('Pencil')}
          >
            <LuPencil size={12} />
          </button>
          <button
            type='button'
            onClick={() => setSelectedTool('highlighter')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 w-7 p-0 rounded-full shrink-0',
              selectedTool === 'highlighter'
                ? 'bg-base-300 text-base-content'
                : 'text-base-content/70',
            )}
            title={_('Highlighter')}
          >
            <LuHighlighter size={12} />
          </button>
          <button
            type='button'
            onClick={() => setSelectedTool('shape')}
            className={clsx(
              'btn btn-ghost h-7 min-h-7 w-7 p-0 rounded-full shrink-0',
              selectedTool === 'shape' ? 'bg-base-300 text-base-content' : 'text-base-content/70',
            )}
            title={_('Shapes')}
          >
            <LuShapes size={12} />
          </button>

          {/* Reset Filters button if any active */}
          {hasActiveFilters && (
            <button
              type='button'
              onClick={handleResetFilters}
              className='btn btn-ghost btn-xs h-6 text-[11px] text-base-content/60 ms-auto shrink-0'
            >
              {_('Reset')}
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className='flex-1 overflow-y-auto p-4 sm:p-6 bg-base-200/30'>
        {pages.length === 0 ? (
          <div className='flex flex-col items-center justify-center h-full min-h-[350px]'>
            <EmptyState
              Icon={PiNotePencil}
              label={_('No handwriting notes found')}
              hint={_('Notes drawn on book pages will appear here.')}
              action={
                hasActiveFilters ? (
                  <button
                    onClick={handleResetFilters}
                    className='btn btn-sm btn-outline rounded-full text-xs mt-2'
                  >
                    {_('Clear Filters')}
                  </button>
                ) : undefined
              }
            />
          </div>
        ) : viewMode === 'grouped' ? (
          /* Grouped by Book View */
          <div className='flex flex-col gap-8 max-w-7xl mx-auto'>
            {Array.from(pagesByBook.entries()).map(([hash, bookPages]) => {
              const book =
                libraryStore.getBookByHash(hash) || bookDataStore.getBookData(hash)?.book;
              const title = book?.title || booksMap.get(hash) || `Book (${hash.slice(0, 8)})`;
              const author = book?.author || '';

              return (
                <div key={hash} className='flex flex-col gap-3'>
                  {/* Book Section Header */}
                  <div className='flex items-center justify-between gap-3 pb-2 border-b border-base-200/80'>
                    <div className='flex items-center gap-3 min-w-0'>
                      {book ? (
                        <div className='w-8 h-11 shrink-0 overflow-hidden rounded shadow-xs'>
                          <BookCover book={book} mode='list' coverFit='crop' />
                        </div>
                      ) : (
                        <div className='w-8 h-11 shrink-0 rounded bg-base-300 flex items-center justify-center'>
                          <PiBookOpen size={16} className='text-base-content/50' />
                        </div>
                      )}
                      <div className='min-w-0'>
                        <h3
                          className='text-sm font-semibold text-base-content truncate'
                          title={title}
                        >
                          {title}
                        </h3>
                        {author && (
                          <p className='text-xs text-base-content/60 truncate'>{author}</p>
                        )}
                      </div>
                      <span className='badge badge-sm badge-ghost text-xs font-normal ms-1'>
                        {`${bookPages.length} ${bookPages.length === 1 ? _('page') : _('pages')}`}
                      </span>
                    </div>

                    <button
                      type='button'
                      onClick={() => handleOpenBook(hash)}
                      className='btn btn-ghost btn-xs text-xs gap-1 text-primary hover:bg-primary/10 rounded-lg shrink-0'
                    >
                      <PiArrowSquareOut size={13} />
                      <span>{_('Open Book')}</span>
                    </button>
                  </div>

                  {/* Book Notes Grid */}
                  <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5'>
                    {bookPages.map(renderNoteCard)}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* Flat All Notes Grid View */
          <div className='grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3.5 max-w-7xl mx-auto'>
            {pages.map(renderNoteCard)}
          </div>
        )}
      </div>

      {/* Full-view Detail / Carousel Modal */}
      {previewPageSummary && (
        <div
          className='fixed inset-0 z-50 flex flex-col bg-base-100/95 dark:bg-base-300/95 backdrop-blur-md select-none animate-in fade-in duration-150'
          onClick={() => setPreviewPageSummary(null)}
        >
          {/* Header Bar with Safe Area Top Padding */}
          <div
            className='flex flex-col border-b border-base-200/80 bg-base-100 shrink-0 shadow-xs'
            style={{
              paddingTop: `max(env(safe-area-inset-top, 0px), var(--safe-area-inset-top, 0px), ${effectiveTopInset}px)`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className='flex items-center justify-between px-4 sm:px-6 h-14'>
              {/* Left: Back / Title / Page */}
              <div className='flex items-center gap-3 min-w-0'>
                <button
                  type='button'
                  onClick={() => setPreviewPageSummary(null)}
                  className='btn btn-ghost btn-sm h-8 w-8 p-0 rounded-full'
                  title={_('Back to Overview')}
                >
                  <PiCaretLeft size={20} />
                </button>
                <div className='min-w-0'>
                  <div className='text-sm font-semibold text-base-content truncate max-w-xs sm:max-w-md'>
                    {previewPageSummary.bookTitle}
                  </div>
                  <div className='text-xs text-base-content/60'>
                    {_('Page {{page}}', { page: previewPageSummary.pageNumber })}
                    {pages.length > 1 && (
                      <span className='ms-2 px-1.5 py-0.2 bg-base-200 rounded text-[11px] font-mono'>
                        {previewIndex + 1} / {pages.length}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Right: Actions */}
              <div className='flex items-center gap-1.5'>
                <button
                  type='button'
                  onClick={() => handleJumpToPage(previewPageSummary)}
                  className='btn btn-primary btn-sm h-8 px-3.5 rounded-full text-xs gap-1.5 font-medium shadow-sm'
                  title={_('Open in Reader')}
                >
                  <PiNotePencil size={15} />
                  <span>{_('Open in Reader')}</span>
                </button>

                <button
                  type='button'
                  onClick={(e) => handleExportPagePng(previewPageSummary, e)}
                  className='btn btn-ghost btn-sm h-8 px-2.5 rounded-full text-xs gap-1 text-base-content/75 hover:bg-base-200'
                  title={_('Export PNG')}
                >
                  <PiImage size={15} />
                  <span className='hidden sm:inline'>PNG</span>
                </button>

                <button
                  type='button'
                  onClick={(e) => handleExportPageSvg(previewPageSummary, e)}
                  className='btn btn-ghost btn-sm h-8 px-2.5 rounded-full text-xs gap-1 text-base-content/75 hover:bg-base-200'
                  title={_('Export SVG')}
                >
                  <PiCode size={15} />
                  <span className='hidden sm:inline'>SVG</span>
                </button>

                {confirmClearPageId === previewPageSummary.id ? (
                  <div className='flex items-center gap-1 ms-1'>
                    <button
                      type='button'
                      onClick={() => setConfirmClearPageId(null)}
                      className='btn btn-ghost btn-xs h-7 min-w-[50px] px-2 text-xs rounded-full text-base-content/60'
                    >
                      {_('Cancel')}
                    </button>
                    <button
                      type='button'
                      onClick={(e) => handleClearPage(previewPageSummary, e)}
                      className='btn btn-error btn-xs h-7 min-w-[56px] px-2.5 text-xs font-medium rounded-full shadow-xs'
                    >
                      {_('Delete')}
                    </button>
                  </div>
                ) : (
                  <button
                    type='button'
                    onClick={() => setConfirmClearPageId(previewPageSummary.id)}
                    className='btn btn-ghost btn-sm h-8 w-8 p-0 rounded-full text-base-content/60 hover:text-error hover:bg-error/10'
                    title={_('Clear Page Notes')}
                  >
                    <PiTrash size={16} />
                  </button>
                )}

                <button
                  type='button'
                  onClick={() => setPreviewPageSummary(null)}
                  className='btn btn-ghost btn-sm h-8 w-8 p-0 rounded-full text-base-content/70 hover:bg-base-200 ms-1'
                  title={_('Close')}
                >
                  <PiX size={18} />
                </button>
              </div>
            </div>
          </div>

          {/* Carousel Viewport */}
          <div
            className='flex-1 relative flex items-center justify-between p-4 sm:p-8 overflow-hidden'
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Nav Button */}
            <button
              type='button'
              onClick={handlePrevNote}
              disabled={!hasPrevNote}
              className={clsx(
                'btn btn-circle btn-md shadow-xl bg-base-100/90 dark:bg-base-200/90 border border-base-200/80 hover:bg-base-100 z-10 transition-all shrink-0',
                !hasPrevNote ? 'opacity-20 pointer-events-none' : 'hover:scale-105 active:scale-95',
              )}
              title={_('Previous Note (Left Arrow)')}
            >
              <PiCaretLeft size={24} />
            </button>

            {/* Note Canvas Container */}
            <div className='flex-1 flex items-center justify-center h-full max-h-full px-2 sm:px-6 overflow-hidden'>
              <div
                className='relative max-h-[78vh] shadow-2xl rounded-2xl border border-base-300/80 overflow-hidden flex items-center justify-center bg-[#faf9f6] dark:bg-[#18181a] cursor-pointer'
                style={{
                  aspectRatio: `${previewAspectRatio}`,
                  width: `min(860px, calc(78vh * ${previewAspectRatio}))`,
                  maxWidth: '92vw',
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  handleJumpToPage(previewPageSummary);
                }}
                title={_('Click anywhere to open in reader and start handwriting')}
              >
                {/* Background Layer 1: Snapshot or simulated book page */}
                {snapshots[previewPageSummary.id] || previewPageSummary.pageSnapshot ? (
                  <img
                    src={snapshots[previewPageSummary.id] || previewPageSummary.pageSnapshot}
                    alt={_('Page {{page}}', { page: previewPageSummary.pageNumber })}
                    onLoad={(e) => {
                      const nw = e.currentTarget.naturalWidth;
                      const nh = e.currentTarget.naturalHeight;
                      if (nw > 0 && nh > 0) {
                        setPreviewImageAspectRatio(nw / nh);
                      }
                    }}
                    className='w-full h-full object-fill pointer-events-none select-none'
                  />
                ) : (
                  <div className='absolute inset-0 p-6 sm:p-10 flex flex-col justify-between select-none pointer-events-none opacity-60 dark:opacity-50'>
                    <div className='text-xs uppercase tracking-wider text-base-content/50 text-center font-serif truncate border-b border-base-content/10 pb-2'>
                      {previewPageSummary.bookTitle}
                    </div>

                    <div className='flex-1 py-4 text-xs sm:text-sm leading-relaxed text-base-content/80 font-serif overflow-hidden space-y-3'>
                      {previewPageSummary.pageText ? (
                        previewPageSummary.pageText
                          .split('\n\n')
                          .slice(0, 5)
                          .map((para, idx) => (
                            <p key={idx} className='line-clamp-4 text-justify indent-4'>
                              {para}
                            </p>
                          ))
                      ) : previewPageSummary.textSnippets.length > 0 ? (
                        <p className='line-clamp-6 text-justify indent-4'>
                          {previewPageSummary.textSnippets.join(' ')}
                        </p>
                      ) : (
                        <div className='space-y-3 pt-2 opacity-35'>
                          <div className='h-2.5 bg-base-content/40 rounded w-full' />
                          <div className='h-2.5 bg-base-content/40 rounded w-11/12' />
                          <div className='h-2.5 bg-base-content/40 rounded w-full' />
                          <div className='h-2.5 bg-base-content/40 rounded w-10/12' />
                          <div className='h-2.5 bg-base-content/40 rounded w-full' />
                        </div>
                      )}
                    </div>

                    <div className='text-xs text-base-content/50 text-center font-serif pt-2 border-t border-base-content/10'>
                      {previewPageSummary.pageNumber}
                    </div>
                  </div>
                )}

                {/* Layer 2: Vector SVG Strokes (100% sharp and 1:1 aligned) */}
                {previewPageSummary.strokes.length > 0 && (
                  <div
                    className='absolute inset-0 w-full h-full pointer-events-none [&>svg]:w-full [&>svg]:h-full [&>svg]:block'
                    dangerouslySetInnerHTML={{
                      __html: strokesToSvg(
                        previewPageSummary.strokes,
                        1000,
                        Math.round(1000 / previewAspectRatio),
                        {
                          isDarkMode,
                          transparentBg: true,
                        },
                      ),
                    }}
                  />
                )}

                {/* Layer 3: Sticky Notes overlay */}
                {previewPageSummary.stickyNotes.length > 0 && (
                  <div className='absolute bottom-3 end-3 flex items-center gap-1.5 bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-medium px-2.5 py-1 rounded-lg backdrop-blur-md border border-amber-500/30'>
                    <LuStickyNote size={14} />
                    <span>
                      {previewPageSummary.stickyNotes.length} {_('Sticky Notes')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Nav Button */}
            <button
              type='button'
              onClick={handleNextNote}
              disabled={!hasNextNote}
              className={clsx(
                'btn btn-circle btn-md shadow-xl bg-base-100/90 dark:bg-base-200/90 border border-base-200/80 hover:bg-base-100 z-10 transition-all shrink-0',
                !hasNextNote ? 'opacity-20 pointer-events-none' : 'hover:scale-105 active:scale-95',
              )}
              title={_('Next Note (Right Arrow)')}
            >
              <PiCaretRight size={24} />
            </button>
          </div>

          {/* Footer Navigation Tip with Safe Area Bottom Padding */}
          <div
            className='flex items-center justify-center text-[11px] text-base-content/45 bg-base-100/80 border-t border-base-200/60 shrink-0 px-4'
            style={{
              minHeight: '2.25rem',
              paddingBottom: `max(env(safe-area-inset-bottom, 0px), var(--safe-area-inset-bottom, 0px), ${effectiveBottomInset * 0.5}px)`,
            }}
          >
            {_('Use ← / → arrow keys to flip between notes, Esc to return')}
          </div>
        </div>
      )}
    </Dialog>
  );
};

export default HandwritingOverviewDialog;
