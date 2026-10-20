/**
 * CRM360 Explorer — Tab definitions and utility functions
 */
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { ExternalTableName } from '@/types/externalDB';
import {
  CORE_TABS, COMMUNICATION_TABS, SALES_TABS,
  CRM_PIPELINE_TABS, GAMIFICATION_TABS, METADATA_TABS,
} from './crm360TabsData';

// ─── Tab configuration type ─────────────────────────────────
export interface TabConfig {
  id: ExternalTableName | string;
  label: string;
  icon: React.ElementType;
  description: string;
  searchColumn?: string;
  editable?: boolean;
  columns: { key: string; label: string; format?: 'date' | 'currency' | 'boolean' | 'number' }[];
}

// ─── Aggregated TABS array ──────────────────────────────────
export const TABS: TabConfig[] = [
  ...CORE_TABS,
  ...COMMUNICATION_TABS,
  ...SALES_TABS,
  ...CRM_PIPELINE_TABS,
  ...GAMIFICATION_TABS,
  ...METADATA_TABS,
];

// ─── Value formatters ────────────────────────────────────────
export function formatCellValue(value: unknown, format?: string): string {
  if (value === null || value === undefined) return '—';
  if (format === 'date' && typeof value === 'string') {
    try {
      return formatDistanceToNow(new Date(value), { addSuffix: true, locale: ptBR });
    } catch { return String(value); }
  }
  if (format === 'currency' && typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
  }
  if (format === 'boolean') return value ? '✅' : '❌';
  if (format === 'number' && typeof value === 'number') {
    return new Intl.NumberFormat('pt-BR').format(value);
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

// ─── CSV Export ──────────────────────────────────────────────
export function exportToCSV(data: Record<string, unknown>[], columns: TabConfig['columns'], filename: string) {
  if (!data.length) return;
  const header = columns.map(c => c.label).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const val = row[c.key];
      const str = val === null || val === undefined ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── RFM Segment colors ─────────────────────────────────────
export const RFM_SEGMENT_COLORS: Record<string, string> = {
  Champions: 'bg-success/15 text-success dark:text-success',
  'Loyal Customers': 'bg-info/15 text-info',
  'Potential Loyalist': 'bg-info/15 text-info dark:text-info',
  'At Risk': 'bg-destructive/15 text-destructive',
  Hibernating: 'bg-muted text-muted-foreground',
  Lost: 'bg-muted/50 text-muted-foreground',
};
