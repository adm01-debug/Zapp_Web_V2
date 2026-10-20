/**
 * Cartão t_4947d288 — a tela vazia do Inbox mostra as dicas de atalho reais.
 *
 * Antes o `InboxEmptyChat` era só ícone + frase. Agora ele lista, no slot
 * `action` do `ConversationEmptyState` (que segue sem atalhos — decisão
 * t_fced78b2), as teclas que a pessoa realmente usa para navegar a lista e
 * abrir a busca, lidas do `useCustomShortcuts`.
 *
 * A prova: as teclas vêm do hook e MUDAM quando o atalho é remapeado — nada de
 * `kbd` fixo que continua mentindo depois de o usuário trocar a combinação.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import { useCustomShortcuts } from '@/hooks/ui/useCustomShortcuts';
import { InboxEmptyChat } from '@/components/inbox/InboxEmptyChat';

/** Ajusta o store real antes/durante o render (nada de mock do hook). */
function AjustarAtalhos({
  reset,
  remap,
}: {
  reset?: boolean;
  remap?: { id: string; key: string; modifiers: { ctrlKey?: boolean } };
}) {
  const { resetAllShortcuts, updateShortcut } = useCustomShortcuts();
  useEffect(() => {
    if (reset) resetAllShortcuts();
    if (remap) updateShortcut(remap.id, remap.key, remap.modifiers);
  }, [reset, remap, resetAllShortcuts, updateShortcut]);
  return null;
}

const REMAP_BUSCA: { id: string; key: string; modifiers: { ctrlKey?: boolean } } = {
  id: 'global-search',
  key: 'j',
  modifiers: { ctrlKey: true },
};

function barraAtalhos(): HTMLElement {
  return screen.getByTestId('inbox-empty-shortcuts');
}

describe('InboxEmptyChat — dicas dos atalhos reais', () => {
  it('mantém o estado vazio compartilhado e lista os atalhos de navegação e busca', async () => {
    render(
      <>
        <AjustarAtalhos reset />
        <InboxEmptyChat />
      </>,
    );

    expect(screen.getByTestId('conversation-empty-state')).toBeInTheDocument();

    await waitFor(() => expect(screen.getByText('Próxima conversa')).toBeInTheDocument());
    expect(screen.getByText('Conversa anterior')).toBeInTheDocument();
    expect(screen.getByText('Busca global')).toBeInTheDocument();

    // Teclas padrão do V2: Alt+↓ / Alt+↑ para navegar e Ctrl+K para buscar.
    const barra = barraAtalhos();
    expect(within(barra).getAllByText('Alt')).toHaveLength(2);
    expect(within(barra).getByText('ArrowDown')).toBeInTheDocument();
    expect(within(barra).getByText('ArrowUp')).toBeInTheDocument();
    expect(within(barra).getByText('Ctrl')).toBeInTheDocument();
    expect(within(barra).getByText('k')).toBeInTheDocument();
  });

  it('reflete o remapeamento: trocar a busca para Ctrl+J atualiza a dica', async () => {
    render(
      <>
        <AjustarAtalhos reset remap={REMAP_BUSCA} />
        <InboxEmptyChat />
      </>,
    );

    await waitFor(() => expect(within(barraAtalhos()).getByText('j')).toBeInTheDocument());
    expect(within(barraAtalhos()).queryByText('k')).not.toBeInTheDocument();
  });
});
