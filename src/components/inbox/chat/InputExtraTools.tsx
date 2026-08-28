import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion } from '@/components/ui/motion';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AISuggestions } from '../AISuggestions';
import { MessageTemplates } from '../MessageTemplates';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { Message } from '@/types/chat';
import { cn } from '@/lib/utils';
import { Zap, Mic, Clock, MapPin, Package, Layers } from 'lucide-react';

interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface InputExtraToolsProps {
  isRecordingAudio: boolean;
  messages: Message[];
  contactName: string;
  quickReplies: QuickReply[];
  onInputChange: (value: string) => void;
  onQuickReply: (reply: QuickReply) => void;
  onRecordToggle: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
}

export function InputExtraTools({
  isRecordingAudio, messages, contactName, quickReplies,
  onInputChange, onQuickReply, onRecordToggle,
  onOpenInteractiveBuilder, onOpenSchedule, onOpenLocationPicker, onSendProduct,
}: InputExtraToolsProps) {
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onOpenInteractiveBuilder} aria-label="Mensagem Interativa">
            <Layers className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Mensagem Interativa</TooltipContent>
      </Tooltip>

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" aria-label="Respostas rápidas">
            <Zap className="w-5 h-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 glass-strong border-border/50" align="start">
          <div className="p-3 border-b border-border/50 bg-gradient-to-r from-primary/10 to-transparent">
            <h4 className="font-medium text-sm">Respostas Rápidas</h4>
            <p className="text-xs text-muted-foreground">Digite / para usar atalhos</p>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">
            {quickReplies.map((reply) => (
              <motion.button key={reply.id} whileHover={{ x: 4 }} onClick={() => onQuickReply(reply)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-primary/10 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{reply.title}</span>
                  <Badge variant="outline" className="text-[10px] border-primary/30">{reply.shortcut}</Badge>
                </div>
              </motion.button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      <AISuggestions messages={messages.map(m => ({ id: m.id, content: m.content, sender: m.sender, timestamp: m.timestamp }))} contactName={contactName} onSelectSuggestion={(text) => onInputChange(text)} />
      <MessageTemplates onSelectTemplate={(text) => onInputChange(text)} />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className={cn("text-muted-foreground hover:text-primary hover:bg-primary/10", isRecordingAudio && "text-destructive bg-destructive/10")} onClick={onRecordToggle} aria-label={isRecordingAudio ? "Parar gravação" : "Gravar áudio"}>
            <Mic className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{isRecordingAudio ? "Parar gravação" : "Gravar áudio"}</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onOpenLocationPicker} aria-label="Compartilhar localização">
            <MapPin className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Compartilhar localização</TooltipContent>
      </Tooltip>

      <ExternalProductCatalog onSendProduct={onSendProduct} trigger={
        <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" aria-label="Catálogo de produtos">
          <Package className="w-5 h-5" />
        </Button>
      } />

      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10" onClick={onOpenSchedule} aria-label="Agendar mensagem">
            <Clock className="w-5 h-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Agendar mensagem</TooltipContent>
      </Tooltip>
    </>
  );
}
