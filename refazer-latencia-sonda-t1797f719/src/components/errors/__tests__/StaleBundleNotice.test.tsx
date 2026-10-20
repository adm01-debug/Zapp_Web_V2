import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { StaleBundleNotice } from '@/components/errors/StaleBundleNotice';

const reduzir = vi.hoisted(() => ({ value: false }));

vi.mock('framer-motion', async (importOriginal) => {
  const actual = await importOriginal<typeof import('framer-motion')>();
  const montar = (tag: string) => (props: Record<string, unknown>) => {
    const { children, initial, animate, transition, ...rest } = props;
    const ini = initial as { opacity?: number } | false | undefined;
    return React.createElement(
      tag,
      {
        ...rest,
        'data-opacidade-inicial': ini === false ? 'false' : String(ini?.opacity ?? 'nenhuma'),
        'data-rotacao': String((animate as { rotate?: number } | undefined)?.rotate ?? 'nenhuma'),
        'data-duracao': String(
          (transition as { duration?: number } | undefined)?.duration ?? 'nenhuma'
        ),
      },
      children as React.ReactNode
    );
  };
  return {
    ...actual,
    motion: { div: montar('div') },
    useReducedMotion: () => reduzir.value,
  };
});

const reload = vi.fn();

describe('StaleBundleNotice', () => {
  beforeEach(() => {
    sessionStorage.clear();
    reload.mockClear();
    reduzir.value = false;
    Object.defineProperty(window, 'location', {
      configurable: true,
      writable: true,
      value: { reload },
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('mostra a tela calma com o botao primario', () => {
    render(<StaleBundleNotice />);
    expect(screen.getByText(/Nova versão disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Atualizar agora/i })).toBeInTheDocument();
  });

  it('sem movimento reduzido: entra subindo e o icone gira uma vez', () => {
    const { container } = render(<StaleBundleNotice />);
    expect(container.querySelector('[data-opacidade-inicial="0"]')).not.toBeNull();
    expect(container.querySelector('[data-rotacao="360"]')).not.toBeNull();
    expect(container.querySelector('[data-duracao="1.2"]')).not.toBeNull();
  });

  it('com movimento reduzido: sem deslocamento, sem giro e transicao instantanea', () => {
    reduzir.value = true;
    const { container } = render(<StaleBundleNotice />);
    expect(container.querySelector('[data-opacidade-inicial="0"]')).toBeNull();
    expect(container.querySelector('[data-rotacao="360"]')).toBeNull();
    expect(container.querySelector('[data-rotacao="0"]')).not.toBeNull();
    expect(container.querySelector('[data-duracao="0"]')).not.toBeNull();
  });

  it('"Atualizar agora" zera a guarda da sessao e recarrega', () => {
    sessionStorage.setItem('__zapp_chunk_reload_count', '2');
    sessionStorage.setItem('__zapp_chunk_reload_at', '123');
    sessionStorage.setItem('zapp_chunk_reload_v1', '1');

    render(<StaleBundleNotice />);
    fireEvent.click(screen.getByRole('button', { name: /Atualizar agora/i }));

    expect(sessionStorage.getItem('__zapp_chunk_reload_count')).toBeNull();
    expect(sessionStorage.getItem('__zapp_chunk_reload_at')).toBeNull();
    expect(sessionStorage.getItem('zapp_chunk_reload_v1')).toBeNull();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
