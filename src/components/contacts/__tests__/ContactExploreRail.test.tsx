import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ContactExploreRail } from '../ContactExploreRail';
import type { Contact } from '../types';

const contato = (id: string, name: string, sobre: Partial<Contact> = {}): Contact =>
  ({
    id,
    name,
    surname: null,
    nickname: null,
    phone: '+5511999999999',
    email: `${id}@exemplo.com`,
    avatar_url: null,
    company: 'Empresa X',
    job_title: 'Diretora',
    tags: [],
    contact_type: 'lead',
    created_at: '2026-01-01T00:00:00.000Z',
    ...sobre,
  }) as Contact;

describe('ContactExploreRail (ZD-081..085)', () => {
  it('anuncia o carrossel e lista um mini-card por contato', () => {
    render(
      <ContactExploreRail
        contatos={[contato('1', 'Ana'), contato('2', 'Bruno')]}
        onAbrirContato={vi.fn()}
      />,
    );
    expect(screen.getByRole('region', { name: 'Carrossel de todos os contatos' })).toBeInTheDocument();
    expect(screen.getByText('Explore seus contatos')).toBeInTheDocument();
    expect(screen.getByText('Navegação rápida pelos resultados')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir ficha de Ana' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abrir ficha de Bruno' })).toBeInTheDocument();
  });

  it('abre a ficha do contato clicado', () => {
    const abrir = vi.fn();
    render(<ContactExploreRail contatos={[contato('1', 'Ana'), contato('2', 'Bruno')]} onAbrirContato={abrir} />);
    fireEvent.click(screen.getByRole('button', { name: 'Abrir ficha de Bruno' }));
    expect(abrir).toHaveBeenCalledWith('2');
  });

  it('mostra vazio explícito quando o recorte não tem contato', () => {
    render(<ContactExploreRail contatos={[]} onAbrirContato={vi.fn()} />);
    expect(screen.getByText('Nenhum contato neste filtro.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Abrir ficha de/ })).toBeNull();
  });

  it('desabilita os controles quando não há o que rolar', () => {
    render(<ContactExploreRail contatos={[contato('1', 'Ana')]} onAbrirContato={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Contato anterior no carrossel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Próximo contato no carrossel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pausar carrossel' })).toBeDisabled();
  });

  it('o botão de pausa alterna o rótulo entre Pausar e Reproduzir', () => {
    render(
      <ContactExploreRail
        contatos={[contato('1', 'Ana'), contato('2', 'Bruno')]}
        onAbrirContato={vi.fn()}
      />,
    );
    const pausa = screen.getByRole('button', { name: 'Pausar carrossel' });
    fireEvent.click(pausa);
    expect(screen.getByRole('button', { name: 'Reproduzir carrossel' })).toBeInTheDocument();
  });

  it('as setas reciclam a ordem visual do trilho e pausam o auto-avanço', () => {
    render(
      <ContactExploreRail
        contatos={[contato('1', 'Ana'), contato('2', 'Bruno'), contato('3', 'Carla')]}
        onAbrirContato={vi.fn()}
      />,
    );
    const regiao = screen.getByRole('region', { name: 'Carrossel de todos os contatos' });
    const ordem = () =>
      Array.from(regiao.querySelectorAll('button[aria-label^="Abrir ficha de "]')).map((botao) =>
        botao.getAttribute('aria-label'),
      );

    expect(ordem()).toEqual(['Abrir ficha de Ana', 'Abrir ficha de Bruno', 'Abrir ficha de Carla']);
    fireEvent.click(screen.getByRole('button', { name: 'Próximo contato no carrossel' }));
    expect(ordem()).toEqual(['Abrir ficha de Bruno', 'Abrir ficha de Carla', 'Abrir ficha de Ana']);
    expect(screen.getByRole('button', { name: 'Reproduzir carrossel' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contato anterior no carrossel' }));
    expect(ordem()).toEqual(['Abrir ficha de Ana', 'Abrir ficha de Bruno', 'Abrir ficha de Carla']);
  });

  it('mostra a empresa do contato e um marcador quando ela falta', () => {
    render(
      <ContactExploreRail
        contatos={[contato('1', 'Ana'), contato('2', 'Bruno', { company: null })]}
        onAbrirContato={vi.fn()}
      />,
    );
    expect(screen.getAllByText('Empresa X').length).toBeGreaterThan(0);
    expect(screen.getByText('Empresa não informada')).toBeInTheDocument();
  });
});