import { useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { motion, AnimatePresence } from '@/components/ui/motion';
import { ReplyPreview } from '../ReplyQuote';
import { SlashCommands, SlashCommand } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { FileUploader, FileUploaderRef } from '../FileUploader';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Send, Smile, Plus } from 'lucide-react';
import { AIEnhanceButton } from './AIEnhanceButton';
import { InputExtraTools } from './InputExtraTools';
import { toast } from '@/hooks/ui/use-toast';
import { useIsMobile } from '@/hooks/ui/use-mobile';

interface QuickReply {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatMessageInputProps {
  inputValue: string;
  replyToMessage: Message | null;
  isRecordingAudio: boolean;
  showSlashCommands: boolean;
  contactId: string;
  contactPhone: string;
  contactName: string;
  messages: Message[];
  quickReplies: QuickReply[];
  onInputChange: (value: string) => void;
  onSend: () => void;
  onCancelReply: () => void;
  onSlashCommand: (command: SlashCommand, subCommand?: string) => void;
  onCloseSlashCommands: () => void;
  onQuickReply: (reply: QuickReply) => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onAudioCancel: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onTypingStart: () => void;
  onTypingStop: () => void;
  onExternalFiles?: (files: File[]) => void;
}

export interface ChatMessageInputRef {
  focus: () => void;
  handleExternalFiles: (files: File[]) => void;
}

export const ChatMessageInput = forwardRef<ChatMessageInputRef, ChatMessageInputProps>(({
  inputValue, replyToMessage, isRecordingAudio, showSlashCommands,
  contactId, contactPhone, contactName, messages, quickReplies,
  onInputChange, onSend, onCancelReply, onSlashCommand, onCloseSlashCommands,
  onQuickReply, onRecordToggle, onAudioSend, onAudioCancel,
  onOpenInteractiveBuilder, onOpenSchedule, onOpenLocationPicker,
  onSendProduct, onTypingStart, onTypingStop,
}, ref) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileUploaderRef = useRef<FileUploaderRef>(null);
  const isMobile = useIsMobile();

  useImperativeHandle(ref, () => ({
    focus: () => textareaRef.current?.focus(),
    handleExternalFiles: (files: File[]) => fileUploaderRef.current?.handleExternalFiles(files),
  }));

  const autoResize = useCallback((el: HTMLTextAreaElement) => {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    onInputChange(value);
    autoResize(e.target);
    if (value.length > 0) onTypingStart();
    else onTypingStop();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashCommands && (e.key === 'Enter' || e.key === 'ArrowUp' || e.key === 'ArrowDown')) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
    if (e.key === 'Escape' && showSlashCommands) onCloseSlashCommands();
  };

  const extraTools = (
    <InputExtraTools
      isRecordingAudio={isRecordingAudio}
      messages={messages}
      contactName={contactName}
      quickReplies={quickReplies}
      onInputChange={onInputChange}
      onQuickReply={onQuickReply}
      onRecordToggle={onRecordToggle}
      onOpenInteractiveBuilder={onOpenInteractiveBuilder}
      onOpenSchedule={onOpenSchedule}
      onOpenLocationPicker={onOpenLocationPicker}
      onSendProduct={onSendProduct}
    />
  );

  return (
    <>
      <AnimatePresence>
        {replyToMessage && <ReplyPreview message={replyToMessage} onCancel={onCancelReply} />}
      </AnimatePresence>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={cn("glass-strong border-t border-border/50", isMobile ? "p-2 safe-area-bottom" : "p-4")}>
        <div className="flex items-end gap-1">
          <FileUploader ref={fileUploaderRef} instanceName={contactId} recipientNumber={contactPhone} contactId={contactId} connectionId={undefined}
            onFileSelect={(file, category) => toast({ title: 'Arquivo selecionado', description: `${file.name} (${category}) será enviado.` })}
            onFileSent={() => toast({ title: 'Arquivo enviado!', description: 'O arquivo foi enviado com sucesso via WhatsApp.' })}
          />

          {isMobile ? (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary hover:bg-primary/10 flex-shrink-0 w-9 h-9 touch-manipulation active:scale-95" aria-label="Mais opções">
                  <Plus className="w-5 h-5" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-2 glass-strong border-border/50" align="start" side="top">
                <div className="flex flex-wrap gap-1 max-w-[240px]">{extraTools}</div>
              </PopoverContent>
            </Popover>
          ) : (
            <div className="flex items-center gap-1">{extraTools}</div>
          )}

          <div className="flex-1 relative group min-w-0">
            <SlashCommands inputValue={inputValue} onSelectCommand={onSlashCommand} onClose={onCloseSlashCommands} isOpen={showSlashCommands} />
            <Textarea ref={textareaRef} value={inputValue} onChange={handleInputChange} onKeyDown={handleKeyDown} onBlur={onTypingStop}
              placeholder={replyToMessage ? "Digite sua resposta..." : isMobile ? "Mensagem..." : "Digite / para comandos... (Shift+Enter para nova linha)"}
              className={cn("min-h-[40px] max-h-[120px] resize-none pr-10 glass border-border/50 focus:border-primary/50 focus:ring-primary/20 transition-all", isMobile ? "py-2.5 text-[16px] rounded-2xl leading-snug" : "py-2.5")}
              rows={1}
            />
            <div className="absolute right-1 top-1.5 flex items-center gap-0.5">
              <AIEnhanceButton inputValue={inputValue} onInputChange={onInputChange} contactName={contactName} />
              {!isMobile && (
                <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
                  <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary w-8 h-8" aria-label="Emojis">
                    <Smile className="w-5 h-5" />
                  </Button>
                </motion.div>
              )}
            </div>
          </div>

          <div className="flex-shrink-0">
            <Button onClick={onSend} disabled={!inputValue.trim()} size="icon"
              className={cn("text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all disabled:opacity-50 touch-manipulation active:scale-95", isMobile ? "w-10 h-10 rounded-full" : "w-9 h-9")}
              style={{ background: 'var(--gradient-primary)' }} aria-label="Enviar mensagem">
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <AnimatePresence>
          {isRecordingAudio && (
            <div className="mt-3"><AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} /></div>
          )}
        </AnimatePresence>
      </motion.div>
    </>
  );
});

ChatMessageInput.displayName = 'ChatMessageInput';
