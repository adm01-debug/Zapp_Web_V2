import { useCallback, useEffect, useRef } from 'react';

/**
 * IA-048 — identidade de requisição de IA e descarte de resposta superada.
 *
 * Toda resposta de IA é assíncrona: entre o clique e a resolução, o usuário
 * pode trocar de contato, de período ou editar o rascunho. Sem uma identidade
 * de requisição, a resposta antiga é aplicada sob o contexto novo — o resultado
 * do contato A aparece no contato B e, pior, efeitos no servidor (ex.: alerta
 * de sentimento) disparam para o contato errado.
 *
 * Este helper oferece: (1) um `requestId` único por clique; (2) uma "versão" do
 * contexto EXPLÍCITO da requisição (contato + período escolhido). Comparar a
 * versão na resolução diz se a resposta ainda pertence à tela atual; se não, a
 * resposta é DESCARTADA inteira — nada de estado e nada de efeito no servidor.
 *
 * O que NÃO entra na versão (risco medido): `messages.length` nem a última
 * mensagem VIVA. Incluí-los faria cada mensagem que chega por tempo real
 * invalidar uma análise legítima em voo — a análise nunca apareceria. A versão
 * deriva SÓ do contexto explicitamente escolhido pelo usuário.
 */

export interface AiRequestContext {
  /** Contato dono da requisição. */
  contactId: string;
  /** Contexto explícito (ex.: período escolhido) serializado numa chave. */
  periodKey: string;
}

export interface AiRequestIdentity extends AiRequestContext {
  /** Identificador único do clique que originou a requisição. */
  requestId: string;
  /** Versão do contexto no momento da abertura da requisição. */
  generation: number;
}

/**
 * Gera um identificador opaco e único por requisição (uuid v4).
 * Mesma exigência da criação de rascunho em `useCampaignEditor`: sem fonte
 * segura não há identidade confiável, então falha alto em vez de sortear.
 */
export function createAiRequestId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  if (cryptoApi && typeof cryptoApi.getRandomValues === 'function') {
    const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
    // uuid v4: versão 4 nos bits altos do byte 6, variante RFC 4122 no byte 8.
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('O navegador não oferece uma fonte segura para identificar a requisição de IA.');
}

/** Data local do calendário (YYYY-MM-DD): o período é escolhido por dia, não por instante. */
function formatDayKey(date: Date | null | undefined): string {
  if (!date) return '';
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Chave do período ESCOLHIDO pelo usuário. Períodos relativos usam o próprio
 * rótulo; `custom` usa as datas selecionadas. NUNCA deriva das mensagens — só
 * do que o usuário escolheu no seletor.
 */
export function buildPeriodKey(
  period: string,
  customFrom?: Date | null,
  customTo?: Date | null,
): string {
  if (period === 'custom') return `custom:${formatDayKey(customFrom)}:${formatDayKey(customTo)}`;
  return period;
}

/**
 * Lógica de descarte pura (sem React): a resposta ainda vale para o contexto
 * atual? Basta a geração, o contato ou o período ter mudado para descartar.
 */
export function isAiRequestCurrent(
  request: AiRequestIdentity,
  current: AiRequestContext & { generation: number },
): boolean {
  return request.generation === current.generation
    && request.contactId === current.contactId
    && request.periodKey === current.periodKey;
}

export interface AiRequestGeneration {
  /** Abre uma requisição: incrementa a geração e captura contato + período atuais. */
  begin: () => AiRequestIdentity;
  /** Abre uma requisição derivada SEM incrementar a geração (ex.: reescrever item). */
  snapshot: () => AiRequestIdentity;
  /** Diz se a requisição ainda pertence ao contexto atual (dá para aplicar). */
  isCurrent: (request: AiRequestIdentity) => boolean;
  /** Invalida qualquer requisição em voo — chamar nos efeitos que já resetam estado. */
  invalidate: () => void;
}

/**
 * Contador de geração em `useRef`: valor monotônico que muda a cada reset de
 * contexto, sem re-render. Mesmo padrão de descarte por geração de
 * `useTalkMeQueue` (compara geração e descarta) e `useCampaignEditor` (descarta
 * resposta substituída), extraído para reuso na IA.
 */
export function useAiRequestGeneration(context: AiRequestContext): AiRequestGeneration {
  const generationRef = useRef(0);
  const contextRef = useRef<AiRequestContext>(context);
  const { contactId, periodKey } = context;

  // Só contato + período explícito: nunca `messages.length` nem última mensagem.
  useEffect(() => {
    contextRef.current = { contactId, periodKey };
  }, [contactId, periodKey]);

  const buildIdentity = useCallback((generation: number): AiRequestIdentity => ({
    requestId: createAiRequestId(),
    generation,
    contactId: contextRef.current.contactId,
    periodKey: contextRef.current.periodKey,
  }), []);

  const begin = useCallback((): AiRequestIdentity => {
    generationRef.current += 1;
    return buildIdentity(generationRef.current);
  }, [buildIdentity]);

  const snapshot = useCallback(
    (): AiRequestIdentity => buildIdentity(generationRef.current),
    [buildIdentity],
  );

  const isCurrent = useCallback(
    (request: AiRequestIdentity): boolean =>
      isAiRequestCurrent(request, { ...contextRef.current, generation: generationRef.current }),
    [],
  );

  const invalidate = useCallback((): void => {
    generationRef.current += 1;
  }, []);

  return { begin, snapshot, isCurrent, invalidate };
}
