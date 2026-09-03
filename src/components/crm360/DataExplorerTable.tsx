import { useState, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Search, RefreshCw, ChevronLeft, ChevronRight, X,
  Download, ArrowUpDown, Plus,
} from 'lucide-react';
import { useExternalTableBrowser } from '@/hooks/integrations/useExternalDB';
import { formatCellValue, exportToCSV, RFM_SEGMENT_COLORS } from './crm360TabsConfig';
import type { TabConfig } from './crm360TabsConfig';
import type { ExternalTableName } from '@/types/externalDB';

function RFMBadge({ segment }: { segment: string | null }) {
  if (!segment) return null;
  return (
    <Badge variant="outline" className={RFM_SEGMENT_COLORS[segment] || 'bg-muted text-muted-foreground'}>
      {segment}
    </Badge>
  );
}

interface DataExplorerTableProps {
  tabConfig: TabConfig;
  onRowClick?: (row: Record<string, unknown>) => void;
  onCreateClick?: () => void;
}

export function DataExplorerTable({ tabConfig, onRowClick, onCreateClick }: DataExplorerTableProps) {
  const browser = useExternalTableBrowser(tabConfig.id as ExternalTableName);
  const [searchInput, setSearchInput] = useState('');

  const totalPages = Math.max(1, Math.ceil(browser.totalRecords / browser.pageSize));

  const handleSearch = useCallback(() => {
    if (!searchInput.trim() || !tabConfig.searchColumn) {
      browser.clearFilters();
      return;
    }
    browser.clearFilters();
    browser.addFilter({
      column: tabConfig.searchColumn,
      operator: 'ilike',
      value: `%${searchInput.trim()}%`,
    });
  }, [searchInput, tabConfig.searchColumn, browser]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  }, [handleSearch]);

  const handleClearSearch = useCallback(() => {
    setSearchInput('');
    browser.clearFilters();
  }, [browser]);

  return (
    <div className="space-y-3">
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={`Buscar por ${tabConfig.searchColumn || 'campo'}...`}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={handleKeyDown}
            className="pl-9 pr-8 h-9"
          />
          {searchInput && (
            <button onClick={handleClearSearch} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleSearch} className="h-9">
          <Search className="h-3.5 w-3.5 mr-1" /> Buscar
        </Button>
        <Select value={String(browser.pageSize)} onValueChange={(v) => browser.setPageSize(Number(v))}>
          <SelectTrigger className="w-[80px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10</SelectItem>
            <SelectItem value="25">25</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => browser.refetch()} className="h-9">
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
        <Button variant="outline" size="sm" onClick={() => exportToCSV(browser.data as Record<string, unknown>[], tabConfig.columns, tabConfig.id)} disabled={browser.data.length === 0} className="h-9">
          <Download className="h-3.5 w-3.5 mr-1" /> CSV
        </Button>
        {onCreateClick && (
          <Button size="sm" onClick={onCreateClick} className="h-9">
            <Plus className="h-3.5 w-3.5 mr-1" /> Novo
          </Button>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-auto">
          {browser.totalRecords > 0 && <Badge variant="secondary" className="text-[10px]">{browser.totalRecords.toLocaleString('pt-BR')} reg.</Badge>}
          {browser.duration > 0 && <Badge variant="outline" className="text-[10px]">{browser.duration}ms</Badge>}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <ScrollArea className="max-h-[55vh]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px] text-[10px]">#</TableHead>
                {tabConfig.columns.map((col) => (
                  <TableHead key={col.key} className="cursor-pointer hover:bg-muted/50 transition-colors text-xs"
                    onClick={() => { const isAsc = browser.order?.column === col.key && browser.order?.ascending; browser.setSort(col.key, !isAsc); }}>
                    <div className="flex items-center gap-1">
                      {col.label}
                      {browser.order?.column === col.key && <ArrowUpDown className="h-3 w-3 text-primary" />}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {browser.isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-6" /></TableCell>
                    {tabConfig.columns.map((col) => <TableCell key={col.key}><Skeleton className="h-4 w-16" /></TableCell>)}
                  </TableRow>
                ))
              ) : browser.data.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={tabConfig.columns.length + 1} className="text-center py-8 text-muted-foreground">Nenhum registro encontrado</TableCell>
                </TableRow>
              ) : (
                browser.data.map((row: Record<string, unknown>, idx: number) => (
                  <TableRow key={String(row.id ?? idx)} className={`hover:bg-muted/30 ${onRowClick ? 'cursor-pointer' : ''}`} onClick={() => onRowClick?.(row)}>
                    <TableCell className="text-muted-foreground text-[10px]">{browser.page * browser.pageSize + idx + 1}</TableCell>
                    {tabConfig.columns.map((col) => (
                      <TableCell key={col.key} className="max-w-[180px] truncate text-xs">
                        {col.key === 'segment_code' ? <RFMBadge segment={row[col.key] as string} /> : <span title={String(row[col.key] ?? '')}>{formatCellValue(row[col.key], col.format)}</span>}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </ScrollArea>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Pág. {browser.page + 1} de {totalPages}</span>
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" onClick={browser.prevPage} disabled={browser.page === 0} className="h-7 px-2"><ChevronLeft className="h-3.5 w-3.5" /></Button>
          <Button variant="outline" size="sm" onClick={browser.nextPage} disabled={browser.page >= totalPages - 1} className="h-7 px-2"><ChevronRight className="h-3.5 w-3.5" /></Button>
        </div>
      </div>

      {browser.error && <div className="bg-destructive/10 text-destructive p-3 rounded-lg text-sm">Erro: {browser.error}</div>}
    </div>
  );
}
