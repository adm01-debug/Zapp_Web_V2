import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { X } from 'lucide-react';

interface FiltersPanelProps {
  filters: {
    vendedores: string[];
    ramos: string[];
    estados: string[];
    rfm_segments: string[];
  } | null;
  params: {
    vendedor?: string;
    ramo?: string;
    estado?: string;
    rfm_segment?: string;
    cliente_ativado?: boolean;
    ja_comprou?: boolean;
  };
  onFilter: (key: string, value: string | boolean | undefined) => void;
  onClear: () => void;
  activeCount: number;
}

export function CRMFiltersPanel({ filters, params, onFilter, onClear, activeCount }: FiltersPanelProps) {
  if (!filters) return null;

  return (
    <div className="space-y-4 p-1">
      {activeCount > 0 && (
        <Button variant="ghost" size="sm" onClick={onClear} className="w-full text-xs text-destructive hover:text-destructive">
          <X className="w-3 h-3 mr-1" /> Limpar {activeCount} filtro{activeCount > 1 ? 's' : ''}
        </Button>
      )}

      <FilterSelect label="Vendedor" value={params.vendedor} options={filters.vendedores}
        onChange={(v) => onFilter('vendedor', v === '_all' ? undefined : v)} />

      <FilterSelect label="Ramo de atividade" value={params.ramo} options={filters.ramos.slice(0, 50)}
        onChange={(v) => onFilter('ramo', v === '_all' ? undefined : v)} />

      <FilterSelect label="Estado" value={params.estado} options={filters.estados}
        onChange={(v) => onFilter('estado', v === '_all' ? undefined : v)} />

      {filters.rfm_segments.length > 0 && (
        <FilterSelect label="Segmento RFM" value={params.rfm_segment} options={filters.rfm_segments}
          onChange={(v) => onFilter('rfm_segment', v === '_all' ? undefined : v)} />
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status cliente</label>
        <Select
          value={params.cliente_ativado === true ? 'ativo' : params.cliente_ativado === false ? 'inativo' : '_all'}
          onValueChange={(v) => onFilter('cliente_ativado', v === '_all' ? undefined : v === 'ativo')}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="ativo">Ativo</SelectItem>
            <SelectItem value="inativo">Inativo</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Já comprou?</label>
        <Select
          value={params.ja_comprou === true ? 'sim' : params.ja_comprou === false ? 'nao' : '_all'}
          onValueChange={(v) => onFilter('ja_comprou', v === '_all' ? undefined : v === 'sim')}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="sim">Sim</SelectItem>
            <SelectItem value="nao">Não</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function FilterSelect({ label, value, options, onChange }: {
  label: string; value?: string; options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</label>
      <Select value={value || '_all'} onValueChange={onChange}>
        <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="_all">Todos</SelectItem>
          {options.map((v) => (<SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>))}
        </SelectContent>
      </Select>
    </div>
  );
}
