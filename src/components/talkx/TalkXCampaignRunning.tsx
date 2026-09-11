// TalkXCampaignRunning.tsx — E77: Tela "Campanha em Andamento"
import React, { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import {
  Zap, CheckCircle2, AlertTriangle, Users, ChevronLeft,
  Pause, Square, Eye, RefreshCw, Activity, Settings2,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { useTalkX, type TalkXCampaign } from '@/hooks/integrations/useTalkX';
import { IconTile, RailCard, MetaRow, fmtInt, fmtDateTime } from './talkxShared';
import { DashboardKpiCard } from '@/components/dashboard/overview/DashboardKpiCard';
import { fromTable } from '@/lib/supabaseHelpers';

// ─── Sub-tab type ──────────────────────────────────────────────────────────────
type RunTab = 'overview' | 'recipients' | 'messages' | 'config' | 'results' | 'logs';
const RUN_TABS: { id: RunTab; label: string }[] = [
  { id: 'overview', label: 'Visão Geral' },
  { id: 'recipients', label: 'Destinatários' },
  { id: 'messages', label: 'Mensagens' },
  { id: 'config', label: 'Configurações' },
  { id: 'results', label: 'Resultados' },
  { id: 'logs', label: 'Logs em Tempo Real' },
];

// ─── Speed label ───────────────────────────────────────────────────────────────
const SPEED_LABEL: Record<string, string> = {
  slow: 'Lento (seguro)',
  moderate: 'Moderado',
  fast: 'Rápido',
};

// ─── Donut SVG ─────────────────────────────────────────────────────────────────
function DonutChart({ sent, delivered, failed, total }: { sent: number; delivered: number; failed: number; total: number }) {
  const R = 72, CX = 88, CY = 88, STROKE = 18;
  const circ = 2 * Math.PI * R;
  const pct = (n: number) => total > 0 ? (n / total) * circ : 0;
  const pending = Math.max(0, total - sent - failed);
  const segments = [
    { val: delivered, color: 'hsl(var(--dash-green))', label: 'Entregues' },
    { val: sent - delivered, color: 'hsl(var(--primary))', label: 'Enviadas' },
    { val: failed, color: 'hsl(var(--dash-red))', label: 'Falhas' },
    { val: pending, color: 'hsl(var(--muted))', label: 'Pendentes' },
  ];
  let offset = 0;
  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={176} height={176} viewBox="0 0 176 176">
        {total === 0
          ? <circle cx={CX} cy={CY} r={R} fill="none" stroke="hsl(var(--muted))" strokeWidth={STROKE} />
          : segments.map(({ val, color }, i) => {
              const dash = pct(val);
              const el = (
                <circle key={i} cx={CX} cy={CY} r={R} fill="none" stroke={color}
                  strokeWidth={STROKE} strokeDasharray={`${dash} ${circ - dash}`}
                  strokeDashoffset={-offset} style={{ transform: 'rotate(-90deg)', transformOrigin: `${CX}px ${CY}px` }} />
              );
              offset += dash;
              return el;
            })
        }
        <text x={CX} y={CY - 6} textAnchor="middle" className="fill-foreground" fontSize={22} fontWeight={700}>{total > 0 ? Math.round(((sent + failed) / total) * 100) : 0}%</text>
        <text x={CX} y={CY + 14} textAnchor="middle" className="fill-foreground-secondary" fontSize={11}>concluído</text>
      </svg>
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5">
        {segments.map(({ val, color, label }) => (
          <div key={label} className="flex items-center gap-2 text-[12px]">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-foreground-secondary">{label}</span>
            <span className="font-semibold text-foreground ml-auto">{fmtInt(val)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Tab: Visão Geral ──────────────────────────────────────────────────────────
function TabOverview({ c, chartData }: { c: TalkXCampaign; chartData: { time: string; Enviadas: number; Entregues: number }[] }) {
  const pending = Math.max(0, c.total_recipients - c.sent_count - c.failed_count);
  const elapsed = c.started_at ? Math.round((new Date().getTime() - new Date(c.started_at).getTime()) / 60000) : 0;
  return (
    <div className="space-y-4">
      {/* Donut + KPIs lado a lado */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RailCard title="Progresso da Campanha" subtitle={`${fmtInt(c.sent_count + c.failed_count)} de ${fmtInt(c.total_recipients)} processados`} color="blue" icon={Activity}>
          <div className="pt-2">
            <DonutChart sent={c.sent_count} delivered={c.delivered_count} failed={c.failed_count} total={c.total_recipients} />
          </div>
        </RailCard>
        <div className="grid grid-cols-2 gap-3 content-start">
          <DashboardKpiCard size="compact" index={0} label="Enviadas" value={fmtInt(c.sent_count)} delta={{ text: `de ${fmtInt(c.total_recipients)} prev.`, tone: 'muted' }} tile="blue" icon={Zap} bars={null} barsColor="blue" chart="none" />
          <DashboardKpiCard size="compact" index={1} label="Entregues" value={fmtInt(c.delivered_count)} delta={{ text: c.sent_count > 0 ? `${Math.round((c.delivered_count / c.sent_count) * 100)}% das enviadas` : '—', tone: 'muted' }} tile="green" icon={CheckCircle2} bars={null} barsColor="green" chart="none" />
          <DashboardKpiCard size="compact" index={2} label="Falhas" value={fmtInt(c.failed_count)} delta={c.sent_count > 0 ? { text: `${Math.round((c.failed_count / c.sent_count) * 100)}% de erro`, tone: 'muted' } : null} tile="red" icon={AlertTriangle} bars={null} barsColor="red" chart="none" />
          <DashboardKpiCard size="compact" index={3} label="Restantes" value={fmtInt(pending)} delta={{ text: `${elapsed}min decorridos`, tone: 'muted' }} tile="amber" icon={Users} bars={null} barsColor="amber" chart="none" />
        </div>
      </div>
      {/* Barra de progresso */}
      {c.total_recipients > 0 && (
        <div className="rounded-2xl bg-card border border-border/70 p-4 space-y-2">
          <div className="flex justify-between text-[12px] text-foreground-secondary">
            <span>Progresso geral</span>
            <span>{fmtInt(c.sent_count + c.failed_count)} / {fmtInt(c.total_recipients)} contatos</span>
          </div>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.min(100, ((c.sent_count + c.failed_count) / c.total_recipients) * 100)}%` }} />
          </div>
        </div>
      )}
      {/* Ritmo de Envio */}
      {chartData.length > 0 && (
        <RailCard title="Ritmo de Envio" color="blue" icon={Activity}>
          <div className="h-[160px] pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
                <defs>
                  <linearGradient id="rg-sent" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="10%" stopColor="hsl(var(--primary))" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border)/.4)" vertical={false} />
                <XAxis dataKey="time" tick={{ fontSize: 10, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--foreground-secondary))' }} tickLine={false} axisLine={false} />
                <ReTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="Enviadas" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#rg-sent)" dot={false} />
                <Area type="monotone" dataKey="Entregues" stroke="hsl(var(--dash-green))" strokeWidth={2} fill="none" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </RailCard>
      )}
    </div>
  );
}

// ─── Tab: Configurações ────────────────────────────────────────────────────────
function TabConfig({ c }: { c: TalkXCampaign }) {
  return (
    <RailCard title="Configurações da Campanha" color="amber" icon={Activity}>
      <div className="pt-1 space-y-0.5">
        <MetaRow label="Velocidade" value={SPEED_LABEL[c.speed_profile ?? ''] ?? c.speed_profile ?? '—'} />
        <MetaRow label="Intervalo entre msgs" value={`${c.send_interval_min}s – ${c.send_interval_max}s`} />
        <MetaRow label="Delay de digitação" value={`${c.typing_delay_min}s – ${c.typing_delay_max}s`} />
        <MetaRow label="Janela de envio" value={c.send_window_start ? `${c.send_window_start?.slice(0, 5)} – ${c.send_window_end?.slice(0, 5)}` : 'Sem restrição'} />
        <MetaRow label="Horário comercial" value={c.business_hours_only ? 'Sim' : 'Não'} />
        <MetaRow label="Iniciada em" value={fmtDateTime(c.started_at) ?? '—'} />
        <MetaRow label="Canal WhatsApp" value={c.whatsapp_connection_id ?? '—'} />
      </div>
    </RailCard>
  );
}


// ─── Tab: Destinatários ────────────────────────────────────────────────────────────────
type RecipRow = { status: string; sent_at: string | null; delivered_at: string | null; error_message: string | null; contacts: { name: string; phone: string } | null };
const STATUS_TONE: Record<string, string> = { sent: 'text-dash-green', failed: 'text-dash-red', pending: 'text-foreground-secondary' };
const STATUS_LABEL: Record<string, string> = { sent: 'Enviado', failed: 'Falha', pending: 'Pendente', delivered: 'Entregue' };

function TabRecipients({ campaignId }: { campaignId: string }) {
  const { data: recips, isLoading } = useQuery({
    queryKey: ['talkx-running-recipients', campaignId],
    queryFn: async () => {
      const { data } = await fromTable('talkx_recipients')
        .select('status, sent_at, delivered_at, error_message, contacts:contact_id(name, phone)')
        .eq('campaign_id', campaignId).order('updated_at', { ascending: false }).limit(200);
      return (data ?? []) as RecipRow[];
    },
    refetchInterval: 15_000,
    staleTime: 10_000,
  });

  return (
    <div className="rounded-2xl bg-card border border-border/70 overflow-hidden">
      <div className="px-4 py-3 border-b border-border/40 flex items-center justify-between">
        <p className="text-[13px] font-bold text-foreground">Destinatários</p>
        <p className="text-[12px] text-foreground-secondary">{isLoading ? 'Carregando…' : `Mostrando ${recips?.length ?? 0} recentes`}</p>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-9 bg-muted/40 rounded-lg animate-pulse" />)}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[540px] border-collapse">
            <thead><tr>
              {['Contato', 'Telefone', 'Status', 'Enviada em', 'Entregue em'].map((h) => (
                <th key={h} className="text-left text-[11px] font-semibold text-foreground-secondary px-4 py-2">{h}</th>
              ))}
            </tr></thead>
            <tbody>
              {(recips ?? []).map((r, i) => (
                <tr key={i} className="border-t border-border/40 hover:bg-muted/10">
                  <td className="px-4 py-2.5 text-[12.5px] font-medium text-foreground truncate max-w-[180px]">{r.contacts?.name ?? '—'}</td>
                  <td className="px-4 py-2.5 text-[12px] text-foreground-secondary font-mono">{r.contacts?.phone ?? '—'}</td>
                  <td className={`px-4 py-2.5 text-[12px] font-semibold ${STATUS_TONE[r.status] ?? 'text-foreground-secondary'}`}>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{r.sent_at ? new Date(r.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-muted-foreground">{r.delivered_at ? new Date(r.delivered_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(recips?.length ?? 0) >= 200 && <p className="text-[11px] text-muted-foreground text-center p-3">Mostrando 200 mais recentes. Use Exportar CSV no Monitor para o conjunto completo.</p>}
        </div>
      )}
    </div>
  );
}


// ─── Tab: Resultados ───────────────────────────────────────────────────────────────
function TabResults({ c, sentHistory }: { c: TalkXCampaign; sentHistory: { time: string; Enviadas: number; Entregues: number }[] }) {
  const deliveryRate = c.sent_count > 0 ? Math.round((c.delivered_count / c.sent_count) * 1000) / 10 : null;
  const failRate = c.sent_count > 0 ? Math.round((c.failed_count / c.sent_count) * 1000) / 10 : null;
  const elapsed = c.started_at ? Math.round((new Date().getTime() - new Date(c.started_at).getTime()) / 60000) : null;
  const pending = Math.max(0, c.total_recipients - c.sent_count - c.failed_count);
  // Velocidade real: avg msgs/min a partir do historico
  const avgRate = sentHistory.length >= 2
    ? Math.round(sentHistory.slice(-10).reduce((a, b) => a + b.Enviadas, 0) / Math.min(10, sentHistory.length))
    : null;

  const METRICS: { label: string; value: string; sub?: string }[] = [
    { label: 'Total de destinatários', value: fmtInt(c.total_recipients) },
    { label: 'Enviadas', value: fmtInt(c.sent_count), sub: c.total_recipients > 0 ? `${Math.round((c.sent_count / c.total_recipients) * 100)}% do total` : undefined },
    { label: 'Entregues', value: fmtInt(c.delivered_count), sub: deliveryRate !== null ? `${deliveryRate.toString().replace('.', ',')}% das enviadas` : undefined },
    { label: 'Falhas', value: fmtInt(c.failed_count), sub: failRate !== null ? `${failRate.toString().replace('.', ',')}% de erro` : undefined },
    { label: 'Pendentes', value: fmtInt(pending) },
    { label: 'Tempo decorrido', value: elapsed !== null ? `${elapsed} min` : '—' },
    { label: 'Ritmo médio (últ. 10 min)', value: avgRate !== null ? `${avgRate} msgs/min` : '—' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {METRICS.map(({ label, value, sub }) => (
          <div key={label} className="rounded-xl border border-border/60 bg-card p-3">
            <p className="text-[22px] font-bold text-foreground">{value}</p>
            <p className="text-[11px] font-semibold text-foreground-secondary mt-0.5">{label}</p>
            {sub && <p className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        ))}
      </div>
      {c.started_at && c.status === 'sending' && pending > 0 && avgRate && avgRate > 0 && (
        <div className="rounded-2xl bg-card border border-border/70 p-4">
          <p className="text-[13px] font-bold text-foreground mb-1">Tempo estimado para concluir</p>
          <p className="text-[22px] font-bold text-primary">{Math.ceil(pending / avgRate)} min</p>
          <p className="text-[11.5px] text-foreground-secondary">Baseado no ritmo atual ({avgRate} msgs/min)</p>
        </div>
      )}
    </div>
  );
}

// ─── Tab placeholder ───────────────────────────────────────────────────────────
function TabComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-muted/30 p-8 text-center">
      <p className="text-[14px] font-semibold text-foreground mb-1">{label}</p>
      <p className="text-[12px] text-foreground-secondary">Disponível em breve</p>
    </div>
  );
}

// ─── Main component ─────────────────────────────────────────────────────────────
interface Props {
  onBack: () => void;
  onViewMonitor: (id: string) => void;
  initialCampaignId?: string | null;
}

export function TalkXCampaignRunning({ onBack, onViewMonitor, initialCampaignId }: Props) {
  const { campaigns, updateCampaign, pauseCampaign, cancelCampaign, startCampaign, refetchCampaigns } = useTalkX();
  const sending = useMemo(() => campaigns.filter((c) => c.status === 'sending' || c.status === 'paused'), [campaigns]);

  const [selectedId, setSelectedId] = useState<string | null>(initialCampaignId ?? sending[0]?.id ?? null);
  const [activeTab, setActiveTab] = useState<RunTab>('overview');
  const [pauseOpen, setPauseOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [limitsOpen, setLimitsOpen] = useState(false);
  // E78: limites editaveis
  const [lSpeed, setLSpeed] = useState<string>('');
  const [lIntMin, setLIntMin] = useState<number>(0);
  const [lIntMax, setLIntMax] = useState<number>(0);
  const [lWinStart, setLWinStart] = useState<string>('');
  const [lWinEnd, setLWinEnd] = useState<string>('');
  const [lBizHours, setLBizHours] = useState<boolean>(false);
  const [lSaving, setLSaving] = useState(false);
  const [resuming, setResuming] = useState(false);

  const campaign = useMemo(() => campaigns.find((c) => c.id === selectedId) ?? null, [campaigns, selectedId]);

  // Histórico de envios para gráfico AreaChart (últimos 20 pontos por minuto)
  const { data: sentHistory } = useQuery({
    queryKey: ['talkx-running-history', selectedId],
    queryFn: async () => {
      if (!selectedId) return [];
      const { data } = await fromTable('talkx_recipients')
        .select('sent_at, delivered_at')
        .eq('campaign_id', selectedId)
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: true })
        .limit(2000);
      if (!data?.length) return [];
      // Agrupa por minuto
      const byMin: Record<string, { Enviadas: number; Entregues: number }> = {};
      (data as { sent_at: string; delivered_at: string | null }[]).forEach((r) => {
        const key = r.sent_at.slice(0, 16).replace('T', ' ').slice(5); // MM-DD HH:mm
        byMin[key] ??= { Enviadas: 0, Entregues: 0 };
        byMin[key].Enviadas += 1;
        if (r.delivered_at) byMin[key].Entregues += 1;
      });
      return Object.entries(byMin).map(([time, v]) => ({ time, ...v })).slice(-20);
    },
    enabled: !!selectedId,
    refetchInterval: 30_000,
    staleTime: 20_000,
  });

  const handleOpenLimits = useCallback(() => {
    if (!campaign) return;
    setLSpeed(campaign.speed_profile ?? 'moderate');
    setLIntMin(campaign.send_interval_min);
    setLIntMax(campaign.send_interval_max);
    setLWinStart(campaign.send_window_start?.slice(0, 5) ?? '');
    setLWinEnd(campaign.send_window_end?.slice(0, 5) ?? '');
    setLBizHours(campaign.business_hours_only ?? false);
    setLimitsOpen(true);
  }, [campaign]);

  const handleSaveLimits = useCallback(async () => {
    if (!campaign) return;
    if (!Number.isFinite(lIntMin) || lIntMin < 1 || !Number.isFinite(lIntMax) || lIntMax < 1) {
      toast.error('Intervalos devem ser números inteiros positivos (mínimo: 1s).');
      return;
    }
    setLSaving(true);
    try {
      await updateCampaign.mutateAsync({
        id: campaign.id,
        speed_profile: lSpeed as 'slow' | 'moderate' | 'fast',
        send_interval_min: lIntMin,
        send_interval_max: Math.max(lIntMin, lIntMax),
        send_window_start: lWinStart ? `${lWinStart}:00` : null,
        send_window_end: lWinEnd ? `${lWinEnd}:00` : null,
        business_hours_only: lBizHours,
      });
      setLimitsOpen(false);
      toast.success('Limites atualizados. Aplicados no próximo lote de envios.');
    } catch {
      toast.error('Erro ao salvar limites.');
    } finally {
      setLSaving(false);
    }
  }, [campaign, updateCampaign, lSpeed, lIntMin, lIntMax, lWinStart, lWinEnd, lBizHours]);

  const handlePause = useCallback(async () => {
    if (!campaign) return;
    setPauseOpen(false);
    try {
      await pauseCampaign(campaign.id);
      toast.info('Campanha pausada.');
    } catch {
      toast.error('Erro ao pausar a campanha.');
    }
  }, [campaign, pauseCampaign]);

  const handleCancel = useCallback(async () => {
    if (!campaign) return;
    setCancelOpen(false);
    try {
      await cancelCampaign(campaign.id);
      toast.warning('Campanha cancelada.');
      onBack();
    } catch {
      toast.error('Erro ao cancelar a campanha.');
    }
  }, [campaign, cancelCampaign, onBack]);

  return (
    <div className="min-h-full bg-background p-3 md:p-4 lg:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted/50 shrink-0">
            <ChevronLeft className="w-5 h-5 text-foreground-secondary" />
          </button>
          <IconTile icon={Activity} color="green" size={40} glow />
          <div className="min-w-0">
            <h1 className="text-[18px] font-bold text-foreground leading-tight truncate">Campanha em Andamento</h1>
            <p className="text-[12px] text-foreground-secondary">Acompanhe e gerencie envios ativos</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {/* Seletor de campanha */}
          <select
            value={selectedId ?? ''}
            onChange={(e) => { setSelectedId(e.target.value || null); setActiveTab('overview'); }}
            className="h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] font-medium max-w-[220px] truncate focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {sending.length === 0 && <option value="">Nenhuma campanha ativa</option>}
            {sending.map((c) => (
              <option key={c.id} value={c.id}>{c.name} [{c.status}]</option>
            ))}
          </select>
          <button type="button" onClick={() => { void refetchCampaigns(); }} title="Atualizar" className="h-9 w-9 flex items-center justify-center rounded-lg border border-border/70 bg-input/40 hover:bg-muted/50">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {!campaign && (
        <div className="rounded-2xl border border-border/50 bg-muted/20 p-10 text-center">
          <p className="text-[14px] text-foreground-secondary">Nenhuma campanha em andamento no momento.</p>
        </div>
      )}

      {campaign && (
        <>
          {/* Sub-tabs */}
          <div className="flex gap-1 overflow-x-auto no-scrollbar border-b border-border/40 pb-0">
            {RUN_TABS.map((t) => (
              <button
                key={t.id} type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3.5 py-2 text-[12.5px] font-medium whitespace-nowrap shrink-0 border-b-2 transition-colors
                  ${activeTab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-foreground-secondary hover:text-foreground'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Conteúdo das sub-tabs */}
          <div>
            {activeTab === 'overview' && (
              <TabOverview c={campaign} chartData={sentHistory ?? []} />
            )}
            {activeTab === 'config' && <TabConfig c={campaign} />}
            {activeTab === 'recipients' && <TabRecipients campaignId={campaign.id} />}
            {activeTab === 'messages' && <TabComingSoon label="Mensagens" />}
            {activeTab === 'results' && <TabResults c={campaign} sentHistory={sentHistory ?? []} />}
            {activeTab === 'logs' && <TabComingSoon label="Logs em Tempo Real" />}
          </div>

          {/* Card Ações */}
          <div className="rounded-2xl bg-card border border-border/70 p-4">
            <p className="text-[13px] font-bold text-foreground mb-3">Ações da Campanha</p>
            <div className="flex flex-wrap gap-2">
              {campaign.status === 'sending' && (
                <button type="button" onClick={() => setPauseOpen(true)}
                  className="h-9 px-4 rounded-lg border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[12.5px] font-semibold flex items-center gap-2 hover:bg-amber-500/20">
                  <Pause className="w-4 h-4" />Pausar
                </button>
              )}
              {campaign.status === 'paused' && (
                <button type="button" disabled={resuming} onClick={async () => {
                  setResuming(true);
                  try {
                    void startCampaign(campaign.id);
                    toast.success('Campanha retomada!');
                  } catch {
                    toast.error('Erro ao retomar campanha.');
                  } finally { setResuming(false); }
                }}
                  className="h-9 px-4 rounded-lg border border-primary/40 bg-primary/10 text-primary text-[12.5px] font-semibold flex items-center gap-2 hover:bg-primary/20 disabled:opacity-50">
                  <Zap className="w-4 h-4" />{resuming ? 'Retomando…' : 'Retomar'}
                </button>
              )}
              <button type="button" onClick={handleOpenLimits}
                className="h-9 px-4 rounded-lg border border-border/70 bg-input/40 text-[12.5px] font-semibold flex items-center gap-2 hover:bg-muted/50">
                <Settings2 className="w-4 h-4" />Editar Limites
              </button>
              <button type="button" onClick={() => onViewMonitor(campaign.id)}
                className="h-9 px-4 rounded-lg border border-border/70 bg-input/40 text-[12.5px] font-semibold flex items-center gap-2 hover:bg-muted/50">
                <Eye className="w-4 h-4" />Ver Monitor
              </button>
              <button type="button" onClick={() => setCancelOpen(true)}
                className="h-9 px-4 rounded-lg border border-red-500/30 bg-red-500/8 text-red-600 dark:text-red-400 text-[12.5px] font-semibold flex items-center gap-2 hover:bg-red-500/15 ml-auto">
                <Square className="w-4 h-4" />Cancelar campanha
              </button>
            </div>
          </div>
        </>
      )}

      {/* Modal: Editar Limites (E78) */}
      <AlertDialog open={limitsOpen} onOpenChange={setLimitsOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Editar Limites de Envio</AlertDialogTitle>
            <AlertDialogDescription>Aplicados no próximo lote de 20 envios.</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <label className="text-[12px] font-semibold text-foreground">Velocidade</label>
              <select value={lSpeed} onChange={(e) => setLSpeed(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary">
                <option value="slow">Lento (seguro)</option>
                <option value="moderate">Moderado</option>
                <option value="fast">Rápido</option>
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[12px] font-semibold text-foreground">Intervalo mínimo (s)</label>
                <input type="number" min={1} value={lIntMin} onChange={(e) => setLIntMin(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-semibold text-foreground">Intervalo máximo (s)</label>
                <input type="number" min={lIntMin} value={lIntMax} onChange={(e) => setLIntMax(Number(e.target.value))}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[12px] font-semibold text-foreground">Janela início</label>
                <input type="time" value={lWinStart} onChange={(e) => setLWinStart(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
              <div className="space-y-1">
                <label className="text-[12px] font-semibold text-foreground">Janela fim</label>
                <input type="time" value={lWinEnd} onChange={(e) => setLWinEnd(e.target.value)}
                  className="w-full h-9 px-3 rounded-lg border border-border/70 bg-input/40 text-[12.5px] focus:outline-none focus:ring-1 focus:ring-primary" />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={lBizHours} onChange={(e) => setLBizHours(e.target.checked)} className="rounded" />
              <span className="text-[12.5px] text-foreground">Apenas horário comercial (seg–sex 8h–18h)</span>
            </label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveLimits} disabled={lSaving}
              className="bg-primary text-primary-foreground hover:bg-primary/90">
              {lSaving ? 'Salvando…' : 'Salvar Limites'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Pausar */}
      <AlertDialog open={pauseOpen} onOpenChange={setPauseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pausar Campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              O envio será interrompido até você retomar. Mensagens em voo continuarão sendo entregues.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handlePause} className="bg-amber-500 text-white hover:bg-amber-600">Pausar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Modal: Cancelar */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar Campanha?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. Os destinatários restantes não receberão a mensagem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel} className="bg-destructive text-white hover:bg-destructive/90">Confirmar cancelamento</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
