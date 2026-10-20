/**
 * t_148b3c50 — o medidor de força passa a expor o valor e o estado dos
 * requisitos para leitores de tela.
 *
 * Antes: a barra era só visual (sem role="progressbar"/aria-valuenow) e os
 * requisitos eram ditos apenas por cor e ícone — quem usa leitor de tela não
 * sabia o percentual nem quais requisitos faltavam.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { PasswordStrengthMeter } from '../PasswordStrengthMeter';

function mockFetch(body: string) {
  const fetchMock = vi.fn(async () => ({ ok: true, text: async () => body }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PasswordStrengthMeter — acessibilidade (t_148b3c50)', () => {
  it('a barra é um progressbar nomeado com valor atual e texto', () => {
    mockFetch('0000000000000000000000000000000000:1\n');
    render(<PasswordStrengthMeter password="Abcdef1!" />);

    const barra = screen.getByRole('progressbar', { name: 'Força da senha' });
    // 5 requisitos atendidos (8+ chars, maiúscula, minúscula, número, especial),
    // sem bônus de comprimento: 5/6 => 83%.
    expect(barra.getAttribute('aria-valuenow')).toBe('83');
    expect(barra.getAttribute('aria-valuemin')).toBe('0');
    expect(barra.getAttribute('aria-valuemax')).toBe('100');
    expect(barra.getAttribute('aria-valuetext')).toBe('Forte');
  });

  it('cada requisito diz em texto se está atendido ou pendente', () => {
    mockFetch('0000000000000000000000000000000000:1\n');
    render(<PasswordStrengthMeter password="abcdefgh" />);

    // 'abcdefgh' atende 8+ caracteres e minúscula; faltam maiúscula, número e especial.
    expect(screen.getAllByText(/requisito atendido/)).toHaveLength(2);
    expect(screen.getAllByText(/requisito pendente/)).toHaveLength(3);
  });
});
