import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { Activity, CalendarDays } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconTile, RECIPIENT_STATUS, TalkXFilterBar } from '../talkxShared';
import { fmtTime } from '../talkxShared';
import type { FilterDefinition } from '../talkxShared';

/**
 * X145 (TL-154) — cabeçalho da aba "Monitor" do módulo Talk X.
 *
 * É só apresentação: recebe a campanha em acompanhamento, as opções dos filtros e
 * o estado de cada filtro, e devolve cada mudança por callback. Quem lê os dados
 * é a tela (`TalkXView`) e o painel (`TalkXLiveMonitor`), então o cabeçalho não
 * busca nada sozinho.
 *
 * Duas decisões do desenho, registradas aqui:
 *  - o filtro de dia vai de `started_at` até hoje e o rótulo é o do mock
 *    ("Hoje · Qui, 08 de out de 2026");
 *  - o título e o subtítulo não citam o canal: a regra permanente de 08/10/2026
 *    proíbe indicar canal/origem em tela nova.
 */

export interface MonitorCampaign {
  id: string;
  name: string;
  status: string;
  started_at: string | null;
  created_at?: string | null;
}

export interface MonitorSegmentOption {
  value: string;
  label: string;
}

const MAX_DAY_OPTIONS = 31;

/** Dia local (não UTC) em ISO curto — o filtro de dia é o dia de quem olha a tela. */
function localDayISO(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** Rótulo do dia no formato do mock: hoje ganha o prefixo explícito. */
function dayLabel(iso: string, today: string): string {
  const raw = format(parseISO(iso), "EEE, dd 'de' MMM 'de' yyyy", { locale: ptBR }).replace(/\./g, '');
  const titled = raw.charAt(0).toUpperCase() + raw.slice(1);
  return iso === today ? `Hoje · ${titled}` : titled;
}

/** Dias oferecidos: de ontem até o dia em que a campanha começou (hoje é o item padrão). */
function dayOptions(startedAt: string | null, today: string): MonitorSegmentOption[] {
  const start = startedAt ? new Date(startedAt) : null;
  const startIso = start && !Number.isNaN(start.getTime()) ? localDayISO(start) : today;
  const options: MonitorSegmentOption[] = [];
  let cursor = parseISO(today);
  for (let i = 0; i < MAX_DAY_OPTIONS; i += 1) {
    const cursorIso = localDayISO(cursor);
    if (cursorIso < startIso) break;
    if (cursorIso !== today) options.push({ value: cursorIso, label: dayLabel(cursorIso, today) });
    cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
  }
  return options;
}

/** Texto do chip seletor: "Em andamento · <nome> · Iniciada às HH:mm". */
function campaignChipLabel(campaign: MonitorCampaign): string {
  const state = campaign.status === 'paused' ? 'Pausada' : 'Em andamento';
  const started = fmtTime(campaign.started_at);
  return started && started !== '—'
    ? `${state} · ${campaign.name} · Iniciada às ${started}`
    : `${state} · ${campaign.name}`;
}

export interface TalkXMonitorHeaderProps {
  /** Campanha aberta no monitor. */
  campaign: MonitorCampaign;
  /** Campanhas oferecidas pelo seletor (só `sending`/`paused`). */
  activeCampaigns: MonitorCampaign[];
  onSelectCampaign: (id: string) => void;
  /** Segmentações da campanha. Vazio esconde o filtro (não há o que recortar). */
  segments: MonitorSegmentOption[];
  segment: string;
  onSegmentChange: (value: string) => void;
  status: string;
  onStatusChange: (value: string) => void;
  day: string;
  onDayChange: (day: string) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

export function TalkXMonitorHeader({
  campaign, activeCampaigns, onSelectCampaign,
  segments, segment, onSegmentChange,
  status, onStatusChange,
  day, onDayChange,
  onRefresh, refreshing = false,
}: TalkXMonitorHeaderProps) {
  const today = localDayISO();
  const isToday = day === today;
  const days = useMemo(() => dayOptions(campaign.started_at, today), [campaign.started_at, today]);
  const filters: FilterDefinition[] = useMemo(() => {
    const list: FilterDefinition[] = [
      { key: 'day', label: 'Dia', allLabel: dayLabel(today, today), options: days, icon: CalendarDays },
    ];
    if (segments.length > 0) {
      list.push({ key: 'segment', label: 'Segmentação', allLabel: 'Todas as segmentações', options: segments });
    }
    list.push({
      key: 'status', label: 'Status', allLabel: 'Todos os status',
      options: Object.entries(RECIPIENT_STATUS).map(([value, meta]) => ({ value, label: meta.label })),
    });
    return list;
  }, [days, segments, today]);

  // O seletor lista a campanha aberta junto das demais ativas: ela sempre tem item.
  const selectableCampaigns = useMemo(() => {
    const active = activeCampaigns.filter((c) => c.status === 'sending' || c.status === 'paused');
    return active.some((c) => c.id === campaign.id) ? active : [campaign, ...active];
  }, [activeCampaigns, campaign]);

  const handleFilter = (key: string, value: string) => {
    if (key === 'day') { onDayChange(value === 'all' ? today : value); return; }
    if (key === 'segment') { onSegmentChange(value); return; }
    if (key === 'status') { onStatusChange(value); return; }
  };

  return (
    <section className="rounded-2xl bg-card border border-border/70 p-4 md:p-5 space-y-3" aria-label="Cabeçalho do monitor">
      <nav aria-label="breadcrumb" className="flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
        <span>Teletransporte</span>
        <span className="text-border" aria-hidden="true">›</span>
        <span>Chat</span>
        <span className="text-border" aria-hidden="true">›</span>
        <span>Campanhas</span>
        <span className="text-border" aria-hidden="true">›</span>
        <span className="text-foreground font-medium">Talk X</span>
      </nav>

      <div className="flex items-center gap-3.5 min-w-0">
        <IconTile icon={Activity} color="blue" size={48} glow />
        <div className="min-w-0">
          <h2 className="text-xl font-bold font-display text-foreground tracking-[-0.02em] truncate">Monitor ao Vivo</h2>
          <p className="text-xs text-foreground-secondary">Acompanhe o desempenho da sua campanha em tempo real.</p>
        </div>
      </div>

      <TalkXFilterBar
        filters={filters}
        values={{ day: isToday ? 'all' : day, segment, status }}
        onFilter={handleFilter}
        onClear={() => { onDayChange(today); onSegmentChange('all'); onStatusChange('all'); }}
        hasActive={!isToday || segment !== 'all' || status !== 'all'}
        onRefresh={onRefresh}
        refreshing={refreshing}
        rightSlot={(
          <Select value={campaign.id} onValueChange={onSelectCampaign}>
            <SelectTrigger aria-label="Campanha em acompanhamento" className="h-9 text-xs bg-input/40 border-border/70 rounded-lg w-full sm:w-auto sm:min-w-[240px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {selectableCampaigns.map((item) => (
                <SelectItem key={item.id} value={item.id}>{campaignChipLabel(item)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
    </section>
  );
}
