import { useMemo } from 'react';
import { ChevronDown } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CAMPAIGN_STATUS } from './constants';
import { fmtTime } from './format';

/**
 * X053 / T17-008 — indicador de campanha em andamento do cabeçalho do módulo.
 *
 * Mostra a campanha ATIVA mais recente (o que o "Ao vivo" do canal de tempo real
 * não mostrava: lá era só o estado da conexão). O menu lista as demais ativas e o
 * clique abre a campanha. Sem campanha ativa o cartão não é desenhado.
 *
 * Só entram `sending` e `paused`; a ordem é `started_at desc` (o desempate é o
 * `id`, para a ordem não depender do backend) e o recorte é de 5, como o cartão
 * do mock — as que sobrarem continuam acessíveis pela tela "Em andamento".
 */
export type ActiveCampaign = {
  id: string;
  name: string;
  status: string;
  started_at: string | null;
};

const ACTIVE_STATUSES = new Set(['sending', 'paused']);
const LIMIT = 5;

export function ActiveCampaignIndicator({ campaigns, onOpen, live = false }: {
  campaigns: ActiveCampaign[];
  onOpen: (id: string) => void;
  /** Canal de tempo real conectado: o ponto do cartão pulsa e ganha o tooltip "Ao vivo". */
  live?: boolean;
}) {
  const active = useMemo(() => campaigns
    .filter((c) => ACTIVE_STATUSES.has(c.status))
    .sort((a, b) => (b.started_at ?? '').localeCompare(a.started_at ?? '') || a.id.localeCompare(b.id))
    .slice(0, LIMIT), [campaigns]);

  if (active.length === 0) return null;

  const [top, ...rest] = active;
  const topPaused = top.status === 'paused';
  const topLabel = CAMPAIGN_STATUS[top.status]?.label ?? top.status;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="talkx-glow-ring inline-flex items-center gap-2 h-9 px-3 rounded-lg border border-border/60 bg-input/40 text-left transition-colors hover:bg-muted/60"
          aria-label={`Campanhas em andamento — ${top.name}`}
        >
          <span
            title={live ? 'Ao vivo' : undefined}
            className={cn('w-2 h-2 rounded-full shrink-0', topPaused ? 'bg-warning' : 'bg-success', live && 'talkx-live-dot')}
          />
          <span className="flex flex-col leading-tight min-w-0">
            <span className={cn('text-2xs font-semibold', topPaused ? 'text-warning' : 'text-success')}>{topLabel}</span>
            <span className="text-[11px] text-foreground truncate max-w-[160px]">{top.name}</span>
          </span>
          <span className="text-2xs text-muted-foreground hidden sm:inline whitespace-nowrap">Iniciada às {fmtTime(top.started_at)}</span>
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {active.map((c) => {
          const paused = c.status === 'paused';
          return (
            <DropdownMenuItem key={c.id} onSelect={() => onOpen(c.id)} className="flex items-center gap-2">
              <span className={cn('w-2 h-2 rounded-full shrink-0', paused ? 'bg-warning' : 'bg-success')} />
              <span className="truncate">{c.name}</span>
              <span className="text-2xs text-muted-foreground ml-auto">
                {CAMPAIGN_STATUS[c.status]?.label ?? c.status}
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
