import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { AuthProvider } from '@/hooks/auth/useAuth';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    auth: {
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
      getSession: vi.fn(() => Promise.resolve({ data: { session: null } })),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
      })),
    })),
  },
}));

vi.mock('xlsx', () => ({
  utils: {
    json_to_sheet: vi.fn().mockReturnValue({}),
    book_new: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

vi.mock('jspdf', () => ({
  jsPDF: vi.fn().mockImplementation(() => ({
    setFontSize: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
    internal: { pageSize: { getWidth: vi.fn().mockReturnValue(210) } },
  })),
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { useExportData, ExportColumn } from '@/hooks/system/useExportData';

interface TestRow extends Record<string, unknown> {
  name: string;
  email: string;
  score: number;
}

const createWrapper = () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient },
      React.createElement(AuthProvider, null, children)
    );
};

describe('useExportData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const columns: ExportColumn<TestRow>[] = [
    { key: 'name', header: 'Nome' },
    { key: 'email', header: 'Email' },
    { key: 'score', header: 'Score', format: (v: unknown) => `${v}%` },
  ];

  const testData: TestRow[] = [
    { name: 'John', email: 'john@test.com', score: 95 },
    { name: 'Jane', email: 'jane@test.com', score: 87 },
  ];

  it('initializes with isExporting=false', () => {
    const { result } = renderHook(() =>
      useExportData<TestRow>({ columns, fileName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(result.current.isExporting).toBe(false);
  });

  it('exposes exportCSV function', () => {
    const { result } = renderHook(() =>
      useExportData<TestRow>({ columns, fileName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.exportCSV).toBe('function');
  });

  it('exposes exportExcel function', () => {
    const { result } = renderHook(() =>
      useExportData<TestRow>({ columns, fileName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.exportExcel).toBe('function');
  });

  it('exposes exportPDF function', () => {
    const { result } = renderHook(() =>
      useExportData<TestRow>({ columns, fileName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.exportPDF).toBe('function');
  });

  it('exposes exportData function', () => {
    const { result } = renderHook(() =>
      useExportData<TestRow>({ columns, fileName: 'test' }),
      { wrapper: createWrapper() }
    );
    expect(typeof result.current.exportData).toBe('function');
  });

  it('column format function is applied', () => {
    const scoreCol = columns.find(c => c.key === 'score');
    expect(scoreCol?.format?.(95)).toBe('95%');
  });

  it('handles columns without format function', () => {
    const nameCol = columns.find(c => c.key === 'name');
    expect(nameCol?.format).toBeUndefined();
  });
});
