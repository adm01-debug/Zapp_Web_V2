/**
 * Etapas 137–139: seção Planejamento do painel de detalhes.
 * Apresentação pura; WorkItemSheet mantém o estado e chama as mutations.
 */
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, BellRing, CalendarIcon, CheckCircle2, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Calendar } from '@/components/ui/calendar';
import { comporLocal, diaLocal } from '../localDateTime';
import {
  avaliarLembrete,
  formatPlanejamentoDate,
  formatPlanejamentoTime,
  type TomAviso,
} from './planejamento';

const COR_AVISO: Record<TomAviso, string> = {
  success: 'text-success',
  warning: 'text-[hsl(var(--warning-text))]',
  destructive: 'text-[hsl(var(--destructive-text))]',
};

const COR_APOIO = 'text-2xs text-muted-foreground';

export interface PlanejamentoSectionProps {
  prazoDia: string | null;
  prazoHora: string;
  onPrazoDia: (dia: string | null) => void;
  onPrazoHora: (hora: string) => void;
  avisoDia: string | null;
  avisoHora: string;
  onAvisoDia: (dia: string | null) => void;
  onAvisoHora: (hora: string) => void;
  lembreteElegivel: boolean;
  motivoIndisponivel: string;
  focoAviso?: boolean;
  avisadoEm: string | null;
  onAdiar: (minutes: number | 'tomorrow9') => void;
  onRemover: () => void;
}

export function PlanejamentoSection({
  prazoDia,
  prazoHora,
  onPrazoDia,
  onPrazoHora,
  avisoDia,
  avisoHora,
  onAvisoDia,
  onAvisoHora,
  lembreteElegivel,
  motivoIndisponivel,
  focoAviso = false,
  avisadoEm,
  onAdiar,
  onRemover,
}: PlanejamentoSectionProps) {
  const prazoIso = prazoDia ? comporLocal(prazoDia, prazoHora) : null;
  const avisoIso = avisoDia ? comporLocal(avisoDia, avisoHora) : null;
  const aviso = lembreteElegivel ? avaliarLembrete(avisoIso, prazoIso) : null;
  const agendado = Boolean(lembreteElegivel && avisoDia);
  const avisadoData = formatPlanejamentoDate(avisadoEm);
  const avisadoHora = formatPlanejamentoTime(avisadoEm);

  return (
    <section data-testid="sheet-planejamento" className="flex flex-col gap-2">
      <h3 className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
        Planejamento
      </h3>

      <div className="grid gap-3 sm:grid-cols-2">
        <div data-testid="planejamento-prazo" className="rounded-lg border border-border/70 bg-input/30 p-3">
          <Label className="text-xs text-muted-foreground">Até quando concluir</Label>
          <div className="mt-1.5 flex items-center gap-2">
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  data-testid="sheet-prazo"
                  className="h-10 min-w-0 flex-1 justify-start border-border/70 bg-background/60 font-normal"
                >
                  <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />
                  <span className="truncate">
                    {(prazoIso && formatPlanejamentoDate(prazoIso)) || 'Sem prazo'}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  locale={ptBR}
                  selected={prazoDia ? new Date(`${prazoDia}T12:00:00`) : undefined}
                  onSelect={(d) => onPrazoDia(d ? diaLocal(d.toISOString()) : null)}
                />
                <div className="border-t border-border/50 p-2">
                  <Button variant="ghost" size="sm" onClick={() => onPrazoDia(null)}>
                    Limpar
                  </Button>
                </div>
              </PopoverContent>
            </Popover>
            <Input
              type="time"
              data-testid="sheet-prazo-hora"
              aria-label="Hora do prazo"
              value={prazoHora}
              onChange={(e) => onPrazoHora(e.target.value)}
              className="h-10 w-24 shrink-0 bg-input/40 border-border/70"
            />
          </div>
        </div>

        <div data-testid="planejamento-lembrete" className="rounded-lg border border-border/70 bg-input/30 p-3">
          <Label className="text-xs text-muted-foreground">Quando avisar você</Label>
          {lembreteElegivel ? (
            <div className="mt-1.5 flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    data-testid="sheet-alarme"
                    autoFocus={focoAviso}
                    className="h-10 min-w-0 flex-1 justify-start border-border/70 bg-background/60 font-normal"
                  >
                    {avisadoEm && avisoDia
                      ? <BellRing className="mr-2 h-4 w-4 shrink-0 text-destructive" />
                      : <CalendarIcon className="mr-2 h-4 w-4 shrink-0" />}
                    <span className="truncate">
                      {(avisoIso && formatPlanejamentoDate(avisoIso)) || 'Sem alarme'}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    locale={ptBR}
                    selected={avisoDia ? new Date(`${avisoDia}T12:00:00`) : undefined}
                    onSelect={(d) => onAvisoDia(d ? diaLocal(d.toISOString()) : null)}
                  />
                  <div className="border-t border-border/50 p-2">
                    <Button variant="ghost" size="sm" onClick={() => onAvisoDia(null)}>
                      Limpar
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
              <Input
                type="time"
                data-testid="sheet-alarme-hora"
                aria-label="Hora do lembrete"
                value={avisoHora}
                onChange={(e) => onAvisoHora(e.target.value)}
                className="h-10 w-24 shrink-0 bg-input/40 border-border/70"
              />
            </div>
          ) : (
            <p data-testid="sheet-alarme-indisponivel" className={`mt-1.5 ${COR_APOIO}`}>
              {motivoIndisponivel}
            </p>
          )}
        </div>
      </div>

      {agendado && (
        <div
          data-testid="sheet-lembrete-acoes"
          className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border/70 bg-input/20 px-3 py-2"
        >
          {aviso && (
            <>
              <span
                data-testid="sheet-lembrete-aviso"
                data-tom={aviso.tom}
                className={`inline-flex items-center gap-1 text-2xs font-semibold ${COR_AVISO[aviso.tom]}`}
              >
                {aviso.tom === 'success'
                  ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  : <AlertTriangle className="h-3.5 w-3.5" aria-hidden />}
                {aviso.texto}
              </span>
              <span aria-hidden className="text-muted-foreground">·</span>
            </>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" data-testid="sheet-adiar" className="h-10 gap-1 px-2">
                Adiar <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem data-testid="sheet-adiar-15" onClick={() => onAdiar(15)}>15 min</DropdownMenuItem>
              <DropdownMenuItem data-testid="sheet-adiar-60" onClick={() => onAdiar(60)}>1 hora</DropdownMenuItem>
              <DropdownMenuItem data-testid="sheet-adiar-amanha" onClick={() => onAdiar('tomorrow9')}>Amanhã 9h</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <span aria-hidden className="text-muted-foreground">·</span>
          <button
            type="button"
            data-testid="sheet-remover-alarme"
            onClick={onRemover}
            className="h-10 rounded-md px-2 text-2xs text-muted-foreground transition-colors hover:bg-secondary hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Remover
          </button>
          {avisadoData && avisadoHora && (
            <p data-testid="sheet-avisado" className={`basis-full ${COR_APOIO}`}>
              Avisado em {avisadoData} às {avisadoHora}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
