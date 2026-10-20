import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import React from 'react';
import { AccessibleToastProvider, useAccessibleToast } from '@/components/ui/accessible-toast';

// O ambiente do vitest entrega `import.meta.url` como URL http; a leitura da fonte vai
// pelo diretório da cópia de trabalho.
const FONTE = readFileSync(resolve(process.cwd(), 'src/components/ui/accessible-toast.tsx'), 'utf8');

const SAIDA_MS = 300;

function Disparador() {
  const { addToast, updateToast } = useAccessibleToast();
  return (
    <div>
      <button onClick={() => addToast({ message: 'Salvo com sucesso', type: 'success' })}>sucesso</button>
      <button
        onClick={() => addToast({ message: 'Enviando…', description: 'aguarde', type: 'loading' })}
        data-testid="carregando"
      >
        carregando
      </button>
      <button
        onClick={() => {
          const id = addToast({ message: 'Enviando…', type: 'loading' });
          updateToast(id, { message: 'Enviado', type: 'success' });
        }}
        data-testid="promove"
      >
        promove
      </button>
    </div>
  );
}

function montar() {
  return render(
    <AccessibleToastProvider>
      <Disparador />
    </AccessibleToastProvider>,
  );
}

const alerta = () => screen.queryByRole('alert');
const barraDeProgresso = () => document.querySelector('[role="alert"] .absolute') as HTMLElement | null;

beforeEach(() => {
  vi.useFakeTimers();
  document.documentElement.classList.remove('reduced-motion');
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

describe('AccessibleToastProvider — comportamento preservado sem o runtime de animação', () => {
  it('anuncia o toast na região viva e entra com a animação do tema', () => {
    montar();
    fireEvent.click(screen.getByText('sucesso'));

    expect(screen.getByText('Salvo com sucesso')).toBeDefined();
    const regiao = document.querySelector('[role="region"]') as HTMLElement;
    expect(regiao.getAttribute('aria-live')).toBe('polite');
    expect(regiao.getAttribute('aria-label')).toBe('Notificações');
    expect(alerta()?.getAttribute('aria-atomic')).toBe('true');
    expect(alerta()?.className).toContain('motion-safe:animate-slide-up');
    expect(alerta()?.className).toContain('bg-success/10');
  });

  it('a barra de progresso acompanha a duração do toast', () => {
    montar();
    fireEvent.click(screen.getByText('sucesso'));

    expect(barraDeProgresso()?.style.width).toBe('100%');

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(barraDeProgresso()?.style.width).toBe('80%');
    expect(barraDeProgresso()?.className).toContain('motion-safe:transition-all');
  });

  it('fechar à mão anima a saída e só então desmonta o toast', () => {
    montar();
    fireEvent.click(screen.getByText('sucesso'));

    fireEvent.click(screen.getByLabelText('Fechar notificação'));

    // Continua montado, com a animação de saída do tema.
    expect(alerta()?.className).toContain('motion-safe:animate-exit');

    act(() => {
      vi.advanceTimersByTime(SAIDA_MS);
    });
    expect(alerta()).toBeNull();
  });

  it('sem interação o toast se fecha sozinho depois da duração e sai animado', () => {
    montar();
    fireEvent.click(screen.getByText('sucesso'));

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(alerta()?.className).toContain('motion-safe:animate-exit');

    act(() => {
      vi.advanceTimersByTime(SAIDA_MS);
    });
    expect(alerta()).toBeNull();
  });

  it('toast de carregamento não tem botão de fechar e não expira', () => {
    montar();
    fireEvent.click(screen.getByTestId('carregando'));

    expect(screen.queryByLabelText('Fechar notificação')).toBeNull();

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(screen.getByText('Enviando…')).toBeDefined();
  });

  it('promover o toast de carregamento para sucesso mantém o mesmo nó', () => {
    montar();
    fireEvent.click(screen.getByTestId('promove'));

    expect(screen.getByRole('alert')).toBeDefined();
    expect(screen.getByText('Enviado')).toBeDefined();
    expect(screen.queryByLabelText('Fechar notificação')).not.toBeNull();
    expect(screen.getAllByRole('alert')).toHaveLength(1);
  });

  it('com movimento reduzido não fica esperando a animação de saída', () => {
    document.documentElement.classList.add('reduced-motion');
    montar();
    fireEvent.click(screen.getByText('sucesso'));

    fireEvent.click(screen.getByLabelText('Fechar notificação'));
    act(() => {
      vi.advanceTimersByTime(0);
    });

    expect(alerta()).toBeNull();
  });
});

describe('accessible-toast.tsx — sem o runtime de animação no caminho inicial (SL-103A)', () => {
  it('não importa nem usa o runtime de animação por JS', () => {
    expect(FONTE).not.toMatch(/from ['"]framer-motion['"]/);
    expect(FONTE).not.toMatch(/\bmotion\.[a-z]/);
    expect(FONTE).not.toMatch(/\bAnimatePresence\b/);
    expect(FONTE).not.toMatch(/whileHover=/);
    expect(FONTE).not.toMatch(/whileTap=/);
  });
});
