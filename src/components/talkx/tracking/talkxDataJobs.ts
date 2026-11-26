// talkxDataJobs.ts — regra pura do painel "Jobs de dados" (Configurações do Talk X).
//
// `talkx_data_jobs` é o registro dos jobs de DADOS do módulo (hoje só o
// `recompute_purchase_metrics`, que recalcula os atributos RFM de
// `talkx_contact_attributes`). A tabela não tem escrita para o usuário: quem grava é o
// agendador, com `service_role`. Por isso o painel só LÊ — e é essa leitura que faltava:
// sem ela, um job que nunca rodou (ou que parou) não aparecia em lugar nenhum da tela, e
// a segmentação por RFM seguia vazia sem ninguém saber por quê.
//
// A regra vive fora do .tsx porque o lint (react-refresh/only-export-components) só
// admite componente exportado em arquivo de componente.

import { fmtAgo, fmtDurationShort, type PillTone } from '../talkxShared';

/** Estados possíveis de um job de dados, do ponto de vista de quem opera. */
export type TalkXDataJobState = 'desativado' | 'em_execucao' | 'nunca_executou' | 'atrasado' | 'em_dia';

export interface TalkXDataJobInput {
  /** Nome do job (`talkx_data_jobs.job`). */
  job: string;
  /** De quanto em quanto tempo ele deve rodar (`talkx_data_jobs.interval_minutes`). */
  interval_minutes: number;
  enabled: boolean;
  last_started_at: string | null;
  last_finished_at: string | null;
}

export interface TalkXDataJobView {
  job: string;
  state: TalkXDataJobState;
  /** Frase do estado, para quem opera (não é o rótulo do selo). */
  label: string;
  pillLabel: string;
  tone: PillTone;
  /** "1x por dia", "a cada 1 h", … */
  intervalLabel: string;
  /** "há 3 dias" ou "nunca executou". */
  lastRunLabel: string;
}

/**
 * Folga aceita antes de chamar o job de atrasado: dois ciclos completos. Um job diário
 * só é atrasado depois de 48 h sem terminar; um de hora em hora, depois de 2 h. Um ciclo
 * só seria alarme falso — o agendador não roda no segundo exato.
 */
export const DATA_JOB_GRACE_CYCLES = 2;

/** Intervalo em texto: o banco guarda minutos (1440 = 1x por dia). */
export function fmtDataJobInterval(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes % 1440 === 0) {
    const ciclos = minutes / 1440;
    return ciclos === 1 ? '1x por dia' : `${ciclos}x por dia`;
  }
  if (minutes % 60 === 0) return `a cada ${minutes / 60} h`;
  return `a cada ${minutes} min`;
}

/**
 * Traduz a linha do banco em estado + texto. `nowMs` entra como parâmetro para o teste
 * poder fixar o relógio sem mexer em timers.
 */
export function deriveDataJobView(
  input: TalkXDataJobInput,
  nowMs: number = Date.now(),
): TalkXDataJobView {
  const intervalLabel = fmtDataJobInterval(input.interval_minutes);
  const inicio = input.last_started_at ? new Date(input.last_started_at).getTime() : null;
  const fim = input.last_finished_at ? new Date(input.last_finished_at).getTime() : null;
  // Começou e não terminou (ou terminou antes do início que está gravado) = ainda rodando.
  const rodando = inicio !== null && (fim === null || inicio > fim);
  const semExecucao = 'nunca executou';

  const view = (
    state: TalkXDataJobState,
    label: string,
    pillLabel: string,
    tone: PillTone,
    lastRunLabel: string,
  ): TalkXDataJobView => ({
    job: input.job,
    state,
    label,
    pillLabel,
    tone,
    intervalLabel,
    lastRunLabel,
  });

  if (!input.enabled) {
    return view(
      'desativado',
      'Desativado — não roda até ser reativado',
      'Desativado',
      'muted',
      fim === null ? semExecucao : fmtAgo(input.last_finished_at),
    );
  }

  if (rodando) {
    return view(
      'em_execucao',
      'Em execução agora',
      'Rodando',
      'info',
      fmtAgo(input.last_started_at),
    );
  }

  if (fim === null) {
    return view(
      'nunca_executou',
      'Nunca executou — o dado que ele alimenta está vazio',
      'Nunca rodou',
      'warning',
      semExecucao,
    );
  }

  const cicloMs = Math.max(input.interval_minutes, 1) * 60_000;
  const atrasoMs = nowMs - fim - cicloMs * DATA_JOB_GRACE_CYCLES;
  if (atrasoMs > 0) {
    return view(
      'atrasado',
      `Atrasado ${fmtDurationShort(atrasoMs / 1000)} além do previsto`,
      'Atrasado',
      'danger',
      fmtAgo(input.last_finished_at),
    );
  }

  return view('em_dia', 'Dentro do ciclo esperado', 'Em dia', 'success', fmtAgo(input.last_finished_at));
}
