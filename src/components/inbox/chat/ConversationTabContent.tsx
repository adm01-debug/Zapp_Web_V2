import { lazy, Suspense, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import type { Conversation, Message } from '@/types/chat';
import type { ConversationTab } from './ConversationTabs';
import { TabBanner } from '../tabs/TabBanner';

const conversationTabId = (tab: ConversationTab) => `conversation-tab-${tab}`;
const conversationTabPanelId = (tab: ConversationTab) => `conversation-tabpanel-${tab}`;

const AiTab = lazy(() =>
  import('../tabs/AiTab').then((m) => ({ default: m.AiTab })));
const Crm360Tab = lazy(() =>
  import('../tabs/Crm360Tab').then((m) => ({ default: m.Crm360Tab })));
const OrdersTab = lazy(() =>
  import('../tabs/OrdersTab').then((m) => ({ default: m.OrdersTab })));
const TasksTab = lazy(() =>
  import('../tabs/TasksTab').then((m) => ({ default: m.TasksTab })));
const NotesTab = lazy(() =>
  import('../tabs/NotesTab').then((m) => ({ default: m.NotesTab })));
const FilesTab = lazy(() =>
  import('../tabs/FilesTab').then((m) => ({ default: m.FilesTab })));
const HistoryTab = lazy(() =>
  import('../tabs/HistoryTab').then((m) => ({ default: m.HistoryTab })));

function PanelFallback() {
  return (
    <div className="flex items-center justify-center gap-2 h-40" role="status" aria-live="polite">
      <Loader2 className="w-5 h-5 animate-spin motion-reduce:animate-none text-muted-foreground" aria-hidden="true" />
      <span className="sr-only">Carregando conteúdo da aba…</span>
    </div>
  );
}

/** Wrapper comum: scroll próprio + padding + boundary por seção. */
function Panel({ name, tab, active, children }: { name: string; tab: ConversationTab; active: boolean; children: ReactNode }) {
  return (
    <div
      id={conversationTabPanelId(tab)}
      role="tabpanel"
      aria-labelledby={conversationTabId(tab)}
      tabIndex={0}
      hidden={!active}
      className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <SectionErrorBoundary sectionName={name}>
        <Suspense fallback={<PanelFallback />}>{children}</Suspense>
      </SectionErrorBoundary>
    </div>
  );
}

interface ConversationTabContentProps {
  activeTab: ConversationTab;
  onTabChange: (tab: ConversationTab) => void;
  conversation: Conversation;
  messages: Message[];
  /** Conteúdo da aba Chat — renderizado pelo pai, sempre montado. */
  children: ReactNode;
  /** "Usar resposta" (aba IA) — leva o texto para o input do Chat e troca de aba. */
  onUseSuggestion?: (text: string) => void;
}

export function ConversationTabContent({
  activeTab, onTabChange, conversation, messages, children, onUseSuggestion,
}: ConversationTabContentProps) {
  const contactId = conversation.contact.id;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/*
        A aba Chat fica sempre montada e só é escondida — desmontar perderia
        scroll, rascunho de mensagem, gravação de áudio e assinaturas realtime.
        As demais abas montam sob demanda (lazy) e desmontam ao sair.
      */}
      <div
        id={conversationTabPanelId('chat')}
        role="tabpanel"
        aria-labelledby={conversationTabId('chat')}
        tabIndex={0}
        hidden={activeTab !== 'chat'}
        className="flex-1 flex-col min-h-0 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[active=true]:flex"
        data-active={activeTab === 'chat'}
      >
        {activeTab === 'chat' && (
          <div className="px-4 pt-3">
            <TabBanner
              icon={Sparkles}
              title="Assistente IA"
              description="Sugestões de resposta, identificação de intenção e próximos passos."
              action={{ label: 'Ver sugestões', onClick: () => onTabChange('ia') }}
              dismissKey="inbox-ai-banner-dismissed"
              testId="chat-ai-banner"
            />
          </div>
        )}
        {children}
      </div>

      <Panel name="Assistente IA" tab="ia" active={activeTab === 'ia'}>
        {activeTab === 'ia' && (
          <AiTab
            conversation={conversation}
            messages={messages}
            onUseSuggestion={(text) => onUseSuggestion?.(text)}
          />
        )}
      </Panel>

      <Panel name="CRM 360°" tab="crm" active={activeTab === 'crm'}>
        {activeTab === 'crm' && <Crm360Tab conversation={conversation} messages={messages} onTabChange={onTabChange} />}
      </Panel>

      <Panel name="Pedidos" tab="orders" active={activeTab === 'orders'}>
        {activeTab === 'orders' && <OrdersTab contactId={contactId} />}
      </Panel>

      <Panel name="Tarefas" tab="tasks" active={activeTab === 'tasks'}>
        {activeTab === 'tasks' && <TasksTab contactId={contactId} />}
      </Panel>

      <Panel name="Notas" tab="notes" active={activeTab === 'notes'}>
        {activeTab === 'notes' && <NotesTab contactId={contactId} />}
      </Panel>

      <Panel name="Arquivos" tab="files" active={activeTab === 'files'}>
        {activeTab === 'files' && <FilesTab contactId={contactId} contactName={conversation.contact.name} />}
      </Panel>

      <Panel name="Histórico" tab="history" active={activeTab === 'history'}>
        {activeTab === 'history' && <HistoryTab contactId={contactId} />}
      </Panel>
    </div>
  );
}
