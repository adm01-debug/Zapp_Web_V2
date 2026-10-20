import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CallChannelBadge } from '../CallChannelBadge';

/**
 * T30: o selo mostra POR QUAL LINHA a chamada fala - e nunca um nome que o
 * usuário não pode ver. O texto vem pronto (`rotuloLinhaWhatsApp`); aqui se prova
 * só a apresentação: com motivo, o motivo manda (D8); sem motivo, aparece a linha.
 */
describe('CallChannelBadge — linha de origem (T30)', () => {
  it('sem motivo, mostra a linha da chamada', () => {
    render(<CallChannelBadge channel="whatsapp" linha="pela linha Comercial" />);
    expect(screen.getByText('WhatsApp')).toBeTruthy();
    expect(screen.getByText('· pela linha Comercial')).toBeTruthy();
  });

  it('sem linha e sem motivo, mostra so o canal', () => {
    render(<CallChannelBadge channel="whatsapp" />);
    const selo = screen.getByText('WhatsApp');
    expect(selo.parentElement?.textContent).toBe('WhatsApp');
  });

  it('D8: com motivo, o motivo tem precedencia e a linha nao aparece', () => {
    render(
      <CallChannelBadge
        channel="whatsapp"
        motivo="whatsapp_restrito_supervisores"
        linha="pela linha Promo Brindes WhatsApp"
      />,
    );
    expect(screen.getByText(/Disponível para supervisores/)).toBeTruthy();
    expect(screen.queryByText(/pela linha Promo Brindes WhatsApp/)).toBeNull();
  });

  it('VoIP nao recebe linha (o selo segue funcionando como antes)', () => {
    render(<CallChannelBadge channel="voip" />);
    expect(screen.getByText('VoIP')).toBeTruthy();
  });
});
