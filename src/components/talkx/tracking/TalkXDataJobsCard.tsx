// TalkXDataJobsCard.tsx — painel "Jobs de dados" das Configurações do Talk X.
//
// `talkx_data_jobs` registra os jobs de DADOS do módulo (recarga dos atributos RFM que a
// segmentação usa em `talkx_contact_attributes`). A tabela só tem leitura para o usuário:
// quem escreve é o agendador, com `service_role`. Logo, o painel é somente leitura — e é
// exatamente a leitura que faltava, porque um job parado (ou que nunca rodou) deixava a
// segmentação vazia sem nenhuma pista na tela.
//
// A regra dos estados está em ./talkxDataJobs.ts (o lint só admite componente exportado
// em arquivo .tsx).

import { Database } from 'lucide-react';
import { Pill } from '@/components/dashboard/overview/DashboardCard';
import { KpiCardSkeleton, RailCard } from '../talkxShared';
import { TalkXQueryBoundary } from '../kit/states';
import { useTalkXDataJobs } from '@/hooks/integrations/useTalkXDataJobs';
import { deriveDataJobView, type TalkXDataJobInput } from './talkxDataJobs';

export interface TalkXDataJobsListProps {
  jobs: TalkXDataJobInput[];
  /** Relógio fixo para teste; em produção, `Date.now()`. */
  nowMs?: number;
}

/** Lista dos jobs com estado, intervalo e idade da última execução. */
export function TalkXDataJobsList({ jobs, nowMs }: TalkXDataJobsListProps) {
  return (
    <ul className="divide-y rounded-lg border" aria-label="Jobs de dados do Talk X">
      {jobs.map((job) => {
        const view = deriveDataJobView(job, nowMs);
        return (
          <li key={job.job} className="flex items-start gap-3 px-3 py-2.5">
            <div className="flex-1 min-w-0">
              <code className="text-xs font-mono text-foreground">{job.job}</code>
              <p className="text-2xs text-muted-foreground mt-0.5">{view.label}</p>
              <p className="text-2xs text-muted-foreground">
                Intervalo: {view.intervalLabel} · Última execução: {view.lastRunLabel}
              </p>
            </div>
            <Pill label={view.pillLabel} tone={view.tone} dot />
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Jobs de dados": mostra se a recarga de atributos está em dia, atrasada, desligada ou
 * se nunca rodou. Não oferece botão de rodar porque a escrita não é do usuário (RLS).
 */
export function TalkXDataJobsCard() {
  const { data, isLoading, error, refetch } = useTalkXDataJobs();
  const jobs = data ?? [];

  return (
    <RailCard
      icon={Database}
      color="violet"
      title="Jobs de dados"
      subtitle="Recarga dos atributos de compra (RFM) usados na segmentação"
    >
      <TalkXQueryBoundary
        query={{ isLoading, isError: !!error, error: (error as Error) ?? null }}
        entity="os jobs de dados"
        onRetry={() => refetch()}
        skeleton={<div className="space-y-2"><KpiCardSkeleton /><KpiCardSkeleton /></div>}
        isEmpty={jobs.length === 0}
        empty={<p className="text-xs text-muted-foreground">Nenhum job de dados agendado.</p>}
      >
        <TalkXDataJobsList jobs={jobs} />
      </TalkXQueryBoundary>
    </RailCard>
  );
}
