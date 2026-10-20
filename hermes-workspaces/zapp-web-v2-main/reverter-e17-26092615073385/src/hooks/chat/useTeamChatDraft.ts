import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import { toast } from 'sonner';

const DRAFT_KEY_PREFIX = 'team_draft_';
const CHAR_LIMIT = 10000;

const log = getLogger('TeamChatDraft');

interface UseTeamChatDraftOptions {
  conversationId: string;
  text: string;
  setText: (text: string) => void;
  onFileSent: (mediaUrl: string, mediaType: string, fileName: string) => void;
}

export function useTeamChatDraft({ conversationId, text, setText, onFileSent }: UseTeamChatDraftOptions) {
  const { profile } = useAuth();
  const [pasteUploading, setPasteUploading] = useState(false);

  const charCount = text.length;
  const isNearLimit = charCount > CHAR_LIMIT * 0.9;
  const isOverLimit = charCount > CHAR_LIMIT;
  const hasText = text.trim().length > 0;

  // Auto-save drafts
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        if (text.trim()) {
          localStorage.setItem(`${DRAFT_KEY_PREFIX}${conversationId}`, text);
        } else {
          localStorage.removeItem(`${DRAFT_KEY_PREFIX}${conversationId}`);
        }
      } catch { /* storage unavailable */ }
    }, 500);
    return () => clearTimeout(timer);
  }, [text, conversationId]);

  // Restore draft on mount
  useEffect(() => {
    try {
      const draft = localStorage.getItem(`${DRAFT_KEY_PREFIX}${conversationId}`);
      if (draft && !text) setText(draft);
    } catch (err) { log.error('Unexpected error in useTeamChatDraft:', err); }
  }, [conversationId]);

  // Clear draft on send
  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(`${DRAFT_KEY_PREFIX}${conversationId}`); } catch { /* storage unavailable */ }
  }, [conversationId]);

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
