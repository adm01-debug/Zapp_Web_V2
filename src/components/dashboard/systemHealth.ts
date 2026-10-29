// systemHealth.ts — regra pura da nota "Saúde do Sistema" (0-100) do painel principal.
//
// A V3 lia zapp.fn_system_health_score() (RPC de banco). Na V2 essa RPC não existe: a nota
// é calculada AQUI, no cliente, com os sinais que a V2 já coleta
// (useSystemHealthSignals) — conexões WhatsApp, falhas recentes de envio e fila parada.
// Componente não pode exportar isto (lint react-refresh/only-export-components), por isso
// a regra vive fora do .tsx.
//
// Pontuação (total 100):
//   • Conexões WhatsApp — 40 pts: proporção das conexões saudáveis (conectada e sem
//     health_status "degraded"); uma conexão degradada vale metade. Sem conexão = 0.
//   • Mensagens com falha — 30 pts: 0 falha = 30; a nota cai linearmente até zerar em
//     10% de falha sobre os envios do agente nas últimas 24h.
//   • Fila de envio parada — 30 pts: -10 pts por mensagem presa em "sending" há mais de
//     5 min (3 ou mais presas = 0).

import type { SystemHealthSignals } from '@/hooks/system/useSystemHealthSignals';

export type SystemHealthGrade = 'excelente' | 'bom' | 'atencao' | 'critico';
export type SystemHealthTone = 'success' | 'info' | 'warning' | 'danger';
export type SystemHealthItemStatus = 'ok' | 'warn' | 'bad';
export type SystemHealthItemId = 'connections' | 'failures' | 'stalled';

export interface SystemHealthItem {
  id: SystemHealthItemId;
  label: string;
  status: SystemHealthItemStatus;
  /** O que o gestor lê na linha do detalhe. */
  summary: string;
  /** Pontos obtidos e o máximo do sinal. */
  score: number;
  max: number;
}

export interface SystemHealthResult {
  score: number;
  grade: SystemHealthGrade;
  gradeLabel: string;
  tone: SystemHealthTone;
  items: SystemHealthItem[];
}

export const CONNECTIONS_MAX = 40;
export const FAILURES_MAX = 30;
export const STALLED_MAX = 30;
/** A partir desta taxa de falha (24h) o sinal de mensagens zera. */
export const FAILURE_ZERO_RATE = 0.1;
/** Pontos perdidos por mensagem presa em "sending" há mais de 5 min. */
export const STALLED_STEP = 10;

const GRADES: Array<{ min: number; grade: SystemHealthGrade; label: string; tone: SystemHealthTone }> = [
  { min: 90, grade: 'excelente', label: 'Excelente', tone: 'success' },
  { min: 70, grade: 'bom', label: 'Bom', tone: 'info' },
  { min: 50, grade: 'atencao', label: 'Atenção', tone: 'warning' },
  { min: 0, grade: 'critico', label: 'Crítico', tone: 'danger' },
];

interface SignalScore {
  score: number;
  status: SystemHealthItemStatus;
  summary: string;
}

function connectionSignal(connections: SystemHealthSignals['connections']): SignalScore {
  const total = connections.length;
  if (total === 0) {
    return { score: 0, status: 'bad', summary: 'Nenhuma conexão de WhatsApp cadastrada' };
  }
  let healthy = 0;
  let degraded = 0;
  for (const conn of connections) {
    if (conn.status !== 'connected') continue;
    if (conn.healthStatus === 'degraded') degraded += 1;
    else healthy += 1;
  }
  const offline = total - healthy - degraded;
  const score = Math.round((CONNECTIONS_MAX * (healthy + degraded * 0.5)) / total);
  const status: SystemHealthItemStatus = score >= CONNECTIONS_MAX ? 'ok' : score > 0 ? 'warn' : 'bad';
  const parts = [`${healthy} de ${total} conectada(s)`];
  if (degraded > 0) parts.push(`${degraded} degradada(s)`);
  if (offline > 0) parts.push(`${offline} fora do ar`);
  return { score, status, summary: parts.join(' · ') };
}

function failureSignal(failedRecent: number, totalRecent: number): SignalScore {
  if (totalRecent === 0) {
    return { score: FAILURES_MAX, status: 'ok', summary: 'Nenhum envio nas últimas 24h' };
  }
  const rate = failedRecent / totalRecent;
  const score = Math.round(FAILURES_MAX * (1 - Math.min(1, rate / FAILURE_ZERO_RATE)));
  const status: SystemHealthItemStatus = failedRecent === 0 ? 'ok' : rate >= FAILURE_ZERO_RATE ? 'bad' : 'warn';
  const summary =
    failedRecent === 0
      ? `Nenhuma falha em ${totalRecent} envio(s) nas últimas 24h`
      : `${failedRecent} falha(s) em ${totalRecent} envio(s) nas últimas 24h (${Math.round(rate * 100)}%)`;
  return { score, status, summary };
}

function stalledSignal(stalledSending: number): SignalScore {
  const score = Math.max(0, STALLED_MAX - stalledSending * STALLED_STEP);
  const status: SystemHealthItemStatus = stalledSending === 0 ? 'ok' : stalledSending >= 3 ? 'bad' : 'warn';
  const summary =
    stalledSending === 0
      ? 'Nenhuma mensagem presa no envio'
      : `${stalledSending} mensagem(ns) presa(s) há mais de 5 min`;
  return { score, status, summary };
}

/** Nota 0-100 e o detalhe por sinal — sempre a partir dos sinais reais, nunca de um teto inventado. */
export function deriveSystemHealth(signals: SystemHealthSignals): SystemHealthResult {
  const connections = connectionSignal(signals.connections);
  const failures = failureSignal(signals.failedRecent, signals.totalRecent);
  const stalled = stalledSignal(signals.stalledSending);
  const score = connections.score + failures.score + stalled.score;
  const grade = GRADES.find((g) => score >= g.min) ?? GRADES[GRADES.length - 1];

  return {
    score,
    grade: grade.grade,
    gradeLabel: grade.label,
    tone: grade.tone,
    items: [
      { id: 'connections', label: 'Conexões WhatsApp', ...connections, max: CONNECTIONS_MAX },
      { id: 'failures', label: 'Mensagens com falha (24h)', ...failures, max: FAILURES_MAX },
      { id: 'stalled', label: 'Fila de envio', ...stalled, max: STALLED_MAX },
    ],
  };
}
