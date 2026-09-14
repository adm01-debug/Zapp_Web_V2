import { useState, useEffect, useCallback } from 'react';
import { toast } from '@/hooks/ui/use-toast';
import { getLogger } from '@/lib/logger';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { fetchCatalogContactResults, logCatalogSendEvent, type CatalogSendTemplate } from '@/hooks/integrations/useCatalogContactSearch';

const log = getLogger('useSendProduct');

export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
}

export function useContactSearch(step: 'configure' | 'selectContact') {
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(null);

  // A single scheduled fetch owns both the recent and filtered lists.  Besides
  // avoiding overlapping requests, state changes only happen after the effect
  // has yielded, which prevents a synchronous render cascade on step changes.
  useEffect(() => {
    let cancelled = false;
    const query = contactSearch.trim();
    const timeout = setTimeout(async () => {
      if (step !== 'selectContact') {
        setContactResults([]);
        setSearchingContacts(false);
        return;
      }

      setSearchingContacts(true);
      const data = await fetchCatalogContactResults(query);
      if (!cancelled) {
        setContactResults(data);
        setSearchingContacts(false);
      }
    }, query ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [contactSearch, step]);

  const resetContactSelection = useCallback(() => {
    setSelectedContact(null);
    setContactSearch('');
  }, []);

  return {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  };
}

/** Produto sendo enviado — só o necessário pro log de catalog_send_events (E28). */
export interface SendEventProductInfo {
  id: string;
  name: string;
  sku?: string | null;
  variantLabel?: string | null;
  template?: CatalogSendTemplate | null;
}

export function useSendToContact(onSuccess: () => void) {
  const [isSending, setIsSending] = useState(false);

  const sendProductToContact = useCallback(async (
    contact: ContactResult,
    message: string,
    imageUrls: string[],
    product?: SendEventProductInfo,
    agentId?: string | null,
  ) => {
    setIsSending(true);
    try {
      // Send images
      let imageFailed = 0;
      const messageIds: string[] = [];
      for (const imgUrl of imageUrls) {
        try {
          // Keep the old empty provider caption. The image URL is stored in
          // media_url; it must never become customer-facing message text.
          const result = await sendOutboundMessage({ contactId: contact.id, content: '', messageType: 'image', mediaUrl: imgUrl });
          messageIds.push(result.id);
        } catch {
          imageFailed++;
        }
      }

      // Send text
      let textFailed = false;
      try {
        const result = await sendOutboundMessage({ contactId: contact.id, content: message, messageType: 'text' });
        messageIds.push(result.id);
      } catch { textFailed = true; }

      const totalFailed = imageFailed + (textFailed ? 1 : 0);
      const totalAttempted = imageUrls.length + 1;
      const status = totalFailed === 0 ? 'sent' : totalFailed === totalAttempted ? 'failed' : 'partial';

      if (product) {
        // Falha silenciosa (dentro do próprio helper) — nunca bloqueia o
        // fluxo de envio, que já terminou de verdade nesse ponto.
        void logCatalogSendEvent({
          productId: product.id,
          productName: product.name,
          productSku: product.sku,
          variantLabel: product.variantLabel,
          contactId: contact.id,
          agentId,
          template: product.template,
          imagesCount: imageUrls.length,
          messageLength: message.length,
          status,
          messageIds,
        });
      }

      if (totalFailed > 0) {
        toast({ title: 'Envio parcial', description: `${totalFailed} mensagem(ns) falharam para ${contact.name}`, variant: 'destructive' });
      } else {
        toast({ title: '✅ Produto enviado!', description: `Enviado para ${contact.name}` });
      }
      onSuccess();
    } catch (err) {
      log.error('Error sending product:', err);
      toast({ title: 'Erro ao enviar produto', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  }, [onSuccess]);

  return { isSending, sendProductToContact };
}
