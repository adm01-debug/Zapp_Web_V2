import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { ContactGroupedList } from '../ContactGroupedList';
import type { Contact } from '../types';

function contato(over: Partial<Contact> & Pick<Contact, 'id' | 'name'>): Contact {
  return {
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    company: null,
    job_title: null,
    contact_type: 'cliente',
    created_at: '2026-09-01T00:00:00.000Z',
    ...over,
  };
}

/**
 * Hierarquia tipográfica: o título do GRUPO (nome da empresa) precisa se
 * distinguir do nome de CADA contato que ele organiza. Hoje o cabeçalho usa o
 * MESMO `text-sm font-semibold` do item (ContactListItem.tsx:68) e não há
 * destaque. O padrão do módulo para cabeçalho de seção é `text-xs` + caixa alta
 * com `tracking-wider` (ContactDetailPanel.tsx:344/365).
 *
 * jsdom não calcula estilo (nem `getComputedStyle` traz o CSS do app), então a
 * prova trava o tratamento TIPOGRÁFICO aplicado pelo componente REAL: é a
 * diferença de classe (tamanho/caixa) que separa o cabeçalho do item.
 */
describe('ContactGroupedList — cabeçalho de grupo distinto do item', () => {
  it('o título do grupo tem tratamento de seção (text-xs + uppercase + tracking-wider), diferente do nome do contato', () => {
    const noop = vi.fn();
    render(
      <ContactGroupedList
        contacts={[
          contato({ id: '1', name: 'Ana', surname: 'Souza', company: 'Acme' }),
          contato({ id: '2', name: 'Bruno', surname: 'Lima', company: 'Acme' }),
        ]}
        selectedIds={[]}
        onToggleSelect={noop}
        onOpenDetails={noop}
        onOpenChat={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );

    // O cabeçalho de seção é o botão do grupo; o item do contato fica dentro dele.
    const cabecalho = screen.getByRole('button', { name: /Acme/ });
    const tituloGrupo = within(cabecalho).getByText('Acme');
    const nomeContato = screen.getByText('Ana Souza');

    // Cabeçalho de SEÇÃO: menor (text-xs) e caixa alta (uppercase) com tracking-wider —
    // mesmo tratamento das seções de ContactDetailPanel.
    expect(tituloGrupo.className).toContain('text-xs');
    expect(tituloGrupo.className).toContain('uppercase');
    expect(tituloGrupo.className).toContain('tracking-wider');

    // Nome do contato permanece no tamanho de corpo (text-sm).
    expect(nomeContato.className).toContain('text-sm');
    expect(nomeContato.className).not.toContain('text-xs');

    // Não compartilham o mesmo tratamento: prova que o cabeçalho se distingue do item.
    expect(tituloGrupo.className).not.toBe(nomeContato.className);
  });
});
