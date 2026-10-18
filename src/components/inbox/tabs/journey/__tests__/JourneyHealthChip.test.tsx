/**
 * Testes do `JourneyHealthChip` (K05).
 *
 * O componente REAL é renderizado e o que o usuário vê é afirmado: o texto do chip, o
 * tom do sistema (classe, nunca cor literal) e a dica (o `title` com a regra). Nada aqui
 * depende do relógio da máquina — o `now` vai fixo por prop.
 *
 * O que o jsdom NÃO prova (e por isso não é afirmado): contraste, tamanho e layout.
 */
import { describe, it, expect, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { JourneyHealthChip } from '../JourneyHealthChip';

// O efeito do chip tem de sair do pacote `motion/` (J05). O mock troca APENAS a peça de efeito
// pelo seu desenho no DOM: o chip continua sendo o componente REAL (nenhum valor de saúde é mockado).
vi.mock('../motion', () => ({
  FadeSlideIn: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div className={className} data-testid="fade-slide-in">
      {children}
    </div>
  ),
}));

const AGORA = new Date('2026-10-15T12:00:00.000Z');
const DIA_MS = 86_400_000;

function atras(dias: number): string {
  return new Date(AGORA.getTime() - dias * DIA_MS).toISOString();
}

function renderChip(dias: number | null, recentes: string[] = []) {
  return render(
    <JourneyHealthChip
      lastInteractionAt={dias === null ? null : atras(dias)}
      recentInteractions={recentes}
      now={AGORA}
    />,
  );
}

describe('JourneyHealthChip', () => {
  it('mostra o texto do cartão e a cor do sistema de cada faixa', () => {
    const casos: { dias: number; texto: string; nivel: string; tom: string }[] = [
      { dias: 2, texto: 'Ativo: 2 dias sem contato', nivel: 'active', tom: 'text-success' },
      { dias: 20, texto: 'Esfriando: 20 dias sem contato', nivel: 'cooling', tom: 'text-warning' },
      { dias: 45, texto: 'Inativo: 45 dias sem contato', nivel: 'inactive', tom: 'text-muted-foreground' },
    ];

    for (const caso of casos) {
      const { unmount } = renderChip(caso.dias);
      const chip = screen.getByTestId('journey-health-chip');
      expect(chip).toHaveTextContent(caso.texto);
      expect(chip).toHaveAttribute('data-level', caso.nivel);
      expect(chip.className).toContain(caso.tom);
      unmount();
    }
  });

  it('Morno usa o token info', () => {
    renderChip(7);
    expect(screen.getByTestId('journey-health-chip').className).toContain('text-info');
  });

  it('segue as fronteiras: 3 = Ativo, 4 = Morno, 30 = Esfriando, 31 = Inativo', () => {
    const faixas: [number, string][] = [
      [3, 'active'],
      [4, 'warm'],
      [30, 'cooling'],
      [31, 'inactive'],
    ];
    for (const [dias, nivel] of faixas) {
      const { unmount } = renderChip(dias);
      expect(screen.getByTestId('journey-health-chip')).toHaveAttribute('data-level', nivel);
      unmount();
    }
  });

  it('sem contato registrado não inventa número nem cor de alerta', () => {
    renderChip(null);
    const chip = screen.getByTestId('journey-health-chip');
    expect(chip).toHaveTextContent('Sem contato registrado');
    expect(chip).toHaveAttribute('data-level', 'inactive');
    expect(chip.className).toContain('text-muted-foreground');
  });

  it('a dica explica a regra e a frequência recente', () => {
    renderChip(20, [atras(1), atras(2), atras(40)]);
    const chip = screen.getByTestId('journey-health-chip');
    const dica = chip.getAttribute('title') ?? '';
    expect(dica).toContain('Esfriando: 20 dias sem contato');
    expect(dica).toContain('2 interações nos últimos 30 dias');
    expect(dica).toContain('até 3 dias = Ativo');
    expect(dica).toContain('mais de 30 dias = Inativo');
  });

  it('a mesma leitura vai para o leitor de tela (aria-label)', () => {
    renderChip(20, [atras(5)]);
    const chip = screen.getByTestId('journey-health-chip');
    const rotulo = chip.getAttribute('aria-label') ?? '';
    expect(rotulo).toContain('Esfriando: 20 dias sem contato');
    expect(rotulo).toContain('1 interação nos últimos 30 dias');
    expect(rotulo).toContain('até 3 dias = Ativo');
  });

  it('não usa cor literal: nenhuma classe com hex/rgb/hsl', () => {
    renderChip(12, [atras(1)]);
    const classes = screen.getByTestId('journey-health-chip').className;
    expect(classes).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i);
  });

  it('deixa o efeito no pacote motion/ (J05) e não em CSS próprio', () => {
    renderChip(2);
    const envolucro = screen.getByTestId('fade-slide-in');
    const chip = screen.getByTestId('journey-health-chip');
    expect(envolucro).toContainElement(chip);
    expect(chip.className).not.toMatch(/animate-|transition/);
  });
});
