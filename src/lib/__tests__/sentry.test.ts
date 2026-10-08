/**
 * SL-056 — "Sentry no front e nas edges" (itens 031-032 do plano de paridade).
 *
 * Lacuna medida no inventário de 07/10/2026: "Sem Sentry.init no front/edges".
 * O V2 não aceita dependência nova: o cliente mínimo de Sentry (envelope por
 * `fetch`) mora em `src/lib/sentry.ts`, ligado pelo DSN que já está documentado
 * em `.env.example` (`VITE_SENTRY_DSN`).
 *
 * O que este teste prova (falha sem a correção: `@/lib/sentry` não existia):
 *  1. DESLIGADO POR PADRÃO: sem `VITE_SENTRY_DSN` o init devolve `false` e
 *     nenhum fetch acontece — nenhuma informação sai do sistema por acidente;
 *  2. com DSN: o init liga, instala os handlers globais e um erro global vira
 *     evento no endpoint do projeto do DSN (cabeçalho + item + evento);
 *  3. o init é idempotente (um listener, um envio por erro — sem duplicar);
 *  4. DSN inválido não liga; e-mail/telefone na mensagem saem mascarados;
 *  5. falha do fetch não vira exceção (reportar não pode ser a segunda falha).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  captureException,
  initSentry,
  maskSensitive,
  parseSentryDsn,
  resetSentryForTests,
  sentryIsActive,
} from '@/lib/sentry';

const DSN = 'https://chavepublica@o123.ingest.sentry.io/42';
const STORE = 'https://o123.ingest.sentry.io/api/42/envelope/';

function espiarFetch(resposta: () => Response = () => new Response('', { status: 200 })) {
  const chamadas: { url: string; init: RequestInit }[] = [];
  const mock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: String(input), init: init ?? {} });
    return Promise.resolve(resposta());
  });
  vi.stubGlobal('fetch', mock);
  return { chamadas, mock };
}

/** Lê as 3 linhas do envelope (cabeçalho, item e evento). */
function lerEnvelope(body: string) {
  const [header, item, event] = body.trim().split('\n');
  return {
    header: JSON.parse(header) as Record<string, unknown>,
    item: JSON.parse(item) as Record<string, unknown>,
    event: JSON.parse(event) as Record<string, unknown>,
  };
}

describe('sentry (front)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_SENTRY_DSN', '');
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', '');
    resetSentryForTests();
  });

  afterEach(() => {
    resetSentryForTests();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('sem VITE_SENTRY_DSN fica desligado e não sai nada do sistema', async () => {
    const { mock } = espiarFetch();

    expect(initSentry()).toBe(false);
    expect(sentryIsActive()).toBe(false);
    expect(await captureException(new Error('boom'))).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it('com DSN liga, instala os handlers globais e envia o erro global ao projeto', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    vi.stubEnv('VITE_SENTRY_ENVIRONMENT', 'staging');
    const { chamadas, mock } = espiarFetch();

    expect(initSentry()).toBe(true);
    expect(sentryIsActive()).toBe(true);

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('boom no front') }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));

    expect(chamadas[0].url).toBe(STORE);
    expect(chamadas[0].init.method).toBe('POST');
    const headers = chamadas[0].init.headers as Record<string, string>;
    expect(headers['Content-Type']).toBe('application/x-sentry-envelope');
    expect(headers['X-Sentry-Auth']).toContain('sentry_key=chavepublica');

    const { header, item, event } = lerEnvelope(String(chamadas[0].init.body));
    expect(header.dsn).toBe(DSN);
    expect(item.type).toBe('event');
    expect(event.environment).toBe('staging');
    expect(event.platform).toBe('javascript');
    const tags = event.tags as Record<string, string>;
    expect(tags.source).toBe('window.onerror');
    const valor = (event.exception as { values: { type: string; value: string }[] }).values[0];
    expect(valor.type).toBe('Error');
    expect(valor.value).toBe('boom no front');
    // O define `__ZAPP_BUILD_ID__` do Vite não existe no vitest: sem release aqui.
    expect(event.release).toBeUndefined();
  });

  it('promise rejeitada sem tratamento também vira evento', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const { chamadas, mock } = espiarFetch();
    expect(initSentry()).toBe(true);

    const evento = new Event('unhandledrejection');
    Object.assign(evento, { reason: new Error('promessa rejeitada') });
    window.dispatchEvent(evento);

    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));
    const { event } = lerEnvelope(String(chamadas[0].init.body));
    expect((event.tags as Record<string, string>).source).toBe('unhandledrejection');
    expect(
      (event.exception as { values: { value: string }[] }).values[0].value,
    ).toBe('promessa rejeitada');
  });

  it('initSentry é idempotente: dois init não duplicam o envio', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    const { mock } = espiarFetch();

    expect(initSentry()).toBe(true);
    expect(initSentry()).toBe(true);

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('uma vez só') }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new ErrorEvent('error', { error: new Error('outra') }));
    await vi.waitFor(() => expect(mock).toHaveBeenCalledTimes(2));
  });

  it('DSN inválido não liga o rastreio', async () => {
    expect(parseSentryDsn('')).toBeNull();
    expect(parseSentryDsn('nao-e-url')).toBeNull();
    expect(parseSentryDsn('https://o123.ingest.sentry.io/42')).toBeNull(); // sem chave pública
    expect(parseSentryDsn('https://chave@o123.ingest.sentry.io/nao-numerico')).toBeNull();
    expect(parseSentryDsn('http://chave@o123.ingest.sentry.io/42')).toBeNull(); // http remoto
    expect(parseSentryDsn(DSN)?.projectId).toBe('42');

    vi.stubEnv('VITE_SENTRY_DSN', 'nao-e-url');
    const { mock } = espiarFetch();
    expect(initSentry()).toBe(false);
    expect(mock).not.toHaveBeenCalled();
  });

  it('mascara telefone e e-mail antes de sair', () => {
    expect(maskSensitive('falha com 5511999998888 e joao@exemplo.com.br')).toBe(
      'falha com [num] e [email]',
    );
    expect(maskSensitive('sem dado sensivel')).toBe('sem dado sensivel');
  });

  it('fetch que falha não vira exceção (reportar não pode ser a segunda falha)', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', DSN);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('sem rede'))));
    expect(initSentry()).toBe(true);

    await expect(captureException(new Error('boom'))).resolves.toBe(false);
  });
});
