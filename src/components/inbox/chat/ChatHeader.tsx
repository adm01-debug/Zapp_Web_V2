import { cn } from '@/lib/utils';
import { VisionIcon } from '../ai-tools/VisionIcon';
import { Conversation } from '@/types/chat';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from '@/components/ui/motion';
import { TypingIndicatorCompact } from '../TypingIndicator';
import { SLAIndicator } from '../SLAIndicator';
import { VoiceSelector } from '../VoiceSelector';
import { KeyboardShortcutsHelp } from '../KeyboardShortcutsHelp';
import { QueuePositionNotifier } from '../QueuePositionNotifier';
import { RealtimeCollaboration } from '../RealtimeCollaboration';
import { useExternalContact360 } from '@/hooks/crm/useExternalContact360';
import { useContactIntelligence } from '@/hooks/crm/useContactIntelligence';
import { isExternalConfigured } from '@/integrations/supabase/externalClient';
import { CrmBadges } from './CrmBadges';
import { BusinessHoursBadge } from '../BusinessHoursBadge';
import { AnalysisBadges } from '../AnalysisBadges';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreVertical, Video, Tag, Archive, CheckCircle, Clock, ArrowRight, PhoneCall, Search, Brain, Info, Users, UserCheck, Truck, Wrench } from 'lucide-react';

const contactTypeConfig: Record<string, { label: string; icon: typeof Users; color: string }> = {
  cliente: { label: 'Cliente', icon: Users, color: 'bg-info/10 text-info border-info/30' },
  colaborador: { label: 'Colaborador', icon: UserCheck, color: 'bg-success/10 text-success border-success/30' },
  fornecedor: { label: 'Fornecedor', icon: Truck, color: 'bg-secondary/10 text-secondary border-secondary/30' },
  prestador_servico: { label: 'Prestador', icon: Wrench, color: 'bg-warning/10 text-warning border-warning/30' },
  transportadora: { label: 'Transportadora', icon: Truck, color: 'bg-info/10 text-info border-info/30' },
};

interface ChatHeaderProps {
  conversation: Conversation;
  isContactTyping: boolean;
  showAIAssistant: boolean;
  showDetails: boolean;
  voiceId: string;
  speed: number;
  onToggleAIAssistant: () => void;
  onToggleDetails: () => void;
  onStartCall: () => void;
  onOpenSearch: () => void;
  onOpenTransfer: () => void;
  onOpenSchedule: () => void;
  onVoiceChange: (voiceId: string) => void;
  onSpeedChange: (speed: number) => void;
}

export function ChatHeader({
  conversation, isContactTyping, showAIAssistant, showDetails,
  voiceId, onToggleAIAssistant, onToggleDetails, onStartCall, onOpenSearch,
  onOpenTransfer, onOpenSchedule, onVoiceChange,
}: ChatHeaderProps) {
  const { data: crmData } = useExternalContact360(isExternalConfigured ? conversation.contact.phone : undefined);
  const crmCompany = crmData?.found ? crmData.company : null;
  const crmCustomer = crmData?.found ? crmData.customer : null;
  const crmRfm = crmData?.found ? crmData.rfm : null;

  const { data: intel } = useContactIntelligence(isExternalConfigured ? conversation.contact.phone : undefined);
  const briefing = intel?.found ? intel.briefing : null;

  return (
    <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between px-4 py-3 border-b border-border/20 bg-card">
      <div className="flex items-center gap-3">
        <motion.div whileHover={{ scale: 1.05 }}>
          <Avatar className="w-10 h-10 ring-2 ring-border/30">
            <AvatarImage src={conversation.contact.avatar} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">
              {conversation.contact.name.split(' ').map((n) => n[0]).join('').slice(0, 2)}
            </AvatarFallback>
          </Avatar>
        </motion.div>
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            {briefing ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <h3 className="font-semibold text-foreground cursor-help border-b border-dashed border-primary/30 flex items-center gap-1.5">
                    {conversation.contact.name}
                    <Brain className="w-3.5 h-3.5 text-primary/60" />
                  </h3>
                </TooltipTrigger>
                <TooltipContent side="bottom" align="start" className={cn('max-w-[320px] p-3', briefing.risk_alert && 'border-destructive/50 ring-1 ring-destructive/20')}>
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="space-y-2 text-xs">
                    <p className="font-medium text-foreground">{briefing.opening_tip}</p>
                    {briefing.risk_alert && <p className="text-destructive font-medium">{briefing.risk_alert}</p>}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-muted-foreground">
                      <span>Score: <strong className="text-foreground">{briefing.relationship_score ?? '—'}</strong></span>
                      <span>Etapa: <strong className="text-foreground">{briefing.relationship_stage ?? '—'}</strong></span>
                      <span>Último: <strong className="text-foreground">{briefing.days_since_last_contact != null ? `${briefing.days_since_last_contact}d` : '—'}</strong></span>
                      <span>Interações: <strong className="text-foreground">{briefing.total_interactions}</strong></span>
                      {briefing.vendedor && <span>Vendedor: <strong className="text-foreground">{briefing.vendedor.split(' ').slice(0, 2).join(' ')}</strong></span>}
                      {briefing.rfm_segment && <span>RFM: <strong className="text-foreground">{briefing.rfm_segment}</strong></span>}
                    </div>
                    {intel?.rapport?.suggestions && intel.rapport.suggestions.length > 0 && (
                      <div className="border-t border-border/30 pt-1.5 mt-1">
                        <p className="text-[10px] text-muted-foreground mb-0.5">Rapport:</p>
                        {intel.rapport.suggestions.slice(0, 2).map((s, i) => (
                          <p key={i} className="text-success text-[11px]">{s}</p>
                        ))}
                      </div>
                    )}
                  </motion.div>
                </TooltipContent>
              </Tooltip>
            ) : (
              <h3 className="font-semibold text-foreground">{conversation.contact.name}</h3>
            )}
            <Badge variant="outline" className={cn('text-[10px] capitalize border',
              briefing?.sentiment === 'positive' && 'border-success/50 text-success bg-success/10',
              briefing?.sentiment === 'negative' && 'border-destructive/50 text-destructive bg-destructive/10',
              !briefing?.sentiment && conversation.status === 'open' && 'border-success/50 text-success bg-success/10',
              !briefing?.sentiment && conversation.status === 'pending' && 'border-warning/50 text-warning bg-warning/10',
              !briefing?.sentiment && conversation.status === 'resolved' && 'border-muted-foreground/50 text-muted-foreground',
              !briefing?.sentiment && conversation.status === 'waiting' && 'border-info/50 text-info bg-info/10',
              briefing?.sentiment === 'neutral' && conversation.status === 'open' && 'border-success/50 text-success bg-success/10',
              briefing?.sentiment === 'neutral' && conversation.status === 'pending' && 'border-warning/50 text-warning bg-warning/10',
              briefing?.sentiment === 'neutral' && conversation.status === 'resolved' && 'border-muted-foreground/50 text-muted-foreground',
              briefing?.sentiment === 'neutral' && conversation.status === 'waiting' && 'border-info/50 text-info bg-info/10',
            )}>
              {briefing?.sentiment && briefing.sentiment !== 'neutral' && <span className="mr-0.5">{briefing.sentiment === 'positive' ? '😊' : '😟'}</span>}
              {conversation.status === 'open' ? 'Aberto' : conversation.status === 'pending' ? 'Pendente' : conversation.status === 'resolved' ? 'Resolvido' : 'Aguardando'}
            </Badge>
            {(() => {
              const ct = conversation.contact.contact_type;
              const cfg = ct ? contactTypeConfig[ct] : null;
              if (!cfg) return null;
              const TypeIcon = cfg.icon;
              return <Badge variant="outline" className={cn('text-[10px] border font-medium', cfg.color)}><TypeIcon className="w-3 h-3 mr-0.5" />{cfg.label}</Badge>;
            })()}
            <SLAIndicator firstMessageAt={conversation.createdAt} firstResponseAt={conversation.status === 'resolved' ? conversation.updatedAt : null} resolvedAt={conversation.status === 'resolved' ? conversation.updatedAt : null} firstResponseMinutes={conversation.priority === 'high' ? 2 : 5} resolutionMinutes={conversation.priority === 'high' ? 30 : 60} />
            <CrmBadges crmCompany={crmCompany} crmCustomer={crmCustomer} crmRfm={crmRfm} />
            <BusinessHoursBadge connectionId={conversation.contact.whatsapp_connection_id} />
            <AnalysisBadges contactId={conversation.contact.id} compact />
          </div>
          <p className="text-xs text-muted-foreground">
            {isContactTyping ? <TypingIndicatorCompact isVisible={true} /> : conversation.contact.phone}
          </p>
          <QueuePositionNotifier contactId={conversation.contact.id} className="mt-0.5" />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <RealtimeCollaboration contactId={conversation.contact.id} className="mr-1" />
        {[
          { icon: Search, label: 'Buscar (Ctrl+K)', onClick: onOpenSearch },
          { icon: PhoneCall, label: 'Iniciar chamada', onClick: onStartCall },
          { icon: Video, label: 'Videochamada', onClick: undefined },
        ].map(({ icon: Icon, label, onClick }) => (
          <Tooltip key={label}>
            <TooltipTrigger asChild>
              <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onClick} aria-label={label}>
                  <Icon className="w-4 h-4" />
                </Button>
              </motion.div>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" className={cn("text-muted-foreground hover:text-primary hover:bg-primary/10", showAIAssistant && "text-primary bg-primary/10")} onClick={onToggleAIAssistant} aria-label="Visão">
                <VisionIcon className="w-4 h-4" />
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Visão</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" className={cn("text-muted-foreground hover:text-primary hover:bg-primary/10 relative", showDetails && "text-primary bg-primary/10")} onClick={onToggleDetails} aria-label="Detalhes do contato">
                <Info className="w-4 h-4" />
                {!showDetails && <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-primary animate-pulse" />}
              </Button>
            </motion.div>
          </TooltipTrigger>
          <TooltipContent>Detalhes do contato</TooltipContent>
        </Tooltip>

        <VoiceSelector selectedVoiceId={voiceId} onVoiceChange={onVoiceChange} />
        <KeyboardShortcutsHelp />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" aria-label="Mais opções">
                <MoreVertical className="w-4 h-4" />
              </Button>
            </motion.div>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 bg-card border-border/30">
            <DropdownMenuItem><Tag className="w-4 h-4 mr-2" />Adicionar tag</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenTransfer}><ArrowRight className="w-4 h-4 mr-2" />Transferir</DropdownMenuItem>
            <DropdownMenuItem onClick={onOpenSchedule}><Clock className="w-4 h-4 mr-2" />Agendar mensagem</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem><CheckCircle className="w-4 h-4 mr-2" />Marcar como resolvido</DropdownMenuItem>
            <DropdownMenuItem><Archive className="w-4 h-4 mr-2" />Arquivar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </motion.div>
  );
}
