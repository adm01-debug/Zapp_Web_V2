import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('framer-motion', () => ({
  motion: new Proxy({}, {
    get: (_t, tag: string) => (props: Record<string, unknown>) => {
      const { children, initial, animate, exit, transition, layout, ...rest } = props;
      return React.createElement(tag, rest as Record<string, unknown>, children as React.ReactNode);
    },
  }),
  AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

import { SummaryResult } from '../summary/SummaryResult';

const NARRACAO = 'RESUMO COMPLETO NARRADO';

function setup(over: Partial<React.ComponentProps<typeof SummaryResult>> = {}) {
  const props = {
    summary: {
      summary: 'Cliente pediu orçamento',
      keyPoints: ['Quer 500 unidades', 'Prazo de 10 dias'],
      nextSteps: ['Enviar proposta'],
    },
    isTtsPlaying: false,
    isTtsLoading: false,
    lastTtsText: null as string | null,
    onPlayTts: vi.fn(),
    buildFullNarrationText: () => NARRACAO,
    ...over,
  };
  const utils = render(<SummaryResult {...props} />);
  const iconButtons = () => Array.from(utils.container.querySelectorAll('button.h-8.w-8')) as HTMLElement[];
  return { ...utils, props, iconButtons };
}

beforeEach(() => cleanup());

describe('SummaryResult — conteúdo', () => {
  it('mostra o resumo, os pontos-chave e os próximos passos', () => {
    setup();
    expect(screen.getByText('Cliente pediu orçamento')).toBeInTheDocument();
    expect(screen.getByText('Quer 500 unidades')).toBeInTheDocument();
    expect(screen.getByText('Prazo de 10 dias')).toBeInTheDocument();
    expect(screen.getByText('Enviar proposta')).toBeInTheDocument();
  });

  it('esconde os pontos-chave quando a lista está vazia', () => {
    setup({ summary: { summary: 'Só resumo', keyPoints: [] } });
    expect(screen.queryByText('Pontos-chave')).toBeNull();
    expect(screen.getByText('Só resumo')).toBeInTheDocument();
  });

  it('esconde os próximos passos quando não existem', () => {
    setup({ summary: { summary: 'Só resumo', keyPoints: ['a'] } });
    expect(screen.queryByText('Próximos passos')).toBeNull();
  });
});

describe('SummaryResult — narração', () => {
  it('"Ouvir Tudo" narra o texto completo', () => {
    const { props } = setup();
    fireEvent.click(screen.getByRole('button', { name: /Ouvir Tudo/ }));
    expect(props.onPlayTts).toHaveBeenCalledWith(NARRACAO);
  });

  it('o botão do resumo narra só o resumo', () => {
    const { props, iconButtons } = setup();
    fireEvent.click(iconButtons()[0]);
    expect(props.onPlayTts).toHaveBeenCalledWith('Cliente pediu orçamento');
  });

  it('o botão dos pontos-chave junta os itens numa frase', () => {
    const { props, iconButtons } = setup();
    fireEvent.click(iconButtons()[1]);
    expect(props.onPlayTts).toHaveBeenCalledWith('Pontos-chave: Quer 500 unidades. Prazo de 10 dias');
  });
});

describe('SummaryResult — estados de reprodução', () => {
  it('"Ouvir Tudo" vira "Parar" enquanto toca', () => {
    setup({ isTtsPlaying: true });
    expect(screen.getByRole('button', { name: /Parar/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Ouvir Tudo/ })).toBeNull();
  });

  it('desabilita os botões de áudio enquanto está carregando', () => {
    const { iconButtons } = setup({ isTtsLoading: true, lastTtsText: 'Cliente pediu orçamento' });
    iconButtons().forEach((b) => expect(b).toBeDisabled());
    expect(screen.getByRole('button', { name: /Ouvir Tudo/ })).toBeDisabled();
  });

  it('só troca o ícone do trecho que está tocando agora', () => {
    const { iconButtons } = setup({ isTtsPlaying: true, lastTtsText: 'Cliente pediu orçamento' });
    expect(iconButtons()[0].querySelector('.lucide-volume-x')).not.toBeNull();
    expect(iconButtons()[1].querySelector('.lucide-volume-2')).not.toBeNull();
  });
});
