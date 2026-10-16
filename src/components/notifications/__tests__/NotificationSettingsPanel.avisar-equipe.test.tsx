/**
 * Interruptor "Avisar também da equipe" no painel de notificações.
 *
 * Prova o que o cartão pede, pela TELA real (`NotificationSettingsPanel`):
 * a chave aparece para supervisor (e só para ele), nasce DESLIGADA, ligar
 * grava a escolha e o valor salvo sobrevive à remontagem/recarregamento. O
 * efeito é medido no ponto REAL de decisão (`shouldAlertIncomingMessage`, de
 * `incomingAlertScope`) — o MESMO que o aviso global de mensagem nova usa —
 * e não em estado local do painel.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

/** Papel devolvido pelo `useUserRole` (o teste troca por caso). */
const role = vi.hoisted(() => ({ isSupervisor: false }));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isSupervisor: role.isSupervisor, isAdmin: false, loading: false }),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: {
      soundEnabled: true,
      soundVolume: 70,
      browserNotifications: false,
      quietHoursEnabled: false,
      quietHoursStart: '22:00',
      quietHoursEnd: '08:00',
      sentimentAlertEnabled: true,
      sentimentAlertThreshold: 30,
      sentimentConsecutiveCount: 3,
      transcriptionNotificationEnabled: true,
      messageSoundType: 'chime',
      mentionSoundType: 'bell',
      slaSoundType: 'alert',
      goalSoundType: 'chime',
      transcriptionSoundType: 'soft',
    },
    updateSettings: vi.fn(),
    resetSettings: vi.fn().mockResolvedValue(true),
    isQuietHours: () => false,
    isLoading: false,
    isSaving: false,
  }),
}));

vi.mock('@/hooks/system/usePushNotifications', () => ({
  usePushNotifications: () => ({
    isEnabled: false,
    isSupported: true,
    permission: 'default',
    isSubscribed: false,
    isLoading: false,
    toggleSubscription: vi.fn(),
    showNotification: vi.fn(),
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  previewSound: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue('granted'),
}));

vi.mock('@/hooks/ui/use-toast', () => ({ toast: vi.fn() }));

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';
import {
  TEAM_ALERTS_STORAGE_KEY,
  getIncomingAlertScope,
  resetIncomingAlertScope,
  setAlertProfileId,
  shouldAlertIncomingMessage,
} from '@/hooks/realtime/incomingAlertScope';

const COLECO = { assigned_to: 'outro-atendente' };
const MINHA = { assigned_to: 'meu-id' };

/** O interruptor pelo nome acessível que o leitor de tela anuncia. */
const chave = () => screen.getByRole('switch', { name: /Avisar também da equipe/i });

beforeEach(() => {
  localStorage.clear();
  resetIncomingAlertScope();
  setAlertProfileId('meu-id');
  role.isSupervisor = true;
});

describe('Painel de notificações — interruptor "Avisar também da equipe"', () => {
  it('nasce desligado e, ao ligar, grava a escolha e passa a avisar da conversa de colega', () => {
    render(<NotificationSettingsPanel />);

    // Critério 1: aparece mostrando o valor atual (desligado por padrão) e o
    // ponto de decisão real confirma o padrão — colega não avisa.
    expect(chave()).not.toBeChecked();
    expect(localStorage.getItem(TEAM_ALERTS_STORAGE_KEY)).toBeNull();
    expect(shouldAlertIncomingMessage(COLECO)).toBe(false);

    fireEvent.click(chave());

    // Critério 2: ligar usa a preferência do módulo (não estado local do painel).
    expect(chave()).toBeChecked();
    expect(localStorage.getItem(TEAM_ALERTS_STORAGE_KEY)).toBe('1');
    expect(getIncomingAlertScope().teamAlerts).toBe(true);
    expect(shouldAlertIncomingMessage(COLECO)).toBe(true);
    // A chave amplia o aviso; o que é meu continua avisando.
    expect(shouldAlertIncomingMessage(MINHA)).toBe(true);
  });

  it('desligar de novo grava a escolha negada e volta a não avisar da equipe', () => {
    render(<NotificationSettingsPanel />);

    fireEvent.click(chave());
    fireEvent.click(chave());

    expect(chave()).not.toBeChecked();
    expect(localStorage.getItem(TEAM_ALERTS_STORAGE_KEY)).toBe('0');
    expect(getIncomingAlertScope().teamAlerts).toBe(false);
    expect(shouldAlertIncomingMessage(COLECO)).toBe(false);
    expect(shouldAlertIncomingMessage(MINHA)).toBe(true);
  });

  it('remontar a tela mantém a escolha ligada', () => {
    render(<NotificationSettingsPanel />);
    fireEvent.click(chave());
    expect(chave()).toBeChecked();

    cleanup();
    render(<NotificationSettingsPanel />);

    // Critério 2: a tela relê a preferência salva (nada de estado local duplicado).
    expect(chave()).toBeChecked();
  });

  it('agente comum não vê o interruptor (o resto do painel continua na tela)', () => {
    role.isSupervisor = false;
    render(<NotificationSettingsPanel />);

    expect(screen.queryByRole('switch', { name: /Avisar também da equipe/i })).toBeNull();
    expect(screen.getByRole('switch', { name: /Sons de Notificação/i })).toBeInTheDocument();
  });

  it('recarregar a página: o módulo lê a escolha salva e o padrão é desligado', async () => {
    // Módulo recém-carregado, como numa recarga de página.
    localStorage.setItem(TEAM_ALERTS_STORAGE_KEY, '1');
    vi.resetModules();
    const comEscolha = await import('@/hooks/realtime/incomingAlertScope');
    expect(comEscolha.getIncomingAlertScope().teamAlerts).toBe(true);

    // Sem nada salvo, o padrão do carregamento é DESLIGADO.
    localStorage.clear();
    vi.resetModules();
    const semEscolha = await import('@/hooks/realtime/incomingAlertScope');
    expect(semEscolha.getIncomingAlertScope().teamAlerts).toBe(false);
  });
});
