import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadTeamMedia } from '@/hooks/team-chat/uploadTeamMedia';
import { useAuth } from '@/hooks/auth/useAuth';
import { getTeamChatFileSizeError, MAX_TEAM_CHAT_FILE_SIZE } from '@/lib/teamChatRules';
import { teamDraftStorageKey } from '@/lib/teamChatDraftSession';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

const LEGACY_DRAFT_KEY_PREFIX = 'team_draft_';
const CHAR_LIMIT = 10000;

const log = getLogger('TeamChatDraft');

/** Reexportado para não quebrar quem importa a chave a partir do hook. */
export { teamDraftStorageKey };

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
  onFileSent: (mediaPath: string, mediaType: string, fileName: string) => void;
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

        // HZ5-08: o mesmo limite/tipo do upload por arquivo. Antes, uma imagem
        // colada de 60 MB ia direto para o storage (o bucket recusava e o usuário
        // só via "Erro ao enviar imagem colada").
        const fileError = getTeamChatFileSizeError(file.size);
        if (fileError) {
          toast.error(
            fileError === 'too-large'
              ? `Imagem muito grande. Máximo: ${MAX_TEAM_CHAT_FILE_SIZE / 1024 / 1024}MB`
              : 'A imagem colada está vazia',
          );
          return;
        }

        setPasteUploading(true);
        try {
          const ext = file.type.split('/')[1] || 'png';
          const locator = await uploadTeamMedia({
            profileId: profile.id,
            conversationId,
            file,
            extension: ext,
            contentType: file.type,
          });
          if (!locator) return;

          onFileSent(locator.mediaPath, 'image', `📋 Imagem colada`);
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
