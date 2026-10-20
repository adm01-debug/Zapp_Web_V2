import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('jspdf', () => {
  const mockDoc = {
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
    setFontSize: vi.fn(),
    setTextColor: vi.fn(),
    text: vi.fn(),
    save: vi.fn(),
    getNumberOfPages: vi.fn().mockReturnValue(1),
    setPage: vi.fn(),
  };
  return { default: vi.fn(() => mockDoc) };
});

vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

vi.mock('xlsx', () => ({
  utils: {
    book_new: vi.fn().mockReturnValue({}),
    aoa_to_sheet: vi.fn().mockReturnValue({}),
    book_append_sheet: vi.fn(),
  },
  writeFile: vi.fn(),
}));

import type { ReportData } from '@/utils/exportReport';

const mockData: ReportData = {
  title: 'Test Report',
  subtitle: 'Subtitle',
  generatedAt: new Date('2024-06-15T10:00:00'),
  columns: [
    { header: 'Nome', key: 'name', width: 30 },
    { header: 'Valor', key: 'value' },
  ],
  rows: [
    { name: 'Item 1', value: 100 },
    { name: 'Item 2', value: null },
    { name: 'Item, with "quotes"', value: 'text\nline' },
  ],
  summary: [
    { label: 'Total', value: 200 },
    { label: 'Média', value: 100 },
  ],
};

describe('exportReport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('exportToExcel - blocked by security policy', () => {
    it('throws security error when called', async () => {
      const { exportToExcel } = await import('@/utils/exportReport');
      expect(() => exportToExcel(mockData)).toThrow(/bloqueada/i);
    });

    it('consistently blocks all attempts', async () => {
      const { exportToExcel } = await import('@/utils/exportReport');
      expect(() => exportToExcel(mockData)).toThrow();
      expect(() => exportToExcel({ ...mockData, rows: [] })).toThrow();
    });
  });

  describe('exportToCSV - blocked by security policy', () => {
    it('throws security error when called', async () => {
      const { exportToCSV } = await import('@/utils/exportReport');
      expect(() => exportToCSV(mockData)).toThrow(/bloqueada/i);
    });

    it('blocks even with empty rows', async () => {
      const { exportToCSV } = await import('@/utils/exportReport');
      expect(() => exportToCSV({ ...mockData, rows: [] })).toThrow();
    });
  });

  describe('ReportData structure', () => {
    it('has required fields', () => {
      expect(mockData.title).toBeTruthy();
      expect(mockData.columns.length).toBeGreaterThan(0);
      expect(mockData.generatedAt).toBeInstanceOf(Date);
    });

    it('columns have header and key', () => {
      mockData.columns.forEach(col => {
        expect(col.header).toBeTruthy();
        expect(col.key).toBeTruthy();
      });
    });

    it('summary items have label and value', () => {
      mockData.summary!.forEach(s => {
        expect(s.label).toBeTruthy();
        expect(s.value).toBeDefined();
      });
    });
  });
});
