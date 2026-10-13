/**
 * PD-38 (segundo cartão) — "Alertas de Conexão" na tela de Notificações.
 *
 * O cartão só tem DOIS interruptores de CANAL, lidos e gravados pelo hook
 * `useConnectionAlertPreferences` (t_6bf2d93f): `push_enabled` = notificação do
 * navegador, `email_enabled` = e-mail. Cada interruptor grava na hora (o hook
 * faz upsert otimista com rollback) — aqui a prova é que o toque chama
 * `updatePreference` com o campo e o valor certos, e que o estado desenhado vem
 * do hook (não de um mock que já trazia a resposta).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  preferences: {
    push_enabled: true,
    email_enabled: false,
    alert_on_degraded: true,
    alert_on_disconnected: true,
  },
}));

vi.mock('@/hooks/system/useConnectionAlertPreferences', () => ({
  useConnectionAlertPreferences: () => ({
    preferences: h.preferences,
    isLoading: false,
    isSaving: false,
    updatePreference: h.update,
    updatePreferenceAsync: vi.fn(),
    shouldNotify: () => true,
  }),
}));

import { ConnectionAlertPreferencesCard } from '../NotificationTypeCards';

const navegador = () => screen.getByRole('switch', { name: /Navegador/i });
const email = () => screen.getByRole('switch', { name: /E-mail/i });

describe('ConnectionAlertPreferencesCard — canais do aviso de conexão', () => {
  beforeEach(() => {
    h.update.mockClear();
  });

  it('mostra exatamente os dois canais e o estado que vem do hook', () => {
    render(<ConnectionAlertPreferencesCard />);

    expect(screen.getAllByRole('switch')).toHaveLength(2);
    expect(navegador()).toHaveAttribute('aria-checked', 'true');
    expect(email()).toHaveAttribute('aria-checked', 'false');
  });

  it('desligar o canal do navegador grava push_enabled=false na hora', () => {
    render(<ConnectionAlertPreferencesCard />);

    fireEvent.click(navegador());

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ push_enabled: false });
  });

  it('ligar o canal de e-mail grava email_enabled=true na hora', () => {
    render(<ConnectionAlertPreferencesCard />);

    fireEvent.click(email());

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ email_enabled: true });
  });

  it('o texto visível da linha ("Navegador"/"E-mail") está no nome acessível do interruptor', () => {
    render(<ConnectionAlertPreferencesCard />);

    expect(navegador().getAttribute('aria-label')).toContain('Navegador');
    expect(email().getAttribute('aria-label')).toContain('E-mail');
  });
});
