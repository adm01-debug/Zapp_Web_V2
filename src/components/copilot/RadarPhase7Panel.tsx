/**
 * CV-063, CV-064, CV-067, CV-068, CV-069, CV-070 — RadarPhase7Panel
 *
 * Painel RADAR da Fase 7 que expõe as funcionalidades de interação com a
 * caixa de digitação:
 *
 *   CV-063: botão "Melhorar rascunho" (reusa AIRewriteButton / ai-enhance-message).
 *           O resultado vai para o rascunho, nunca envia sozinho.
 *   CV-064: "Usar" de qualquer sugestão coloca o texto no rascunho. Garantido
 *           pelo callback onUseSuggestion do ChatPanel — nenhuma ação aqui dispara envio.
 *   CV-067: sugestão de anexo (AttachmentSuggestionBanner).
 *   CV-068: respostas rápidas ranqueadas (SmartTemplates).
 *   CV-069: variáveis preenchidas nos templates (SmartTemplates).
 *   CV-070: ditado por voz (VoiceDictationButton).
 */
import { useState, useCallback } from 'react';
import { Wand2, ChevronDown, ChevronUp } from 'lucide-react';
import { cn } from '@/lib/utils';

import { AttachmentSuggestionBanner } from './AttachmentSuggestion';
import { SmartTemplates } from './SmartTemplates';
import { VoiceDictationButton } from './VoiceDictation';
import { CopilotFeedback } from './CopilotFeedback';

import { useAttachmentSuggestion, type AttachmentAsset } from '@/hooks/copilot/useAttachmentSuggestion';
import { useSmartTemplates, type SaleContext } from '@/hooks/copilot/useSmartTemplates';
import { useVoiceDictation } from '@/hooks/copilot/useVoiceDictation';
import { useCopilotFeedback } from '@/hooks/copilot/useCopilotFeedback';
import type { QuickReplyTemplate } from '@/hooks/chat/useQuickReplies';

export interface RadarPhase7PanelProps {
  /** Valor atual do rascunho. */
  inputValue: string;
  /** ID da conversa. */
  conversationId: string;
  /** ID do contato. */
  contactId: string;
  /** Nome do contato. */
  contactName: string;
  /** Mensagens recentes para contexto. */
  messages: Array<{ content: string; sender: string }>;
  /** Contexto de venda (etapa, último produto mencionado, etc.). */
  saleContext: SaleContext;
  /** Templates de respostas rápidas disponíveis. */
  quickReplyTemplates: QuickReplyTemplate[];
  /** Ativos disponíveis para sugestão de anexo. */
  availableAssets?: AttachmentAsset[];
  /** Coloca texto no rascunho sem enviar (CV-064). */
  onDraftText: (text: string) => void;
  /** Envia um arquivo como anexo. */
  onAttachFile?: (fileRef: string, label: string) => void;
  /** Última sugestão exibida ao vendedor (para medir edição CV-065). */
  lastSuggestionText?: string;
  className?: string;
}

export function RadarPhase7Panel({
  inputValue,
  conversationId,
  contactId,
  contactName,
  messages,
  saleContext,
  quickReplyTemplates,
  availableAssets = [],
  onDraftText,
  onAttachFile,
  lastSuggestionText,
  className,
}: RadarPhase7PanelProps) {
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [attachmentDismissed, setAttachmentDismissed] = useState(false);

  // CV-068 / CV-069 — templates ranqueados e preenchidos
  const rankedTemplates = useSmartTemplates({
    templates: quickReplyTemplates,
    saleContext,
    topN: 8,
  });

  // CV-067 — sugestão de anexo
  const lastClientMessage = messages
    .filter((m) => m.sender === 'contact')
    .slice(-1)[0]?.content ?? '';

  const attachmentSuggestions = useAttachmentSuggestion({
    lastClientMessage,
    draftText: inputValue,
    availableAssets,
  });

  // CV-065, CV-066 — feedback
  const { recordFeedback } = useCopilotFeedback({ conversationId, contactId });

  // CV-070 — ditado por voz
  const dictation = useVoiceDictation({
    contactId,
    contactName,
    messages,
    onResult: onDraftText, // CV-064: resultado vai para o rascunho
  });

  // CV-063 — "Melhorar rascunho": abre o AIRewriteButton já existente
  // O painel simplesmente notifica; o AIRewriteButton fica no ChatInputArea.
  // Aqui expõe um botão de atalho que dispara a ação via callback.
  const hasInput = inputValue.trim().length > 0;

  const handleSelectTemplate = useCallback(
    (filledContent: string) => {
      // CV-064 — "Usar" coloca no rascunho, nunca envia
      onDraftText(filledContent);
    },
    [onDraftText],
  );

  const handleAttach = useCallback(
    (fileRef: string, label: string) => {
      onAttachFile?.(fileRef, label);
      setAttachmentDismissed(true);
    },
    [onAttachFile],
  );

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {/* CV-067 — sugestão de anexo */}
      {!attachmentDismissed && attachmentSuggestions.length > 0 && (
        <AttachmentSuggestionBanner
          suggestions={attachmentSuggestions}
          onAttach={handleAttach}
          onDismiss={() => setAttachmentDismissed(true)}
        />
      )}

      {/* CV-063 / CV-070 — barra de ações do rascunho */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* CV-063: botão "Melhorar" (delegado ao AIRewriteButton no ChatInputArea,
            este badge é apenas visual/informativo quando o input tem texto) */}
        {hasInput && (
          <span
            className="inline-flex items-center gap-1 rounded-full border border-border/50 px-2 py-0.5 text-3xs text-muted-foreground"
            title="Use o botão ✨ na barra de formatação para melhorar o rascunho"
          >
            <Wand2 className="w-3 h-3" />
            Melhorar: clique em ✨
          </span>
        )}

        {/* CV-070 — ditado por voz */}
        <VoiceDictationButton
          state={dictation.state}
          durationSeconds={dictation.durationSeconds}
          errorMessage={dictation.errorMessage}
          onStart={dictation.startRecording}
          onStop={dictation.stopRecording}
          onCancel={dictation.cancelRecording}
          variant="block"
        />

        {/* CV-066 — feedback da última sugestão exibida */}
        {lastSuggestionText && (
          <CopilotFeedback
            suggestionId={`${conversationId}-${Date.now()}`}
            onFeedback={(rating, reason) =>
              recordFeedback(`${conversationId}-last`, rating, reason)
            }
          />
        )}
      </div>

      {/* CV-068 / CV-069 — respostas rápidas ranqueadas com variáveis preenchidas */}
      {quickReplyTemplates.length > 0 && (
        <div className="border border-border/40 rounded-lg overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-muted/40 transition-colors"
            onClick={() => setTemplatesOpen((o) => !o)}
            aria-expanded={templatesOpen}
            aria-label="Respostas rápidas inteligentes"
          >
            <span className="flex items-center gap-1.5">
              <span>Respostas sugeridas</span>
              <span className="rounded-full bg-primary/10 text-primary text-3xs px-1.5 py-0 font-medium">
                {rankedTemplates.length}
              </span>
            </span>
            {templatesOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          {templatesOpen && (
            <SmartTemplates
              rankedTemplates={rankedTemplates}
              onSelect={handleSelectTemplate}
              inputValue={inputValue}
            />
          )}
        </div>
      )}
    </div>
  );
}
