import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Message } from '@/types/chat';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { AnimatePresence, motion } from 'framer-motion';
import { RichTextToolbar } from './RichTextToolbar';
import { AIRewriteButton } from './AIRewriteButton';
import { MentionAutocomplete, useMentions } from './MentionAutocomplete';
import { MarkdownPreview } from './MarkdownPreview';
import { SlashCommands, SlashCommand } from '../SlashCommands';
import { AudioRecorder } from '../AudioRecorder';
import { FileUploaderRef } from '../FileUploader';
import { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { SecondaryToolbar, TertiaryToolsMenu } from './ChatInputToolbars';
import { StickerPicker } from '../StickerPicker';
import { CustomEmojiPicker } from '../CustomEmojiPicker';
import { RichTextToggle } from './RichTextToolbar';
import { FileUploader } from '../FileUploader';
import { Send, Mic, Check, Plus, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/ui/use-toast';
import { InputPreviewBars } from './InputPreviewBars';
import { useChatInputLogic, setNativeValue } from './useChatInputLogic';

interface QuickReplyItem {
  id: string;
  title: string;
  shortcut: string;
  content: string;
  category: string;
}

interface ChatInputAreaProps {
  inputValue: string;
  replyToMessage: Message | null;
  editingMessage?: Message | null;
  isRecordingAudio: boolean;
  showSlashCommands: boolean;
  contactId: string;
  contactPhone: string;
  contactName: string;
  instanceName?: string;
  onPollSent?: (poll: { name: string; options: string[]; selectableCount: number }) => void;
  onContactSent?: (contactName: string) => void;
  messages: Message[];
  quickReplies: QuickReplyItem[];
  isSending?: boolean;
  onInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onBlur: () => void;
  onSend: () => void;
  onCancelReply: () => void;
  onCancelEdit?: () => void;
  onSlashCommand: (command: SlashCommand, subCommand?: string) => void;
  onCloseSlashCommands: () => void;
  onQuickReply: (reply: QuickReplyItem) => void;
  onRecordToggle: () => void;
  onAudioSend: (blob: Blob) => void;
  onAudioCancel: () => void;
  onOpenInteractiveBuilder: () => void;
  onOpenSchedule: () => void;
  onOpenLocationPicker: () => void;
  onSendProduct: (product: ExternalProduct) => void;
  onSendSticker: (stickerUrl: string) => void;
  onSendAudioMeme: (audioUrl: string) => void;
  onSendCustomEmoji: (emojiUrl: string) => void;
  onOpenCatalog?: () => void;
  onSelectSuggestion: (text: string) => void;
  onSelectTemplate: (text: string) => void;
  onExternalFiles?: (files: File[]) => void;
  onPasteFiles?: (files: File[]) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
  onToggleSignature?: () => void;
  fileUploaderRef: React.RefObject<FileUploaderRef | null>;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInputArea(props: ChatInputAreaProps) {
  const {
    inputValue, replyToMessage, editingMessage, isRecordingAudio, showSlashCommands,
    contactId, contactPhone, contactName, instanceName, onPollSent, onContactSent,
    messages, quickReplies, isSending = false,
    onInputChange, onKeyDown, onBlur, onSend, onCancelReply, onCancelEdit,
    onSlashCommand, onCloseSlashCommands, onQuickReply, onRecordToggle,
    onAudioSend, onAudioCancel, onOpenInteractiveBuilder, onOpenSchedule,
    onOpenLocationPicker, onSendProduct, onSendSticker, onSendAudioMeme,
    onSendCustomEmoji, onOpenCatalog, onSelectSuggestion, onSelectTemplate,
    onPasteFiles, signatureEnabled, signatureName, onToggleSignature,
    fileUploaderRef, inputRef,
  } = props;

  const logic = useChatInputLogic({
    inputValue, contactId, editingMessage, inputRef, fileUploaderRef, onSend, onPasteFiles,
  });

  const { isOpen: mentionOpen, cursorPos: mentionCursorPos, checkForMention, handleSelect: handleMentionSelect, close: closeMention } = useMentions(inputRef);

  const tertiaryTools = useMemo(() => (
    <TertiaryToolsMenu
      instanceName={instanceName} contactPhone={contactPhone} contactName={contactName}
      messages={messages} quickReplies={quickReplies}
      onOpenInteractiveBuilder={onOpenInteractiveBuilder} onOpenLocationPicker={onOpenLocationPicker}
      onOpenSchedule={onOpenSchedule} onSendProduct={onSendProduct}
      onSelectSuggestion={onSelectSuggestion} onSelectTemplate={onSelectTemplate}
      onQuickReply={onQuickReply} signatureEnabled={signatureEnabled}
      signatureName={signatureName} onToggleSignature={onToggleSignature}
      onPollSent={onPollSent} onContactSent={onContactSent}
    />
  ), [instanceName, contactPhone, contactName, messages, quickReplies, onOpenInteractiveBuilder, onOpenLocationPicker, onOpenSchedule, onSendProduct, onSelectSuggestion, onSelectTemplate, signatureEnabled, signatureName, onToggleSignature]);

  return (
    <>
      <RichTextToolbar
        inputRef={inputRef} inputValue={inputValue}
        onInputChange={(val) => setNativeValue(inputRef, val)}
        visible={logic.showRichToolbar} onToggle={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
      />

      <InputPreviewBars
        replyToMessage={replyToMessage} editingMessage={editingMessage}
        onCancelReply={onCancelReply} onCancelEdit={onCancelEdit}
      />

      <div className={cn("px-4 py-3 border-t border-border bg-card", logic.isMobile && "px-2.5 py-2 safe-area-bottom")}>
        <AnimatePresence>
          {isRecordingAudio && (
            <div className="mb-3"><AudioRecorder onSend={onAudioSend} onCancel={onAudioCancel} /></div>
          )}
        </AnimatePresence>

        <SlashCommands inputValue={inputValue} onSelectCommand={onSlashCommand} onClose={onCloseSlashCommands} isOpen={showSlashCommands} />

        <div className="flex items-end gap-1.5" role="toolbar" aria-label="Barra de mensagem">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon"
                className={cn("text-muted-foreground hover:text-foreground hover:bg-muted shrink-0 touch-manipulation active:scale-95", logic.isMobile ? "w-10 h-10" : "w-9 h-9")}
                aria-label="Mais opções de mensagem">
                <Plus className="w-[18px] h-[18px]" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56 p-2 bg-popover border-border" align="start" side="top">{tertiaryTools}</PopoverContent>
          </Popover>

          <div className="flex-1 min-w-0 relative">
            <MentionAutocomplete inputValue={inputValue} cursorPosition={mentionCursorPos} onSelect={handleMentionSelect} onClose={closeMention} isOpen={mentionOpen} />

            <AnimatePresence>
              {logic.showMarkdownPreview && logic.hasText && logic.showRichToolbar && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="mb-1 px-3 py-2 border border-border/50 rounded-lg bg-muted/30 text-sm max-h-[100px] overflow-y-auto">
                  <MarkdownPreview text={inputValue} className="text-foreground leading-relaxed" />
                </motion.div>
              )}
            </AnimatePresence>

            <textarea ref={inputRef} value={inputValue}
              onChange={(e) => { onInputChange(e); checkForMention(e.target.value, e.target.selectionStart ?? 0); }}
              onKeyDown={onKeyDown} onBlur={onBlur} onPaste={logic.handlePaste}
              onClick={(e) => { const t = e.target as HTMLTextAreaElement; checkForMention(t.value, t.selectionStart ?? 0); }}
              placeholder={editingMessage ? "Editar mensagem..." : replyToMessage ? "Digite sua resposta..." : "Digite uma mensagem... (/ para comandos, @ para mencionar)"}
              rows={1}
              className={cn(
                "w-full bg-transparent border border-border/50 rounded-xl outline-none text-sm text-foreground",
                "placeholder:text-muted-foreground resize-none transition-all",
                "focus:border-primary/50 focus:ring-1 focus:ring-primary/20",
                logic.isMobile ? "px-3 py-2.5 text-[16px] min-h-[42px] max-h-[200px]" : "px-3 py-2 min-h-[40px] max-h-[200px]",
                logic.isOverLimit && "border-destructive/50 focus:border-destructive focus:ring-destructive/20"
              )}
              aria-label={editingMessage ? "Editar mensagem" : replyToMessage ? "Responder mensagem" : "Digite sua mensagem"}
              aria-describedby={logic.charCount > 0 ? "char-counter" : undefined}
            />
            {logic.charCount > 100 && (
              <span id="char-counter" className={cn("absolute bottom-1 right-2 text-[10px] select-none pointer-events-none",
                logic.isOverLimit ? "text-destructive font-medium" : logic.isNearLimit ? "text-warning" : "text-muted-foreground/50")}>
                {logic.charCount}/{logic.CHAR_LIMIT}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={logic.handleSendWithAnimation}
                  disabled={(!logic.hasText && !editingMessage) || logic.isOverLimit || isSending}
                  size="icon"
                  className={cn("rounded-full shrink-0 disabled:opacity-40 touch-manipulation active:scale-95 transition-all",
                    "bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg shadow-primary/25 hover:shadow-primary/40",
                    logic.isMobile ? "w-11 h-11" : "w-10 h-10", logic.sendAnimation && "motion-safe:animate-pulse")}
                  aria-label={editingMessage ? "Confirmar edição" : "Enviar mensagem"}>
                  {isSending ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : editingMessage ? <Check className="w-[18px] h-[18px]" /> : <Send className="w-[18px] h-[18px]" />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{editingMessage ? 'Confirmar edição' : 'Enviar (Enter)'}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button size="icon"
                  className={cn("shrink-0 touch-manipulation active:scale-95 rounded-full transition-all",
                    logic.isMobile ? "w-11 h-11" : "w-10 h-10",
                    isRecordingAudio ? "bg-destructive text-destructive-foreground shadow-lg shadow-destructive/30 hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg shadow-primary/30")}
                  onClick={onRecordToggle} aria-label={isRecordingAudio ? "Parar gravação" : "Gravar áudio"}>
                  <Mic className={cn("w-5 h-5", isRecordingAudio && "motion-safe:animate-pulse")} />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{isRecordingAudio ? 'Parar gravação' : 'Gravar áudio'}</TooltipContent>
            </Tooltip>
          </div>

          {!logic.isMobile && (
            <SecondaryToolbar inputRef={inputRef} inputValue={inputValue}
              showRichToolbar={logic.showRichToolbar} onToggleRichToolbar={() => logic.setShowRichToolbar(!logic.showRichToolbar)}
              isRecordingAudio={isRecordingAudio} onSendSticker={onSendSticker} onSendAudioMeme={onSendAudioMeme}
              onSendCustomEmoji={onSendCustomEmoji} onOpenCatalog={onOpenCatalog} onAudioSend={onAudioSend}
              fileUploaderRef={fileUploaderRef} instanceName={instanceName} contactPhone={contactPhone}
              contactId={contactId} contactName={contactName} onVoiceDictation={logic.handleVoiceDictation}
            />
          )}

          {logic.isMobile && (
            <div className="flex items-center gap-0.5 shrink-0">
              <FileUploader ref={fileUploaderRef} instanceName={instanceName || ''} recipientNumber={contactPhone}
                contactId={contactId} connectionId={undefined}
                onFileSelect={(file, category) => toast({ title: 'Arquivo selecionado', description: `${file.name} (${category}) será enviado.` })}
                onFileSent={() => toast({ title: 'Arquivo enviado!', description: 'O arquivo foi enviado com sucesso.' })}
              />
            </div>
          )}
        </div>

        {logic.isMobile && logic.hasText && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            className="flex items-center gap-1.5 mt-1.5 overflow-x-auto scrollbar-none pb-0.5">
            <AIRewriteButton inputValue={inputValue} contactName={contactName}
              onRewrite={(newText) => setNativeValue(inputRef, newText)} />
            <RichTextToggle active={logic.showRichToolbar} onToggle={() => logic.setShowRichToolbar(!logic.showRichToolbar)} />
            <CustomEmojiPicker onSendEmoji={onSendCustomEmoji} />
            <StickerPicker onSendSticker={onSendSticker} />
          </motion.div>
        )}
      </div>
    </>
  );
}
