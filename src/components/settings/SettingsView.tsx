import { useMemo, useState } from 'react';
import { NPSDashboard } from '@/components/nps/NPSDashboard';
import { FollowUpSequences } from '@/components/settings/FollowUpSequences';
import { QuickRepliesManager } from '@/components/inbox/QuickRepliesManager';
import { StickerManager } from '@/components/inbox/stickers/StickerManager';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Clock, MessageSquare, Bell, Palette, Save, RefreshCw, Loader2,
  Keyboard, Volume2, ArrowRight, Package, Globe, TrendingUp, Settings,
  MessageSquareHeart, Bot, Brain, Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { AIProvidersManager } from '@/components/settings/AIProvidersManager';
import { CSATAutoConfig } from '@/components/settings/CSATAutoConfig';
import { ChatbotL1Config } from '@/components/settings/ChatbotL1Config';
import { LanguageSelector } from '@/components/settings/LanguageSelector';
import { SkillBasedRoutingSettings } from '@/components/settings/SkillBasedRoutingSettings';
import { SoundCustomizationPanel } from '@/components/settings/SoundCustomizationPanel';
import { ElevenLabsDialogue } from '@/components/voice/ElevenLabsDialogue';
import { ElevenLabsVoiceDesign } from '@/components/voice/ElevenLabsVoiceDesign';
import { MediaLibraryAdmin } from '@/components/settings/MediaLibraryAdmin';
import { NotificationSettingsPanel } from '@/components/notifications/NotificationSettingsPanel';
import { KeyboardShortcutsSettings } from '@/components/settings/KeyboardShortcutsSettings';
import { GlobalSettingsSection } from '@/components/settings/GlobalSettingsSection';
import { IntegrationKeysSection } from '@/components/settings/IntegrationKeysSection';
import { ScheduleSettings } from '@/components/settings/ScheduleSettings';
import { MessagesSettings } from '@/components/settings/MessagesSettings';
import { AutomationSettings } from '@/components/settings/AutomationSettings';
import { AppearanceSettings } from '@/components/settings/AppearanceSettings';
import { PageTemplate } from '@/components/layout/PageTemplate';
import { useUserSettings } from '@/hooks/system/useUserSettings';
import { useOnboarding } from '@/hooks/ui/useOnboarding';
import { useUserRole } from '@/hooks/system/useUserRole';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// Catalogo das abas de configuracao: a barra de grupos (TAB_GROUPS) e o teste
// de cobertura leem daqui, entao uma aba nova so precisa existir aqui + num
// grupo -- e o teste acusa qualquer aba orfa (fora de qualquer grupo).
const TABS_META: Record<string, { label: string; icon: LucideIcon; staffOnly: boolean }> = {
  schedule: { label: 'Horário', icon: Clock, staffOnly: true },
  messages: { label: 'Mensagens', icon: MessageSquare, staffOnly: true },
  automation: { label: 'Automação', icon: RefreshCw, staffOnly: true },
  routing: { label: 'Roteamento', icon: Users, staffOnly: true },
  followup: { label: 'Follow-up', icon: ArrowRight, staffOnly: true },
  'chatbot-l1': { label: 'Chatbot L1', icon: Bot, staffOnly: true },
  'ai-providers': { label: 'Gestão IA', icon: Brain, staffOnly: true },
  csat: { label: 'CSAT', icon: MessageSquareHeart, staffOnly: true },
  nps: { label: 'NPS', icon: TrendingUp, staffOnly: true },
  notifications: { label: 'Notificações', icon: Bell, staffOnly: false },
  appearance: { label: 'Aparência', icon: Palette, staffOnly: false },
  shortcuts: { label: 'Atalhos', icon: Keyboard, staffOnly: false },
  sounds: { label: 'Sons', icon: Volume2, staffOnly: false },
  global: { label: 'Global', icon: Globe, staffOnly: true },
  media: { label: 'Mídia', icon: Package, staffOnly: true },
};

// Grupos logicos montados olhando o CONTEUDO de cada painel (nao o nome):
// Atendimento = operacao do atendimento (horario, mensagens, automacao,
// roteamento, follow-up); Inteligencia artificial = recursos de IA; Qualidade =
// pesquisa de satisfacao (CSAT automatico) e painel NPS; Aparência = preferencias
// pessoais do usuario; Sistema = configuracoes globais/integracoes e biblioteca
// de midia. A ordem das abas dentro do grupo preserva a ordem original da barra.
const TAB_GROUPS: { id: string; label: string; icon: LucideIcon; tabs: string[] }[] = [
  { id: 'atendimento', label: 'Atendimento', icon: MessageSquare, tabs: ['schedule', 'messages', 'automation', 'routing', 'followup'] },
  { id: 'ia', label: 'Inteligência artificial', icon: Bot, tabs: ['chatbot-l1', 'ai-providers'] },
  { id: 'qualidade', label: 'Qualidade', icon: MessageSquareHeart, tabs: ['csat', 'nps'] },
  { id: 'aparencia', label: 'Aparência', icon: Palette, tabs: ['notifications', 'appearance', 'shortcuts', 'sounds'] },
  { id: 'sistema', label: 'Sistema', icon: Settings, tabs: ['global', 'media'] },
];

export function SettingsView() {
  const { settings, isLoading, isSaving, updateSettings, saveSettings, toggleWorkDay } = useUserSettings();
  const { resetOnboarding } = useOnboarding();
  const { isAdmin, isSupervisor } = useUserRole();
  // Agent/special_agent so vem as 4 abas pessoais — o resto configura a
  // operacao inteira (horario, roteamento, IA, integracoes...), nao o usuario.
  const isStaff = isAdmin || isSupervisor;

  const visibleTabs = useMemo(
    () => Object.keys(TABS_META).filter((value) => isStaff || !TABS_META[value].staffOnly),
    [isStaff],
  );
  const visibleGroups = useMemo(
    () => TAB_GROUPS.filter((group) => group.tabs.some((value) => visibleTabs.includes(value))),
    [visibleTabs],
  );

  const [selectedTab, setSelectedTab] = useState<string>(isStaff ? 'schedule' : 'notifications');

  // Derivado (nao estado): se a aba selecionada nao existir para o papel atual
  // (staff carrega depois), cai na primeira visivel -- sem setState em efeito.
  const activeTab = visibleTabs.includes(selectedTab) ? selectedTab : visibleTabs[0];
  const activeGroup = visibleGroups.find((group) => group.tabs.includes(activeTab)) ?? visibleGroups[0];

  const handleResetOnboarding = () => {
    resetOnboarding();
    toast.success('Tour de onboarding reiniciado! Volte ao Dashboard para iniciar o tour.');
  };

  return (
    <PageTemplate
      constrained
      title="Configurações"
      subtitle="Configure o comportamento da plataforma"
      icon={<Settings className="w-5 h-5" />}
      actions={
        <Button onClick={saveSettings} disabled={isSaving || isLoading} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Alterações
        </Button>
      }
    >
      {isLoading ? (
        <div className="space-y-4">
          {/* Skeleton tabs bar */}
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-28 rounded-md flex-shrink-0" />
            ))}
          </div>
          {/* Skeleton form fields matching settings layout */}
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <Skeleton className="h-5 w-48" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-10 w-full rounded-md" />
                </div>
              ))}
            </div>
            <div className="pt-2 flex gap-3">
              <Skeleton className="h-9 w-28 rounded-md" />
              <Skeleton className="h-9 w-20 rounded-md" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-6 space-y-5">
            <Skeleton className="h-5 w-36" />
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-6 w-11 rounded-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
      <Tabs value={activeTab} onValueChange={setSelectedTab} className="space-y-4">
        {/* Nivel 1 — grupos logicos. Substitui a barra horizontal unica de 16
            abas (com scroll, fade e seta pulsante) por poucas categorias que
            quebram linha em telas pequenas, sem scroll horizontal. */}
        <nav
          aria-label="Categorias de configurações"
          className="flex flex-wrap items-center gap-1 rounded-xl border border-border/40 bg-muted/40 p-1"
        >
          {visibleGroups.map((group) => {
            const Icon = group.icon;
            const isActive = activeGroup?.id === group.id;
            const firstVisibleTab = group.tabs.find((value) => visibleTabs.includes(value));
            if (!firstVisibleTab) return null;
            return (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedTab(firstVisibleTab)}
                aria-current={isActive ? 'true' : undefined}
                className={cn(
                  'inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors max-sm:min-h-[44px]',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-foreground/70 hover:bg-background/60 hover:text-foreground',
                )}
              >
                <Icon className="h-4 w-4" />
                {group.label}
              </button>
            );
          })}
        </nav>

        {/* Nivel 2 — abas do grupo ativo. Poucas por grupo, entao quebram linha
            em vez de exigir scroll horizontal. */}
        {activeGroup && (
          <TabsList className="bg-muted/30 flex flex-wrap h-auto max-sm:h-auto w-full justify-start gap-1 p-1">
            {activeGroup.tabs
              .filter((value) => visibleTabs.includes(value))
              .map((value) => {
                const tab = TABS_META[value];
                const Icon = tab.icon;
                return (
                  <TabsTrigger key={value} value={value} className="gap-2 whitespace-nowrap max-sm:min-h-[44px]">
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </TabsTrigger>
                );
              })}
          </TabsList>
        )}

        {isStaff && (
          <TabsContent value="schedule">
            <ScheduleSettings />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="messages">
            <div className="space-y-6">
              <MessagesSettings />
              <QuickRepliesManager compact={false} />
            </div>
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="automation">
            <AutomationSettings />
          </TabsContent>
        )}

        <TabsContent value="notifications">
          <NotificationSettingsPanel />
        </TabsContent>

        <TabsContent value="appearance">
          <AppearanceSettings settings={settings} updateSettings={updateSettings} onResetOnboarding={handleResetOnboarding} />
        </TabsContent>

        <TabsContent value="shortcuts">
          <KeyboardShortcutsSettings />
        </TabsContent>

        <TabsContent value="sounds">
          <div className="space-y-6">
            <SoundCustomizationPanel />
            <ElevenLabsDialogue />
            <ElevenLabsVoiceDesign />
          </div>
        </TabsContent>

        {isStaff && (
          <TabsContent value="global">
            <div className="space-y-6">
              <GlobalSettingsSection />
              <IntegrationKeysSection />
            </div>
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="followup">
            <FollowUpSequences />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="media">
            <div className="space-y-6">
              <MediaLibraryAdmin />
              <StickerManager mode="manager" />
            </div>
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="nps">
            <NPSDashboard />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="csat">
            <CSATAutoConfig />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="chatbot-l1">
            <ChatbotL1Config />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="routing">
            <SkillBasedRoutingSettings />
          </TabsContent>
        )}

        {isStaff && (
          <TabsContent value="ai-providers">
            <AIProvidersManager />
          </TabsContent>
        )}
      </Tabs>
      )}
    </PageTemplate>
  );
}
