import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ContactTypeFilter,
  filterByContactType,
  FILTER_OPTIONS,
} from '@/components/inbox/ContactTypeFilter';
import type { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

/**
 * Os 6 valores aceitos pelo CHECK de `contacts.contact_type`
 * (20260928180000_add_contact_type_check_constraint.sql):
 * cliente, colaborador, fornecedor, prestador_servico, transportadora, parceiro.
 * Cada conversa individual precisa cair em EXATAMENTE um desses filtros — em
 * especial `parceiro`, que não existia em FILTER_OPTIONS e escapava de todos.
 */

const TIPOS = [
  'cliente',
  'colaborador',
  'fornecedor',
  'prestador_servico',
  'transportadora',
  'parceiro',
] as const;

function conversa(
  id: string,
  contact_type?: string,
  phone = '5511999999999',
): ConversationWithMessages {
  return {
    contact: { id, name: id, phone, contact_type },
    messages: [],
    unreadCount: 0,
    lastMessage: null,
  } as unknown as ConversationWithMessages;
}

const TIPO_OPTIONS = FILTER_OPTIONS.filter((o) => (TIPOS as readonly string[]).includes(o.value));

describe('ContactTypeFilter — partição por tipo de contato', () => {
  it('cobre os 6 tipos do CHECK do banco, sem repetir', () => {
    expect(TIPO_OPTIONS.map((o) => o.value).sort()).toEqual([...TIPOS].sort());
  });

  it('cada conversa individual casa exatamente um tipo', () => {
    for (const tipo of TIPOS) {
      const c = conversa(`c-${tipo}`, tipo);
      const casam = TIPO_OPTIONS.filter((o) => o.match(c)).map((o) => o.value);
      expect(casam).toEqual([tipo]);
    }
  });

  it('contato sem tipo cai em "Clientes" (regra do default do classificador)', () => {
    const c = conversa('sem-tipo');
    const casam = TIPO_OPTIONS.filter((o) => o.match(c)).map((o) => o.value);
    expect(casam).toEqual(['cliente']);
  });

  it('contato parceiro não casa nenhum outro tipo', () => {
    const parceiro = conversa('p', 'parceiro');
    const outros = TIPO_OPTIONS.filter((o) => o.value !== 'parceiro');
    expect(outros.filter((o) => o.match(parceiro))).toEqual([]);
  });

  it('a conversa de grupo não casa nenhum tipo de contato individual', () => {
    const grupo = conversa('g', 'parceiro', '12345-67890');
    expect(TIPO_OPTIONS.filter((o) => o.match(grupo))).toEqual([]);
  });

  it('"Parceiros" filtra a conversa de parceiro', () => {
    const parceiro = conversa('p', 'parceiro');
    const cliente = conversa('c', 'cliente');
    expect(filterByContactType([parceiro, cliente], 'parceiro').map((c) => c.contact.id)).toEqual([
      'p',
    ]);
  });

  it('a tela oferece a opção "Parceiros" com a contagem', () => {
    const conversas = [conversa('p', 'parceiro'), conversa('c', 'cliente')];
    render(<ContactTypeFilter value={null} onChange={() => {}} conversations={conversas} />);
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'ArrowDown' });
    expect(screen.getByRole('option', { name: /Parceiros/ })).toHaveTextContent('1');
  });
});
