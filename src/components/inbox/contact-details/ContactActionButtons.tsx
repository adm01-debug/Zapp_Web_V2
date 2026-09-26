import {
  Phone, PhoneCall, Headphones, Mail, ArrowLeftRight,
  Star, Archive, Ban, Briefcase, MoreHorizontal, ChevronsDownUp, RefreshCw,
} from 'lucide-react';
import * as React from 'react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useCRMIntegrationEnabled } from '@/hooks/system/useCRMIntegrationEnabled';
import { useSyncToCRM } from '@/hooks/integrations/useSyncToCRM';
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
          description: result.new_relationship_score ? `Score atualizado: ${result.new_relationship_score}` : undefined,
        });
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

type TileProps = React.ComponentPropsWithoutRef<'button'> & {
  icon: React.ReactNode; label: string; testId?: string; hoverColorClass?: string;
};

const Tile = React.forwardRef<HTMLButtonElement, TileProps>(function Tile(
  { icon, label, testId, hoverColorClass = 'group-hover:text-primary', className, ...rest }, ref,
) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={ref}
            type="button"
            data-testid={testId ?? 'contact-action-tile'}
            {...rest}
            className={cn(
              'group h-10 w-10 rounded-lg flex items-center justify-center text-muted-foreground',
              'hover:bg-muted/50 transition-colors disabled:opacity-40 disabled:pointer-events-none',
              hoverColorClass,
              className,
            )}
          >
            {icon}
          </button>
        </TooltipTrigger>
        <TooltipContent>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

export function ContactActionButtons({
  contact, conversation, hasExpandedSections, onCollapseAll, onQuickAction, onStartCall,
}: ContactActionButtonsProps) {
  const crmIntegrationEnabled = useCRMIntegrationEnabled();
  const handleTransfer = () => {
    window.dispatchEvent(new CustomEvent('open-transfer-dialog', { detail: { contactId: contact.id } }));
  };

  return (
    <div className="grid grid-cols-4 gap-2 justify-items-center mt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tile icon={<Phone className="w-[18px] h-[18px]" />} label="Ligar" title="Opções de chamada" />
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
          icon={<Mail className="w-[18px] h-[18px]" />}
          label="E-mail"
          title={contact.email ? 'Abrir email' : 'Sem email'}
          disabled={!contact.email}
          onClick={() => { if (contact.email) navigateToView('email-chat'); }}
        />

        <Tile
          icon={<ArrowLeftRight className="w-[18px] h-[18px]" />}
          label="Transferir"
          title="Transferir conversa"
          onClick={handleTransfer}
          hoverColorClass="group-hover:text-success"
        />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Tile icon={<MoreHorizontal className="w-[18px] h-[18px]" />} label="Mais" title="Mais ações" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[160px]">
            <DropdownMenuItem onClick={() => onQuickAction?.('edit')} className="gap-2 text-xs">
              <Briefcase className="w-3.5 h-3.5 text-primary" />Editar Contato
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickAction?.('vip')} className="gap-2 text-xs">
              <Star className="w-3.5 h-3.5 text-warning" />Marcar VIP
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickAction?.('archive')} className="gap-2 text-xs">
              <Archive className="w-3.5 h-3.5 text-muted-foreground" />Arquivar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onQuickAction?.('block')} className="gap-2 text-xs text-destructive">
              <Ban className="w-3.5 h-3.5" />Bloquear
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
