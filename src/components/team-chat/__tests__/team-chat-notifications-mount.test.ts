import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * TC-007 — o listener de notificações do Team Chat precisa ser ÚNICO e GLOBAL:
 * montado no nível do app (senão quem está em outra tela, ex.: Contatos, não
 * recebe alerta) e NÃO dentro de `TeamChatView` (senão o canal duplica quando a
 * view monta). A view passa a apenas publicar a conversa em foco no store.
 */
const raiz = resolve(__dirname, '../../..');
const ler = (p: string) => readFileSync(resolve(raiz, p), 'utf8');

describe('TC-007 — listener de notificações do Team Chat é único e global', () => {
  it('o listener global é montado no nível do app', () => {
    expect(ler('App.tsx')).toContain('TeamChatNotificationsListener');
  });

  it('a view do Team Chat não monta um segundo listener (sem duplicação)', () => {
    const view = ler('components/team-chat/TeamChatView.tsx');

    expect(view).not.toMatch(/useTeamChatNotifications\(/);
    expect(view).toContain('useActiveTeamChatConversation(');
  });

  it('o listener global lê a conversa em foco do store compartilhado', () => {
    const listener = ler('components/team-chat/TeamChatNotificationsListener.tsx');

    expect(listener).toContain('useActiveTeamChatConversationId');
    expect(listener).toContain('useTeamChatNotifications');
  });
});
