import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { HeroBenefits } from '../HeroBenefits';

/**
 * Prova do cartão: o painel esquerdo do /auth tem de mostrar os mesmos textos
 * do Zapp V3 — o título em duas linhas, os 6 benefícios com descrição e o
 * testemunho com o autor. O teste renderiza o componente REAL (sem mock de
 * conteúdo) para que trocar um texto volte a ficar vermelho.
 */
const TITULO = 'Tudo que você precisa para';
const SUBTITULO = 'atender com excelência';

const BENEFICIOS = [
  ['Inbox Unificado', 'Todas conversas em um só lugar'],
  ['IA Integrada', 'Respostas automáticas inteligentes'],
  ['Analytics Avançado', 'Métricas em tempo real'],
  ['Multi-agentes', 'Colaboração de equipe eficiente'],
  ['SLA Tracking', 'Monitore tempos de resposta'],
  ['Segurança Total', 'Dados criptografados'],
] as const;

describe('HeroBenefits (painel esquerdo do /auth)', () => {
  it('mostra o título do V3 nas duas linhas', () => {
    render(<HeroBenefits />);
    expect(screen.getByRole('heading', { name: TITULO })).toBeInTheDocument();
    expect(screen.getByText(SUBTITULO)).toBeInTheDocument();
  });

  it('mostra os 6 benefícios, cada um com sua descrição', () => {
    render(<HeroBenefits />);
    const itens = screen.getAllByRole('listitem');
    expect(itens).toHaveLength(BENEFICIOS.length);

    for (const [titulo, descricao] of BENEFICIOS) {
      expect(screen.getByRole('heading', { name: titulo })).toBeInTheDocument();
      expect(screen.getByText(descricao)).toBeInTheDocument();
    }
  });

  it('mostra o testemunho com o autor', () => {
    render(<HeroBenefits />);
    expect(screen.getByText(/não é um ato, mas um\s+hábito/i)).toBeInTheDocument();
    expect(screen.getByText('Aristóteles')).toBeInTheDocument();
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<HeroBenefits />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
