/**
 * Faixa de estatísticas do cartão de login (V3).
 *
 * Prova: os 4 itens (valor exato, rótulo exato e ícone lucide de cada um) e o
 * contrato de movimento reduzido — com `prefers-reduced-motion: reduce` nada se
 * desloca, ou seja, o conteúdo aparece no primeiro paint sem `initial` animado.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SocialProof } from '../SocialProof';

// `useReducedMotion` lê um singleton inicializado uma única vez; trocar o
// matchMedia no meio do arquivo não surte efeito. Aqui só o hook é substituído —
// o resto do framer-motion segue real, então as asserções são sobre o DOM que ele
// de fato produz.
const reduceMotion = { value: false };

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  return { ...actual, useReducedMotion: () => reduceMotion.value };
});

const ITENS = [
  ['10k+', 'Usuários ativos', 'lucide-users'],
  ['1M+', 'Mensagens/dia', 'lucide-message-square'],
  ['99.9%', 'Uptime', 'lucide-zap'],
  ['100%', 'Seguro', 'lucide-shield'],
] as const;

beforeEach(() => {
  reduceMotion.value = false;
});

describe('SocialProof — estatísticas (V3)', () => {
  it('mostra os 4 valores e os 4 rótulos exatos', () => {
    render(<SocialProof />);

    for (const [valor, rotulo] of ITENS) {
      expect(screen.getByText(valor)).toBeInTheDocument();
      expect(screen.getByText(rotulo)).toBeInTheDocument();
    }
  });

  it('cada item traz o seu ícone lucide', () => {
    const { container } = render(<SocialProof />);

    expect(container.querySelectorAll('svg')).toHaveLength(4);
    for (const [, , classe] of ITENS) {
      expect(container.querySelector(`.${classe}`)).not.toBeNull();
    }
  });

  it('sem redução, a faixa entra deslocando (estado inicial do 1º paint)', () => {
    reduceMotion.value = false;
    const { container } = render(<SocialProof />);

    const faixa = container.querySelector('[data-testid="social-proof"]') as HTMLElement;
    expect(faixa.style.opacity).toBe('0');
    expect(faixa.style.transform).toContain('translate');
  });

  it('com movimento reduzido, nada se desloca (estado final no 1º paint)', () => {
    reduceMotion.value = true;
    const { container } = render(<SocialProof />);

    const faixa = container.querySelector('[data-testid="social-proof"]') as HTMLElement;
    expect(faixa.style.opacity).not.toBe('0');
    expect(faixa.style.transform).not.toContain('translate');

    const itens = container.querySelectorAll('[data-testid="social-proof-item"]');
    expect(itens).toHaveLength(4);
    for (const item of itens) {
      const el = item as HTMLElement;
      expect(el.style.opacity).not.toBe('0');
      expect(el.style.transform).not.toContain('scale');
    }

    // o conteúdo continua na tela — só a animação foi pulada
    expect(screen.getByText('Mensagens/dia')).toBeInTheDocument();
  });
});
