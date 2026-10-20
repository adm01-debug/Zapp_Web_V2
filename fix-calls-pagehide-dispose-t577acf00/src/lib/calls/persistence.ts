/**
 * Persistência idempotente da chamada — etapa T11 do plano de finalização.
 *
 * Módulo **puro** (sem React, sem toast, sem logger): fala só com o banco pela
 * RPC `upsert_my_call` (Apêndice B.3, `supabase/migrations/20260926800000`).
 * Quem decide a UI do erro é o consumidor — aqui só se devolve `ok/error`.
 *
 * Regras que este arquivo trava:
 * - **um id por chamada**: as 3 gravações (tocando/atendida/fim) usam o mesmo
 *   `p_id`; o `ON CONFLICT (id) DO UPDATE` transforma retry em atualização, sem
 *   duplicar linha. Por isso o retry repete o MESMO payload;
 * - **`p_status` sempre explícito**: o INSERT do banco faz
 *   `coalesce(p_status,'ringing')`, então omitir status no fim sobrescreveria o
 *   desfecho com `ringing`;
 * - **`undefined` é omitido**: o `supabase-js` serializa o objeto em JSON e
 *   `JSON.stringify` descarta chaves `undefined` — elas ficam fora do `UPDATE`,
 *   e o `coalesce` do banco preserva o valor já gravado.
 */

import { supabase, SUPABASE_ANON_KEY, SUPABASE_URL } from '@/integrations/supabase/client';

import { sipCodeToEndReason } from './callStatus';
import { persistedStatusForEndReason } from './session';
import type { CallDirection, CallEndOutcome, EndReason, PersistedStatus } from './callStatus';

// Reexportado daqui para quem consome a persistência (`useSipClient`): o
// desfecho fino do T12 sai por este módulo e um import a mais no hook
// estouraria o orçamento de linhas do T09 (<120).
export type { CallEndOutcome };

/** Entrada de `upsertMyCall` em nomes de domínio; o mapa `p_*` é interno. */
export interface UpsertMyCallInput {
  /** Mesmo id nas 3 gravações — é o `sessionId` da máquina de sessão. */
  id: string;
  direction: CallDirection;
  /** Sempre explícito (ver o cabeçalho). */
  status: PersistedStatus;
  channel?: 'voip' | 'whatsapp';
  peerNumber?: string | null;
  peerName?: string | null;
  contactId?: string | null;
  /** Call-ID do SIP — prova de qual sessão do provedor gerou a linha. */
  providerCallId?: string | null;
  answeredAt?: string | null;
  endedAt?: string | null;
  endReason?: EndReason | null;
  talkSeconds?: number | null;
}

export type UpsertMyCallResult = { ok: boolean; error?: unknown };

/** Tentativas com o mesmo `p_id` antes de devolver falha. */
const MAX_TENTATIVAS = 3;

/** Nome da RPC — o contrato é o da migration B.3, não se inventa outro. */
export const UPSERT_MY_CALL_RPC = 'upsert_my_call';

/** `null` e `undefined` significam o mesmo para a RPC (coalesce): omitir. */
function omitirNulo<T>(valor: T | null | undefined): T | undefined {
  return valor ?? undefined;
}

/** Contador módulo-local: unicidade do fallback sem PRNG previsível. */
let contadorUuid = 0;

/**
 * Fallback **sem WebCrypto**: preenche os 16 bytes com o relógio + um contador.
 *
 * Este caminho não existe em navegador real (`crypto.getRandomValues` está em
 * todos, inclusive em contexto não-seguro). NÃO usa `Math.random()` de
 * propósito: o gate de segurança do Sonar classifica PRNG previsível como
 * vulnerabilidade (`typescript:S2245`), e o valor aqui é um id de linha sob
 * RLS — não um segredo.
 */
function preencherSemCrypto(bytes: Uint8Array): void {
  contadorUuid += 1;
  const agora = Date.now();
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = (agora >> ((i % 4) * 8)) & 0xff;
  }
  bytes[0] = (contadorUuid >> 24) & 0xff;
  bytes[1] = (contadorUuid >> 16) & 0xff;
  bytes[2] = (contadorUuid >> 8) & 0xff;
  bytes[3] = contadorUuid & 0xff;
}

/**
 * UUID v4 — sempre no formato que a coluna `calls.id` (`uuid`) aceita.
 *
 * O fallback é deliberado: `p_id` é `uuid` no banco, então um id fora desse
 * formato derruba as 3 tentativas com `22P02` e **nenhuma linha nasce**
 * (Safari/iOS < 15.4 e contexto não-seguro não têm `crypto.randomUUID`).
 */
export function uuidV4(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(b);
  else preencherSemCrypto(b);
  b[6] = (b[6] & 0x0f) | 0x40; // versão 4
  b[8] = (b[8] & 0x3f) | 0x80; // variante RFC 4122
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Id da linha da chamada: o `sessionId` do provider (um só id por chamada) ou,
 * sem ele, um uuid local (o id vai para `audit_logs`).
 */
export function novoCallId(sessionId?: string | null): string {
  return sessionId || uuidV4();
}

/**
 * Motivo do fim de uma chamada **atendida**: falha técnica > encerramento pelo
 * outro lado > encerramento local (o default, inclusive para o legado sem
 * `outcome` — até o T12 toda atendida encerrada virava `completed`, o que não
 * dizia quem desligou).
 */
function motivoAtendida(outcome?: CallEndOutcome | null): EndReason {
  if (outcome?.endedBy === 'failure') return 'failed';
  if (outcome?.endedBy === 'hangup_remote') return 'hangup_remote';
  return 'hangup_local';
}

/**
 * Motivo do fim de uma chamada **não atendida**: quem encerrou manda; sem
 * origem (legado), o código SIP final decide — e sem código, `no_answer`.
 *
 * `hangup_local` aqui FORÇA `cancelled` mesmo com código 200: na corrida do
 * CANCEL o servidor pode responder 200 ao INVITE já cancelado, e o usuário que
 * desligou antes do atendimento não pode ver "Concluída".
 */
function motivoNaoAtendida(outcome?: CallEndOutcome | null): EndReason {
  switch (outcome?.endedBy) {
    case 'reject':
      return 'declined';
    case 'hangup_local':
      return 'cancelled';
    case 'cancel_remote':
      return 'cancelled_remote';
    case 'timeout':
      return 'timeout';
    // Falha local/transporte antes de atender: NÃO é "não atendida" — espelha
    // `motivoAtendida`, senão uma falha do discar era gravada como no_answer.
    case 'failure':
      return 'failed';
    default: {
      const sipCode = outcome?.sipCode ?? null;
      return sipCode === null ? 'no_answer' : sipCodeToEndReason(sipCode);
    }
  }
}

/**
 * Desfecho a persistir no fim da chamada (T12).
 *
 * Atendida → `ended` (só `failure` vira `failed`). Não atendida → o motivo vem
 * do `outcome` (código SIP e quem encerrou); entrada perdida continua virando
 * `missed` e o resto sai de `persistedStatusForEndReason`.
 *
 * `persistedStatusForEndReason` (session.ts) sozinha não serve: ela mapeia
 * `no_answer` → `ended`, o que é correto para a máquina de sessão — o `missed`
 * da entrada é regra de **persistência** (T11), não do estado.
 */
export function desfechoDaChamada(
  talkSeconds: number | null,
  direction: CallDirection | null,
  outcome?: CallEndOutcome | null,
): { status: PersistedStatus; endReason: EndReason } {
  const endReason = talkSeconds !== null ? motivoAtendida(outcome) : motivoNaoAtendida(outcome);
  const status = endReason === 'no_answer' && direction === 'inbound'
    ? 'missed'
    : persistedStatusForEndReason(endReason) ?? 'ended';
  return { status, endReason };
}

/** Mapa 1:1 com os parâmetros `p_*` da RPC. */
function parametros(input: UpsertMyCallInput) {
  return {
    p_id: input.id,
    p_direction: input.direction,
    p_status: input.status,
    p_channel: omitirNulo(input.channel),
    p_peer_number: omitirNulo(input.peerNumber),
    p_peer_name: omitirNulo(input.peerName),
    p_contact_id: omitirNulo(input.contactId),
    p_provider_call_id: omitirNulo(input.providerCallId),
    p_answered_at: omitirNulo(input.answeredAt),
    p_ended_at: omitirNulo(input.endedAt),
    p_end_reason: omitirNulo(input.endReason),
    p_talk_seconds: omitirNulo(input.talkSeconds),
  };
}

/**
 * Grava/atualiza a chamada com retry idempotente (até 3 tentativas, sempre o
 * mesmo `p_id`). Nunca lança: devolve `{ ok: false, error }` na falha.
 */
export async function upsertMyCall(input: UpsertMyCallInput): Promise<UpsertMyCallResult> {
  const args = parametros(input);
  let erro: unknown;
  for (let tentativa = 0; tentativa < MAX_TENTATIVAS; tentativa += 1) {
    try {
      const { error } = await supabase.rpc(UPSERT_MY_CALL_RPC, args);
      if (!error) return { ok: true };
      erro = error;
    } catch (falha) {
      erro = falha;
    }
  }
  return { ok: false, error: erro };
}

/**
 * Desfecho da chamada visto da SAÍDA DA PÁGINA (`pagehide`) — o instantâneo que
 * o `useSipClient` colhe antes de a aba morrer.
 */
export interface SaidaDaPagina {
  /** `p_id` da linha já criada (sem ele não há o que atualizar). */
  callId: string | null;
  direction: CallDirection | null;
  talkSeconds: number | null;
  outcome: CallEndOutcome;
}

/**
 * Entrada da RPC para o fim da saída da página — `null` quando não há chamada
 * em curso (sem `callId`).
 *
 * Status e motivo saem do MESMO `desfechoDaChamada` das outras gravações: o
 * caminho da aba fechada não inventa regra paralela. `p_status` continua
 * explícito e o `p_id` é o mesmo da linha, então a gravação é update, não uma
 * segunda linha.
 */
export function entradaDaSaidaDaPagina(saida: SaidaDaPagina): UpsertMyCallInput | null {
  if (!saida.callId) return null;
  const direction = saida.direction ?? 'outbound';
  return {
    id: saida.callId,
    direction,
    channel: 'voip',
    endedAt: new Date().toISOString(),
    talkSeconds: saida.talkSeconds,
    ...desfechoDaChamada(saida.talkSeconds, direction, saida.outcome),
  };
}

/**
 * Bearer da sessão para o POST cru. `null` (sem sessão, storage bloqueado ou
 * cliente sem auth) é resposta honesta: sem JWT a RPC é `security invoker` e
 * recusa — não há o que gravar.
 */
async function bearerDaSessao(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    // `error` aqui é "não sei quem é você" (storage bloqueado/sessão inválida), não
    // "nada encontrado": sem JWT a RPC `security invoker` recusaria o POST, então
    // o fim não é gravado e não há para quem avisar (a página está saindo).
    if (error) return null;
    return data.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/**
 * Grava o fim por um `fetch` CRU com `keepalive: true`.
 *
 * O `supabase.rpc()` do cliente usa `fetch` SEM `keepalive`: quando a aba é
 * descartada o pedido em voo é cancelado e a linha fica em `ringing`/`answered`
 * para sempre (é o defeito que este caminho existe para fechar). Aqui o MESMO
 * payload `p_*` da RPC (mesmo `p_id`, `p_status` explícito) sai por um `fetch`
 * que o navegador entrega mesmo com a página morrendo.
 *
 * Sem retry, sem toast e sem erro que suba: na saída não há consumidor vivo
 * para reagir — a falha é engolida DE PROPÓSITO (o toast do T11 continua sendo
 * o caminho das gravações normais). Devolve `true` quando o pedido foi
 * DISPARADO, não quando o banco confirmou.
 */
export function gravarFimComKeepalive(input: UpsertMyCallInput, bearer: string): boolean {
  if (typeof fetch !== 'function') return false;
  try {
    void fetch(`${SUPABASE_URL}/rest/v1/rpc/${UPSERT_MY_CALL_RPC}`, {
      method: 'POST',
      keepalive: true,
      headers: {
        'Content-Type': 'application/json',
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${bearer}`,
      },
      body: JSON.stringify(parametros(input)),
    }).catch(() => undefined);
    return true;
  } catch {
    // `fetch` pode lançar de forma síncrona (URL inválida/ambiente sem rede).
    return false;
  }
}

/**
 * Registra a gravação do fim na SAÍDA DA PÁGINA e devolve o descarte do
 * listener.
 *
 * O par registro/remoção sai daqui, e quem chama usa o descarte no cleanup do
 * MESMO efeito (ver `useSipClient`): não sobra listener global duplicado —
 * `pagehide` sai na JANELA (não borbulha do `document`) e é o evento que o
 * navegador dispara ao fechar ou descartar a aba.
 *
 * `colher` roda só na saída e devolve o instantâneo da chamada, ou `null`
 * quando não há o que gravar. O bearer é colhido no PRÓPRIO evento (o handler
 * roda no mesmo turno, antes de a página ser descartada) — guardá-lo antes
 * valeria por uma sessão inteira e um JWT vencido seria recusado pela RPC.
 */
export function registrarFimNaSaidaDaPagina(
  colher: () => SaidaDaPagina | null,
  fila?: FilaDePersistencia,
): () => void {
  const aoSairDaPagina = () => {
    const saida = colher();
    if (!saida) return;
    const entrada = entradaDaSaidaDaPagina(saida);
    if (!entrada) return;
    const enviar = () => {
      void bearerDaSessao().then((bearer) => {
        if (bearer) gravarFimComKeepalive(entrada, bearer);
      });
    };
    // Com fila, o fim espera a cauda: não fura uma escrita ainda em voo
    // (chegaria antes e a linha terminaria presa no status anterior).
    if (fila) fila.aposCauda(enviar);
    else enviar();
  };
  window.addEventListener('pagehide', aoSairDaPagina);
  return () => window.removeEventListener('pagehide', aoSairDaPagina);
}

/** Contrato da fila: quem chama na ordem, chega na ordem. */
export interface FilaDePersistencia {
  executar(input: UpsertMyCallInput): Promise<UpsertMyCallResult>;
  /**
   * Agenda um trabalho de despedida ATRÁS da cauda atual: ele roda depois de
   * tudo que já estava enfileirado, sem furar a fila e sem segurar as
   * próximas gravações (fogo-e-esquece: nunca propaga erro). Serve ao flush
   * do `pagehide`, que não pode `await` nada mas também não pode chegar
   * antes de uma escrita ainda em voo.
   */
  aposCauda(trabalho: () => void): void;
}

/**
 * Reserva o ID da chamada NO INÍCIO (síncrono), antes de o registro
 * assíncrono (`sink.create`: busca de contato + 1ª escrita) resolver — para o
 * flush do `pagehide` nunca sair sem saber o que gravar.
 *
 * Só devolve ID quando ele é determinístico (sessionId do provider: o
 * registro gera exatamente o mesmo via `novoCallId`). Sem sessionId o
 * registro gera um uuid imprevisível — reservar outro aqui criaria uma
 * SEGUNDA linha para a mesma chamada, então devolve null.
 */
export function reservarIdDeSaida(sessionId?: string | null): string | null {
  return sessionId ? novoCallId(sessionId) : null;
}

/**
 * Fila de persistência (D3): encadeia as gravações numa promise única, de modo
 * que a ORDEM DE CHAMADA vire a ordem de chegada à RPC. Sem ela, o `upsert` de
 * `answered` (assíncrono) podia completar DEPOIS do `finished` e regravar
 * `status='answered'` sobre o desfecho — a linha terminava "atendida" para
 * sempre.
 *
 * A falha de uma gravação não trava as seguintes: `upsertMyCall` nunca lança
 * (devolve `{ ok:false }`), e o `.catch` defensivo garante que a corrente siga
 * mesmo se algum caminho futuro rejeitar.
 */
export function criarFilaDePersistencia(): FilaDePersistencia {
  let corrente: Promise<unknown> = Promise.resolve();
  return {
    executar(input) {
      const proxima = corrente.then(() => upsertMyCall(input));
      corrente = proxima.catch(() => undefined);
      return proxima;
    },
    aposCauda(trabalho) {
      // Atrás da cauda, sem segurar a fila: a corrente NÃO anda com o
      // trabalho (as próximas gravações não esperam a despedida), e o erro
      // do trabalho nunca vaza (a aba pode estar morrendo).
      const seguro = () => {
        try {
          trabalho();
        } catch {
          /* despedida é fogo-e-esquece */
        }
      };
      void corrente.then(seguro, seguro);
    },
  };
}
