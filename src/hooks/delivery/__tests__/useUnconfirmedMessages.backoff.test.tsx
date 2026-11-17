import { describe, it, expect } from 'vitest';

import { unconfirmedRefetchInterval } from '../useUnconfirmedMessages';

// Recuperado da branch `claude/fix-pd79-compat-pre-migration-261111`, que nunca entrou.
// Sem o recuo, uma falha persistente — permissão negada, RPC fora do schema cache,
// instabilidade do banco — fazia cada conversa aberta repolar de 30 em 30 s para sempre.
//
// O recuo conta falhas SEGUIDAS, não o total da sessão, e a contagem vive na INSTÂNCIA da
// query: o `UnconfirmedMessagesPanel` esconde o painel enquanto a consulta está em erro e
// não oferece recarga manual, então herdar histórico faria o painel sumir por 10 min por
// causa de uma falha isolada.

/** Instância de query: o mesmo objeto atravessa várias avaliações do callback. */
function queryFake() {
  const q = { state: { status: 'pending' as string, errorUpdateCount: undefined as number | undefined } };
  return {
    q,
    em(status: string, errorUpdateCount?: number) {
      q.state = { status, errorUpdateCount };
      return unconfirmedRefetchInterval(q);
    },
  };
}

describe('unconfirmedRefetchInterval', () => {
  it('em regime normal mantém o polling de 30 s', () => {
    const c = queryFake();
    expect(c.em('success')).toBe(30_000);
    expect(c.em('pending')).toBe(30_000);
  });

  it('sob erro seguido dobra a espera: 1, 2, 4 e 8 minutos', () => {
    const c = queryFake();
    expect(c.em('error', 1)).toBe(60_000);
    expect(c.em('error', 2)).toBe(120_000);
    expect(c.em('error', 3)).toBe(240_000);
    expect(c.em('error', 4)).toBe(480_000);
  });

  it('a espera tem teto de 10 minutos, por mais que o erro persista', () => {
    const c = queryFake();
    for (let i = 1; i <= 5; i++) c.em('error', i);
    expect(c.em('error', 6)).toBe(600_000);
    expect(c.em('error', 7)).toBe(600_000);
  });

  it('sucesso zera a contagem: erro → sucesso → erro volta a 1 minuto', () => {
    const c = queryFake();
    for (let i = 1; i <= 4; i++) c.em('error', i);
    expect(c.em('error', 5)).toBe(600_000);

    expect(c.em('success', 5)).toBe(30_000);

    // `errorUpdateCount` não zera no react-query — é o total da sessão. A falha seguinte
    // é a PRIMEIRA desde a recuperação, então cobra 1 min, não 10.
    expect(c.em('error', 6)).toBe(60_000);
  });

  it('o `pending` entre duas falhas não zera a contagem', () => {
    // Consulta que falha desde a abertura não tem dado em cache, então cada nova busca
    // passa por `pending` antes de terminar em erro. Se isso zerasse a contagem, o recuo
    // ficaria preso em 1 min e nunca chegaria a 2, 4, 8 ou 10.
    const c = queryFake();
    expect(c.em('error', 1)).toBe(60_000);
    expect(c.em('pending', 1)).toBe(30_000);
    expect(c.em('error', 2)).toBe(120_000);
    expect(c.em('pending', 2)).toBe(30_000);
    expect(c.em('error', 3)).toBe(240_000);
  });

  it('o mesmo erro reavaliado não conta duas vezes', () => {
    const c = queryFake();
    expect(c.em('error', 1)).toBe(60_000);
    // O callback é reavaliado a cada render, com o MESMO erro: não pode dobrar.
    expect(c.em('error', 1)).toBe(60_000);
    expect(c.em('error', 1)).toBe(60_000);
    expect(c.em('error', 2)).toBe(120_000);
  });

  it('cada conversa tem a própria contagem', () => {
    const um = queryFake();
    for (let i = 1; i <= 4; i++) um.em('error', i);
    expect(um.em('error', 5)).toBe(600_000);
    // Outra conversa que falha pela primeira vez não herda o recuo da primeira.
    const dois = queryFake();
    expect(dois.em('error', 1)).toBe(60_000);
  });

  it('query recriada depois do gcTime não herda a contagem antiga', () => {
    const antes = queryFake();
    for (let i = 1; i <= 5; i++) antes.em('error', i);
    expect(antes.em('error', 6)).toBe(600_000);

    // Conversa fechada por mais que o `gcTime` sai do cache; ao reabrir, o react-query
    // cria uma query NOVA. A contagem vive na instância, então a primeira falha da nova
    // cobra 1 min — e não 10, como ocorreria com chave por `queryHash`.
    const depois = queryFake();
    expect(depois.em('pending')).toBe(30_000);
    expect(depois.em('error', 1)).toBe(60_000);
  });

  it('erro sem contador conta como primeira falha, não como zero', () => {
    expect(queryFake().em('error')).toBe(60_000);
    expect(queryFake().em('error', 0)).toBe(60_000);
  });
});
