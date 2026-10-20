import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContactTypeFilter,
  filterByContactType,
  FILTER_OPTIONS,
} from '@/components/inbox/ContactTypeFilter';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// R2-INB-055 — o classificador de grupo apagava o hífen que a própria expressão
// exige (`replace(/\D/g,'')` antes de `/^\d+-\d+$/`). Resultado: grupo nunca era
// reconhecido, a lista de grupos ficava vazia e "Chats Individuais" engolia grupo.

function conversa(
  contact: Partial<ConversationWithMessages['contact']> & { id: string; phone: string },
  unreadCount = 0,
): ConversationWithMessages {
  return {
    contact: { name: contact.id, ...contact },
    messages: [],
    unreadCount,
    lastMessage: null,
  } as ConversationWithMessages;
}

// Representação canônica do grupo nos contatos: JID "<dígitos>-<dígitos>" — o
// domínio @g.us já foi removido na gravação (evolution-webhook-handlers.ts:131).
const grupo = conversa({ id: 'grupo', phone: '12345-67890', group_category: 'orcamentos', contact_type: 'cliente' });
const pessoa = conversa({ id: 'pessoa', phone: '5511999999999', contact_type: 'cliente' });
const conversas = [grupo, pessoa];

describe('ContactTypeFilter — classificação de grupo (R2-INB-055)', () => {
  it('"Todos os Grupos" devolve o grupo e não o contato individual', () => {
    expect(filterByContactType(conversas, 'grupo').map((c) => c.contact.id)).toEqual(['grupo']);
  });

  it('"Chats Individuais" devolve o contato individual e não o grupo', () => {
    expect(filterByContactType(conversas, 'individual').map((c) => c.contact.id)).toEqual(['pessoa']);
  });

  it('a subcategoria do grupo casa pela categoria do grupo', () => {
    expect(filterByContactType(conversas, 'grupo_orcamentos').map((c) => c.contact.id)).toEqual(['grupo']);
  });

  it('grupo que ainda carrega o domínio do JID (@g.us) também é grupo', () => {
    const comDominio = [conversa({ id: 'grupo-jid', phone: '5511999999999-1234567890@g.us' })];
    expect(filterByContactType(comDominio, 'grupo').map((c) => c.contact.id)).toEqual(['grupo-jid']);
  });

  it('a contagem da opção "Todos os Grupos" reflete o grupo carregado', () => {
    const opcao = FILTER_OPTIONS.find((o) => o.value === 'grupo');
    expect(conversas.filter(opcao!.match)).toHaveLength(1);
  });

  it('a tela mostra a contagem no item de grupos', () => {
    render(<ContactTypeFilter value={null} onChange={() => {}} conversations={conversas} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Todos os Grupos/ })).toHaveTextContent('1');
  });
});
