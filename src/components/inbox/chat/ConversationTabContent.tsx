import { lazy, Suspense, type ReactNode } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { SectionErrorBoundary } from '@/components/ui/section-error-boundary';
import type { Conversation, Message } from '@/types/chat';
import type { ConversationTab } from './ConversationTabs';
import { TabBanner } from '../tabs/TabBanner';

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
    <div className="flex items-center justify-center h-40">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Wrapper comum: scroll próprio + padding + boundary por seção. */
function Panel({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex-1 min-h-0 overflow-y-auto p-4">
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
      <div className={activeTab === 'chat' ? 'flex-1 flex flex-col min-h-0' : 'hidden'}>
        {activeTab === 'chat' && (
          <div className="px-4 pt-3">
            <TabBanner
              icon={Sparkles}
              title="Assistente IA"
              description="Sugestões de resposta, identificação de intenção e próximos passos."
              action={{ label: 'Ver sugestões', onClick: () => onTabChange('ia') }}
              dismissKey="inbox-ai-banner-dismissed"
              testId="chat-ai-banner"
              iconClassName="bg-kpi-purple text-kpi-purple-fg"
            />
          </div>
        )}
        {children}
      </div>

      {activeTab === 'ia' && (
        <Panel name="Assistente IA">
          <AiTab
            conversation={conversation}
            messages={messages}
            onUseSuggestion={(text) => onUseSuggestion?.(text)}
          />
        </Panel>
      )}

      {activeTab === 'crm' && (
        <Panel name="CRM 360°">
          <Crm360Tab conversation={conversation} messages={messages} onTabChange={onTabChange} />
        </Panel>
      )}

      {activeTab === 'orders' && (
        <Panel name="Pedidos">
          <OrdersTab contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'tasks' && (
        <Panel name="Tarefas">
          <TasksTab contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'notes' && (
        <Panel name="Notas">
          <NotesTab contactId={contactId} />
        </Panel>
      )}

      {activeTab === 'files' && (
        <Panel name="Arquivos">
          <FilesTab contactId={contactId} contactName={conversation.contact.name} />
        </Panel>
      )}

      {activeTab === 'history' && (
        <Panel name="Histórico">
          <HistoryTab contactId={contactId} />
        </Panel>
      )}
    </div>
  );
}
