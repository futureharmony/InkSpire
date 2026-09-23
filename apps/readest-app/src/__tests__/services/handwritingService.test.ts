import { describe, expect, test } from 'vitest';
import {
  extractHandwritingFromBooknotes,
  mergeHandwritingIntoBooknotes,
} from '@/services/handwritingService';
import { BookNote } from '@/types/book';
import { HandwritingStroke } from '@/types/handwriting';

describe('Handwriting Service', () => {
  const sampleStroke: HandwritingStroke = {
    id: 's-1',
    tool: 'pen',
    color: '#000000',
    width: 2,
    opacity: 1,
    pageIndex: 0,
    createdAt: 1000,
    updatedAt: 1000,
    points: [{ x: 0.1, y: 0.2 }],
  };

  test('extracts handwriting strokes from booknotes', () => {
    const booknotes: BookNote[] = [
      {
        id: 'ann-1',
        type: 'annotation',
        cfi: 'cfi-1',
        note: 'Normal text note',
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'hw-hash-p1',
        type: 'handwriting',
        cfi: 'cfi-hw',
        page: 1,
        note: JSON.stringify([sampleStroke]),
        createdAt: 1000,
        updatedAt: 1000,
      },
      {
        id: 'hw-deleted',
        type: 'handwriting',
        cfi: 'cfi-del',
        page: 2,
        note: JSON.stringify([sampleStroke]),
        deletedAt: 12345,
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const extracted = extractHandwritingFromBooknotes(booknotes);
    expect(Object.keys(extracted).length).toBe(1);
    expect(extracted[0]?.length).toBe(1);
    expect(extracted[0]?.[0]?.id).toBe('s-1');
  });

  test('merges new handwriting strokes into booknotes', () => {
    const existing: BookNote[] = [
      {
        id: 'bookmark-1',
        type: 'bookmark',
        cfi: 'cfi-bm',
        note: '',
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const merged = mergeHandwritingIntoBooknotes('book-1', 0, [sampleStroke], existing);

    expect(merged.length).toBe(2);
    const hwNote = merged.find((n) => n.type === 'handwriting');
    expect(hwNote).toBeDefined();
    expect(hwNote?.page).toBe(1);
    expect(hwNote?.bookHash).toBe('book-1');
    expect(JSON.parse(hwNote!.note)).toMatchObject([sampleStroke]);
  });

  test('updates existing handwriting note at the same page', () => {
    const existing: BookNote[] = [
      {
        id: 'hw-book-1-p1',
        type: 'handwriting',
        bookHash: 'book-1',
        cfi: 'cfi-1',
        page: 1,
        note: JSON.stringify([sampleStroke]),
        createdAt: 500,
        updatedAt: 500,
      },
    ];

    const newStroke: HandwritingStroke = {
      ...sampleStroke,
      id: 's-2',
    };

    const merged = mergeHandwritingIntoBooknotes('book-1', 0, [sampleStroke, newStroke], existing);

    expect(merged.length).toBe(1);
    expect(merged[0]?.createdAt).toBe(500); // Preserves creation time
    const parsedStrokes = JSON.parse(merged[0]!.note);
    expect(parsedStrokes.length).toBe(2);
  });

  test('marks handwriting note as deleted when strokes are cleared', () => {
    const existing: BookNote[] = [
      {
        id: 'hw-book-1-p1',
        type: 'handwriting',
        bookHash: 'book-1',
        cfi: 'cfi-1',
        page: 1,
        note: JSON.stringify([sampleStroke]),
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];

    const merged = mergeHandwritingIntoBooknotes('book-1', 0, [], existing);

    expect(merged.length).toBe(1);
    expect(merged[0]?.deletedAt).toBeDefined();
  });

  test('embeds textAnchor snippet and cfi into BookNote', () => {
    const strokeWithAnchor: HandwritingStroke = {
      ...sampleStroke,
      id: 's-anchor',
      pageIndex: 4, // Page 5
      textAnchor: {
        textSnippet: 'Important concept on artificial intelligence',
        cfi: 'epubcfi(/6/12[c5]!/4/2/1:10)',
        sectionIndex: 3,
      },
    };

    const merged = mergeHandwritingIntoBooknotes('book-ai', 4, [strokeWithAnchor], []);

    expect(merged.length).toBe(1);
    const note = merged[0]!;
    expect(note.page).toBe(5); // 1-based page 5
    expect(note.cfi).toBe('epubcfi(/6/12[c5]!/4/2/1:10)');
    expect(note.text).toContain('Important concept on artificial intelligence');
  });

  test('keeps page 5 and page 6 handwriting notes distinct in booknotes array', () => {
    const strokeP5: HandwritingStroke = { ...sampleStroke, id: 's-p5', pageIndex: 4 };
    const strokeP6: HandwritingStroke = { ...sampleStroke, id: 's-p6', pageIndex: 5 };

    let booknotes: BookNote[] = [];
    booknotes = mergeHandwritingIntoBooknotes('book-1', 4, [strokeP5], booknotes);
    booknotes = mergeHandwritingIntoBooknotes('book-1', 5, [strokeP6], booknotes);

    expect(booknotes.length).toBe(2);

    const extracted = extractHandwritingFromBooknotes(booknotes);
    expect(extracted[4]?.length).toBe(1);
    expect(extracted[4]?.[0]?.id).toBe('s-p5');
    expect(extracted[5]?.length).toBe(1);
    expect(extracted[5]?.[0]?.id).toBe('s-p6');
  });
});
