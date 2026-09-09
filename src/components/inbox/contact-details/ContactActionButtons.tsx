import {
  Phone, PhoneCall, Headphones, MessageCircle, Mail, ArrowLeftRight,
  Briefcase, MoreHorizontal, ChevronsDownUp, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useSyncToCRM } from '@/hooks/integrations/useSyncToCRM';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import type { Conversation } from '@/types/chat';
import { navigateToView } from '@/hooks/system/useNavigationHistory';

interface ContactActionButtonsProps {
  contact: { id: string; name: string; phone: string; email?: string };
  conversation?: Conversation;
  hasExpandedSections?: boolean;
  onCollapseAll?: () => void;
  onQuickAction?: (action: string) => void;
  onStartCall: (type: 'whatsapp' | 'voip') => void;
}

function CrmSyncMenuItem({ conversation }: { conversation: Conversation }) {
  const { syncConversationAsync, isSyncing, isConfigured } = useSyncToCRM();
  if (!isConfigured) return null;

  const handleCrmSync = async () => {
    try {
      const result = await syncConversationAsync({
        contactId: conversation.contact.id,
      });
      if (result?.synced) {
        toast.success('Sincronizado com o CRM!', {
          description: result.new_relationship_score != null ? `Score atualizado: ${result.new_relationship_score}` : undefined,
        });
      } else if (result?.queued) {
        toast.info('Sincronização agendada', { description: 'A fila CRM fará novas tentativas automaticamente.' });
      } else if (result?.reason === 'duplicate') {
        toast.info('Já sincronizado', { description: 'Esta conversa já foi enviada ao CRM.' });
      } else if (result?.reason === 'contact_not_found') {
        toast.warning('Contato não encontrado no CRM');
      }
    } catch {
      toast.error('Erro ao sincronizar com CRM');
    }
  };

  return (
    <DropdownMenuItem onClick={handleCrmSync} disabled={isSyncing} className="gap-2 text-xs">
      <RefreshCw className={cn('w-3.5 h-3.5 text-primary', isSyncing && 'animate-spin')} />Sincronizar CRM
    </DropdownMenuItem>
  );
}

function Tile({ icon, label, onClick, disabled, title, testId }: {
  icon: React.ReactNode; label: string; onClick?: () => void; disabled?: boolean; title?: string; testId?: string;
}) {
  return (
    <button
      type="button"
      data-testid={testId ?? 'contact-action-tile'}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'w-full min-w-0 h-14 rounded-xl bg-muted/40 border border-border flex flex-col items-center justify-center gap-1',
        'hover:bg-muted/70 transition-colors disabled:opacity-40 disabled:pointer-events-none',
      )}
    >
      {icon}
      <span className="text-[11px] text-muted-foreground leading-none">{label}</span>
    </button>
  );
}

export function ContactActionButtons({
  contact, conversation, hasExpandedSections, onCollapseAll, onQuickAction, onStartCall,
}: ContactActionButtonsProps) {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const handleTransfer = () => {
    window.dispatchEvent(new CustomEvent('zapp:open-transfer-dialog', { detail: { contactId: contact.id } }));
  };

  const whatsappPhone = contact.phone.replace(/\D/g, '');
  const openWhatsApp = () => {
    if (!whatsappPhone) return;
    window.open(`https://wa.me/${whatsappPhone}`, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="grid grid-cols-5 gap-2 w-full max-w-[312px] mx-auto mt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tile icon={<Phone className="w-[18px] h-[18px] text-primary" />} label="Ligar" title="Opções de chamada" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onStartCall('whatsapp')} className="gap-2 text-xs">
              <PhoneCall className="w-3.5 h-3.5 text-success" />Ligar via WhatsApp
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => {
              onStartCall('voip');
              window.dispatchEvent(new CustomEvent('start-voip-call', { detail: { phone: contact.phone, name: contact.name } }));
            }} className="gap-2 text-xs">
              <Headphones className="w-3.5 h-3.5 text-info" />Ligar via Telefone
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Tile
          icon={<MessageCircle className="w-[18px] h-[18px] text-success" />}
          label="WhatsApp"
          title={whatsappPhone ? 'Abrir WhatsApp' : 'Sem telefone'}
          disabled={!whatsappPhone}
          onClick={openWhatsApp}
        />

        <Tile
          icon={<Mail className="w-[18px] h-[18px] text-primary" />}
          label="E-mail"
          title={contact.email ? 'Abrir email' : 'Sem email'}
          disabled={!contact.email}
          onClick={() => { if (contact.email) navigateToView('email-chat'); }}
        />

        <Tile
          icon={<ArrowLeftRight className="w-[18px] h-[18px] text-primary" />}
          label="Transferir"
          title="Transferir conversa"
          onClick={handleTransfer}
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tile icon={<MoreHorizontal className="w-[18px] h-[18px] text-muted-foreground" />} label="Mais" title="Mais ações" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onQuickAction?.('edit')} className="gap-2 text-xs">
              <Briefcase className="w-3.5 h-3.5 text-primary" />Editar Contato
            </DropdownMenuItem>
            {crmIntegrationEnabled && conversation && <CrmSyncMenuItem conversation={conversation} />}
            {hasExpandedSections && onCollapseAll && (
              <DropdownMenuItem onClick={onCollapseAll} className="gap-2 text-xs">
                <ChevronsDownUp className="w-3.5 h-3.5 text-muted-foreground" />Recolher seções
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
    </div>
  );
}
