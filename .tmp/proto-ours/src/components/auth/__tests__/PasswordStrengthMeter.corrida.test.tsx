import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createHash } from 'node:crypto';
import React from 'react';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';

/**
 * R2-AUTH-031 — item 256: "Resposta de verificacao da senha anterior pode
 * substituir o veredito da senha atual".
 *
 * O efeito de checagem de vazamento cancelava so o timer do debounce: uma
 * consulta ja em voo resolvia depois da troca de senha e escrevia
 * isBreached/breachCount/checkingBreach sem conferir se ainda era a consulta
 * vigente. O veredito exibido ficava solto do valor que ele descreve.
 *
 * Estes testes seguram cada fetch numa promise controlada pelo teste e
 * resolvem na ordem escolhida, provando:
 *   A/B) nas duas ordens de resolucao, so a resposta da senha ATUAL vale;
 *   C)   consulta antiga resolvendo depois da troca para senha curta nao
 *        exibe veredito dela;
 *   D)   o veredito da senha anterior some na hora ao trocar de senha;
 *   E)   falha de rede (rejeicao) ou !ok da consulta antiga nao apaga nem
 *        troca o veredito da consulta vigente.
 *   F)   ao voltar para a MESMA senha (A -> B -> A), a consulta original
 *        encerrada nao sobrescreve o veredito da consulta vigente;
 *   G)   a resposta da consulta antiga nao derruba o aviso de "verificando"
 *        da consulta vigente nem antecipa o veredito dela.
 */

function sha1Upper(value: string): string {
  return createHash('sha1').update(value, 'utf8').digest('hex').toUpperCase();
}

interface RespostaFalsa {
  ok: boolean;
  text: () => Promise<string>;
}

interface ControleFetch {
  fetchMock: ReturnType<typeof vi.fn>;
  /** Promessas pendentes na ordem em que o componente chamou fetch. */
  chamadas: Array<{
    url: string;
    resolver: (r: RespostaFalsa) => void;
    rejeitar: (e: unknown) => void;
  }>;
}

function mockFetchControlado(): ControleFetch {
  const chamadas: ControleFetch['chamadas'] = [];
  const fetchMock = vi.fn((input: string, _init?: RequestInit) => {
    return new Promise<RespostaFalsa>((resolver, rejeitar) => {
      chamadas.push({ url: input, resolver, rejeitar });
    }) as unknown as Promise<Response>;
  });
  vi.stubGlobal('fetch', fetchMock);
  return { fetchMock, chamadas };
}

/** Corpo HIBP contendo o sufixo SHA-1 da senha = senha vazada. */
function corpoVazada(senha: string, vazamentos = 321): string {
  return `${'0'.repeat(35)}:9\n${sha1Upper(senha).slice(5)}:${vazamentos}\n`;
}

/** Corpo HIBP com sufixos que nao casam = senha nao vazada. */
const CORPO_LIMPO = `${'0'.repeat(35)}:7\n${'1'.repeat(35)}:2\n`;

const respostaOk = (corpo: string): RespostaFalsa => ({
  ok: true,
  text: async () => corpo,
});

const SENHA_A = 'Antiga!Senha1';
const SENHA_B = 'Atual#Senha2';

const TXT_COMPROMETIDA = 'Senha comprometida!';
const TXT_LIMPA = 'Senha não encontrada em vazamentos conhecidos';

async function esperarFetch(chamadas: ControleFetch['chamadas'], total: number) {
  await waitFor(() => expect(chamadas.length).toBe(total), { timeout: 4000 });
}

/** Resolve uma chamada e da tempo de a cadeia de microtasks assentar. */
async function resolver(
  chamada: ControleFetch['chamadas'][number],
  resposta: RespostaFalsa,
) {
  await act(async () => {
    chamada.resolver(resposta);
    await new Promise((r) => setTimeout(r, 30));
  });
}

async function rejeitar(
  chamada: ControleFetch['chamadas'][number],
  erro: unknown,
) {
  await act(async () => {
    chamada.rejeitar(erro);
    await new Promise((r) => setTimeout(r, 30));
  });
}

/**
 * Da tempo de uma resposta tardia errada produzir efeito observavel: cobre a
 * cadeia de microtasks da consulta e a animacao de saida do AnimatePresence
 * (~300 ms). Sem isso, assercoes de "permaneceu" passam numa janela cega.
 */
async function assentar() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600));
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PasswordStrengthMeter — corrida entre consultas de vazamento (R2-AUTH-031)', () => {
  it('vale o veredito da senha atual quando a resposta "vazada" da antiga chega por ultimo', async () => {
    const { chamadas } = mockFetchControlado();
    const { rerender } = render(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 1);

    rerender(<PasswordStrengthMeter password={SENHA_B} />);
    await esperarFetch(chamadas, 2);

    // A consulta da senha ATUAL responde primeiro: nao vazada.
    await resolver(chamadas[1], respostaOk(CORPO_LIMPO));
    expect(await screen.findByText(TXT_LIMPA)).toBeInTheDocument();

    // A consulta ANTIGA termina depois, dizendo "vazada": nao pode valer.
    await resolver(chamadas[0], respostaOk(corpoVazada(SENHA_A)));

    expect(screen.queryByText(TXT_COMPROMETIDA)).not.toBeInTheDocument();
    expect(screen.getByText(TXT_LIMPA)).toBeInTheDocument();
  });

  it('vale o veredito da senha atual quando a resposta "limpa" da antiga chega por ultimo', async () => {
    const { chamadas } = mockFetchControlado();
    const { rerender } = render(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 1);

    rerender(<PasswordStrengthMeter password={SENHA_B} />);
    await esperarFetch(chamadas, 2);

    // A consulta da senha ATUAL responde primeiro: vazada.
    await resolver(chamadas[1], respostaOk(corpoVazada(SENHA_B)));
    expect(await screen.findByText(TXT_COMPROMETIDA)).toBeInTheDocument();

    // A consulta ANTIGA termina depois, dizendo "limpa": nao pode apagar o alerta.
    await resolver(chamadas[0], respostaOk(CORPO_LIMPO));

    await waitFor(() =>
      expect(screen.queryByText(TXT_LIMPA)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(TXT_COMPROMETIDA)).toBeInTheDocument();
  });

  it('nao exibe o veredito da consulta antiga ao trocar para senha curta (menos de 8)', async () => {
    const { chamadas } = mockFetchControlado();
    const { rerender } = render(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 1);

    // Troca para senha curta: nem debounce nem nova consulta existem para ela.
    rerender(<PasswordStrengthMeter password="Aa1!x" />);

    // A consulta antiga resolve "vazada" depois da troca: nao pode aparecer.
    await resolver(chamadas[0], respostaOk(corpoVazada(SENHA_A)));

    await waitFor(() => {
      expect(screen.queryByText(TXT_COMPROMETIDA)).not.toBeInTheDocument();
      expect(screen.queryByText(TXT_LIMPA)).not.toBeInTheDocument();
    });
  });

  it('some com o veredito da senha anterior na hora da troca, antes de a nova consulta responder', async () => {
    const { chamadas } = mockFetchControlado();
    const onStrengthChange = vi.fn();
    const { rerender } = render(
      <PasswordStrengthMeter password={SENHA_A} onStrengthChange={onStrengthChange} />,
    );
    await esperarFetch(chamadas, 1);

    await resolver(chamadas[0], respostaOk(corpoVazada(SENHA_A)));
    expect(await screen.findByText(TXT_COMPROMETIDA)).toBeInTheDocument();
    // A vazada e atende todos os requisitos: isValid=false por causa do veredito.
    expect(onStrengthChange.mock.lastCall?.[1]).toBe(false);

    // Troca para B com a consulta de B ainda pendente: o veredito de A nao
    // pode continuar valendo nem na tela nem no estado reportado ao pai.
    onStrengthChange.mockClear();
    rerender(
      <PasswordStrengthMeter password={SENHA_B} onStrengthChange={onStrengthChange} />,
    );

    // isValid vira true imediatamente: B atende os requisitos e nao herda o
    // veredito de A. Sem a correcao isBreached segue true -> isValid fica false.
    await waitFor(() =>
      expect(onStrengthChange.mock.lastCall?.[1]).toBe(true),
    );

    // Na tela, o alerta de A sai antes de o debounce de B (500 ms) poder
    // disparar qualquer coisa.
    await waitFor(
      () => expect(screen.queryByText(TXT_COMPROMETIDA)).not.toBeInTheDocument(),
      { timeout: 450 },
    );
    expect(screen.queryByText(TXT_LIMPA)).not.toBeInTheDocument();

    // A consulta de B ainda pode responder depois, com o veredito DELA.
    await esperarFetch(chamadas, 2);
    await resolver(chamadas[1], respostaOk(CORPO_LIMPO));
    expect(await screen.findByText(TXT_LIMPA)).toBeInTheDocument();
  });

  it('rejeicao de rede da consulta antiga nao apaga o veredito da senha atual', async () => {
    const { chamadas } = mockFetchControlado();
    const onStrengthChange = vi.fn();
    const { rerender } = render(
      <PasswordStrengthMeter password={SENHA_A} onStrengthChange={onStrengthChange} />,
    );
    await esperarFetch(chamadas, 1);

    rerender(
      <PasswordStrengthMeter password={SENHA_B} onStrengthChange={onStrengthChange} />,
    );
    await esperarFetch(chamadas, 2);

    await resolver(chamadas[1], respostaOk(corpoVazada(SENHA_B)));
    expect(await screen.findByText(TXT_COMPROMETIDA)).toBeInTheDocument();
    // B vazada: isValid=false por causa do veredito vigente.
    expect(onStrengthChange.mock.lastCall?.[1]).toBe(false);

    // Falha de rede da consulta ANTIGA nao pode apagar o alerta vigente.
    await rejeitar(chamadas[0], new Error('rede fora'));
    await assentar();

    // Sem a correcao o catch antigo zera isBreached: o alerta sai do DOM e
    // isValid vira true para uma senha que segue marcada como vazada.
    expect(onStrengthChange.mock.lastCall?.[1]).toBe(false);
    expect(screen.getByText(TXT_COMPROMETIDA)).toBeInTheDocument();
  });

  it('resposta !ok da consulta antiga nao apaga o veredito da senha atual', async () => {
    const { chamadas } = mockFetchControlado();
    const onStrengthChange = vi.fn();
    const { rerender } = render(
      <PasswordStrengthMeter password={SENHA_A} onStrengthChange={onStrengthChange} />,
    );
    await esperarFetch(chamadas, 1);

    rerender(
      <PasswordStrengthMeter password={SENHA_B} onStrengthChange={onStrengthChange} />,
    );
    await esperarFetch(chamadas, 2);

    await resolver(chamadas[1], respostaOk(corpoVazada(SENHA_B)));
    expect(await screen.findByText(TXT_COMPROMETIDA)).toBeInTheDocument();
    expect(onStrengthChange.mock.lastCall?.[1]).toBe(false);

    // Resposta de erro HTTP da consulta ANTIGA tambem nao pode apagar o alerta.
    await resolver(chamadas[0], { ok: false, text: async () => '' });
    await assentar();

    expect(onStrengthChange.mock.lastCall?.[1]).toBe(false);
    expect(screen.getByText(TXT_COMPROMETIDA)).toBeInTheDocument();
  });

  it('nao deixa a consulta original do mesmo texto sobrescrever o veredito ao voltar para a senha (A -> B -> A)', async () => {
    const { chamadas } = mockFetchControlado();
    const { rerender } = render(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 1);

    rerender(<PasswordStrengthMeter password={SENHA_B} />);
    await esperarFetch(chamadas, 2);

    // Volta para SENHA_A: a consulta vigente passa a ser a TERCEIRA, mas
    // descreve o MESMO texto da primeira. Pelo valor nao da para distinguir as
    // duas -- so a geracao separa a consulta encerrada da vigente.
    rerender(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 3);

    // A consulta vigente (indice 2) responde: nao vazada.
    await resolver(chamadas[2], respostaOk(CORPO_LIMPO));
    expect(await screen.findByText(TXT_LIMPA)).toBeInTheDocument();

    // A consulta ORIGINAL de SENHA_A (indice 0) resolve depois dizendo
    // "vazada": mesma senha na tela, consulta encerrada -- nao pode valer.
    await resolver(chamadas[0], respostaOk(corpoVazada(SENHA_A)));

    await waitFor(() =>
      expect(screen.queryByText(TXT_COMPROMETIDA)).not.toBeInTheDocument(),
    );
    expect(screen.getByText(TXT_LIMPA)).toBeInTheDocument();
  });

  it('resposta da consulta antiga nao derruba o carregamento da consulta vigente', async () => {
    const { chamadas } = mockFetchControlado();
    const { rerender } = render(<PasswordStrengthMeter password={SENHA_A} />);
    await esperarFetch(chamadas, 1);

    rerender(<PasswordStrengthMeter password={SENHA_B} />);
    await esperarFetch(chamadas, 2);
    // A consulta vigente (B) esta em voo: o aviso de checagem tem de estar na tela.
    expect(
      await screen.findByText('Verificando em bancos de vazamentos...'),
    ).toBeInTheDocument();

    // A consulta antiga (A) resolve "limpa" enquanto B ainda espera: nem o
    // aviso de checagem da vigente cai, nem o veredito dela aparece antes da hora.
    await resolver(chamadas[0], respostaOk(CORPO_LIMPO));
    await assentar();

    expect(
      screen.getByText('Verificando em bancos de vazamentos...'),
    ).toBeInTheDocument();
    expect(screen.queryByText(TXT_LIMPA)).not.toBeInTheDocument();
    expect(screen.queryByText(TXT_COMPROMETIDA)).not.toBeInTheDocument();

    // Agora sim: a consulta vigente responde com o veredito DELA.
    await resolver(chamadas[1], respostaOk(corpoVazada(SENHA_B)));
    expect(await screen.findByText(TXT_COMPROMETIDA)).toBeInTheDocument();
  });
});
