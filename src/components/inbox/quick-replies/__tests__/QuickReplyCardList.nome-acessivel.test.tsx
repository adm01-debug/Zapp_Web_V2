import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QuickReplyCardList } from '../QuickReplyCardList';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

/**
 * Melhoria recuperada da branch `claude/ga-ci-verde-261020` (bloco C, veredito em
 * `analise-prs/VEREDITOS-BLOCO-C-261117.md`).
 *
 * O botão de excluir era só o ícone de lixeira, sem nome acessível: num leitor de
 * tela ele era anunciado como "botão", sem dizer o que apaga nem qual resposta.
 *
 * A branch também trazia uma confirmação dentro deste componente. **Essa parte NÃO
 * foi recuperada, e o veredito original errou nela:** a `main` já confirma a
 * exclusão um nível acima, no `QuickRepliesManager` (L13 —
 * `QuickRepliesManager.tsx:37,150,163-181`, coberto por
 * `__tests__/QuickRepliesManager.exclusao-confirmada.test.tsx`). Confirmar aqui
 * dentro engoliria o clique e o diálogo do pai nunca abriria. O contrato deste
 * componente continua sendo: `onDelete` só **pede** a exclusão.
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

function renderLista(over: { onDelete?: (id: string) => void; onSelect?: () => void } = {}) {
  const templates = [modelo()];
  return render(
    <QuickReplyCardList
      templates={templates}
      groupedByCategory={{ Geral: templates }}
      isLoading={false}
      activeTab="all"
      searchQuery=""
      isFavorite={() => false}
      onSelect={over.onSelect ?? (() => {})}
      onToggleFavorite={() => {}}
      onCopy={() => {}}
      onEdit={() => {}}
      onDelete={over.onDelete ?? (() => {})}
      onShowCreate={() => {}}
    />,
  );
}

describe('QuickReplyCardList — nome acessível do botão de excluir', () => {
  it('o botão de excluir tem nome acessível com o título do modelo', () => {
    renderLista();
    expect(
      screen.getByRole('button', { name: 'Excluir resposta rápida: Saudação padrão' }),
    ).toBeTruthy();
  });

  it('o clique entrega o id ao pai e não seleciona a resposta', () => {
    const onDelete = vi.fn();
    const onSelect = vi.fn();
    renderLista({ onDelete, onSelect });

    fireEvent.click(screen.getByRole('button', { name: /Excluir resposta rápida/ }));

    // Quem confirma e quem exclui de verdade é o QuickRepliesManager (L13).
    expect(onDelete).toHaveBeenCalledWith('t1');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
