/**
 * UK-14 — contrato de `section-error-boundary`.
 *
 * Prova o boundary leve de seção: sem erro renderiza os filhos; com erro mostra
 * o fallback inline (nome da seção + mensagem) SEM derrubar o resto da página;
 * reporta ao coletor (`reportClientError`) e ao log; e o "Tentar novamente"
 * reseta o estado e volta a montar os filhos.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';

vi.mock('@/lib/errorReporter', () => ({ reportClientError: vi.fn() }));
vi.mock('@/lib/logger', () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { reportClientError } from '@/lib/errorReporter';
import { log } from '@/lib/logger';

let deveFalhar = true;

function Filho() {
  if (deveFalhar) throw new Error('falha da seção');
  return <p>conteúdo vivo</p>;
}

let silenciar: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  deveFalhar = true;
  vi.clearAllMocks();
  // React imprime o erro capturado no console; não é o que se está provando.
  silenciar = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  silenciar.mockRestore();
  cleanup();
});

describe('section-error-boundary — contrato (UK-14)', () => {
  it('sem erro renderiza os filhos e não reporta nada', () => {
    deveFalhar = false;
    render(
      <SectionErrorBoundary sectionName="Relatórios">
        <Filho />
      </SectionErrorBoundary>,
    );

    expect(screen.getByText('conteúdo vivo')).toBeInTheDocument();
    expect(reportClientError).not.toHaveBeenCalled();
  });

  it('com erro mostra o fallback inline com o nome da seção e a mensagem', () => {
    render(
      <SectionErrorBoundary sectionName="Relatórios">
        <Filho />
      </SectionErrorBoundary>,
    );

    expect(screen.getByText('Erro em "Relatórios"')).toBeInTheDocument();
    expect(screen.getByText('falha da seção')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Tentar novamente/ })).toBeInTheDocument();
  });

  it('sem sectionName usa o rótulo genérico', () => {
    render(
      <SectionErrorBoundary>
        <Filho />
      </SectionErrorBoundary>,
    );

    expect(screen.getByText('Erro ao carregar seção')).toBeInTheDocument();
  });

  it('reporta o erro ao coletor com a origem e a seção', () => {
    render(
      <SectionErrorBoundary sectionName="Relatórios">
        <Filho />
      </SectionErrorBoundary>,
    );

    expect(reportClientError).toHaveBeenCalledTimes(1);
    const [erro, ctx] = vi.mocked(reportClientError).mock.calls[0];
    expect(erro).toBeInstanceOf(Error);
    expect(ctx).toMatchObject({ source: 'SectionErrorBoundary', section: 'Relatórios' });
    expect(log.error).toHaveBeenCalled();
    expect(String(vi.mocked(log.error).mock.calls[0][0])).toContain('[SectionError]');
  });

  it('"Tentar novamente" reseta e remonta os filhos', () => {
    render(
      <SectionErrorBoundary sectionName="Relatórios">
        <Filho />
      </SectionErrorBoundary>,
    );
    expect(screen.queryByText('conteúdo vivo')).toBeNull();

    deveFalhar = false;
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/ }));

    expect(screen.getByText('conteúdo vivo')).toBeInTheDocument();
    expect(screen.queryByText('Erro em "Relatórios"')).toBeNull();
  });
});
