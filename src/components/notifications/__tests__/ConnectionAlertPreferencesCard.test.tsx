/**
 * PD-38 — "Alertas de Conexão" na tela de Notificações.
 *
 * O cartão tem QUATRO interruptores: os dois TIPOS de aviso — o interruptor
 * mestre que a faixa dentro do app (EvolutionDisconnectBanner) obedece:
 * `alert_on_degraded` e `alert_on_disconnected` — e os dois CANAIS por onde o
 * aviso sai: `push_enabled` (navegador) e `email_enabled` (e-mail). A prova
 * aqui é: (a) o estado desenhado vem do hook (não de um mock que já trouxe a
 * resposta); (b) o toque chama `updatePreference` com o campo e o valor certos;
 * (c) o nome acessível de cada interruptor traz o texto visível da linha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const h = vi.hoisted(() => ({
  update: vi.fn(),
  preferences: {
    push_enabled: true,
    email_enabled: false,
    alert_on_degraded: true,
    alert_on_disconnected: false,
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

const degradada = () => screen.getByRole('switch', { name: 'Ativar notificação de Conexão degradada' });
const desconectada = () => screen.getByRole('switch', { name: 'Ativar notificação de Conexão desconectada' });
const navegador = () => screen.getByRole('switch', { name: 'Ativar notificação de Navegador' });
const email = () => screen.getByRole('switch', { name: 'Ativar notificação de E-mail' });

describe('ConnectionAlertPreferencesCard — tipo e canal do aviso de conexão', () => {
  beforeEach(() => {
    h.update.mockClear();
  });

  it('mostra os quatro interruptores com o estado que vem do hook', () => {
    render(<ConnectionAlertPreferencesCard />);

    expect(screen.getAllByRole('switch')).toHaveLength(4);
    expect(degradada()).toHaveAttribute('aria-checked', 'true');
    expect(desconectada()).toHaveAttribute('aria-checked', 'false');
    expect(navegador()).toHaveAttribute('aria-checked', 'true');
    expect(email()).toHaveAttribute('aria-checked', 'false');
  });

  it('desligar "Conexão degradada" grava alert_on_degraded=false na hora', () => {
    render(<ConnectionAlertPreferencesCard />);

    fireEvent.click(degradada());

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ alert_on_degraded: false });
  });

  it('ligar "Conexão desconectada" grava alert_on_disconnected=true na hora', () => {
    render(<ConnectionAlertPreferencesCard />);

    fireEvent.click(desconectada());

    expect(h.update).toHaveBeenCalledTimes(1);
    expect(h.update).toHaveBeenCalledWith({ alert_on_disconnected: true });
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

  it('o texto visível de cada linha está no nome acessível do interruptor', () => {
    render(<ConnectionAlertPreferencesCard />);

    expect(degradada().getAttribute('aria-label')).toContain('Conexão degradada');
    expect(desconectada().getAttribute('aria-label')).toContain('Conexão desconectada');
    expect(navegador().getAttribute('aria-label')).toContain('Navegador');
    expect(email().getAttribute('aria-label')).toContain('E-mail');
  });
});
