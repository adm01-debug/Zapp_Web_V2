/**
 * Contrato do evento de início de chamada — Apêndice D de
 * `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` (etapa 15).
 *
 * Novo contrato: `zapp:start-call` disparado em `document`, com
 * `StartCallPayload` tipado.
 *
 * Compatibilidade obrigatória: o evento legado `start-voip-call` (disparado em
 * `window` por `ContactActionButtons`/`ContactHeaderSection`) continua sendo
 * aceito e é convertido para `StartCallPayload` com canal `voip` e origem
 * `inbox`. Some quando a etapa 47 remover os emissores antigos.
 *
 * Este módulo não importa react; usa `window`/`document` e degrada para no-op
 * em ambiente sem DOM (SSR).
 */

/** Canal do transporte — mesma união de `calls.channel` (seção 2.7). */
export type StartCallChannel = 'voip' | 'whatsapp';

/** De onde o usuário pediu a ligação (define se o discador abre ou já disca). */
export type StartCallSource = 'inbox' | 'contacts' | 'history' | 'other';

/** Detail do evento `zapp:start-call`. */
export interface StartCallPayload {
  channel: StartCallChannel;
  /** Como veio; o provider normaliza. */
  phone: string;
  contactId?: string;
  name?: string;
  /** Linha WhatsApp da conversa (inbox). */
  connectionId?: string;
  source: StartCallSource;
  /**
   * Default `false`: abre o painel preenchido, não disca sozinho. Só é `true`
   * no botão "Ligar de volta" do histórico.
   */
  autoDial?: boolean;
}

/** Detail do evento legado `start-voip-call`: apenas telefone e nome. */
export interface LegacyStartCallDetail {
  phone?: unknown;
  name?: unknown;
}

export const START_CALL_EVENT = 'zapp:start-call';
export const LEGACY_START_CALL_EVENT = 'start-voip-call';

export type StartCallHandler = (payload: StartCallPayload) => void;

const CHANNELS: StartCallChannel[] = ['voip', 'whatsapp'];
const SOURCES: StartCallSource[] = ['inbox', 'contacts', 'history', 'other'];

/**
 * Converte o detail legado em `StartCallPayload`. Devolve `null` quando não há
 * telefone utilizável — nesse caso o evento é ignorado (com warn).
 */
export function toStartCallPayload(detail: unknown): StartCallPayload | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const legado = detail as LegacyStartCallDetail;
  // O número vai como veio (quem normaliza é o provider) — só vazio é recusado.
  if (typeof legado.phone !== 'string' || legado.phone === '') return null;

  const payload: StartCallPayload = {
    channel: 'voip',
    phone: legado.phone,
    source: 'inbox',
    autoDial: false,
  };
  if (typeof legado.name === 'string' && legado.name !== '') payload.name = legado.name;
  return payload;
}

/** Guarda de runtime do detail do evento novo (protege contra payload torto). */
export function isStartCallPayload(detail: unknown): detail is StartCallPayload {
  if (typeof detail !== 'object' || detail === null) return false;
  const candidato = detail as Partial<StartCallPayload>;
  if (typeof candidato.phone !== 'string' || candidato.phone === '') return false;
  if (typeof candidato.channel !== 'string') return false;
  if (!CHANNELS.some((canal) => canal === candidato.channel)) return false;
  if (typeof candidato.source !== 'string') return false;
  if (!SOURCES.some((origem) => origem === candidato.source)) return false;
  return true;
}

/**
 * Emite `zapp:start-call` em `document` com o payload recebido, sem clonar nem
 * preencher defaults (o `detail` é exatamente o objeto passado).
 */
export function dispatchStartCall(payload: StartCallPayload): void {
  if (!hasDocument()) return;
  document.dispatchEvent(new CustomEvent<StartCallPayload>(START_CALL_EVENT, { detail: payload }));
}

/**
 * Assina o início de chamada. O handler recebe `StartCallPayload` tanto do
 * evento novo (`document`/`zapp:start-call`) quanto do legado
 * (`window`/`start-voip-call`, convertido). Devolve a função de cleanup, que
 * remove os dois listeners e pode ser chamada mais de uma vez.
 */
export function onStartCall(handler: StartCallHandler): () => void {
  if (!hasDocument() || !hasWindow()) return () => {};

  const aoNovo = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    if (!isStartCallPayload(detail)) {
      warnMalformed(START_CALL_EVENT, detail);
      return;
    }
    handler(detail);
  };

  const aoLegado = (event: Event): void => {
    const detail = (event as CustomEvent<unknown>).detail;
    const payload = toStartCallPayload(detail);
    if (payload === null) {
      warnMalformed(LEGACY_START_CALL_EVENT, detail);
      return;
    }
    handler(payload);
  };

  document.addEventListener(START_CALL_EVENT, aoNovo);
  window.addEventListener(LEGACY_START_CALL_EVENT, aoLegado);

  let assinado = true;
  return () => {
    if (!assinado) return;
    assinado = false;
    document.removeEventListener(START_CALL_EVENT, aoNovo);
    window.removeEventListener(LEGACY_START_CALL_EVENT, aoLegado);
  };
}

function hasDocument(): boolean {
  return typeof document !== 'undefined' && typeof document.dispatchEvent === 'function';
}

function hasWindow(): boolean {
  return typeof window !== 'undefined' && typeof window.addEventListener === 'function';
}

function warnMalformed(eventName: string, detail: unknown): void {
  console.warn(`[start-call] detail inválido ignorado em '${eventName}'`, detail);
}
