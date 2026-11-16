import { describe, it, expect, beforeEach } from 'vitest';

import { unconfirmedRefetchInterval, resetBackoffUnconfirmed } from '../useUnconfirmedMessages';

// Recuperado da branch `claude/fix-pd79-compat-pre-migration-261111`, que nunca entrou.
// Sem o recuo, uma falha persistente — permissão negada, RPC fora do schema cache,
// instabilidade do banco — fazia cada conversa aberta repolar de 30 em 30 s para sempre.
//
// O recuo conta falhas SEGUIDAS, não o total da sessão: o `UnconfirmedMessagesPanel`
// esconde o painel enquanto a consulta está em erro e não oferece recarga manual, então
// herdar histórico faria o painel sumir por 10 min por causa de uma falha isolada.
const q = (hash: string, status: string, errorUpdateCount?: number) =>
  ({ queryHash: hash, state: { status, errorUpdateCount } });

describe('unconfirmedRefetchInterval', () => {
  beforeEach(() => resetBackoffUnconfirmed());

  it('em regime normal mantém o polling de 30 s', () => {
    expect(unconfirmedRefetchInterval(q('a', 'success'))).toBe(30_000);
    expect(unconfirmedRefetchInterval(q('a', 'pending'))).toBe(30_000);
  });

  it('sob erro seguido dobra a espera: 1, 2, 4 e 8 minutos', () => {
    expect(unconfirmedRefetchInterval(q('a', 'error', 1))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 2))).toBe(120_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 3))).toBe(240_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 4))).toBe(480_000);
  });

  it('a espera tem teto de 10 minutos, por mais que o erro persista', () => {
    for (let i = 1; i <= 5; i++) unconfirmedRefetchInterval(q('a', 'error', i));
    expect(unconfirmedRefetchInterval(q('a', 'error', 6))).toBe(600_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 7))).toBe(600_000);
  });

  it('sucesso zera a contagem: erro → sucesso → erro volta a 1 minuto', () => {
    for (let i = 1; i <= 4; i++) unconfirmedRefetchInterval(q('a', 'error', i));
    expect(unconfirmedRefetchInterval(q('a', 'error', 5))).toBe(600_000);

    expect(unconfirmedRefetchInterval(q('a', 'success', 5))).toBe(30_000);

    // `errorUpdateCount` não zera no react-query — é o total da sessão. A falha seguinte
    // é a PRIMEIRA desde a recuperação, então cobra 1 min, não 10.
    expect(unconfirmedRefetchInterval(q('a', 'error', 6))).toBe(60_000);
  });

  it('o mesmo erro reavaliado não conta duas vezes', () => {
    expect(unconfirmedRefetchInterval(q('a', 'error', 1))).toBe(60_000);
    // O callback é reavaliado a cada render, com o MESMO erro: não pode dobrar.
    expect(unconfirmedRefetchInterval(q('a', 'error', 1))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 1))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('a', 'error', 2))).toBe(120_000);
  });

  it('cada conversa tem a própria contagem', () => {
    for (let i = 1; i <= 4; i++) unconfirmedRefetchInterval(q('conversa-1', 'error', i));
    expect(unconfirmedRefetchInterval(q('conversa-1', 'error', 5))).toBe(600_000);
    // Outra conversa que falha pela primeira vez não herda o recuo da primeira.
    expect(unconfirmedRefetchInterval(q('conversa-2', 'error', 1))).toBe(60_000);
  });

  it('erro sem contador conta como primeira falha, não como zero', () => {
    expect(unconfirmedRefetchInterval(q('a', 'error'))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('b', 'error', 0))).toBe(60_000);
  });
});
