import { fireEvent } from '@testing-library/react';
import type { Contact } from '../types';

/**
 * Helpers compartilhados pelos testes de exclusão de contato
 * (`ContactDeletePermission.test.tsx` e `ContactDeleteEntryPoints.test.tsx`).
 * Ficam aqui para não repetir o mesmo bloco nos dois arquivos (o SonarCloud
 * reprova duplicação em código novo: limite de 3%).
 */

/** DropdownMenuTrigger do Radix abre no pointerdown, não no click. */
export function openMenu(element: Element) {
  fireEvent.pointerDown(element);
  fireEvent.pointerUp(element);
  fireEvent.click(element);
}

export function trigger(): Element {
  const el = document.querySelector('button[aria-haspopup="menu"]');
  if (!el) throw new Error('botão de menu não encontrado');
  return el;
}

export function baseContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: '30000000-0000-0000-0000-000000000001',
    name: 'Ana Souza',
    surname: null,
    nickname: null,
    phone: '5511999999999',
    email: null,
    avatar_url: null,
    company: null,
    job_title: null,
    tags: null,
    contact_type: 'cliente',
    created_at: '2026-09-01T10:00:00.000Z',
    ...overrides,
  };
}

export const noop = () => {};
