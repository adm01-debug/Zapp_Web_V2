import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { CommandPalette } from '@/components/CommandPalette';

// O palette filtra os módulos pelo papel do usuário (useUserRole). Este teste
// só olha o texto do campo de busca, então o papel fica fixo.
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ roles: ['admin'], permissions: [], isLoading: false }),
}));

describe('CommandPalette — sugestão do campo de busca (E12)', () => {
  beforeAll(() => {
    // O jsdom não implementa scrollIntoView e o cmdk (por trás do
    // CommandDialog) o chama ao montar a lista.
    Element.prototype.scrollIntoView = vi.fn();
  });
  beforeEach(() => {
    localStorage.clear();
  });

  it('sugere "tarefas" e não o id morto "pipeline"', () => {
    render(<CommandPalette onNavigate={vi.fn()} />);

    // O diálogo nasce fechado: o atalho real do usuário (⌘K / Ctrl+K) é o que o abre.
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });

    const campo = screen.getByPlaceholderText(/Buscar módulo/);
    expect(campo.getAttribute('placeholder')).toBe('Buscar módulo… (ex: tarefas, chatbot)');
  });
});
