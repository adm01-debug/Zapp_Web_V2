/**
 * t_638c8a1a: os controles da seção "Configurações" (Sincronização automática,
 * Lembrete padrão, Calendar ID) ficavam TOTALMENTE interativos numa integração que
 * não existe (o próprio botão "Conectar" só mostra um toast de OAuth). O usuário
 * alterava valores que nunca eram salvos nem aplicados.
 *
 * A correção desabilita os controles, com o motivo visível — mesmo tratamento do
 * botão "Conectar Google Calendar". Este teste prova o estado desabilitado.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import { GoogleCalendarIntegration } from '../GoogleCalendarIntegration';

function renderTela() {
  return render(
    <TooltipProvider>
      <GoogleCalendarIntegration />
    </TooltipProvider>
  );
}

describe('GoogleCalendarIntegration — controles de configuração desabilitados (t_638c8a1a)', () => {
  it('os controles que não têm efeito estão desabilitados', () => {
    renderTela();

    // Sincronização automática (Switch).
    expect(screen.getByRole('switch')).toBeDisabled();

    // Lembrete padrão (minutos) — input numérico.
    expect(screen.getByRole('spinbutton')).toBeDisabled();

    // Calendar ID — único campo com placeholder "primary".
    expect(screen.getByPlaceholderText('primary')).toBeDisabled();

    // O botão de conexão também segue indisponível enquanto não há OAuth.
    expect(screen.getByRole('button', { name: /Conectar Google Calendar/i })).toBeDisabled();
  });

  it('o motivo da indisponibilidade fica visível na seção', () => {
    renderTela();
    expect(screen.getByText(/Controles indisponíveis até a autenticação OAuth/i)).toBeInTheDocument();
  });
});
