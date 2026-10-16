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
//
// Sinal INFORMATIVO (não entra na nota): "Conexões sem credencial" tem escala própria de
// 100 pts. A sonda de saúde grava health_status "no_credentials" sem tocar no status da
// conexão (fail-closed), então o sinal de conexões acima a enxerga como conectada — sem
// esta linha, uma conexão que não autentica passaria despercebida no cartão.

import type { SystemHealthSignals } from '@/hooks/system/useSystemHealthSignals';

export type SystemHealthGrade = 'excelente' | 'bom' | 'atencao' | 'critico';
export type SystemHealthTone = 'success' | 'info' | 'warning' | 'danger';
export type SystemHealthItemStatus = 'ok' | 'warn' | 'bad';
export type SystemHealthItemId = 'connections' | 'failures' | 'stalled' | 'credentials';

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
/**
 * Escala do sinal informativo "Conexões sem credencial" (0-100). NÃO entra na nota:
 * os 100 pontos da nota continuam vindo de connections (40) + failures (30) + stalled (30).
 */
export const CREDENTIALS_MAX = 100;
/** A partir desta fração de conexões sem credencial o sinal informativo marca Falha. */
export const CREDENTIALS_BAD_RATIO = 0.5;
/** health_status que a sonda de saúde grava quando a instância não autentica (401/403). */
const NO_CREDENTIALS_STATUS = 'no_credentials';

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

/**
 * Sinal informativo: quantas conexões a sonda viu sem credencial própria. Escala 0-100
 * própria — NÃO soma na nota (é diagnóstico, não penalidade: a conexão sem credencial já
 * pesa no sinal de conexões quando está fora do ar).
 */
function credentialSignal(connections: SystemHealthSignals['connections']): SignalScore {
  const total = connections.length;
  if (total === 0) {
    // Sem conexão cadastrada não há credencial a julgar: nem afirma falha nem inventa nota.
    return { score: CREDENTIALS_MAX, status: 'ok', summary: 'Nenhuma conexão para avaliar credencial' };
  }
  const missing = connections.filter((conn) => conn.healthStatus === NO_CREDENTIALS_STATUS).length;
  const score = Math.round(CREDENTIALS_MAX * (1 - missing / total));
  const status: SystemHealthItemStatus =
    missing === 0 ? 'ok' : missing / total >= CREDENTIALS_BAD_RATIO ? 'bad' : 'warn';
  const summary =
    missing === 0 ? 'Todas as conexões com credencial válida' : `${missing} de ${total} conexão(ões) sem credencial`;
  return { score, status, summary };
}

/** Nota 0-100 e o detalhe por sinal — sempre a partir dos sinais reais, nunca de um teto inventado. */
export function deriveSystemHealth(signals: SystemHealthSignals): SystemHealthResult {
  const connections = connectionSignal(signals.connections);
  const failures = failureSignal(signals.failedRecent, signals.totalRecent);
  const stalled = stalledSignal(signals.stalledSending);
  const credentials = credentialSignal(signals.connections);
  // A nota é a soma dos três sinais clássicos: 40 + 30 + 30 = 100. O sinal de credencial é
  // informativo (escala própria de 100) e NÃO entra aqui — os 100 pontos não saem de 100.
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
      { id: 'credentials', label: 'Conexões sem credencial', ...credentials, max: CREDENTIALS_MAX },
    ],
  };
}
