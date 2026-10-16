import type { ReactNode } from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const roleState = { isAdmin: false, isSupervisor: false };
vi.mock('@/hooks/system/useUserRole', () => ({ useUserRole: () => roleState }));

vi.mock('@/hooks/system/useUserSettings', () => ({
  useUserSettings: () => ({
    settings: {},
    isLoading: false,
    isSaving: false,
    updateSettings: vi.fn(),
    saveSettings: vi.fn(),
    toggleWorkDay: vi.fn(),
  }),
}));
vi.mock('@/hooks/ui/useOnboarding', () => ({
  useOnboarding: () => ({ hasCompletedOnboarding: true, loading: false, completeOnboarding: vi.fn(), resetOnboarding: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

// Tabs simplificado (mesmo padrao usado em GmailInboxView.test.tsx): TabsContent
// renderiza sempre, sem depender de qual aba esta ativa. Isso isola o teste no
// que realmente queremos verificar -- o guard `{isStaff && (...)}` em volta de
// cada TabsContent staff-only -- sem depender da mecanica de clique/estado
// interno do Radix Tabs, que nao responde a fireEvent.click em jsdom aqui.
vi.mock('@/components/ui/tabs', async () => {
  const { createElement: ce } = await import('react');
  return {
    Tabs: ({ children }: { children: ReactNode }) => ce('div', {}, children),
    TabsList: ({ children }: { children: ReactNode }) => ce('div', { role: 'tablist' }, children),
    TabsTrigger: ({ children }: { children: ReactNode }) => ce('button', { role: 'tab' }, children),
    TabsContent: ({ children }: { children: ReactNode }) => ce('div', {}, children),
  };
});

// Paineis: stub para isolar o teste na composicao/guard de abas do proprio
// SettingsView, nao no comportamento interno de cada painel (mesmo criterio
// usado em DashboardView.test.tsx).
vi.mock('@/components/nps/NPSDashboard', () => ({ NPSDashboard: () => <div data-testid="stub-nps" /> }));
vi.mock('@/components/settings/FollowUpSequences', () => ({ FollowUpSequences: () => <div data-testid="stub-followup" /> }));
vi.mock('@/components/inbox/QuickRepliesManager', () => ({ QuickRepliesManager: () => <div data-testid="stub-quick-replies" /> }));
vi.mock('@/components/inbox/stickers/StickerManager', () => ({ StickerManager: () => <div data-testid="stub-sticker-manager" /> }));
vi.mock('@/components/settings/AIAutoTagsConfig', () => ({ AIAutoTagsConfig: () => <div data-testid="stub-ai-tags" /> }));
vi.mock('@/components/settings/AIProvidersManager', () => ({ AIProvidersManager: () => <div data-testid="stub-ai-providers" /> }));
vi.mock('@/components/settings/CSATAutoConfig', () => ({ CSATAutoConfig: () => <div data-testid="stub-csat" /> }));
vi.mock('@/components/settings/ChatbotL1Config', () => ({ ChatbotL1Config: () => <div data-testid="stub-chatbot-l1" /> }));
vi.mock('@/components/settings/LanguageSelector', () => ({ LanguageSelector: () => <div data-testid="stub-language" /> }));
vi.mock('@/components/settings/SkillBasedRoutingSettings', () => ({ SkillBasedRoutingSettings: () => <div data-testid="stub-routing" /> }));
vi.mock('@/components/settings/SoundCustomizationPanel', () => ({ SoundCustomizationPanel: () => <div data-testid="stub-sounds" /> }));
vi.mock('@/components/voice/ElevenLabsDialogue', () => ({ ElevenLabsDialogue: () => <div data-testid="stub-elevenlabs-dialogue" /> }));
vi.mock('@/components/voice/ElevenLabsVoiceDesign', () => ({ ElevenLabsVoiceDesign: () => <div data-testid="stub-elevenlabs-voice" /> }));
vi.mock('@/components/settings/MediaLibraryAdmin', () => ({ MediaLibraryAdmin: () => <div data-testid="stub-media" /> }));
vi.mock('@/components/notifications/NotificationSettingsPanel', () => ({ NotificationSettingsPanel: () => <div data-testid="stub-notifications" /> }));
vi.mock('@/components/settings/KeyboardShortcutsSettings', () => ({ KeyboardShortcutsSettings: () => <div data-testid="stub-shortcuts" /> }));
vi.mock('@/components/settings/GlobalSettingsSection', () => ({ GlobalSettingsSection: () => <div data-testid="stub-global" /> }));
vi.mock('@/components/settings/IntegrationKeysSection', () => ({ IntegrationKeysSection: () => <div data-testid="stub-integration-keys" /> }));
vi.mock('@/components/settings/ScheduleSettings', () => ({ ScheduleSettings: () => <div data-testid="stub-schedule" /> }));
vi.mock('@/components/settings/MessagesSettings', () => ({ MessagesSettings: () => <div data-testid="stub-messages" /> }));
vi.mock('@/components/settings/AutomationSettings', () => ({ AutomationSettings: () => <div data-testid="stub-automation" /> }));
vi.mock('@/components/settings/AppearanceSettings', () => ({ AppearanceSettings: () => <div data-testid="stub-appearance" /> }));

import { SettingsView } from '../SettingsView';

// As 12 abas restritas a staff, com o testid que o painel real (stubado
// acima) deixa no DOM quando o TabsContent que o envolve monta.
const STAFF_ONLY_TEST_IDS = [
  'stub-schedule', 'stub-messages', 'stub-automation', 'stub-global',
  'stub-followup', 'stub-media', 'stub-nps', 'stub-ai-tags', 'stub-csat',
  'stub-chatbot-l1', 'stub-routing', 'stub-ai-providers',
];

describe('SettingsView — guard das abas staff-only (RBAC)', () => {
  beforeEach(() => {
    roleState.isAdmin = false;
    roleState.isSupervisor = false;
  });

  it('agente: nenhum dos 12 paineis staff-only monta no DOM', () => {
    render(<SettingsView />);
    for (const testId of STAFF_ONLY_TEST_IDS) {
      expect(screen.queryByTestId(testId)).not.toBeInTheDocument();
    }
    // paineis pessoais continuam de pe
    expect(screen.getByTestId('stub-notifications')).toBeInTheDocument();
    expect(screen.getByTestId('stub-appearance')).toBeInTheDocument();
  });

  it('agente: nenhuma das 12 abas staff-only aparece na barra', () => {
    render(<SettingsView />);
    const tabs = screen.getAllByRole('tab').map((el) => el.textContent);
    expect(tabs).toEqual(['Notificações', 'Aparência', 'Atalhos', 'Sons']);
  });

  it('staff (admin): todos os 12 paineis staff-only montam no DOM', () => {
    roleState.isAdmin = true;
    render(<SettingsView />);
    for (const testId of STAFF_ONLY_TEST_IDS) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });

  it('staff (supervisor): mesmo resultado que admin -- isStaff cobre os dois papeis', () => {
    roleState.isSupervisor = true;
    render(<SettingsView />);
    for (const testId of STAFF_ONLY_TEST_IDS) {
      expect(screen.getByTestId(testId)).toBeInTheDocument();
    }
  });
});
