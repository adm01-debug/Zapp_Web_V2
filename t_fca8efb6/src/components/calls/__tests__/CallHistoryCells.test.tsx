import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallContactCell } from '../CallContactCell';
import { nomeDoContato } from '@/lib/calls/nomeDoContato';
import { CallResultCell } from '../CallResultCell';
import { CallDirectionCell } from '../CallDirectionCell';
import { formatarDataHora } from '@/lib/calls/historyFormat';

describe('CallContactCell (T48)', () => {
  // as 3 variantes do aceite
  it('peer_name vence os outros dois', () => {
    const nome = nomeDoContato({ peer_name: 'Ana WhatsApp', contact_name: 'Ana CRM', peer_number: '5511999999999', contact_avatar_url: '' });
    expect(nome).toBe('Ana WhatsApp');
  });

  it('sem peer_name cai no contact_name', () => {
    const nome = nomeDoContato({ peer_name: '', contact_name: 'Ana CRM', peer_number: '5511999999999', contact_avatar_url: '' });
    expect(nome).toBe('Ana CRM');
  });

  it('sem nome nenhum mostra o telefone formatado', () => {
    const nome = nomeDoContato({ peer_name: '', contact_name: '', peer_number: '5511987654321', contact_avatar_url: '' });
    expect(nome).toMatch(/\(11\)/);
  });

  it('sem nome e sem telefone diz que nao identificou', () => {
    const nome = nomeDoContato({ peer_name: '', contact_name: '', peer_number: '', contact_avatar_url: '' });
    expect(nome).toBe('Número não identificado');
  });

  it('mostra a foto quando existe, e nao as iniciais', () => {
    render(<CallContactCell row={{ peer_name: 'Ana', contact_name: '', peer_number: '', contact_avatar_url: 'https://x/y.png' }} />);
    const img = document.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://x/y.png');
  });

  it('sem foto usa as iniciais em avatar de 40', () => {
    render(<CallContactCell row={{ peer_name: 'Ana Paula', contact_name: '', peer_number: '', contact_avatar_url: '' }} />);
    const avatar = screen.getByText('AP');
    expect(avatar.className).toContain('h-10');
    expect(avatar.className).toContain('w-10');
  });
});

describe('CallResultCell (T50)', () => {
  it('usa o rotulo e a cor do tom do dominio', () => {
    render(<CallResultCell result="missed" />);
    expect(screen.getByText('Perdida')).toBeTruthy();
  });

  it('sem resultado mostra traco, nao vazio', () => {
    render(<CallResultCell result={null} />);
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('em andamento pulsa apenas sob reduced-motion permitido', () => {
    render(<CallResultCell result="completed" emAndamento />);
    const dot = document.querySelector('.motion-safe\\:animate-pulse');
    expect(dot).toBeTruthy();
  });
});

describe('CallDirectionCell (T50)', () => {
  it('recebida e realizada tem rotulo acessivel', () => {
    const { unmount } = render(<CallDirectionCell direction="inbound" />);
    expect(screen.getByText('Recebida')).toBeTruthy();
    unmount();
    render(<CallDirectionCell direction="outbound" />);
    expect(screen.getByText('Realizada')).toBeTruthy();
  });
});

describe('formatarDataHora (T51)', () => {
  it('mês minúsculo e sem ponto final', () => {
    const texto = formatarDataHora('2026-10-02T17:35:00-03:00');
    expect(texto).toMatch(/^02 out · \d\d:\d\d$/);
  });

  it('sem data devolve traco, nao Invalid Date', () => {
    expect(formatarDataHora(null)).toBe('—');
    expect(formatarDataHora('nao-e-data')).toBe('—');
  });
});
