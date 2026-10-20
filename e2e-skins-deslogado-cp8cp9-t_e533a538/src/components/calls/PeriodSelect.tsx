import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PERIODOS, type PeriodoValue } from './periodos';

interface PeriodSelectProps {
  value: PeriodoValue;
  onValueChange: (valor: PeriodoValue) => void;
  className?: string;
}

/**
 * T35: filtro de período. Componente controlado de proposito - quem guarda o estado
 * e a URL (T36), nao ele. Altura h-11 no celular (44px), h-10 no desktop (40px).
 */
export function PeriodSelect({ value, onValueChange, className }: PeriodSelectProps) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as PeriodoValue)}>
      <SelectTrigger className={`h-11 md:h-10 w-[150px] text-xs ${className ?? ''}`} aria-label="Período">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PERIODOS.map((p) => (
          <SelectItem key={p.value} value={p.value} className="text-xs">
            {p.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
