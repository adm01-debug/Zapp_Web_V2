import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MFABackupCodes } from '../MFABackupCodes';

/**
 * S2245 aqui e vulnerabilidade de verdade, nao enfeite: os codigos de backup de
 * MFA sao a ultima credencial de recuperacao da conta e, com `Math.random()`
 * (PRNG previsivel), sao adivinhaveis a partir de saidas observadas. A fonte tem
 * de ser criptografica.
 *
 * O que NAO pode mudar, porque quem valida o codigo depois depende do formato:
 * `XXXX-XXXX`, 4+4 caracteres do alfabeto base36 MAIUSCULO ('0-9A-Z') e o
 * separador '-'. Nada disso e persistido pelo componente (ele so renderiza e
 * baixa o arquivo do usuario), comparado por regex fora deste teste nem enviado
 * ao banco — os codigos de producao vem do servidor de auth (comentario do
 * proprio arquivo). Por isso o sorteio pode trocar de fonte sem trocar o formato.
 */
const FORMATO = /^[A-Z0-9]{4}-[A-Z0-9]{4}$/;
const PARTE_BASE36 = /^[0-9A-Z]{4}$/;

function codigosNaTela(): string[] {
  return screen.getAllByText(FORMATO).map((elemento) => elemento.textContent ?? '');
}

function renderizarLote(): string[] {
  const { unmount } = render(<MFABackupCodes />);
  const codigos = codigosNaTela();
  unmount();
  return codigos;
}

describe('MFABackupCodes — os codigos de backup vem de fonte criptografica', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sorteia cada parte por crypto.getRandomValues (nao por Math.random)', () => {
    const espiao = vi.spyOn(globalThis.crypto, 'getRandomValues');

    const codigos = renderizarLote();

    expect(codigos).toHaveLength(10);
    // 10 codigos x 2 partes x 4 caracteres = 80 sorteios, no minimo.
    expect(espiao.mock.calls.length).toBeGreaterThanOrEqual(80);
  });

  it('preserva o formato XXXX-XXXX: 4+4 caracteres base36 maiusculo, com o separador', () => {
    for (const codigo of renderizarLote()) {
      expect(codigo).toMatch(FORMATO);
      const [parte1, parte2] = codigo.split('-');
      expect(parte1).toMatch(PARTE_BASE36);
      expect(parte2).toMatch(PARTE_BASE36);
      expect(parte1).toHaveLength(4);
      expect(parte2).toHaveLength(4);
      expect(codigo).toBe(codigo.toUpperCase());
    }
  });

  it('nao repete dentro do lote nem entre lotes (o codigo e sorteado)', () => {
    const loteA = renderizarLote();
    const loteB = renderizarLote();

    expect(new Set(loteA).size).toBe(loteA.length);
    expect(new Set(loteB).size).toBe(loteB.length);
    expect(loteA.filter((codigo) => loteB.includes(codigo))).toEqual([]);
  });
});
