import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AIRewriteButton } from './AIRewriteButton';
import { RichTextToggle } from './RichTextToolbar';
import { StickerPicker } from '../StickerPicker';
import { AudioMemePicker } from '../AudioMemePicker';
import { VoiceChangerPicker } from '../VoiceChangerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { FileUploader, FileUploaderRef } from '../FileUploader';
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
import { toast } from '@/hooks/ui/use-toast';

type QuickReplyItem = { id: string; title: string; shortcut: string; content: string; category: string };

interface SecondaryToolbarProps {
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  inputValue: string;
  showRichToolbar: boolean;
  onToggleRichToolbar: () => void;
  isRecordingAudio: boolean;
  onSendSticker: (url: string) => void;
  onSendAudioMeme: (url: string) => void;
  onSendCustomEmoji: (url: string) => void;
  onOpenCatalog?: () => void;
  onAudioSend: (blob: Blob) => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  instanceName?: string;
  contactPhone: string;
  contactId: string;
  contactName?: string;
  onVoiceDictation: (text: string) => void;
}

export function SecondaryToolbar({
  inputRef, inputValue, showRichToolbar, onToggleRichToolbar, isRecordingAudio,
  onSendSticker, onSendAudioMeme, onSendCustomEmoji, onOpenCatalog, onAudioSend,
  fileUploaderRef, instanceName, contactPhone, contactId, contactName, onVoiceDictation,
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
    <div className="flex shrink-0 flex-wrap items-center gap-0.5">
      <AIRewriteButton inputValue={inputValue} onRewrite={handleRewrite} contactName={contactName} />
      <StickerPicker onSendSticker={onSendSticker} />
      <AudioMemePicker onSendAudio={onSendAudioMeme} />
      <VoiceChangerPicker onSendAudio={onSendAudioMeme} />
      <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
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
      <FileUploader
        ref={fileUploaderRef}
        instanceName={instanceName || ''}
        recipientNumber={contactPhone}
        contactId={contactId}
        connectionId={undefined}
        onFileSelect={(file, category) => {
          toast({ title: 'Arquivo selecionado', description: `${file.name} (${category}) será enviado.` });
        }}
        onFileSent={() => {
          toast({ title: 'Arquivo enviado!', description: 'O arquivo foi enviado com sucesso.' });
        }}
      />
      <RichTextToggle active={showRichToolbar} onToggle={onToggleRichToolbar} />
      <VoiceDictationButton onTranscript={onVoiceDictation} disabled={isRecordingAudio} />
      <TextToAudioButton inputValue={inputValue} onAudioReady={onAudioSend} />
    </div>
  );
}

interface TertiaryToolsMenuProps {
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
  instanceName, contactPhone, contactName, messages, quickReplies,
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
      <AdvancedMessageMenu instanceName={instanceName || ''} recipientNumber={contactPhone} onPollSent={onPollSent} onContactSent={onContactSent} />
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
