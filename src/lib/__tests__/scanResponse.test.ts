import { describe, expect, it } from 'vitest';
import {
  parseScanInvocation,
  isBlocking,
  isRetryable,
  isInputError,
  ScanBlockedError,
  type ScanResult,
} from '../scanResponse';

/**
 * HZ1-02 — o front do V2 passa a conversar com o `file-security-scanner`.
 *
 * Aqui o alvo é só a NORMALIZAÇÃO: a tela nunca vê o envelope cru. Os quatro
 * envelopes que a Edge pode devolver (varreu-limpo, barrou, falha-passageira e
 * NÃO varreu) precisam sair daqui como `ScanResult` e classificar certo, porque é
 * essa classificação que decide se o arquivo do agente sai ou não.
 */

/** `FunctionsHttpError` do supabase-js: corpo em `error.context` (um `Response`). */
function httpError(status: number, body: unknown, message = 'Edge Function returned a non-2xx status code') {
  return {
    name: 'FunctionsHttpError',
    message,
    context: new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}

describe('parseScanInvocation — varreu e passou', () => {
  it('data com success/scanned:true vira sucesso limpo e NÃO é bloqueio nem retry', async () => {
    const result = await parseScanInvocation({
      data: { success: true, scanned: true, verdict: 'clean', scanId: 'scan-1', message: 'Arquivo verificado.' },
      error: null,
    });

    expect(result.status).toBe('success');
    expect(result).toMatchObject({ verdict: 'clean', scanId: 'scan-1', message: 'Arquivo verificado.' });
    expect(isBlocking(result)).toBe(false);
    expect(isRetryable(result)).toBe(false);
    expect(isInputError(result)).toBe(false);
  });

  it('sucesso sem `scanned` explícito continua sendo sucesso (envelopes antigos)', async () => {
    const result = await parseScanInvocation({ data: { success: true, verdict: 'clean' }, error: null });
    expect(result.status).toBe('success');
  });
});

describe('parseScanInvocation — scanned:false (servidor não varreu)', () => {
  it('vira `skipped` com reason/message e NÃO se confunde com erro nem com limpo', async () => {
    const result = await parseScanInvocation({
      data: {
        success: true,
        scanned: false,
        verdict: 'unknown',
        reason: 'no_key',
        message: 'O arquivo não pôde ser verificado agora e será enviado mesmo assim.',
        scanId: null,
      },
      error: null,
    });

    expect(result.status).toBe('skipped');
    expect(result).toMatchObject({ reason: 'no_key', scanId: null });
    if (result.status !== 'skipped') throw new Error('esperado skipped');
    expect(result.message).toContain('enviado mesmo assim');
    expect(isBlocking(result)).toBe(false);
    expect(isRetryable(result)).toBe(false);
  });

  it('scanned:false sem message usa um texto próprio (nunca vazio na tela)', async () => {
    const result = await parseScanInvocation({
      data: { success: true, scanned: false, reason: 'too_large' },
      error: null,
    });
    expect(result.status).toBe('skipped');
    if (result.status !== 'skipped') throw new Error('esperado skipped');
    expect(result.message.length).toBeGreaterThan(0);
  });
});

describe('parseScanInvocation — barrou e falhou', () => {
  it('422 MALWARE_DETECTED no corpo do FunctionsHttpError classifica como bloqueio', async () => {
    const result = await parseScanInvocation({
      data: null,
      error: httpError(422, {
        error: true,
        code: 'MALWARE_DETECTED',
        message: 'Arquivo bloqueado: ameaça detectada.',
        verdict: 'malicious',
        scanId: 'scan-eicar',
        contract: 'scan-v1',
      }),
    });

    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('esperado erro');
    expect(result.code).toBe('MALWARE_DETECTED');
    expect(result.verdict).toBe('malicious');
    expect(result.scanId).toBe('scan-eicar');
    expect(result.contract).toBe('scan-v1');
    expect(isBlocking(result)).toBe(true);
    expect(isRetryable(result)).toBe(false);
  });

  it('403 SUSPICIOUS_FILE também bloqueia', async () => {
    const result = await parseScanInvocation({
      data: null,
      error: httpError(403, { error: true, code: 'SUSPICIOUS_FILE', message: 'Arquivo suspeito.', verdict: 'suspicious' }),
    });
    expect(isBlocking(result)).toBe(true);
  });

  it('408 SCAN_TIMEOUT e 429 RATE_LIMITED são passageiros (retry)', async () => {
    const timeout = await parseScanInvocation({
      data: null,
      error: httpError(408, { error: true, code: 'SCAN_TIMEOUT', message: 'Tempo esgotado ao verificar o arquivo.' }),
    });
    const limited = await parseScanInvocation({
      data: null,
      error: httpError(429, { error: true, code: 'RATE_LIMITED', message: 'Muitas verificações agora. Tente novamente.' }),
    });

    expect(isRetryable(timeout)).toBe(true);
    expect(isRetryable(limited)).toBe(true);
    expect(isBlocking(limited)).toBe(false);
  });

  it('502 SCAN_UNAVAILABLE é passageiro; 500 INTERNAL_ERROR não é retry nem bloqueio', async () => {
    const unavailable = await parseScanInvocation({
      data: null,
      error: httpError(502, { error: true, code: 'SCAN_UNAVAILABLE', message: 'Verificação indisponível.' }),
    });
    const internal = await parseScanInvocation({
      data: null,
      error: httpError(500, { error: true, code: 'INTERNAL_ERROR', message: 'Falha interna.' }),
    });

    expect(isRetryable(unavailable)).toBe(true);
    expect(isRetryable(internal)).toBe(false);
    expect(isInputError(internal)).toBe(false);
    expect(internal.status).toBe('error');
  });

  it('400 INVALID_INPUT e 405 METHOD_NOT_ALLOWED são erro de pedido', async () => {
    const invalid = await parseScanInvocation({
      data: null,
      error: httpError(400, { error: true, code: 'INVALID_INPUT', message: 'Arquivo inválido.' }),
    });
    const method = await parseScanInvocation({
      data: null,
      error: httpError(405, { error: true, code: 'METHOD_NOT_ALLOWED', message: 'Método não permitido.' }),
    });

    expect(isInputError(invalid)).toBe(true);
    expect(isInputError(method)).toBe(true);
    expect(isRetryable(invalid)).toBe(false);
    expect(isBlocking(invalid)).toBe(false);
  });

  it('código desconhecido cai em UNKNOWN (o front não inventa um veredito)', async () => {
    const result = await parseScanInvocation({
      data: null,
      error: httpError(418, { error: true, code: 'TEAPOT', message: 'Erro novo do servidor.' }),
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('esperado erro');
    expect(result.code).toBe('UNKNOWN');
    expect(result.message).toBe('Erro novo do servidor.');
  });
});

describe('parseScanInvocation — transporte e resposta degenerada', () => {
  it('falha de rede (sem corpo) é NETWORK_ERROR e pode ser repetida', async () => {
    const result = await parseScanInvocation({ data: null, error: new Error('Failed to fetch') });
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('esperado erro');
    expect(result.code).toBe('NETWORK_ERROR');
    expect(result.message).toBe('Failed to fetch');
    expect(isRetryable(result)).toBe(true);
  });

  it('sem data e sem error resolve como UNKNOWN, sem lançar', async () => {
    const result = await parseScanInvocation({ data: null, error: null });
    expect(result.status).toBe('error');
    if (result.status !== 'error') throw new Error('esperado erro');
    expect(result.code).toBe('UNKNOWN');
  });

  it('sempre resolve — nunca lança, mesmo com envelope bizarro', async () => {
    await expect(parseScanInvocation({ data: undefined, error: 'boom' as unknown })).resolves.toBeTruthy();
  });
});

describe('ScanBlockedError', () => {
  it('leva o resultado estruturado para cima sem perder código nem mensagem', () => {
    const result: ScanResult = {
      status: 'error',
      code: 'MALWARE_DETECTED',
      message: 'Arquivo bloqueado: ameaça detectada.',
      verdict: 'malicious',
      scanId: 'scan-eicar',
    };
    const err = new ScanBlockedError(result);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('ScanBlockedError');
    expect(err.message).toBe('Arquivo bloqueado: ameaça detectada.');
    expect(err.result).toBe(result);
  });
});
