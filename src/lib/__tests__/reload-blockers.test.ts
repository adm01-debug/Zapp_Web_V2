import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  haBloqueioRecarga,
  observarBloqueiosRecarga,
  registrarBloqueioRecarga,
} from '@/lib/reload-blockers';

// O registro e um singleton de modulo: cada teste limpa o que abriu para nao vazar estado.
const limpezasDeBloqueio: Array<() => void> = [];
const limpezasDeObservador: Array<() => void> = [];

function registrar(motivo: string) {
  const limpar = registrarBloqueioRecarga(motivo);
  limpezasDeBloqueio.push(limpar);
  return limpar;
}

function observar(listener: (bloqueado: boolean) => void) {
  const parar = observarBloqueiosRecarga(listener);
  limpezasDeObservador.push(parar);
  return parar;
}

afterEach(() => {
  while (limpezasDeObservador.length > 0) limpezasDeObservador.pop()?.();
  while (limpezasDeBloqueio.length > 0) limpezasDeBloqueio.pop()?.();
});

describe('registro central de bloqueios de recarga', () => {
  it('comeca livre e fica bloqueado apenas enquanto houver registro ativo', () => {
    expect(haBloqueioRecarga()).toBe(false);

    const limpar = registrar('mensagem-em-edicao');
    expect(haBloqueioRecarga()).toBe(true);

    limpar();
    expect(haBloqueioRecarga()).toBe(false);
  });

  it('criterio 1: dois registros simultaneos so liberam quando as duas limpezas ocorrem', () => {
    const primeiro = registrar('mensagem-em-edicao');
    const segundo = registrar('chamada-ativa');

    expect(haBloqueioRecarga()).toBe(true);

    primeiro();
    expect(haBloqueioRecarga()).toBe(true);

    segundo();
    expect(haBloqueioRecarga()).toBe(false);
  });

  it('trata registros de mesmo motivo como independentes (token unico por registro)', () => {
    const primeiro = registrar('mesmo-motivo');
    const segundo = registrar('mesmo-motivo');

    expect(haBloqueioRecarga()).toBe(true);

    primeiro();
    expect(haBloqueioRecarga()).toBe(true);

    segundo();
    expect(haBloqueioRecarga()).toBe(false);
  });

  it('criterio 2: limpeza repetida e idempotente e nao afeta os demais registros', () => {
    const primeiro = registrar('mensagem-em-edicao');
    const segundo = registrar('chamada-ativa');

    primeiro();
    primeiro();
    primeiro();

    expect(haBloqueioRecarga()).toBe(true);

    segundo();
    expect(haBloqueioRecarga()).toBe(false);
  });

  it('criterio 2: limpeza repetida nao emite transicao duplicada', () => {
    const listener = vi.fn();
    observar(listener);

    const limpar = registrar('mensagem-em-edicao');
    limpar();
    limpar();

    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('criterio 3: observador recebe so as transicoes agregadas livre->bloqueado e bloqueado->livre', () => {
    const listener = vi.fn();
    observar(listener);

    const primeiro = registrar('mensagem-em-edicao');
    const segundo = registrar('chamada-ativa');

    // O segundo bloqueio nao muda o estado agregado: nao ha aviso novo.
    expect(listener.mock.calls).toEqual([[true]]);

    primeiro();
    expect(listener.mock.calls).toEqual([[true]]);

    segundo();
    expect(listener.mock.calls).toEqual([[true], [false]]);
  });

  it('criterio 3: observador deixa de receber depois da propria limpeza', () => {
    const listener = vi.fn();
    const parar = observar(listener);

    const limpar = registrar('mensagem-em-edicao');
    expect(listener.mock.calls).toEqual([[true]]);

    parar();
    limpar();

    expect(listener.mock.calls).toEqual([[true]]);
  });

  it('nao avisa o observador ao se inscrever: so a proxima transicao conta', () => {
    const limparAnterior = registrar('mensagem-em-edicao');

    const listener = vi.fn();
    observar(listener);
    expect(listener).not.toHaveBeenCalled();

    limparAnterior();
    expect(listener.mock.calls).toEqual([[false]]);
  });

  it('avisa todos os observadores ativos e isola falha de um deles', () => {
    const primeiro = vi.fn();
    const quebrado = vi.fn(() => {
      throw new Error('observador com defeito');
    });
    const terceiro = vi.fn();
    observar(primeiro);
    observar(quebrado);
    observar(terceiro);

    const limpar = registrar('mensagem-em-edicao');

    expect(primeiro.mock.calls).toEqual([[true]]);
    expect(quebrado.mock.calls).toEqual([[true]]);
    expect(terceiro.mock.calls).toEqual([[true]]);

    limpar();
  });
});
