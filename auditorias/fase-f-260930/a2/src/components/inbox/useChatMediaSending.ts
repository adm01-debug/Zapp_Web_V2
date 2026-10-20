import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMediaUrl } from '@/utils/normalizeMediaUrl';
import { toast } from '@/hooks/ui/use-toast';
import { sendOutboundMessage } from '@/services/outbound-message.service';

/**
 * Encapsulates WhatsApp instance resolution and media-message sending
 * (stickers, custom emojis, audio memes) to keep ChatPanel lean.
 */
export function useChatMediaSending(contactId: string, contactPhone: string | undefined) {
  const [instanceName, setInstanceName] = useState('');
  const [whatsappConnectionId, setWhatsappConnectionId] = useState<string | null>(null);
  const resolvedRef = useRef(false);

  const resolveInstance = useCallback(async (): Promise<string> => {
    if (instanceName) return instanceName;

    try {
      const { data: contact } = await supabase
        .from('contacts')
        .select('whatsapp_connection_id')
        .eq('id', contactId)
        .maybeSingle();

      if (contact?.whatsapp_connection_id) {
        setWhatsappConnectionId(contact.whatsapp_connection_id);
        const { data: conn } = await supabase
          .from('whatsapp_connections')
          .select('instance_id')
          .eq('id', contact.whatsapp_connection_id)
          .maybeSingle();
        if (conn?.instance_id) {
          setInstanceName(conn.instance_id);
          return conn.instance_id;
        }
      }

      const { data: fallbackConn } = await supabase
        .from('whatsapp_connections')
        .select('instance_id')
        .eq('status', 'connected')
        .limit(1)
        .maybeSingle();

      if (fallbackConn?.instance_id) {
        setInstanceName(fallbackConn.instance_id);
        return fallbackConn.instance_id;
      }
    } catch (err) {
      log.error('Failed to resolve WhatsApp instance:', err);
    }
    return '';
  }, [contactId, instanceName]);

  const initResolve = useCallback(async () => {
    if (!resolvedRef.current) {
      resolvedRef.current = true;
      await resolveInstance();
    }
  }, [resolveInstance]);

  const ensureInstance = useCallback(async (): Promise<string | null> => {
    const resolved = instanceName || await resolveInstance();
    if (!resolved || !contactPhone) {
      toast({ title: 'Erro', description: 'Conexão WhatsApp não disponível.' });
      return null;
    }
    return resolved;
  }, [instanceName, resolveInstance, contactPhone]);

  const handleSendSticker = useCallback(async (stickerUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) return;

    try {
      void inst;
      await sendOutboundMessage({
        contactId, content: '[Sticker]', messageType: 'sticker', mediaUrl: stickerUrl,
      });

      // Auto-save sticker
      supabase.from('stickers').select('id').eq('image_url', stickerUrl).maybeSingle().then(async ({ data: existing }) => {
        if (!existing) {
          const { data: { user } } = await supabase.auth.getUser();
          await supabase.from('stickers').insert({
            name: `Enviada ${new Date().toLocaleDateString('pt-BR')}`,
            image_url: stickerUrl, category: 'enviadas', is_favorite: false, use_count: 1, uploaded_by: user?.id || null,
          });
        }
      });

      toast({ title: 'Figurinha enviada!' });
    } catch {
      toast({ title: 'Erro ao enviar figurinha', variant: 'destructive' });
    }
  }, [ensureInstance, contactId]);

  const handleSendCustomEmoji = useCallback(async (emojiUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) return;

    try {
      const isUrl = emojiUrl.startsWith('http');
      void inst;
      await sendOutboundMessage({
        contactId,
        content: isUrl ? '[Emoji]' : emojiUrl,
        messageType: isUrl ? 'image' : 'text',
        mediaUrl: isUrl ? emojiUrl : null,
      });
      toast({ title: 'Emoji enviado!' });
    } catch {
      toast({ title: 'Erro ao enviar emoji', variant: 'destructive' });
    }
  }, [ensureInstance, contactId]);

  const handleSendAudioMeme = useCallback(async (audioUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) return;

    try {
      const normalizedAudioUrl = normalizeMediaUrl(audioUrl);
      void inst;
      await sendOutboundMessage({
        contactId, content: '[Áudio Meme]', messageType: 'audio', mediaUrl: normalizedAudioUrl,
      });
      toast({ title: '🔊 Áudio meme enviado!' });
    } catch {
      toast({ title: 'Erro ao enviar áudio meme', variant: 'destructive' });
    }
  }, [ensureInstance, contactId]);

  return {
    instanceName,
    whatsappConnectionId,
    initResolve,
    resolveInstance,
    handleSendSticker,
    handleSendCustomEmoji,
    handleSendAudioMeme,
  };
}
