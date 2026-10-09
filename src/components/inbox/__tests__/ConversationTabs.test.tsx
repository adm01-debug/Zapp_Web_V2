/**
 * FASE G — etapas 73/74/75.
 *
 * 75: a barra de abas da conversa monta as 8 abas da fusão e o badge de Tarefas
 *     usa `tasksOpen` (não mais "lembretes pendentes").
 * 73: a aba removida `reminders` guardada em localStorage é redirecionada para
 *     `tasks` — quem estava em Lembretes cai em Tarefas.
 * 74: o atalho global Alt+T está registrado e sem conflito.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react';

import { ConversationTabs, type ConversationTab } from '@/components/inbox/chat/ConversationTabs';
import { ConversationTabContent } from '@/components/inbox/chat/ConversationTabContent';
import type { Conversation } from '@/types/chat';
import { DEFAULT_SHORTCUTS } from '@/hooks/shortcuts/defaultShortcuts';
import type { ShortcutBinding } from '@/hooks/ui/useCustomShortcuts';
import type { ConversationTabCounts } from '@/hooks/chat/useConversationTabCounts';
import {
  useInboxUIState,
  normalizeConversationTab,
  CONVERSATION_TAB_STORAGE_KEY,
} from '@/hooks/inbox/useInboxUIState';

// O NotesTab real puxa hooks de CRM; o alvo aqui é o encanamento — o botão
// "Ver na aba Tarefas" fica INERTE se `onTabChange` não for repassado.
vi.mock('@/components/inbox/tabs/NotesTab', () => ({
  NotesTab: ({ contactId, onTabChange }: { contactId: string; onTabChange?: (tab: string) => void }) => (
    <button data-testid="notes-ver-tarefas" onClick={() => onTabChange?.('tasks')}>
      Ver na aba Tarefas ({contactId})
    </button>
  ),
}));

const ABAS = ['chat', 'files', 'ia', 'crm', 'orders', 'history', 'tasks', 'notes'] as const;

const COUNTS: ConversationTabCounts = {
  tasksOpen: 3,
  notesTotal: 2,
  filesTotal: 5,
};

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
});

afterEach(() => cleanup());

interface RenderTabsProps {
  activeTab?: ConversationTab;
  counts?: ConversationTabCounts;
  extraCounts?: { orders?: number };
}

function renderTabs({ activeTab = 'chat', counts = COUNTS, extraCounts }: RenderTabsProps = {}) {
  const onTabChange = vi.fn();
  render(
    <ConversationTabs
      activeTab={activeTab}
      onTabChange={onTabChange}
      counts={counts}
      extraCounts={extraCounts}
    />,
  );
  return { onTabChange };
}

describe('etapa 75 — ConversationTabs (8 abas da fusão)', () => {
  it('renderiza as 8 abas e nenhuma aba removida', () => {
    renderTabs();

    expect(screen.getByTestId('conversation-tabs')).toBeTruthy();
    for (const id of ABAS) {
      expect(screen.getByTestId(`conversation-tab-${id}`)).toBeTruthy();
    }
    // A fusão Lembretes→Tarefas tirou a aba 'reminders' da barra.
    expect(screen.queryByTestId('conversation-tab-reminders')).toBeNull();
    expect(document.querySelectorAll('[role="tab"]')).toHaveLength(8);
  });

  it('badge de Tarefas mostra tasksOpen', () => {
    renderTabs();

    expect(screen.getByTestId('conversation-tab-count-tasks').textContent).toBe('3');
    expect(screen.getByTestId('conversation-tab-count-files').textContent).toBe('5');
    expect(screen.getByTestId('conversation-tab-count-notes').textContent).toBe('2');
  });

  it('não renderiza badge quando o contador é zero', () => {
    renderTabs({ counts: { ...COUNTS, tasksOpen: 0 } });

    expect(screen.queryByTestId('conversation-tab-count-tasks')).toBeNull();
  });

  it('badge de SalesView vem de extraCounts (CRM client-side)', () => {
    renderTabs({ extraCounts: { orders: 4 } });

    expect(screen.getByTestId('conversation-tab-count-orders').textContent).toBe('4');
  });

  it('clicar numa aba entrega o id certo ao onTabChange', () => {
    const { onTabChange } = renderTabs();

    fireEvent.click(screen.getByTestId('conversation-tab-tasks'));

    expect(onTabChange).toHaveBeenCalledWith('tasks');
  });

  it('marca a aba ativa com aria-selected e as demais como false', () => {
    renderTabs({ activeTab: 'tasks' });

    expect(screen.getByTestId('conversation-tab-tasks').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('conversation-tab-chat').getAttribute('aria-selected')).toBe('false');
  });
});

describe('etapa 73 — redirecionamento reminders → tasks', () => {
  it('mapeia a aba removida reminders para tasks', () => {
    expect(normalizeConversationTab('reminders')).toBe('tasks');
  });

  it('mantém abas válidas e cai em chat para valor desconhecido', () => {
    expect(normalizeConversationTab('notes')).toBe('notes');
    expect(normalizeConversationTab('tasks')).toBe('tasks');
    expect(normalizeConversationTab('lixo')).toBe('chat');
    expect(normalizeConversationTab(null)).toBe('chat');
    expect(normalizeConversationTab(undefined)).toBe('chat');
  });

  it('hidrata a aba persistida reminders já como tasks', () => {
    window.localStorage.setItem(CONVERSATION_TAB_STORAGE_KEY, 'reminders');

    const { result } = renderHook(() => useInboxUIState());

    expect(result.current.conversationTab).toBe('tasks');
  });

  it('persiste a aba escolhida em localStorage', () => {
    const { result } = renderHook(() => useInboxUIState());

    act(() => result.current.setConversationTab('tasks'));

    expect(window.localStorage.getItem(CONVERSATION_TAB_STORAGE_KEY)).toBe('tasks');
  });
});

describe('etapa 74 — atalho Alt+T (abrir Tarefas)', () => {
  const atalho = DEFAULT_SHORTCUTS.find((s) => s.id === 'open-tasks-tab');

  const combo = (s: ShortcutBinding) =>
    `${s.defaultKey.toLowerCase()}|${!!s.defaultModifiers.ctrlKey}|${!!s.defaultModifiers.shiftKey}|${!!s.defaultModifiers.altKey}`;

  it('está registrado como Alt+T', () => {
    expect(atalho).toBeDefined();
    expect(atalho?.defaultKey).toBe('t');
    expect(atalho?.defaultModifiers.altKey).toBe(true);
    expect(atalho?.defaultModifiers.ctrlKey).toBeFalsy();
    expect(atalho?.defaultModifiers.shiftKey).toBeFalsy();
  });

  it('não conflita com nenhum outro atalho padrão', () => {
    expect(atalho).toBeDefined();
    const alvo = combo(atalho as ShortcutBinding);
    expect(DEFAULT_SHORTCUTS.filter((s) => combo(s) === alvo)).toHaveLength(1);
  });
});

describe('ConversationTabContent — repassa onTabChange às abas', () => {
  it('o botão "Ver na aba Tarefas" das Notas troca para a aba Tarefas', async () => {
    const onTabChange = vi.fn();
    const conversation = { contact: { id: 'c1', name: 'Ana' } } as unknown as Conversation;

    render(
      <ConversationTabContent
        activeTab="notes"
        onTabChange={onTabChange}
        conversation={conversation}
        messages={[]}
      >
        {null}
      </ConversationTabContent>,
    );

    fireEvent.click(await screen.findByTestId('notes-ver-tarefas'));

    expect(onTabChange).toHaveBeenCalledWith('tasks');
  });
});

/**
 * RES-1/SL-207 — "Composer só aparece na aba Chat".
 *
 * Não é defeito: é decisão registrada no plano do Inbox 360
 * (`docs/design/PLANO_INBOX_360_CONVERSA.md:66`): "Chat sempre montado... Composer de
 * mensagem só existe na aba Chat — decisão registrada (as imagens 3/4/6 mostram composer
 * em outras abas; não replicar)". O composer de mensagem (`ChatInputArea`) tem um único
 * ponto de render em produção, dentro do `ChatPanel` (`ChatPanel.tsx:401`), que é montado
 * como `children` aqui.
 *
 * Este teste é a prova executável da decisão: o painel do Chat NUNCA desmonta ao trocar de
 * aba (senão perderia rascunho, scroll, gravação e assinaturas realtime) e fica apenas
 * escondido fora da aba Chat — por isso o composer não aparece nas demais abas. Se alguém
 * remover o `hidden` (ou o painel passar a desmontar), este teste fica vermelho e força uma
 * troca consciente da decisão.
 */
describe('ConversationTabContent — composer de mensagem só na aba Chat (decisão do plano Inbox 360 §13)', () => {
  const conversation = { contact: { id: 'c1', name: 'Ana' } } as unknown as Conversation;

  function renderPainelDoChat(activeTab: ConversationTab) {
    return render(
      <ConversationTabContent
        activeTab={activeTab}
        onTabChange={vi.fn()}
        conversation={conversation}
        messages={[]}
      >
        <div data-testid="painel-do-chat" />
      </ConversationTabContent>,
    );
  }

  it('mantém o painel do Chat visível na aba Chat', () => {
    const { getByTestId } = renderPainelDoChat('chat');

    expect(getByTestId('painel-do-chat').closest('.hidden')).toBeNull();
  });

  it('fora da aba Chat, mantém o painel do Chat montado e apenas escondido', () => {
    const { getByTestId } = renderPainelDoChat('notes');

    const painelDoChat = getByTestId('painel-do-chat');
    // Continua no documento: a aba Chat é escondida, nunca desmontada.
    expect(document.body.contains(painelDoChat)).toBe(true);
    // E escondido: o composer de mensagem não aparece nas demais abas.
    expect(painelDoChat.closest('.hidden')).not.toBeNull();
  });
});
