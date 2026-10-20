import { useState, useCallback, useEffect } from 'react';
import { useIsMobile } from '@/hooks/ui/use-mobile';

const DRAFT_KEY_PREFIX = 'chat_draft_';
const CHAR_LIMIT = 4096;

interface UseChatInputLogicParams {
  inputValue: string;
  contactId: string;
  editingMessage: { content: string } | null | undefined;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  fileUploaderRef: React.RefObject<{ handleExternalFiles: (files: File[]) => void } | null>;
  onSend: () => void;
  onPasteFiles?: (files: File[]) => void;
}

export function useChatInputLogic({
  inputValue, contactId, editingMessage, inputRef, fileUploaderRef, onSend, onPasteFiles,
}: UseChatInputLogicParams) {
  const [showRichToolbar, setShowRichToolbar] = useState(false);
  const [showMarkdownPreview, setShowMarkdownPreview] = useState(false);
  const [sendAnimation, setSendAnimation] = useState(false);
  const isMobile = useIsMobile();

  const hasText = inputValue.trim().length > 0;
  const charCount = inputValue.length;
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

  // Auto-save drafts
  useEffect(() => {
    if (!contactId || editingMessage) return;
    const timer = setTimeout(() => {
      try {
        if (inputValue.trim()) {
          localStorage.setItem(`${DRAFT_KEY_PREFIX}${contactId}`, inputValue);
        } else {
          localStorage.removeItem(`${DRAFT_KEY_PREFIX}${contactId}`);
        }
      } catch { /* storage unavailable */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [inputValue, contactId, editingMessage]);

  // Restore draft on contact change
  useEffect(() => {
    if (!contactId || editingMessage) return;
    let draft: string | null = null;
    try { draft = localStorage.getItem(`${DRAFT_KEY_PREFIX}${contactId}`); } catch { /* storage unavailable */ }
    if (draft && !inputValue) {
      setNativeValue(inputRef, draft);
    }
  }, [contactId]);

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
    try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}${contactId}`); } catch { /* storage unavailable */ }
    if (isMobile && navigator.vibrate) navigator.vibrate(50);
    onSend();
    setTimeout(() => setSendAnimation(false), 400);
  }, [hasText, isOverLimit, contactId, isMobile, onSend]);

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
