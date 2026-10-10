import type { ComponentType } from 'react';
import { describe, it, expect } from 'vitest';
import { render, within } from '@testing-library/react';
import { ContactCard } from '../ContactCard';
import { ContactListItem } from '../ContactListItem';
import type { ContactItemProps } from '../types';
import { baseContact, noop } from './contactDeleteFixtures';

/**
 * Prova da hierarquia tipográfica do ContactCard (view padrão "Cards").
 * A escala real é a modular de tailwind.config.ts: 3xs=10, 2xs=11, xs=12,
 * sm=14, base=16, lg=18. O jsdom não aplica Tailwind, então leio o token de
 * tamanho efetivo (o mais próximo na cadeia de ancestrais, como a herança
 * CSS faria) e comparo em px. O ContactListItem é a view de referência do
 * módulo (o cartão diz que ela já faz certo nesses pontos).
 */
const PX: Record<string, number> = {
  'text-3xs': 10,
  'text-2xs': 11,
  'text-xs': 12,
  'text-sm': 14,
  'text-base': 16,
  'text-lg': 18,
  'text-xl': 20,
  'text-2xl': 24,
};

function fontPx(el: Element): number {
  let node: Element | null = el;
  while (node) {
    const token = Array.from(node.classList).find((c) => c in PX);
    if (token) return PX[token];
    node = node.parentElement;
  }
  throw new Error(`sem token de tamanho na cadeia de "${el.textContent}"`);
}

/** Tamanho efetivo, em px, de cada papel do contato dentro de uma view. */
function medir(root: HTMLElement) {
  const size = (texto: string) => fontPx(within(root).getByText(texto));
  return {
    nome: size('Ana Souza'),
    telefone: size('5511999999999'),
    email: size('ana@acme.com'),
    empresa: size('Acme Ltda'),
    iniciais: size('AS'),
  };
}

function props(): ContactItemProps {
  return {
    contact: baseContact({
      name: 'Ana Souza',
      company: 'Acme Ltda',
      email: 'ana@acme.com',
      phone: '5511999999999',
    }),
    isSelected: false,
    onToggleSelect: noop,
    onOpenDetails: noop,
    onOpenChat: noop,
    onEdit: noop,
    onDelete: noop,
    index: 0,
  };
}

function medirView(Component: ComponentType<ContactItemProps>) {
  const { container } = render(<Component {...props()} />);
  return { valores: medir(container), container };
}

describe('ContactCard · tipografia do card padrão', () => {
  it('telefone, e-mail e empresa batem com o tamanho das outras views do módulo', () => {
    const card = medirView(ContactCard).valores;
    const referencia = medirView(ContactListItem).valores;

    expect(card.telefone).toBe(referencia.telefone);
    expect(card.email).toBe(referencia.email);
    expect(card.empresa).toBe(referencia.empresa);
    // E continuam no nível secundário, abaixo do nome (que segue primário).
    expect(card.telefone).toBeLessThan(card.nome);
    expect(card.email).toBeLessThan(card.nome);
    expect(card.empresa).toBeLessThan(card.nome);
    expect(card.nome).toBe(referencia.nome);
  });

  it('as iniciais decorativas do avatar são mais leves que o nome da pessoa', () => {
    const { valores, container } = medirView(ContactCard);
    const iniciaisEl = within(container).getByText('AS');

    expect(valores.iniciais).toBeLessThan(valores.nome);
    expect(iniciaisEl.classList.contains('font-bold')).toBe(false);
  });
});
