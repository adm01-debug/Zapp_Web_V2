import { useState, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { getLogger } from '@/lib/logger';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import { fetchCatalogContactResults, logCatalogSendEvent, CONTACT_SEARCH_MIN_CHARS, type CatalogSendTemplate } from '@/hooks/integrations/useCatalogContactSearch';
import { CATALOG_SEND_EVENTS_KEY } from '@/hooks/integrations/useCatalogRecentSends';

const log = getLogger('useSendProduct');

export interface ContactResult {
  id: string;
  name: string;
  phone: string;
  avatar_url: string | null;
  /** CT-45 — alimenta {{empresa}} na personalização da mensagem. */
  company?: string | null;
}

/** CT-46 — contador de mensagens do envio em andamento ("Enviando 2/4..."). */
export interface SendProgress {
  /** Mensagens já concluídas (enviadas ou falhadas). */
  done: number;
  /** Total de mensagens que este envio vai disparar. */
  total: number;
}

/** Versão mínima (ms) entre duas fotos do mesmo envio — humanização (CT-05). */
export const PHOTO_MIN_INTERVAL_MS = 800;
/** Jitter aleatório somado ao intervalo mínimo, para o ritmo não ser metronômico. */
export const PHOTO_INTERVAL_JITTER_MS = 700;

const sleep = (ms: number) => new Promise<void>((resolve) => { setTimeout(resolve, ms); });

/**
 * Fração aleatória em [0, 1) para o jitter do ritmo humano.
 *
 * Não é `Math.random()`: a regra S2245 do Sonar marca PRNG fraco como
 * vulnerabilidade e o quality gate do repositório fica vermelho por causa disso.
 * O módulo já exige Web Crypto para os ids de entrega (`crypto.randomUUID` em
 * outbound-message.service), então a fonte é a mesma.
 */
function randomFraction(): number {
  const buffer = new Uint32Array(1);
  crypto.getRandomValues(buffer);
  return buffer[0] / 0x1_0000_0000;
}

/**
 * CT-06 — abre a conversa do contato no inbox a partir do toast de sucesso.
 *
 * Não existe rota `?view=inbox&contact=<id>`: o inbox recebe a conversa por
 * evento (`open-contact-chat`, escutado em useRealtimeInbox) e o parâmetro de
 * URL só troca a view. É o mesmo mecanismo já usado por useContactsCRUD
 * .openContactChat — repetir a tentativa cobre a view do inbox ainda montando.
 */
export function openContactChat(contactId: string): void {
  // O retry abaixo agenda timers que podem disparar depois de o ambiente de
  // execução sair de cena (jsdom desmontado no fim da suíte, ou SSR onde
  // `window` nunca existiu). Sem esta guarda o callback estoura
  // `ReferenceError: window is not defined` fora de qualquer try/catch e
  // derruba o processo — era isso que reprovava o `test:coverage` do CI.
  if (typeof window === 'undefined') return;
  const appWindow = window as Window & { __pendingOpenContactId?: string };
  appWindow.__pendingOpenContactId = contactId;
  if (new URLSearchParams(window.location.search).get('view') !== 'inbox') {
    navigateToView('inbox');
  }
  let attempts = 0;
  const tryDispatch = () => {
    attempts++;
    // O timer sobrevive ao ambiente (teardown do jsdom): reavaliar antes de
    // tocar o DOM evita o ReferenceError e encerra a cadeia de retry.
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('open-contact-chat', { detail: { contactId } }));
    if (attempts < 15) setTimeout(tryDispatch, 200);
  };
  setTimeout(tryDispatch, 150);
}

export function useContactSearch(
  step: 'configure' | 'selectContact',
  presetContact?: ContactResult | null,
) {
  const [contactSearch, setContactSearch] = useState('');
  const [contactResults, setContactResults] = useState<ContactResult[]>([]);
  const [searchingContacts, setSearchingContacts] = useState(false);
  // CT-14/CT-17 — quando o dialog abre a partir de uma conversa (chat, perfil
  // do contato), o contato já vem escolhido e continua trocável.
  const [selectedContact, setSelectedContact] = useState<ContactResult | null>(presetContact ?? null);

  // Troca do preset durante a vida do dialog (outra conversa/contato) sem
  // efeito e sem ref-durante-render: mesmo padrão de comparação no corpo do
  // render já usado em SendProductDialog.
  const presetContactId = presetContact?.id ?? null;
  const [prevPresetContactId, setPrevPresetContactId] = useState(presetContactId);
  if (prevPresetContactId !== presetContactId) {
    setPrevPresetContactId(presetContactId);
    setSelectedContact(presetContact ?? null);
  }

  // A single scheduled fetch owns both the recent and filtered lists.  Besides
  // avoiding overlapping requests, state changes only happen after the effect
  // has yielded, which prevents a synchronous render cascade on step changes.
  useEffect(() => {
    let cancelled = false;
    const query = contactSearch.trim();
    // CT-43 — debounce de 300 ms e mínimo de 2 caracteres: um único caractere
    // casa quase a base inteira e não vale nem a digitação nem a consulta.
    const hasQuery = query.length >= CONTACT_SEARCH_MIN_CHARS;
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
    }, hasQuery ? 300 : 0);
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

export function useSendToContact(onSuccess: () => void, onRetry?: () => void) {
  const [isSending, setIsSending] = useState(false);
  // CT-46 — contador real de mensagens do envio em andamento. Guardado junto
  // do booleano porque o botão precisa dizer "Enviando 2/4...", não só
  // "Enviando...". Reiniciado a cada envio; não é limpo no fim para que o
  // último estado não pisque de volta para 0/0 durante o fechamento.
  const [sendProgress, setSendProgress] = useState<SendProgress | null>(null);
  const queryClient = useQueryClient();

  const sendProductToContact = useCallback(async (
    contact: ContactResult,
    message: string,
    imageUrls: string[],
    product?: SendEventProductInfo,
    agentId?: string | null,
  ) => {
    setIsSending(true);
    try {
      // CT-04 — a mensagem vira **caption da primeira foto**: é assim que o
      // usuário manda produto no WhatsApp (texto colado na imagem). As demais
      // fotos vão mudas e o texto só vira mensagem própria quando não há foto
      // nenhuma. Antes o fluxo mandava N fotos com caption vazio + 1 texto
      // separado = N+1 mensagens e o cliente recebia a foto órfã do texto.
      let failed = 0;
      const messageIds: string[] = [];
      const hasImages = imageUrls.length > 0;
      const total = hasImages ? imageUrls.length : 1;
      setSendProgress({ done: 0, total });

      for (let i = 0; i < imageUrls.length; i++) {
        // CT-05 — ritmo humano entre fotos: sem isso as N imagens saem no
        // mesmo milissegundo (prints de rajada e risco de bloqueio do número).
        if (i > 0) {
          await sleep(PHOTO_MIN_INTERVAL_MS + randomFraction() * PHOTO_INTERVAL_JITTER_MS);
        }
        const isFirst = i === 0;
        try {
          const result = await sendOutboundMessage({
            contactId: contact.id,
            // `content` é o que a nossa própria UI exibe; `caption` é o que a
            // Evolution manda junto da mídia. Os dois carregam a mensagem na 1ª.
            content: isFirst ? message : '',
            messageType: 'image',
            mediaUrl: imageUrls[i],
            caption: isFirst ? message : null,
          });
          messageIds.push(result.id);
        } catch {
          // Uma foto que falha não aborta as demais (mantido do comportamento
          // anterior): o resultado agregado é que fica `partial`.
          failed++;
        }
        setSendProgress({ done: i + 1, total });
      }

      if (!hasImages) {
        try {
          const result = await sendOutboundMessage({ contactId: contact.id, content: message, messageType: 'text' });
          messageIds.push(result.id);
        } catch { failed++; }
        setSendProgress({ done: 1, total });
      }

      const totalAttempted = total;
      const status = failed === 0 ? 'sent' : failed === totalAttempted ? 'failed' : 'partial';

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
        }).finally(() => {
          // O rail do catálogo (E56) lê esta tabela: sem invalidar, o envio
          // recém-registrado só apareceria num refetch por foco de janela
          // ou remount, porque staleTime apenas marca o cache como velho.
          void queryClient.invalidateQueries({ queryKey: CATALOG_SEND_EVENTS_KEY });
        });
      }

      // CT-06 — três tons de toast (sonner), com as duas ações que o usuário
      // realmente quer depois de enviar: abrir a conversa ou tentar de novo.
      const retryAction = onRetry ? { label: 'Tentar de novo', onClick: onRetry } : undefined;
      if (status === 'failed') {
        toast.error('Falha no envio', {
          description: `Nenhuma mensagem chegou a ${contact.name}. Tente novamente.`,
          action: retryAction,
        });
      } else if (status === 'partial') {
        toast.warning('Envio parcial', {
          description: `${failed} de ${totalAttempted} mensagem(ns) falharam para ${contact.name}.`,
          action: retryAction,
        });
      } else {
        toast.success('✅ Produto enviado!', {
          description: `Enviado para ${contact.name}`,
          action: { label: 'Abrir conversa', onClick: () => openContactChat(contact.id) },
        });
      }
      // Audit 24/09 — falha total (todas as mensagens/fotos falharam) não
      // pode fechar o dialog nem apagar o rascunho: sem isso, onSuccess()
      // disparava incondicionalmente e o usuário perdia a mensagem digitada
      // mesmo quando NADA foi enviado (achado CRÍTICO 1 da auditoria).
      if (status !== 'failed') onSuccess();
    } catch (err) {
      log.error('Error sending product:', err);
      toast.error('Erro ao enviar produto', {
        action: onRetry ? { label: 'Tentar de novo', onClick: onRetry } : undefined,
      });
    } finally {
      setIsSending(false);
    }
  }, [onSuccess, onRetry, queryClient]);

  return { isSending, sendProgress, sendProductToContact };
}
