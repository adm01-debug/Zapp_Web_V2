import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

const LEGACY_DRAFT_KEY_PREFIX = 'team_draft_';
const CHAR_LIMIT = 10000;

const log = getLogger('TeamChatDraft');

/** Convenção da casa: `zapp.<area>:<userId>` — o rascunho é do usuário, não do navegador. */
export function teamDraftStorageKey(userId: string, conversationId: string): string {
  return `zapp.teamchat.draft:${userId}:${conversationId}`;
}

/**
 * Rascunhos gravados antes do escopo por usuário (`team_draft_<conv>`) vazavam
 * entre contas no mesmo navegador — ao montar, o legado é removido sem leitura.
 */
function purgeLegacyDrafts(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(LEGACY_DRAFT_KEY_PREFIX)) doomed.push(key);
    }
    doomed.forEach((key) => localStorage.removeItem(key));
  } catch { /* storage unavailable */ }
}

interface UseTeamChatDraftOptions {
  conversationId: string;
  text: string;
  setText: (text: string) => void;
  onFileSent: (mediaUrl: string, mediaType: string, fileName: string) => void;
}

export function useTeamChatDraft({ conversationId, text, setText, onFileSent }: UseTeamChatDraftOptions) {
  const { profile } = useAuth();
  const [pasteUploading, setPasteUploading] = useState(false);
  const userId = profile?.id;
  const draftKey = userId ? teamDraftStorageKey(userId, conversationId) : null;

  const charCount = text.length;
  const isNearLimit = charCount > CHAR_LIMIT * 0.9;
  const isOverLimit = charCount > CHAR_LIMIT;
  const hasText = text.trim().length > 0;

  // Auto-save drafts
  useEffect(() => {
    if (!draftKey) return;
    const timer = setTimeout(() => {
      try {
        if (text.trim()) {
          localStorage.setItem(draftKey, text);
        } else {
          localStorage.removeItem(draftKey);
        }
      } catch { /* storage unavailable */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [text, draftKey]);

  // Restore draft on mount
  useEffect(() => {
    purgeLegacyDrafts();
    if (!draftKey) return;
    try {
      const draft = localStorage.getItem(draftKey);
      if (draft && !text) setText(draft);
    } catch (err) { log.error('Unexpected error in useTeamChatDraft:', err); }
  // text/setText fora das deps de propósito: restaurar só na troca de conversa ou
  // de conta — com `text` aqui, apagar o campo ressuscitaria o rascunho.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId, draftKey]);

  // Clear draft on send
  const clearDraft = useCallback(() => {
    if (!draftKey) return;
    try { localStorage.removeItem(draftKey); } catch { /* storage unavailable */ }
  }, [draftKey]);

  // Paste images from clipboard
  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items || !profile || pasteUploading) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        e.preventDefault();
        const file = items[i].getAsFile();
        if (!file) return;

        setPasteUploading(true);
        try {
          const ext = file.type.split('/')[1] || 'png';
          const path = `${profile.id}/${conversationId}/${Date.now()}_paste.${ext}`;
          const { error: uploadError } = await supabase.storage
            .from('team-chat-files')
            .upload(path, file, { contentType: file.type });
          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from('team-chat-files')
            .getPublicUrl(path);

          onFileSent(urlData.publicUrl, 'image', `📋 Imagem colada`);
        } catch (err) {
          log.error('Paste image upload error:', err);
          toast.error('Erro ao enviar imagem colada');
        } finally {
          setPasteUploading(false);
        }
        return;
      }
    }
  }, [profile, conversationId, pasteUploading, onFileSent]);

  return {
    charCount,
    isNearLimit,
    isOverLimit,
    hasText,
    pasteUploading,
    handlePaste,
    clearDraft,
    CHAR_LIMIT,
  };
}
