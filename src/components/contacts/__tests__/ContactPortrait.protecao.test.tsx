import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ContactPortrait } from '../ContactPortrait';
import type { Contact } from '../types';

/**
 * ZD-119 â€” proteÃ§Ã£o de tela da foto do contato (dado pessoal).
 *
 * O retrato Ã© o Ãºnico elemento do card que expÃµe a imagem real da pessoa. O
 * contrato Ã©: a imagem nÃ£o Ã© arrastÃ¡vel (sem "arrastar para o desktop") e o
 * menu de contexto nÃ£o abre (sem "Salvar imagem como"). Sem foto, o fallback
 * sÃ£o iniciais sobre fundo neutro â€” nunca uma URL pÃºblica.
 *
 * MutaÃ§Ã£o verificada: remover `onContextMenu` de ContactPortrait.tsx deixa o
 * primeiro caso vermelho.
 */

const BASE: Contact = {
  id: '40000000-0000-4000-9000-000000000001',
  name: 'Ana Souza',
  surname: null,
  nickname: null,
  phone: '5511987654321',
  email: null,
  avatar_url: 'https://cdn.example.test/ana.jpg',
  company: null,
  job_title: null,
  tags: null,
  contact_type: 'lead',
  created_at: '2026-09-15T12:00:00.000Z',
};

describe('ContactPortrait â€” proteÃ§Ã£o de tela', () => {
  it('nÃ£o permite arrastar a foto', () => {
    render(<ContactPortrait contact={BASE} />);
    const img = screen.getByRole('img', { name: 'Ana Souza' });
    expect(img).toHaveAttribute('draggable', 'false');
  });

  it('bloqueia o menu de contexto da foto (sem "Salvar imagem como")', () => {
    render(<ContactPortrait contact={BASE} />);
    const img = screen.getByRole('img', { name: 'Ana Souza' });
    const evento = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    const permitido = img.dispatchEvent(evento);
    expect(permitido).toBe(false);
    expect(evento.defaultPrevented).toBe(true);
  });

  it('sem foto mostra iniciais e nÃ£o renderiza <img>', () => {
    render(<ContactPortrait contact={{ ...BASE, avatar_url: null }} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('AS')).toBeTruthy();
  });

  it('só a primeira linha usa carregamento imediato (ZD-101)', () => {
    const { rerender } = render(<ContactPortrait contact={BASE} priority />);
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toHaveAttribute('loading', 'eager');
    rerender(<ContactPortrait contact={BASE} />);
    expect(screen.getByRole('img', { name: 'Ana Souza' })).toHaveAttribute('loading', 'lazy');
  });
});