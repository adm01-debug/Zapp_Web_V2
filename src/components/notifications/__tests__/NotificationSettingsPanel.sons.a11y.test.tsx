/**
 * N-198: os controles de som por tipo e o botão "Testar som"
 * precisam de nome acessível (aria-label) para que leitores de
 * tela anunciem o que cada controle faz.
 *
 * O teste falha sem a correção (RED) e passa depois (GREEN).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { axe } from 'vitest-axe';
import type { NotificationSettings } from '@/hooks/system/useNotificationSettings';
import { TooltipProvider } from '@/components/ui/tooltip';

const h = vi.hoisted(() => ({
  settings: {
    soundEnabled: true,
    soundVolume: 70,
    browserNotifications: false,
    slaBreachSound: true,
    newMessageSound: true,
    mentionSound: true,
    desktopAlerts: false,
    quietHoursEnabled: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    sentimentAlertEnabled: true,
    sentimentAlertThreshold: 30,
    sentimentConsecutiveCount: 3,
    transcriptionNotificationEnabled: true,
    messageSoundType: 'chime' as const,
    mentionSoundType: 'bell' as const,
    slaSoundType: 'alert' as const,
    goalSoundType: 'chime' as const,
    transcriptionSoundType: 'soft' as const,
  } as NotificationSettings,
  updateSettings: vi.fn((_: Partial<NotificationSettings>) => {}),
}));

vi.mock('@/hooks/system/useNotificationSettings', () => ({
  useNotificationSettings: () => ({
    settings: h.settings,
    updateSettings: h.updateSettings,
    resetSettings: vi.fn().mockResolvedValue(true),
    isQuietHours: () => false,
    isLoading: false,
    isSaving: false,
  }),
}));

vi.mock('@/utils/notificationSounds', () => ({
  playNotificationSound: vi.fn(),
  previewSound: vi.fn(),
  requestNotificationPermission: vi.fn().mockResolvedValue(true),
}));

// O cartão "Alertas de Conexão" (PD-38) usa o hook que depende do AuthProvider;
// a tela é renderizada sem provider, então o hook entra falso.
vi.mock('@/hooks/system/useConnectionAlertPreferences', () => ({
  useConnectionAlertPreferences: () => ({
    preferences: { push_enabled: true, email_enabled: true, alert_on_degraded: true, alert_on_disconnected: true },
    isLoading: false,
    isSaving: false,
    updatePreference: vi.fn(),
    updatePreferenceAsync: vi.fn(),
    shouldNotify: () => true,
  }),
}));

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';
import { NotificationTypeSection, SoundSelector } from '../NotificationTypeCards';

/**
 * Os 5 cartões da seção e o rótulo que o nome acessível de cada um deve conter.
 * 'transcrição de áudio' é o texto VISÍVEL da linha `notificationType="achievement"`
 * (antes dizia "conquista", um nome que não batia com a tela).
 */
const TIPOS = [
  'mensagem',
  'menção',
  'violação de SLA',
  'meta alcançada',
  'transcrição de áudio',
] as const;

/**
 * Roda o axe SÓ nos controles de som (seletor + botão "Testar som") e devolve
 * as regras de nome acessível que acusam. Um controle SEM nome cai aqui — é
 * justamente o defeito deste cartão — então a lista tem de vir vazia.
 *
 * O filtro é por regra do axe (button-name / aria-input-field-name), não por
 * procurar o aria-label no HTML: se o nome faltasse, o filtro antigo não via
 * o nó e a checagem passava sem provar nada.
 */
async function queixasDeNome(elemento: HTMLElement) {
  // jsdom não tem layout: contraste fica fora (padrão do repo).
  const results = await axe(elemento, { rules: { 'color-contrast': { enabled: false } } });
  return results.violations
    .filter((v) => v.id === 'button-name' || v.id === 'aria-input-field-name')
    .map((v) => v.id);
}

function renderPanel() {
  return render(
    <TooltipProvider>
      <NotificationSettingsPanel />
    </TooltipProvider>,
  );
}

function renderSection() {
  return render(
    <TooltipProvider>
      <NotificationTypeSection settings={h.settings} updateSettings={h.updateSettings} />
    </TooltipProvider>,
  );
}

describe('N-198 — controles de som com nome acessível', () => {
  it('o botão "Testar som" mestre tem nome e o axe não acusa', async () => {
    renderPanel();
    // getByRole lança se houver 0 (sem nome) ou 2+; o getAllByRole prova que há exatamente 1.
    const botao = screen.getByRole('button', { name: 'Testar som' });
    expect(screen.getAllByRole('button', { name: 'Testar som' })).toHaveLength(1);
    expect(await queixasDeNome(botao)).toEqual([]);
  });

  it('todos os tipos têm seletor e botão com nome acessível (combobox e botão)', () => {
    renderSection();
    for (const tipo of TIPOS) {
      expect(screen.getByRole('combobox', { name: `Som de ${tipo}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Testar som de ${tipo}` })).toBeInTheDocument();
    }
  });

  it('axe: o SoundSelector isolado não tem controle de som sem nome', async () => {
    const { container } = render(
      <TooltipProvider>
        <SoundSelector value="chime" onChange={() => {}} notificationType="achievement" label="Som" soundVolume={70} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Som de transcrição de áudio' })).toBeInTheDocument();
    expect(await queixasDeNome(container)).toEqual([]);
  });

  it('axe: cada SoundSelector da seção não tem controle de som sem nome', async () => {
    renderSection();
    // Localiza as raízes do SoundSelector por estrutura (a raiz de cada combobox):
    // funciona mesmo se o nome acessível estiver faltando, que é o defeito.
    const raizes = Array.from(document.body.querySelectorAll('[role="combobox"]')).map(
      (combobox) => combobox.parentElement as HTMLElement,
    );
    expect(raizes).toHaveLength(TIPOS.length);
    for (const raiz of raizes) {
      expect(await queixasDeNome(raiz)).toEqual([]);
    }
  });
});
