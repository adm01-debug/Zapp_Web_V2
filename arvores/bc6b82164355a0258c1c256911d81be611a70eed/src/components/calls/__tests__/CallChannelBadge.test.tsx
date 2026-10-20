import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallChannelBadge } from '../CallChannelBadge';

describe('CallChannelBadge', () => {
  it('mostra o nome do canal de WhatsApp', () => {
    render(<CallChannelBadge channel="whatsapp" />);
    expect(screen.getByText(/WhatsApp/)).toBeTruthy();
  });

  it('mostra o nome do canal de VoIP', () => {
    render(<CallChannelBadge channel="voip" />);
    expect(screen.getByText(/VoIP/)).toBeTruthy();
  });

  it('no caso D8 explica que o canal é restrito a supervisores', () => {
    render(<CallChannelBadge channel="whatsapp" motivo="whatsapp_restrito_supervisores" />);
    expect(screen.getByText(/Disponível para supervisores/)).toBeTruthy();
  });

  it('não mostra texto de motivo quando não há motivo', () => {
    render(<CallChannelBadge channel="whatsapp" motivo={null} />);
    const selo = screen.getByText(/WhatsApp/);
    expect(selo.textContent).not.toContain('·');
  });
});
