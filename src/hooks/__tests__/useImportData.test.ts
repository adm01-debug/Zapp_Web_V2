import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { z } from 'zod';

vi.mock('xlsx', () => ({
  read: vi.fn().mockReturnValue({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: {} },
  }),
  utils: {
    sheet_to_json: vi.fn().mockReturnValue([
      { name: 'John', email: 'john@test.com' },
      { name: 'Jane', email: 'jane@test.com' },
    ]),
  },
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

import { useImportData } from '@/hooks/system/useImportData';

const testSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
});

type TestRow = z.infer<typeof testSchema>;

describe('useImportData', () => {
  const mockOnImport = vi.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('initializes with idle status', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport })
    );
    expect(result.current.status).toBe('idle');
    expect(result.current.progress).toBe(0);
    expect(result.current.result).toBeNull();
  });

  it('exposes processFile function', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport })
    );
    expect(typeof result.current.processFile).toBe('function');
  });

  it('exposes reset function', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport })
    );
    expect(typeof result.current.reset).toBe('function');
  });

  it('exposes confirmImport function', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport })
    );
    expect(typeof result.current.confirmImport).toBe('function');
  });

  it('isProcessing is false initially', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport })
    );
    expect(result.current.isProcessing).toBe(false);
  });

  it('accepts maxRows option', () => {
    const { result } = renderHook(() =>
      useImportData<TestRow>({ schema: testSchema, onImport: mockOnImport, maxRows: 100 })
    );
    expect(result.current.status).toBe('idle');
  });

  it('schema validates correct data', () => {
    const validData = { name: 'John', email: 'john@test.com' };
    expect(testSchema.safeParse(validData).success).toBe(true);
  });

  it('schema rejects invalid email', () => {
    const invalidData = { name: 'John', email: 'not-an-email' };
    expect(testSchema.safeParse(invalidData).success).toBe(false);
  });

  it('schema rejects empty name', () => {
    const invalidData = { name: '', email: 'john@test.com' };
    expect(testSchema.safeParse(invalidData).success).toBe(false);
  });

  it('schema rejects missing fields', () => {
    const invalidData = { name: 'John' };
    expect(testSchema.safeParse(invalidData).success).toBe(false);
  });

  it('validates multiple rows correctly', () => {
    const rows = [
      { name: 'John', email: 'john@test.com' },
      { name: '', email: 'bad' },
      { name: 'Jane', email: 'jane@test.com' },
    ];

    const results = rows.map(r => testSchema.safeParse(r));
    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[2].success).toBe(true);
  });
});
