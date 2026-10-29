import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { ConnectionAlertPreferences } from '@/components/settings/ConnectionAlertPreferences';

/**
 * PD-38/39 — a tela de Configuracoes tem de deixar o usuario editar AS QUATRO
 * preferencias: dois canais (navegador/e-mail) e dois tipos (instavel/desconectada).
 *
 * O estado controlado aqui e o que o hook devolve; o componente e o REAL.
 */
const estado = vi.hoisted(() => ({
  preferences: {
    push_enabled: true,
    email_enabled: true,
    alert_on_degraded: true,
    alert_on_disconnected: true,
  },
  isLoading: false,
  isSaving: false,
  updatePreferenceAsync: vi.fn(() => Promise.resolve()),
}));

vi.mock('@/hooks/system/useConnectionAlertPreferences', () => ({
  CONNECTION_ALERT_DEFAULTS: {
    push_enabled: true,
    email_enabled: true,
    alert_on_degraded: true,
    alert_on_disconnected: true,
  },
  useConnectionAlertPreferences: () => ({
    preferences: estado.preferences,
    isLoading: estado.isLoading,
    isSaving: estado.isSaving,
    updatePreference: vi.fn(),
    updatePreferenceAsync: estado.updatePreferenceAsync,
    shouldNotify: () => true,
  }),
}));

const trocar = (nome: RegExp) => screen.getByRole('switch', { name: nome });

beforeEach(() => {
  estado.preferences = {
    push_enabled: true,
    email_enabled: true,
    alert_on_degraded: true,
    alert_on_disconnected: true,
  };
  estado.isLoading = false;
  estado.isSaving = false;
  estado.updatePreferenceAsync = vi.fn(() => Promise.resolve());
});

describe('ConnectionAlertPreferences (tela de Configuracoes)', () => {
  it('mostra as quatro preferencias refletindo o estado atual do usuario', () => {
    estado.preferences = {
      push_enabled: false,
      email_enabled: true,
      alert_on_degraded: false,
      alert_on_disconnected: true,
    };
    render(<ConnectionAlertPreferences />);

    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(trocar(/Notificação do navegador/)).not.toBeChecked();
    expect(trocar(/E-mail/)).toBeChecked();
    expect(trocar(/Conexão instável/)).not.toBeChecked();
    expect(trocar(/Conexão desconectada/)).toBeChecked();
  });

  it('grava cada uma das quatro preferencias com o campo e o valor certos', async () => {
    render(<ConnectionAlertPreferences />);

    fireEvent.click(trocar(/Notificação do navegador/));
    await waitFor(() =>
      expect(estado.updatePreferenceAsync).toHaveBeenCalledWith({ push_enabled: false }),
    );

    fireEvent.click(trocar(/E-mail/));
    await waitFor(() =>
      expect(estado.updatePreferenceAsync).toHaveBeenCalledWith({ email_enabled: false }),
    );

    fireEvent.click(trocar(/Conexão instável/));
    await waitFor(() =>
      expect(estado.updatePreferenceAsync).toHaveBeenCalledWith({ alert_on_degraded: false }),
    );

    fireEvent.click(trocar(/Conexão desconectada/));
    await waitFor(() =>
      expect(estado.updatePreferenceAsync).toHaveBeenCalledWith({
        alert_on_disconnected: false,
      }),
    );

    expect(estado.updatePreferenceAsync).toHaveBeenCalledTimes(4);
  });

  it('anuncia o erro quando o salvamento falha, sem esconder o interruptor', async () => {
    estado.updatePreferenceAsync = vi.fn(() => Promise.reject(new Error('boom')));
    render(<ConnectionAlertPreferences />);

    fireEvent.click(trocar(/Conexão desconectada/));

    const alerta = await screen.findByRole('alert');
    expect(alerta).toHaveTextContent(/não foi possível salvar/i);
    expect(trocar(/Conexão desconectada/)).toBeInTheDocument();
  });

  it('mostra o estado de salvando enquanto a gravacao esta em voo', () => {
    estado.isSaving = true;
    render(<ConnectionAlertPreferences />);
    expect(screen.getByText('Salvando…')).toBeInTheDocument();
  });

  it('desabilita os interruptores enquanto carrega e nao anuncia salvamento', () => {
    estado.isLoading = true;
    render(<ConnectionAlertPreferences />);
    for (const interruptor of screen.getAllByRole('switch')) {
      expect(interruptor).toBeDisabled();
    }
    expect(screen.queryByText('Salvando…')).not.toBeInTheDocument();
  });

  it('explica que o e-mail depende do envio configurado (PK-15)', () => {
    render(<ConnectionAlertPreferences />);
    expect(screen.getByText(/PK-15/)).toBeInTheDocument();
  });

  it('nao oferece nenhum controle de exportar', () => {
    render(<ConnectionAlertPreferences />);
    expect(screen.queryByRole('button', { name: /exportar|baixar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /exportar/i })).not.toBeInTheDocument();
  });

  it('nao tem violacao de acessibilidade', async () => {
    const { container } = render(<ConnectionAlertPreferences />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
