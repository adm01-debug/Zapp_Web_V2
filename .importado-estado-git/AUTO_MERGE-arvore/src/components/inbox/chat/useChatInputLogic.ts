import { useState, useCallback, useEffect } from 'react';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import { AuthService } from '@/services/auth.service';
import { log } from '@/lib/logger';
import {
  inboxDraftStorageKey,
  purgeLegacyInboxDrafts,
  readInboxDraft,
  removeInboxDraft,
  writeInboxDraft,
} from '@/lib/inboxDraftSession';

/** Limite de caracteres do editor de mensagem — fonte única (contador, botão e envio). */
export const CHAR_LIMIT = 4096;

/** Assinatura de texto ligada + nome do agente — o mesmo par que o ChatPanel entrega à barra. */
export interface AssinaturaDeTexto {
  enabled?: boolean;
  name?: string;
}

/*
 * R2-INB-016 (item 312) — a assinatura de texto CONTA no limite de 4096: o limite representa
 * o payload real enviado ao canal, não o texto cru do editor. `applySignature`
 * (src/hooks/chat/useMessageSignature.ts) coloca `*<nome>:*\n` antes do corpo quando a
 * assinatura está ligada; sem contar esse prefixo, um corpo de 4090 caracteres com a
 * assinatura "*Ana:*\n" ultrapassava 4096 com o botão Enviar ainda habilitado.
 */

/**
 * Prefixo que a assinatura de texto APLICÁVEL coloca antes do corpo enviado. Vazio quando a
 * assinatura está desligada ou o nome do agente ainda não chegou (é o mesmo que
 * `applySignature` devolve nesses casos). Espelha o formato de `applySignature`; a igualdade
 * entre os dois é cobrada por teste contra a assinatura REAL, em
 * `__tests__/ChatInputArea.limite-enter.test.tsx`, e não por convenção.
 */
export function prefixoAssinaturaDeTexto(assinatura?: AssinaturaDeTexto): string {
  if (!assinatura?.enabled || !assinatura.name) return '';
  return `*${assinatura.name}:*\n`;
}

/**
 * Grandeza do limite: corpo que vai ser enviado (sem espaços nas pontas, como o transporte
 * recebe) mais o prefixo da assinatura aplicável. Contador, botão Enviar e a recusa do
 * Enter (useChatPanelHandlers.handleSend) medem este mesmo número.
 */
export function medirPayloadDeEnvio(corpo: string, prefixoDaAssinatura = ''): number {
  return corpo.trim().length + prefixoDaAssinatura.length;
}

interface UseChatInputLogicParams {
  inputValue: string;
  contactId: string;
  editingMessage: { content: string } | null | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileUploaderRef: React.RefObject<{ handleExternalFiles: (files: File[]) => void } | null>;
  onSend: () => void;
  onPasteFiles?: (files: File[]) => void;
  signatureEnabled?: boolean;
  signatureName?: string;
}

/**
 * SEC-FRONTEND-03 (auditoria de 07/10/2026): dono do rascunho. O rascunho é do
 * USUÁRIO, não do navegador — sem identidade legível (cliente de auth mockado em
 * teste isolado, storage bloqueado) nada é gravado: a falha é fechada, nunca um
 * rascunho sem dono voltando para outra conta.
 */
function useDraftOwnerId(): string | null {
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const session = await AuthService.getSession();
        if (!cancelled) setOwnerId(session?.user?.id ?? null);
      } catch (err) {
        log.warn('[useChatInputLogic] sessão indisponível para o escopo do rascunho', err);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return ownerId;
}

export function useChatInputLogic({
  inputValue, contactId, editingMessage, inputRef, fileUploaderRef, onSend, onPasteFiles,
  signatureEnabled, signatureName,
}: UseChatInputLogicParams) {
  const [showRichToolbar, setShowRichToolbar] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [sendAnimation, setSendAnimation] = useState(false);
  const isMobile = useIsMobile();
  const ownerId = useDraftOwnerId();
  /**
   * SEC-FRONTEND-03: a chave do rascunho leva o dono
   * (`zapp.inbox.draft:<userId>:<contactId>`). Sem usuário identificado — ou sem
   * contato — não existe chave, e sem chave não há gravação nem leitura.
   */
  const draftKey = inboxDraftStorageKey(ownerId, contactId);

  const hasText = inputValue.trim().length > 0;
  // R2-INB-016 (item 312): contador e botão medem o payload real do envio — corpo do editor
  // mais a assinatura de texto aplicável. A edição não passa por `applySignature`
  // (useChatPanelHandlers.handleSend), então lá o limite segue medindo o corpo do editor.
  const prefixoDaAssinatura = editingMessage
    ? ''
    : prefixoAssinaturaDeTexto({ enabled: signatureEnabled, name: signatureName });
  const charCount = medirPayloadDeEnvio(inputValue, prefixoDaAssinatura);
  const isNearLimit = charCount > CHAR_LIMIT * 0.9;
  const isOverLimit = charCount > CHAR_LIMIT;

  // Auto-grow textarea
  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [inputRef]);

  useEffect(() => { autoResize(); }, [inputValue, autoResize]);

  // O rascunho antigo (`chat_draft_<contato>`, sem dono) sai sem leitura na montagem:
  // o texto gravado antes deste cartão não pertence a ninguém identificável.
  useEffect(() => { purgeLegacyInboxDrafts(); }, []);

  // Auto-save drafts
  useEffect(() => {
    if (!draftKey || editingMessage) return;
    const timer = setTimeout(() => {
      if (inputValue.trim()) {
        writeInboxDraft(draftKey, inputValue);
      } else {
        removeInboxDraft(draftKey);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue, draftKey, editingMessage]);

  // Restore draft on contact change (and once the owner identity is known)
  useEffect(() => {
    if (!contactId || editingMessage) return;
    const draft = readInboxDraft(draftKey);
    if (draft && !inputValue) {
      setNativeValue(inputRef, draft);
    }
  // inputValue/editingMessage/inputRef fora das deps de propósito: restaurar só na troca de
  // contato ou de dono — com `inputValue` aqui, apagar o campo ressuscitaria o rascunho.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId, draftKey]);

  // Paste images
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) files.push(file);
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      if (onPasteFiles) onPasteFiles(files);
      else if (fileUploaderRef.current) fileUploaderRef.current.handleExternalFiles(files);
    }
  }, [onPasteFiles, fileUploaderRef]);

  // Voice dictation
  const handleVoiceDictation = useCallback((text: string) => {
    const el = inputRef.current;
    if (!el) return;
    const current = el.value;
    setNativeValue(inputRef, current ? `${current} ${text}` : text);
    el.focus();
  }, [inputRef]);

  // Send with animation
  const handleSendWithAnimation = useCallback(() => {
    if (!hasText || isOverLimit) return;
    setSendAnimation(true);
    removeInboxDraft(draftKey);
    if (isMobile && navigator.vibrate) navigator.vibrate(50);
    onSend();
    setTimeout(() => setSendAnimation(false), 400);
  }, [hasText, isOverLimit, draftKey, isMobile, onSend]);

  return {
    showRichToolbar, setShowRichToolbar,
    showMarkdownPreview, setShowMarkdownPreview,
    sendAnimation, isMobile,
    hasText, charCount, isNearLimit, isOverLimit,
    CHAR_LIMIT,
    handlePaste, handleVoiceDictation, handleSendWithAnimation,
  };
}

/** Helper to set textarea value via native setter (React-compatible) */
export function setNativeValue(
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
  value: string,
) {
  const el = inputRef.current;
  if (!el) return;
  const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  if (nativeSetter) {
    nativeSetter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
}
