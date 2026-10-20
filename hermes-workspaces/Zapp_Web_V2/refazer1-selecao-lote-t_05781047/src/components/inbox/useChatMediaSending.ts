import { useState, useRef, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { normalizeMediaUrl } from '@/utils/normalizeMediaUrl';
import { toast } from '@/hooks/ui/use-toast';
import { sendOutboundMessage } from '@/services/outbound-message.service';

/** Motivo único da recusa quando a conexão WhatsApp não resolve: mesmo texto no toast e na rejeição. */
const CONEXAO_WHATSAPP_INDISPONIVEL = 'Conexão WhatsApp não disponível.';

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
      toast({ title: 'Erro', description: CONEXAO_WHATSAPP_INDISPONIVEL });
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

  // R2-INB-058 (#350-A): o chamador do inbox (`onSendAudio` do VoiceChangerPicker/AudioMemePicker)
  // faz `await onSendAudio(...)` dentro do próprio try e só entende REJEIÇÃO. Sair em silêncio
  // quando a conexão não resolve (antes: `if (!inst) return;`) e engolir o erro do transporte
  // (antes: `catch {}`) transformava a falha em sucesso — o popover fechava e a prévia era
  // descartada sem a mensagem ter ido. Contrato: REJEITA em falha (depois do toast de erro) e
  // resolve só quando o envio confirma.
  const handleSendAudioMeme = useCallback(async (audioUrl: string) => {
    const inst = await ensureInstance();
    if (!inst) throw new Error(CONEXAO_WHATSAPP_INDISPONIVEL);

    try {
      const normalizedAudioUrl = normalizeMediaUrl(audioUrl);
      void inst;
      await sendOutboundMessage({
        contactId, content: '[Áudio Meme]', messageType: 'audio', mediaUrl: normalizedAudioUrl,
      });
      toast({ title: '🔊 Áudio meme enviado!' });
    } catch (err) {
      toast({ title: 'Erro ao enviar áudio meme', variant: 'destructive' });
      throw err;
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
