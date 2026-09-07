import { useMemo, useState } from 'react';
import { Users, Download, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { DashboardCard, SectionHeader, CardSelect } from '../overview/DashboardCard';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useExportData } from '@/hooks/system/useExportData';
import { getSLARateTone, getSLARateLabel, SLA_RATE_TEXT_CLASS, SLA_RATE_BG_CLASS, SLA_RATE_BADGE_CLASS } from './slaRate';

interface AgentSLARow {
  agentId: string;
  agentName: string;
  avatarUrl?: string;
  overallRate: number;
  firstResponse: { onTime: number; breached: number };
}

interface SLAAgentTableProps {
  agents: AgentSLARow[];
}

const PAGE_SIZE = 8;
const SORT_OPTIONS = [
  { value: 'sla-desc', label: 'Ordenar por SLA (maior)' },
  { value: 'sla-asc', label: 'Ordenar por SLA (menor)' },
  { value: 'name', label: 'Ordenar por nome' },
];

export function SLAAgentTable({ agents }: SLAAgentTableProps) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('sla-desc');
  const [page, setPage] = useState(0);

  const { exportCSV } = useExportData<Record<string, unknown>>({
    fileName: 'sla-por-agente',
    columns: [
      { key: 'agentName', header: 'Agente' },
      { key: 'overallRate', header: 'SLA (%)', format: (v) => `${Math.round(Number(v))}` },
      { key: 'onTime', header: 'No Prazo' },
      { key: 'breached', header: 'Violações' },
    ],
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const rows = term ? agents.filter((a) => a.agentName.toLowerCase().includes(term)) : agents;
    const sorted = [...rows];
    if (sort === 'sla-desc') sorted.sort((a, b) => b.overallRate - a.overallRate);
    else if (sort === 'sla-asc') sorted.sort((a, b) => a.overallRate - b.overallRate);
    else sorted.sort((a, b) => a.agentName.localeCompare(b.agentName));
    return sorted;
  }, [agents, search, sort]);

  const totalPages = Math.max(Math.ceil(filtered.length / PAGE_SIZE), 1);
  const currentPage = Math.min(page, totalPages - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const handleExport = () => {
    exportCSV(filtered.map((a) => ({
      agentName: a.agentName, overallRate: a.overallRate,
      onTime: a.firstResponse.onTime, breached: a.firstResponse.breached,
    })));
  };

  return (
    <DashboardCard testid="sla-agent-table-card">
      <SectionHeader
        icon={Users}
        title="SLA por Agente"
        subtitle="Desempenho individual de SLA no período selecionado"
        tileSize={44}
        right={(
          <div className="flex items-center gap-1.5 shrink-0">
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Buscar agente…"
              className="w-[220px] h-8 px-2.5 rounded-lg bg-input/60 border border-border/60 text-[12px] placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <CardSelect value={sort} onValueChange={(v) => { setSort(v); setPage(0); }} options={SORT_OPTIONS} testid="sla-sort-select" />
            <button
              type="button"
              onClick={handleExport}
              className="w-8 h-8 rounded-lg bg-muted/40 border border-border/60 hover:bg-muted/60 flex items-center justify-center shrink-0"
              aria-label="Exportar"
            >
              <Download className="w-4 h-4 text-foreground-secondary" />
            </button>
          </div>
        )}
      />

      {agents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-1 py-10 text-center">
          <Users className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-[13px] font-medium text-foreground">Sem agentes</p>
          <p className="text-[12px] text-muted-foreground">Nenhum agente encontrado no período selecionado</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="table-auto w-full text-[13px]">
              <thead>
                <tr className="text-left">
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground flex items-center gap-1 pt-0">Agente <ChevronsUpDown className="w-3 h-3" /></th>
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground">SLA</th>
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground">No Prazo</th>
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Violações</th>
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Progresso</th>
                  <th className="pb-2 text-[12px] font-semibold text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((agent) => {
                  const tone = getSLARateTone(agent.overallRate);
                  return (
                    <tr key={agent.agentId} className="h-12 border-t border-border/60">
                      <td className="pr-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-[26px] h-[26px]"><AvatarImage src={agent.avatarUrl} /><AvatarFallback className="text-[10px]">{agent.agentName.slice(0, 2).toUpperCase()}</AvatarFallback></Avatar>
                          <span className="font-medium text-foreground truncate">{agent.agentName}</span>
                        </div>
                      </td>
                      <td className={`pr-2 font-semibold tabular-nums ${SLA_RATE_TEXT_CLASS[tone]}`}>{Math.round(agent.overallRate)}%</td>
                      <td className="pr-2 text-foreground-secondary tabular-nums">{agent.firstResponse.onTime}</td>
                      <td className="pr-2 text-foreground-secondary tabular-nums">{agent.firstResponse.breached}</td>
                      <td className="pr-2">
                        <div className="w-[175px] h-1.5 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full rounded-full ${SLA_RATE_BG_CLASS[tone]}`} style={{ width: `${Math.min(agent.overallRate, 100)}%` }} />
                        </div>
                      </td>
                      <td>
                        <span className={`h-[22px] px-2 rounded-md text-[11px] font-semibold border inline-flex items-center ${SLA_RATE_BADGE_CLASS[tone]}`}>
                          {getSLARateLabel(agent.overallRate)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between mt-2.5 pt-2.5 border-t border-border/60">
            <p className="text-[12px] text-muted-foreground">
              Mostrando {filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1}–{Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length} agentes
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={currentPage === 0}
                onClick={() => setPage((p) => Math.max(p - 1, 0))}
                className="w-7 h-7 rounded-md border border-border/60 flex items-center justify-center disabled:opacity-30 hover:bg-muted/50"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setPage(i)}
                  className={`w-7 h-7 rounded-md text-[12px] font-medium flex items-center justify-center ${i === currentPage ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50 text-foreground-secondary'}`}
                >
                  {i + 1}
                </button>
              ))}
              <button
                type="button"
                disabled={currentPage >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(p + 1, totalPages - 1))}
                className="w-7 h-7 rounded-md border border-border/60 flex items-center justify-center disabled:opacity-30 hover:bg-muted/50"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </DashboardCard>
  );
}
