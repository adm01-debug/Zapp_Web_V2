import { useState, useEffect } from 'react';
import { useTeamConversations } from '@/hooks/chat/useTeamChat';
import { TeamConversationList } from './TeamConversationList';
import { TeamChatPanel } from './TeamChatPanel';
import { TeamMemberDetails } from './TeamMemberDetails';
import { NewConversationDialog } from './NewConversationDialog';
import { Users, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useActiveTeamChatConversation } from '@/hooks/chat/useTeamChatNotifications';
import { Button } from '@/components/ui/button';
import { ConversationEmptyState } from '@/components/shared/ConversationEmptyState';

/** Lê ?cid=<id> da URL (deep-link da notificação do chat da equipe). */
function readCidParam(): string | null {
  return new URLSearchParams(window.location.search).get('cid');
}

/** Remove ?cid= da entrada atual sem empilhar histórico (mesmo padrão do ?emailContact). */
function stripCidParam(): void {
  const url = new URL(window.location.href);
  if (!url.searchParams.has('cid')) return;
  url.searchParams.delete('cid');
  const base = window.history.state && typeof window.history.state === 'object' ? window.history.state : {};
  window.history.replaceState(base, '', url.href);
}

export function TeamChatView() {
  const {
    data: conversations = [],
    isLoading,
    isPending,
    refetch: refetchConversations,
  } = useTeamConversations();
  // Sem perfil a query fica desabilitada (`enabled: !!profile`) e `isLoading` é false
  // sem nenhuma busca feita: `isPending` segura o deep-link até a primeira lista real.
  const conversationsLoading = isLoading || !!isPending;
  // Conversa aberta (escolha do usuário ou deep-link já resolvido). Um deep-link
  // pendente não a apaga: só a substitui quando a conversa dele existir.
  const [pickedId, setPickedId] = useState<string | null>(null);
  const [deepLinkCid, setDeepLinkCid] = useState<string | null>(() => readCidParam());
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  // Recarga da lista pedida pelo deep-link (ver abaixo): cid e se já terminou.
  const [recarga, setRecarga] = useState<{ cid: string; feita: boolean } | null>(null);

  // Deep-link: ?cid=<uuid> (vindo da notificação) é lido ao abrir a tela e a cada
  // `zapp:navigate` (nova notificação com a tela aberta) e sai da URL na hora —
  // recargas da lista (realtime) não desfazem a conversa escolhida depois.
  useEffect(() => {
    const onNavigate = () => {
      const cid = readCidParam();
      if (!cid) return;
      // Sai da URL aqui mesmo, sem depender de mudança de estado: com o mesmo cid duas
      // vezes seguidas o estado não muda, e o ?cid= ficaria pendurado na URL (reabrindo a
      // conversa ao voltar para a tela ou recarregar).
      stripCidParam();
      // A seleção atual NÃO muda aqui: só troca quando o cid resolver para uma conversa
      // existente (abaixo). Se ele for descartado, o usuário continua na conversa que
      // tinha aberta. E cada notificação é um pedido novo: zera a recarga, para que o
      // mesmo cid descartado antes volte a recarregar a lista (a conversa pode ter
      // passado a existir desde então).
      setDeepLinkCid(cid);
      setRecarga(null);
    };
    window.addEventListener('zapp:navigate', onNavigate);
    return () => window.removeEventListener('zapp:navigate', onNavigate);
  }, []);
  // O ?cid= da abertura já foi lido no estado inicial: sai da URL na montagem, mesmo
  // quando a conversa não existe para o usuário (o pedido é descartado logo abaixo).
  useEffect(() => {
    stripCidParam();
  }, []);
  // Lista carregada sem a conversa do deep-link: antes de desistir, recarrega a lista
  // UMA vez — a notificação de uma conversa recém-criada costuma chegar antes do
  // realtime atualizar a lista. Se depois da recarga ela continuar ausente (sem acesso,
  // apagada), o pedido é descartado e não abre sozinho quando surgir mais tarde.
  // Ajuste de estado no render (padrão do React para estado derivado de props).
  const deepLinkAusente =
    !conversationsLoading && !!deepLinkCid && !conversations.some(c => c.id === deepLinkCid);
  if (deepLinkAusente && recarga?.cid !== deepLinkCid) setRecarga({ cid: deepLinkCid as string, feita: false });
  useEffect(() => {
    if (!recarga || recarga.feita) return;
    let ativo = true;
    void Promise.resolve(refetchConversations()).finally(() => {
      if (ativo) setRecarga((r) => (r && r.cid === recarga.cid ? { ...r, feita: true } : r));
    });
    return () => { ativo = false; };
  }, [recarga, refetchConversations]);
  const deepLinkMissing = deepLinkAusente && recarga?.cid === deepLinkCid && recarga.feita;
  if (deepLinkMissing) setDeepLinkCid(null);
  const deepLinkedId = !conversationsLoading && !deepLinkAusente ? deepLinkCid : null;
  // Deep-link resolvido para conversa existente: vira a escolha atual (substitui a
  // conversa aberta e fecha os detalhes dela). Até resolver, a anterior continua.
  if (deepLinkedId) {
    setPickedId(deepLinkedId);
    setDeepLinkCid(null);
    setShowDetails(false);
  }
  const selectedId = deepLinkedId ?? pickedId;
  const setSelectedId = (id: string | null) => {
    setPickedId(id);
    setDeepLinkCid(null);
  };

  // TC-007: o listener de notificações é ÚNICO e global (montado em App.tsx); aqui a view
  // só publica a conversa em foco para o listener suprimir o alerta dela — e limpa ao
  // desmontar, para voltar a alertar quando o atendente sai da tela.
  useActiveTeamChatConversation(selectedId);

  const selectedConversation = conversations.find(c => c.id === selectedId) || null;

  return (
    <div className="flex h-full w-full bg-background">
      {/* Sidebar */}
      <div className={cn(
        "w-80 border-r border-border flex flex-col shrink-0",
        selectedId && "hidden md:flex"
      )}>
        <TeamConversationList
          conversations={conversations}
          selectedId={selectedId}
          onSelect={(id) => { setSelectedId(id); setShowDetails(false); }}
          onNewConversation={() => setShowNewDialog(true)}
          loading={conversationsLoading}
        />
      </div>

      {/* Chat area */}
      <div className={cn(
        "flex-1 flex flex-col min-w-0 w-0",
        !selectedId && "hidden md:flex"
      )}>
        {selectedConversation ? (
          <TeamChatPanel
            conversation={selectedConversation}
            onBack={() => setSelectedId(null)}
            onToggleDetails={() => setShowDetails(prev => !prev)}
            showDetails={showDetails}
          />
        ) : (
          <ConversationEmptyState
            icon={Users}
            title="Chat da Equipe"
            description="Selecione uma conversa ou inicie uma nova para conversar com seus colegas"
            action={(
              <Button
                size="sm"
                className="gap-2 rounded-xl shadow-lg shadow-primary/20 bg-primary hover:bg-primary/90 text-primary-foreground"
                onClick={() => setShowNewDialog(true)}
              >
                <Plus className="w-4 h-4" />
                Nova conversa
              </Button>
            )}
          />
        )}
      </div>

      {/* Details panel */}
      {showDetails && selectedConversation && (
        <TeamMemberDetails
          conversation={selectedConversation}
          onClose={() => setShowDetails(false)}
        />
      )}

      <NewConversationDialog
        open={showNewDialog}
        onOpenChange={setShowNewDialog}
        onCreated={(id) => {
          setSelectedId(id);
          setShowNewDialog(false);
        }}
      />
    </div>
  );
}
