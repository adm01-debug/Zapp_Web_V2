import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { HeroBenefits } from '../HeroBenefits';

// `useReducedMotion` do framer-motion é substituído por um interruptor do teste:
// é a única forma de exercitar o caminho de movimento reduzido no jsdom.
const movimentoReduzido = vi.hoisted(() => ({ ativo: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const real = await importOriginal<typeof import('framer-motion')>();
  return { ...real, useReducedMotion: () => movimentoReduzido.ativo };
});

/**
 * Prova do cartão: o painel esquerdo do /auth tem de mostrar os mesmos textos
 * do Zapp V3 — o título em duas linhas, os 6 benefícios com descrição e o
 * testemunho com o autor. O teste renderiza o componente REAL (sem mock de
 * conteúdo) para que trocar um texto volte a ficar vermelho.
 */
const TITULO = 'Tudo que você precisa para';
const SUBTITULO = 'atender com excelência';
const CITACAO =
  '“Nós somos o que fazemos repetidamente; a excelência, portanto, não é um ato, mas um hábito.”';

const BENEFICIOS = [
  ['Inbox Unificado', 'Todas conversas em um só lugar'],
  ['IA Integrada', 'Respostas automáticas inteligentes'],
  ['Analytics Avançado', 'Métricas em tempo real'],
  ['Multi-agentes', 'Colaboração de equipe eficiente'],
  ['SLA Tracking', 'Monitore tempos de resposta'],
  ['Segurança Total', 'Dados criptografados'],
] as const;

beforeEach(() => {
  movimentoReduzido.ativo = false;
});

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

  it('mostra a citação completa com as aspas curvas e o autor', () => {
    render(<HeroBenefits />);
    expect(screen.getByText(CITACAO)).toBeInTheDocument();
    expect(screen.getByText('Aristóteles')).toBeInTheDocument();
    expect(screen.getByText('Filósofo')).toBeInTheDocument();
  });

  it('esconde a citação no celular pela classe (hidden lg:block)', () => {
    const { container } = render(<HeroBenefits />);
    const figura = container.querySelector('figure');
    expect(figura).not.toBeNull();
    expect(figura).toHaveClass('hidden');
    expect(figura).toHaveClass('lg:block');
  });

  it('mantém só o título no celular: descrição dos benefícios escondida abaixo de lg', () => {
    render(<HeroBenefits />);
    for (const [, descricao] of BENEFICIOS) {
      expect(screen.getByText(descricao)).toHaveClass('hidden');
      expect(screen.getByText(descricao)).toHaveClass('lg:block');
    }
  });

  it('com movimento reduzido o conteúdo continua visível e nada fica deslocado', () => {
    movimentoReduzido.ativo = true;
    const { container } = render(<HeroBenefits />);

    // Conteúdo inteiro continua renderizado.
    expect(screen.getByRole('heading', { name: TITULO })).toBeInTheDocument();
    expect(screen.getByText(CITACAO)).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(BENEFICIOS.length);

    // Nada pode ficar com opacidade 0 nem com transform de entrada.
    const alvos = [
      screen.getByRole('heading', { name: TITULO }),
      screen.getByText(SUBTITULO),
      ...screen.getAllByRole('listitem'),
      container.querySelector('figure') as HTMLElement,
    ];
    for (const el of alvos) {
      expect(el).not.toHaveStyle({ opacity: '0' });
      expect(el.style.transform === '' || el.style.transform === 'none').toBe(true);
    }
  });

  it('não tem violação de acessibilidade', async () => {
    const { container } = render(<HeroBenefits />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
