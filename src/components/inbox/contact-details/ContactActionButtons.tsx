import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Phone, PhoneCall, Headphones, Mail, Video,
  Star, Archive, Ban, Briefcase, MoreHorizontal, ChevronsDownUp,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { CRMSyncButton } from '../CRMAutoSync';
import type { Conversation } from '@/types/chat';

interface ContactActionButtonsProps {
  contact: { id: string; name: string; phone: string; email?: string };
  conversation?: Conversation;
  hasExpandedSections?: boolean;
  onCollapseAll?: () => void;
  onQuickAction?: (action: string) => void;
  onStartCall: (type: 'whatsapp' | 'voip') => void;
}

export function ContactActionButtons({
  contact, conversation, hasExpandedSections, onCollapseAll, onQuickAction, onStartCall,
}: ContactActionButtonsProps) {
  return (
    <div className="flex items-center gap-1 mt-2">
      <TooltipProvider>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 border-border/30 hover:border-primary/50 hover:bg-primary/10" title="Opções de chamada">
              <Phone className="w-4 h-4 text-primary" />
            </Button>
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

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 border-border/30 hover:border-primary/50 hover:bg-primary/10"
              onClick={() => toast.info('Chamada de vídeo em breve')}>
              <Video className="w-4 h-4 text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Chamada de vídeo</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 border-border/30 hover:border-primary/50 hover:bg-primary/10"
              onClick={() => { if (contact.email) { const u = new URL(window.location.href); u.searchParams.set('view', 'email-chat'); u.hash = ''; window.history.pushState(null, '', u.href); window.dispatchEvent(new PopStateEvent('popstate')); } }} disabled={!contact.email}>
              <Mail className="w-4 h-4 text-primary" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">{contact.email ? 'Abrir email' : 'Sem email'}</TooltipContent>
        </Tooltip>

        {isExternalConfigured && conversation && <CRMSyncButton conversation={conversation} />}

        {hasExpandedSections && onCollapseAll && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon" className="w-9 h-9 border-border/30 hover:border-muted-foreground/50 hover:bg-muted/20" onClick={onCollapseAll}>
                <ChevronsDownUp className="w-4 h-4 text-muted-foreground" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Recolher todas as seções</TooltipContent>
          </Tooltip>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 border-border/30 hover:bg-muted/30" title="Mais ações">
              <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="center" className="min-w-[140px]">
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
          </DropdownMenuContent>
        </DropdownMenu>
      </TooltipProvider>
    </div>
  );
}
