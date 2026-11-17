import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuickReplyCardList } from '../QuickReplyCardList';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

/**
 * Melhoria recuperada da branch `claude/ga-ci-verde-261020` (bloco C, veredito em
 * `analise-prs/VEREDITOS-BLOCO-C-261117.md`).
 *
 * Antes: o X da linha chamava `onDelete` no clique, sem confirmar, e o botão não
 * tinha nome acessível — só o ícone de lixeira. Numa lista densa de respostas
 * prontas, um toque errado apagava o modelo e não havia desfazer.
 */

afterEach(() => cleanup());

function modelo(over: Partial<QuickReplyTemplate> = {}): QuickReplyTemplate {
  return {
    id: 't1',
    title: 'Saudação padrão',
    content: 'Olá! Como posso ajudar?',
    shortcut: null,
    category: 'Geral',
    is_global: false,
    use_count: 3,
    user_id: 'u1',
    created_at: '2026-11-01T10:00:00Z',
    updated_at: '2026-11-01T10:00:00Z',
    ...over,
  };
}

function renderLista(onDelete: () => void, templates = [modelo()]) {
  return render(
    <QuickReplyCardList
      templates={templates}
      groupedByCategory={{ Geral: templates }}
      isLoading={false}
      activeTab="all"
      searchQuery=""
      isFavorite={() => false}
      onSelect={() => {}}
      onToggleFavorite={() => {}}
      onCopy={() => {}}
      onEdit={() => {}}
      onDelete={onDelete}
      onShowCreate={() => {}}
    />,
  );
}

describe('QuickReplyCardList — excluir pede confirmação', () => {
  it('o botão de excluir tem nome acessível com o título do modelo', () => {
    renderLista(vi.fn());
    expect(
      screen.getByRole('button', { name: 'Excluir resposta rápida: Saudação padrão' }),
    ).toBeTruthy();
  });

  it('clicar no excluir NÃO apaga: abre a confirmação', () => {
    const onDelete = vi.fn();
    renderLista(onDelete);

    fireEvent.click(screen.getByRole('button', { name: /Excluir resposta rápida/ }));

    // Este é o ponto do defeito: antes, aqui já tinha apagado.
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('Excluir esta resposta rápida?')).toBeTruthy();
    // A confirmação diz QUAL modelo e que não há desfazer.
    expect(screen.getByText(/"Saudação padrão" será removida/)).toBeTruthy();
    expect(screen.getByText(/Não há como desfazer/)).toBeTruthy();
  });

  it('confirmar apaga, com o id certo', () => {
    const onDelete = vi.fn();
    renderLista(onDelete, [modelo({ id: 't42', title: 'Cobrança' })]);

    fireEvent.click(screen.getByRole('button', { name: /Excluir resposta rápida/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('t42');
  });

  it('"Manter" fecha sem apagar', () => {
    const onDelete = vi.fn();
    renderLista(onDelete);

    fireEvent.click(screen.getByRole('button', { name: /Excluir resposta rápida/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Manter' }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByText('Excluir esta resposta rápida?')).toBeNull();
  });

  it('o clique no excluir não seleciona a resposta (stopPropagation)', () => {
    const onSelect = vi.fn();
    const templates = [modelo()];
    render(
      <QuickReplyCardList
        templates={templates}
        groupedByCategory={{ Geral: templates }}
        isLoading={false}
        activeTab="all"
        searchQuery=""
        isFavorite={() => false}
        onSelect={onSelect}
        onToggleFavorite={() => {}}
        onCopy={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onShowCreate={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Excluir resposta rápida/ }));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
