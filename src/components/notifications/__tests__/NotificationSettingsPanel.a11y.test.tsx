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

import { NotificationSettingsPanel } from '../NotificationSettingsPanel';
import { NotificationTypeSection, SoundSelector } from '../NotificationTypeCards';

/**
 * O axe varre a página inteira: Switches sem nome (button-name), Slider sem
 * nome (aria-input-field-name) e `region` (seção renderizada fora de landmark
 * no teste) são achados FORA deste cartão — vão como comentário no Kanban,
 * não como correção aqui. O que este cartão garante: nenhuma regra do axe
 * se queixa dos controles de som (seletores e botões "Testar som").
 */
async function axeSemQueixaNosControlesDeSom() {
  // jsdom não tem layout: contraste fica fora (padrão do repo).
  const results = await axe(document.body, { rules: { 'color-contrast': { enabled: false } } });
  // `region` lista TODO conteúdo quando a seção é renderizada fora de landmark
  // no teste (artefato do harness, documentado no WelcomeModal.a11y.test) —
  // não é queixa sobre os controles, então fica fora desta checagem.
  const htmlDosNos = results.violations
    .filter((v) => v.id !== 'region')
    .flatMap((v) => v.nodes.map((n) => n.html));
  return htmlDosNos.filter(
    (html) =>
      html.includes('aria-label="Som de') ||
      html.includes('aria-label="Testar som') ||
      html.includes('role="combobox"'),
  );
}
import { TooltipProvider } from '@/components/ui/tooltip';

function renderPanel() {
  return render(
    <TooltipProvider>
      <NotificationSettingsPanel />
    </TooltipProvider>,
  );
}

describe('N-198 — controles de som com nome acessível', () => {
  it('o botão "Testar som" mestre tem aria-label inequívoco', () => {
    renderPanel();
    // getByRole lança se houver 0 ou 2+; o getAllByRole abaixo prova que há exatamente 1.
    expect(screen.getByRole('button', { name: 'Testar som' })).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Testar som' })).toHaveLength(1);
  });

  it('o seletor de som de mensagem tem aria-label "Som de mensagem"', () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('combobox', { name: 'Som de mensagem' }),
    ).toBeInTheDocument();
  });

  it('o botão de testar som de mensagem tem aria-label "Testar som de mensagem"', () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    expect(
      screen.getByRole('button', { name: 'Testar som de mensagem' }),
    ).toBeInTheDocument();
  });

  it('todos os tipos da seção têm seletor e botão com nome acessível', () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    for (const tipo of ['mensagem', 'menção', 'violação de SLA', 'meta alcançada', 'conquista']) {
      expect(screen.getByRole('combobox', { name: `Som de ${tipo}` })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: `Testar som de ${tipo}` })).toBeInTheDocument();
    }
  });

  it('axe: nenhuma regra se queixa dos controles de som do painel', async () => {
    renderPanel();
    expect(screen.getByRole('button', { name: 'Testar som' })).toBeInTheDocument();
    expect(await axeSemQueixaNosControlesDeSom()).toEqual([]);
  });

  it('axe: nenhuma regra se queixa dos controles de som da seção de tipos', async () => {
    render(
      <TooltipProvider>
        <NotificationTypeSection
          settings={h.settings}
          updateSettings={h.updateSettings}
        />
      </TooltipProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Som de mensagem' })).toBeInTheDocument();
    expect(await axeSemQueixaNosControlesDeSom()).toEqual([]);
  });

  it('o seletor de conquista usa o rótulo do tipo ("Som de conquista")', () => {
    render(
      <TooltipProvider>
        <SoundSelector value="chime" onChange={() => {}} notificationType="achievement" label="Som" soundVolume={70} />
      </TooltipProvider>,
    );
    expect(screen.getByRole('combobox', { name: 'Som de conquista' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Testar som de conquista' })).toBeInTheDocument();
  });

});
