import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { ContactPortrait } from '../ContactPortrait';
import type { Contact } from '../types';

const contato = {
  id: 'c1',
  name: 'Ana',
  surname: 'Lima',
  nickname: null,
  phone: '11999999999',
  email: null,
  avatar_url: 'https://exemplo.test/foto.jpg',
  company: null,
  job_title: null,
  tags: [],
  contact_type: 'cliente',
  created_at: '2026-01-01T00:00:00.000Z',
} as unknown as Contact;

const raiz = resolve(__dirname, '../../..');
const lerCss = (arquivo: string) => readFileSync(resolve(raiz, arquivo), 'utf8').replace(/\r\n/g, '\n');

describe('Fase L (ZD-097..101) — tema claro, contraste, movimento e desempenho', () => {
  it('ZD-097: os tokens do tema claro seguem a escala do design', () => {
    const tokens = lerCss('styles/tokens.css');
    const inicio = tokens.indexOf('--contacts-page: 240 9% 96%');
    expect(inicio).toBeGreaterThan(-1);
    const blocoClaro = tokens.slice(inicio, inicio + 900);
    expect(blocoClaro).toContain('--contacts-raised: 240 9% 97%');
    expect(blocoClaro).toContain('--contacts-line: 240 6% 86%');
    expect(blocoClaro).toContain('--contacts-soft-line: 240 6% 91%');
  });

  it('ZD-101: a primeira linha do carrossel carrega a foto sem lazy', () => {
    const { container } = render(<ContactPortrait contact={contato} priority className="h-full w-full" />);
    const img = container.querySelector('img');
    expect(img?.getAttribute('loading')).toBe('eager');
    expect(img?.getAttribute('fetchpriority')).toBe('high');
  });

  it('ZD-101: fora da primeira linha a foto continua lazy', () => {
    const { container } = render(<ContactPortrait contact={contato} className="h-full w-full" />);
    expect(container.querySelector('img')?.getAttribute('loading')).toBe('lazy');
  });

  it('ZD-100: o carrossel amplia os alvos de toque no ponteiro grosso', () => {
    const rail = readFileSync(resolve(raiz, 'components/contacts/ContactExploreRail.tsx'), 'utf8');
    expect(rail).toContain('min-h-[42px]');
    expect(rail).toContain('h-[42px]');
    expect(rail).toContain('w-[42px]');
  });

  it('ZD-099: a view anuncia o resultado em região viva', () => {
    const view = readFileSync(resolve(raiz, 'components/contacts/ContactsView.tsx'), 'utf8');
    expect(view).toContain('aria-live="polite"');
    expect(view).toContain('data-contacts-live');
    expect(view).toContain('na tela, de');
  });
});