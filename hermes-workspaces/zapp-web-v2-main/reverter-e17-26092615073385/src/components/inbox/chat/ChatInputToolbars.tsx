import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIRewriteButton } from './AIRewriteButton';
import { RichTextToggle } from './RichTextToolbar';
import { StickerPicker } from '../StickerPicker';
import { AudioMemePicker } from '../AudioMemePicker';
import { VoiceChangerPicker } from '../VoiceChangerPicker';
import { VoiceDictationButton } from '@/components/mobile/VoiceDictationButton';
import { TextToAudioButton } from '../TextToAudioButton';
import { AISuggestions } from '../AISuggestions';
import { MessageTemplates } from '../MessageTemplates';
import { AdvancedMessageMenu } from '../AdvancedMessageMenu';
import { ExternalProductCatalog } from '@/components/catalog/ExternalProductCatalog';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { Message } from '@/types/chat';
import { Package, Layers, MapPin, Clock, Zap, PenTool, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

type QuickReplyItem = { id: string; title: string; shortcut: string; content: string; category: string };

interface SecondaryToolbarProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  showRichToolbar: boolean;
  onToggleRichToolbar: () => void;
  isRecordingAudio: boolean;
  onSendSticker: (url: string) => void;
  onSendAudioMeme: (url: string) => void;
  onOpenCatalog?: () => void;
  onAudioSend: (blob: Blob) => void;
  contactName?: string;
  onVoiceDictation: (text: string) => void;
}

/** Ferramentas secundárias — vivem dentro do popover "⋯ Mais" (fase 3, redesign
    carvão). FileUploader e CustomEmojiPicker saíram daqui: viraram ícones fixos
    na linha do input (ver ChatInputArea) para não duplicar o input de arquivo. */
export function SecondaryToolbar({
  inputRef, inputValue, showRichToolbar, onToggleRichToolbar, isRecordingAudio,
  onSendSticker, onSendAudioMeme, onOpenCatalog, onAudioSend,
  contactName, onVoiceDictation,
}: SecondaryToolbarProps) {
  const handleRewrite = (newText: string) => {
    const el = inputRef.current;
    if (!el) return;
    const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    if (nativeSetter) {
      nativeSetter.call(el, newText);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }
  };

  return (
    <div className="flex items-center gap-0.5 shrink-0 flex-wrap">
      <AIRewriteButton inputValue={inputValue} onRewrite={handleRewrite} contactName={contactName} />
      <StickerPicker onSendSticker={onSendSticker} />
      <AudioMemePicker onSendAudio={onSendAudioMeme} />
      <VoiceChangerPicker onSendAudio={onSendAudioMeme} />
      {onOpenCatalog && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="w-8 h-8 text-muted-foreground hover:text-primary transition-colors"
              onClick={onOpenCatalog}
              aria-label="Catálogo de produtos"
            >
              <Package className="w-4 h-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top">Catálogo de Produtos</TooltipContent>
        </Tooltip>
      )}
      <RichTextToggle active={showRichToolbar} onToggle={onToggleRichToolbar} />
      <VoiceDictationButton onTranscript={onVoiceDictation} disabled={isRecordingAudio} />
      <TextToAudioButton inputValue={inputValue} onAudioReady={onAudioSend} />
    </div>
  );
}

interface TertiaryToolsMenuProps {
  contactId: string;
  instanceName?: string;
  contactPhone: string;
  contactName: string;
  messages: Message[];
  quickReplies: QuickReplyItem[];
  onOpenInteractiveBuilder: () => void;
  onOpenLocationPicker: () => void;
  onOpenSchedule: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSelectSuggestion: (text: string) => void;
  onSelectTemplate: (text: string) => void;
  onQuickReply: (reply: QuickReplyItem) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
  onToggleSignature?: () => void;
  onPollSent?: (poll: { name: string; options: string[]; selectableCount: number }) => void;
  onContactSent?: (contactName: string) => void;
}

export function TertiaryToolsMenu({
  contactId, instanceName, contactPhone, contactName, messages, quickReplies,
  onOpenInteractiveBuilder, onOpenLocationPicker, onOpenSchedule,
  onSendProduct, onSelectSuggestion, onSelectTemplate, onQuickReply,
  signatureEnabled, signatureName, onToggleSignature, onPollSent, onContactSent,
}: TertiaryToolsMenuProps) {
  const quickRepliesList = useMemo(() => (
    quickReplies.slice(0, 50).map((reply) => (
      <Button
        key={reply.id}
        variant="ghost"
        size="sm"
        className="justify-start gap-2 text-xs w-full text-muted-foreground hover:text-foreground"
        onClick={() => onQuickReply(reply)}
      >
        <Zap className="w-3.5 h-3.5 text-primary shrink-0" />
        <span className="font-mono text-primary/80">/{reply.shortcut}</span>
        <span className="truncate">{reply.content}</span>
      </Button>
    ))
  ), [quickReplies, onQuickReply]);

  return (
    <div className="flex flex-col gap-1">
      <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={onOpenInteractiveBuilder} aria-label="Mensagem interativa">
        <Layers className="w-4 h-4" /> Mensagem Interativa
      </Button>
      <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={onOpenLocationPicker} aria-label="Enviar localização">
        <MapPin className="w-4 h-4" /> Localização
      </Button>
      <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground hover:text-foreground" onClick={onOpenSchedule} aria-label="Agendar mensagem">
        <Clock className="w-4 h-4" /> Agendar
      </Button>
      <ExternalProductCatalog
        onSendProduct={onSendProduct}
        trigger={
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground hover:text-foreground w-full" aria-label="Catálogo de produtos">
            <Package className="w-4 h-4" /> Catálogo
          </Button>
        }
      />
      <AdvancedMessageMenu contactId={contactId} instanceName={instanceName || ''} recipientNumber={contactPhone} onPollSent={onPollSent} onContactSent={onContactSent} />
      <AISuggestions
        messages={messages.map(m => ({ id: m.id, content: m.content, sender: m.sender, timestamp: m.timestamp }))}
        contactName={contactName}
        onSelectSuggestion={onSelectSuggestion}
      />
      <MessageTemplates onSelectTemplate={onSelectTemplate} />
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-muted-foreground hover:text-foreground w-full" aria-label="Respostas rápidas">
            <Zap className="w-4 h-4" /> Respostas Rápidas
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0 bg-popover border-border" align="start" side="top">
          <div className="p-3 border-b border-border">
            <h4 className="font-medium text-sm text-foreground">Respostas Rápidas</h4>
          </div>
          <div className="max-h-64 overflow-y-auto p-2 space-y-1">{quickRepliesList}</div>
        </PopoverContent>
      </Popover>
      {onToggleSignature && (
        <>
          <div className="border-t border-border/50 my-1" />
          <Button
            variant="ghost"
            size="sm"
            className={cn("justify-start gap-2 w-full", signatureEnabled ? "text-primary hover:text-primary" : "text-muted-foreground hover:text-foreground")}
            onClick={onToggleSignature}
            aria-label={signatureEnabled ? "Desativar assinatura" : "Ativar assinatura"}
          >
            <PenTool className="w-4 h-4" />
            {signatureEnabled ? `Assinatura: ${signatureName || 'Ativa'}` : 'Assinar mensagens'}
            {signatureEnabled && <Check className="w-3.5 h-3.5 ml-auto" />}
          </Button>
        </>
      )}
    </div>
  );
}
