import { useState } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export type PeriodOption = '7d' | '14d' | '30d' | 'custom';

interface DateRange {
  from: Date;
  to: Date;
}

interface PeriodSelectorProps {
  value: PeriodOption;
  dateRange: DateRange;
  onChange: (period: PeriodOption, range: DateRange) => void;
}

const periodLabels: Record<PeriodOption, string> = {
  '7d': 'Últimos 7 dias',
  '14d': 'Últimos 14 dias',
  '30d': 'Últimos 30 dias',
  'custom': 'Personalizado',
};

export function PeriodSelector({ value, dateRange, onChange }: PeriodSelectorProps) {
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [tempRange, setTempRange] = useState<{ from?: Date; to?: Date }>({
    from: dateRange.from,
    to: dateRange.to,
  });

  const handlePeriodChange = (period: PeriodOption) => {
    if (period === 'custom') {
      setIsCustomOpen(true);
      return;
    }

    const now = new Date();
    const days = period === '7d' ? 7 : period === '14d' ? 14 : 30;
    const from = new Date(now);
    from.setDate(from.getDate() - days + 1);
    
    onChange(period, { from, to: now });
  };

  const handleCustomApply = () => {
    if (tempRange.from && tempRange.to) {
      onChange('custom', { from: tempRange.from, to: tempRange.to });
      setIsCustomOpen(false);
    }
  };

  const displayLabel = value === 'custom' 
    ? `${format(dateRange.from, 'dd/MM', { locale: ptBR })} - ${format(dateRange.to, 'dd/MM', { locale: ptBR })}`
    : periodLabels[value];

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="bg-muted/20 border-border/30 hover:bg-muted/40">
            <CalendarIcon className="w-4 h-4 mr-2" />
            {displayLabel}
            <ChevronDown className="w-4 h-4 ml-2" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-card border-border/30">
          <DropdownMenuItem 
            onClick={() => handlePeriodChange('7d')}
            className={cn("cursor-pointer", value === '7d' && "bg-primary/10")}
          >
            Últimos 7 dias
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handlePeriodChange('14d')}
            className={cn("cursor-pointer", value === '14d' && "bg-primary/10")}
          >
            Últimos 14 dias
          </DropdownMenuItem>
          <DropdownMenuItem 
            onClick={() => handlePeriodChange('30d')}
            className={cn("cursor-pointer", value === '30d' && "bg-primary/10")}
          >
            Últimos 30 dias
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem 
            onClick={() => handlePeriodChange('custom')}
            className={cn("cursor-pointer", value === 'custom' && "bg-primary/10")}
          >
            Período personalizado...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Custom Date Range Popover */}
      <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
        <PopoverTrigger asChild>
          <span className="hidden" />
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4 bg-card border-border/30" align="end">
          <div className="space-y-4">
            <div className="text-sm font-medium text-foreground">Selecione o período</div>
            
            <div className="flex gap-4">
              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Data inicial</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal bg-muted/20 border-border/30",
                        !tempRange.from && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {tempRange.from ? format(tempRange.from, "dd/MM/yyyy") : "Início"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border/30" align="start">
                    <Calendar
                      mode="single"
                      selected={tempRange.from}
                      onSelect={(date) => setTempRange(prev => ({ ...prev, from: date }))}
                      disabled={(date) => date > new Date()}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-muted-foreground">Data final</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-[140px] justify-start text-left font-normal bg-muted/20 border-border/30",
                        !tempRange.to && "text-muted-foreground"
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {tempRange.to ? format(tempRange.to, "dd/MM/yyyy") : "Fim"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border/30" align="start">
                    <Calendar
                      mode="single"
                      selected={tempRange.to}
                      onSelect={(date) => setTempRange(prev => ({ ...prev, to: date }))}
                      disabled={(date) => date > new Date() || !!(tempRange.from && date < tempRange.from)}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setIsCustomOpen(false)}
              >
                Cancelar
              </Button>
              <Button 
                size="sm"
                onClick={handleCustomApply}
                disabled={!tempRange.from || !tempRange.to}
              >
                Aplicar
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
