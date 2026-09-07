import { useState } from 'react';
import { Target, CheckCircle2, XCircle, TrendingUp, Users, SlidersHorizontal, ChevronsUpDown, Pencil, Trash2, Plus } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Switch } from '@/components/ui/switch';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useSLAMetrics, type PeriodFilter } from '@/hooks/sla/useSLAMetrics';
import { useSLAConfigurations, PRIORITY_CONFIG } from '@/hooks/sla/useSLAConfigurations';
import { DashboardCard, SectionHeader, CardSelect } from './overview/DashboardCard';
import { DashboardKpiCard } from './overview/DashboardKpiCard';

function rateColor(r: number) { return r >= 80 ? 'text-success' : r >= 50 ? 'text-warning' : 'text-destructive'; }
function rateBg(r: number) { return r >= 80 ? 'bg-success' : r >= 50 ? 'bg-warning' : 'bg-destructive'; }
function rateLabel(r: number) { return r >= 80 ? 'Bom' : r >= 50 ? 'Atenção' : 'Crítico'; }
function rateBadge(r: number) { return r >= 80 ? 'bg-success/15 text-success border-success/30' : r >= 50 ? 'bg-warning/15 text-warning border-warning/30' : 'bg-destructive/15 text-destructive border-destructive/30'; }

const PERIODS = [
  { value: 'today', label: 'Hoje' }, { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' }, { value: 'all', label: 'Todo Período' },
] as const;

export function SLAMetricsDashboard() {
  const [period, setPeriod] = useState<PeriodFilter>('week');
  const [sortDesc, setSortDesc] = useState(true);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 8;

  const { data, loading } = useSLAMetrics(period);
  const { configs, toggleMutation, deleteMutation, openCreate, openEdit } = useSLAConfigurations();

  const overallRate = Math.round(data?.overall.overallRate ?? 100);
  const onTime = data?.overall.firstResponse.onTime ?? 0;
  const breached = data?.overall.firstResponse.breached ?? 0;
  const total = data?.overall.totalConversations ?? 0;
  const agentRows = [...(data?.byAgent ?? [])].sort((a, b) => sortDesc ? b.overallRate - a.overallRate : a.overallRate - b.overallRate);
  const pageRows = agentRows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(agentRows.length / PAGE_SIZE);

  return (
    <TooltipProvider>
      <div className="space-y-2.5">
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-2.5">
          {[
            { icon: Target, label: 'Taxa Geral SLA', value: loading ? '—' : `${overallRate}%`, tile: 'blue' as const, barsColor: 'blue' as const },
            { icon: CheckCircle2, label: 'No Prazo', value: loading ? '—' : String(onTime), tile: 'green' as const, barsColor: 'green' as const },
            { icon: XCircle, label: 'Violações', value: loading ? '—' : String(breached), tile: 'red' as const, barsColor: 'red' as const },
            { icon: TrendingUp, label: 'Total Conversas', value: loading ? '—' : String(total), tile: 'blue' as const, barsColor: 'blue' as const },
          ].map((k, i) => (
            <DashboardKpiCard key={k.label} index={i} label={k.label} value={k.value}
              delta={null} tile={k.tile} icon={k.icon} bars={null} barsColor={k.barsColor} />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-[2fr_1fr] gap-2.5">
          <DashboardCard testid="sla-agents-card">
            <SectionHeader icon={Users} title="SLA por Agente" subtitle="Desempenho individual no período selecionado" tileSize={44}
              right={
                <div className="flex items-center gap-2">
                  <CardSelect value={period} onValueChange={(v) => { setPeriod(v as PeriodFilter); setPage(0); }} options={PERIODS.map(o => ({ value: o.value, label: o.label }))} />
                  <button className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-muted/60" onClick={() => setSortDesc(p => !p)} title="Inverter ordem">
                    <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              }
            />
            {agentRows.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-muted-foreground gap-2">
                <Users className="w-10 h-10 opacity-30" />
                <p className="text-sm">Nenhum agente no período</p>
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] font-semibold text-muted-foreground border-b border-border/60">
                      <th className="text-left pb-2 pl-1">Agente</th>
                      <th className="text-right pb-2 px-2">SLA</th>
                      <th className="text-right pb-2 px-2">No Prazo</th>
                      <th className="text-right pb-2 px-2">Violações</th>
                      <th className="text-left pb-2 px-2 w-[130px]">Progresso</th>
                      <th className="text-left pb-2 pr-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageRows.map(a => (
                      <tr key={a.agentId} className="h-12 border-b border-border/40 hover:bg-muted/20">
                        <td className="pl-1">
                          <div className="flex items-center gap-2">
                            <Avatar className="w-[26px] h-[26px] shrink-0">
                              <AvatarImage src={a.avatarUrl} />
                              <AvatarFallback className="bg-primary/10 text-primary text-[9px] font-semibold">{a.agentName.slice(0, 2).toUpperCase()}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium truncate max-w-[130px]">{a.agentName}</span>
                          </div>
                        </td>
                        <td className={cn('text-right px-2 font-semibold', rateColor(a.overallRate))}>{Math.round(a.overallRate)}%</td>
                        <td className="text-right px-2 text-success font-medium">{a.firstResponse.onTime}</td>
                        <td className="text-right px-2 text-destructive font-medium">{a.firstResponse.breached}</td>
                        <td className="px-2">
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full', rateBg(a.overallRate))} style={{ width: `${a.overallRate}%` }} />
                          </div>
                        </td>
                        <td className="pr-1">
                          <span className={cn('text-[11px] font-semibold px-2 py-0.5 rounded-full border', rateBadge(a.overallRate))}>{rateLabel(a.overallRate)}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {agentRows.length > PAGE_SIZE && (
                  <div className="flex items-center justify-between mt-2 text-[12px] text-muted-foreground">
                    <span>Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, agentRows.length)} de {agentRows.length} agentes</span>
                    <div className="flex gap-1">
                      {[['‹', page === 0, () => setPage(p => p - 1)], ['›', page >= totalPages - 1, () => setPage(p => p + 1)]].map(([ch, dis, fn]) => (
                        <button key={String(ch)} disabled={dis as boolean} onClick={fn as () => void}
                          className="w-7 h-7 rounded-md border border-border/70 hover:bg-muted/60 disabled:opacity-40 flex items-center justify-center">{ch as string}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DashboardCard>
          <div className="space-y-2.5">
            <DashboardCard testid="sla-summary-card">
              <SectionHeader icon={Target} title="Resumo Geral" tileSize={34}
                right={<CardSelect value={period} onValueChange={(v) => setPeriod(v as PeriodFilter)} options={PERIODS.map(o => ({ value: o.value, label: o.label }))} />}
              />
              <div className="mt-3 space-y-3">
                <div>
                  <div className="flex items-center justify-between mb-1 text-[13px]">
                    <span className="text-muted-foreground">Taxa de 1ª Resposta no Prazo</span>
                    <span className={cn('font-bold text-[20px]', rateColor(overallRate))}>{overallRate}%</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div className={cn('h-full rounded-full transition-all duration-700', rateBg(overallRate))} style={{ width: `${overallRate}%` }} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {[{ label: 'No Prazo', v: onTime, cls: 'text-success' }, { label: 'Violações', v: breached, cls: 'text-destructive' }].map(x => (
                    <div key={x.label} className="rounded-lg bg-muted/30 border border-border/50 p-2.5 text-center">
                      <div className={cn('text-[18px] font-bold', x.cls)}>{x.v}</div>
                      <div className="text-[11px] text-muted-foreground mt-0.5">{x.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </DashboardCard>
            <DashboardCard testid="sla-config-card">
              <SectionHeader icon={SlidersHorizontal} title="Configurações de SLA" subtitle="Metas de tempo de primeira resposta" tileSize={34}
                right={
                  <button onClick={openCreate} className="h-7 px-2.5 rounded-md bg-primary text-white text-[12px] font-semibold flex items-center gap-1 hover:bg-primary/90">
                    <Plus className="w-3 h-3" />Novo SLA
                  </button>
                }
              />
              <div className="mt-3 space-y-1">
                {configs.length === 0 ? (
                  <div className="text-center py-6 text-muted-foreground text-[13px]">
                    <SlidersHorizontal className="w-8 h-8 mx-auto mb-2 opacity-30" />Nenhuma configuração
                  </div>
                ) : configs.map(cfg => {
                  const pc = PRIORITY_CONFIG[cfg.priority];
                  return (
                    <div key={cfg.id} className="flex items-center gap-2 py-1.5 border-b border-border/40 last:border-0">
                      <span className={cn('text-[11px] font-medium px-2 py-0.5 rounded-full border w-[62px] text-center shrink-0', pc?.color ?? 'bg-muted/30 text-muted-foreground')}>{pc?.label ?? cfg.priority}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate">{cfg.name}</div>
                        <div className="text-[11px] text-muted-foreground">{cfg.first_response_minutes} min</div>
                      </div>
                      <Switch checked={cfg.is_active} onCheckedChange={(v) => toggleMutation.mutate({ id: cfg.id, is_active: v })} />
                      <button onClick={() => openEdit(cfg)} className="w-7 h-7 rounded-md hover:bg-muted/60 flex items-center justify-center shrink-0"><Pencil className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      <button onClick={() => deleteMutation.mutate(cfg.id)} className="w-7 h-7 rounded-md hover:bg-destructive/10 flex items-center justify-center shrink-0"><Trash2 className="w-3.5 h-3.5 text-destructive" /></button>
                    </div>
                  );
                })}
              </div>
            </DashboardCard>
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
