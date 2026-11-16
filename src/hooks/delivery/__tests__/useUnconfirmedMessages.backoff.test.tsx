import { describe, it, expect } from 'vitest';

import { unconfirmedRefetchInterval } from '../useUnconfirmedMessages';

// Recuperado da branch `claude/fix-pd79-compat-pre-migration-261111`, que nunca entrou.
// Sem o backoff, uma falha persistente — permissão negada, RPC fora do schema cache,
// instabilidade do banco — fazia cada conversa aberta repolar de 30 em 30 s para sempre.
const q = (status: string, errorUpdateCount?: number) => ({ state: { status, errorUpdateCount } });

describe('unconfirmedRefetchInterval', () => {
  it('em regime normal mantém o polling de 30 s', () => {
    expect(unconfirmedRefetchInterval(q('success'))).toBe(30_000);
    expect(unconfirmedRefetchInterval(q('pending'))).toBe(30_000);
  });

  it('sob erro dobra a espera a cada tentativa: 1, 2, 4 e 8 minutos', () => {
    expect(unconfirmedRefetchInterval(q('error', 1))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('error', 2))).toBe(120_000);
    expect(unconfirmedRefetchInterval(q('error', 3))).toBe(240_000);
    expect(unconfirmedRefetchInterval(q('error', 4))).toBe(480_000);
  });

  it('a espera tem teto de 10 minutos, por mais que o erro persista', () => {
    expect(unconfirmedRefetchInterval(q('error', 5))).toBe(600_000);
    expect(unconfirmedRefetchInterval(q('error', 50))).toBe(600_000);
  });

  it('volta para 30 s assim que a consulta tem sucesso', () => {
    expect(unconfirmedRefetchInterval(q('error', 7))).toBe(600_000);
    // `errorUpdateCount` não zera no react-query, mas deixa de ser consultado fora do
    // estado de erro: a volta ao normal não depende de o contador voltar a zero.
    expect(unconfirmedRefetchInterval(q('success', 7))).toBe(30_000);
  });

  it('erro sem contador conta como primeira tentativa, não como zero', () => {
    expect(unconfirmedRefetchInterval(q('error'))).toBe(60_000);
    expect(unconfirmedRefetchInterval(q('error', 0))).toBe(60_000);
  });
});
