/**
 * CatalogBulkSendDialog — E48: envio em massa real.
 * Abre a lista de produtos selecionados, coleta o contato via ContactSelectionStep
 * e envia cada produto individualmente com progress indicator.
 *
 * Não reutiliza sendProductToContact (que mostra toast por produto);
 * usa sendOutboundMessage diretamente para controle total do fluxo e
 * exibe um único toast de resume ao final.
 *
 * R2-MOD-007 — a classificação do envio olha para as TENTATIVAS efetivas, e o
 * encerramento devolve ao pai só os ids concluídos: falha integral vira `fail`
 * (não sucesso parcial) e o item que precisa de retry continua selecionado.
 */
import React, { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Send, Package, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import type { ExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { buildMessage } from './sendProductUtils';
import { useContactSearch, type ContactResult } from './useSendProduct';
import { ContactSelectionStep } from './ContactSelectionStep';
import { useAuth } from '@/hooks/auth/useAuth';
import { formatPrice, ProductThumb, CATALOG_FOCUS_VISIBLE } from './catalogShared';
import { toast } from 'sonner';
import { sendOutboundMessage } from '@/services/outbound-message.service';
import { logCatalogSendEvent } from '@/hooks/integrations/useCatalogContactSearch';
import { cn } from '@/lib/utils';

interface CatalogBulkSendDialogProps {
  /** Lista completa dos produtos selecionados */
  products: ExternalProduct[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Chamado ao concluir o lote com os ids dos produtos EFETIVAMENTE enviados,
   * para o pai removê-los da seleção. Itens falhados ou parciais são omitidos
   * e seguem selecionados para reenvio (R2-MOD-007).
   */
  onSent?: (sentProductIds: string[]) => void;
}

const TEMPLATE_LABELS = { formal: 'Formal', informal: 'Informal', promo: 'Promoção' } as const;

/**
 * Envia um produto para um contato sem exibir toast individual.
 *
 * A classificação parte das partes realmente tentadas: quando o produto não
 * tem imagem, só o texto é tentado — e a rejeição dele é falha integral
 * (`fail`), não `partial`. `partial` só existe quando ao menos uma parte foi
 * confirmada e outra falhou.
 */
async function sendSingleProduct(
  contact: ContactResult,
  product: ExternalProduct,
  agentId: string | null | undefined,
): Promise<'ok' | 'partial' | 'fail'> {
  const message = buildMessage(product, 'informal', null, contact);
  const imgUrl = product.primary_image_url;
  const messageIds: string[] = [];
  /** Cada parte tentada empilha aqui se foi confirmada (true) ou rejeitada (false). */
  const attempts: boolean[] = [];

  if (imgUrl) {
    try {
      const r = await sendOutboundMessage({ contactId: contact.id, content: '', messageType: 'image', mediaUrl: imgUrl });
      messageIds.push(r.id);
      attempts.push(true);
    } catch { attempts.push(false); }
  }
  try {
    const r = await sendOutboundMessage({ contactId: contact.id, content: message, messageType: 'text' });
    messageIds.push(r.id);
    attempts.push(true);
  } catch { attempts.push(false); }

  const okParts = attempts.filter(Boolean).length;
  const status = okParts === attempts.length ? 'sent' : okParts > 0 ? 'partial' : 'failed';

  void logCatalogSendEvent({
    productId: product.id,
    productName: product.name,
    productSku: product.sku,
    contactId: contact.id,
    agentId,
    template: 'informal',
    imagesCount: imgUrl ? 1 : 0,
    messageLength: message.length,
    status,
    messageIds,
  });

  return status === 'sent' ? 'ok' : status === 'partial' ? 'partial' : 'fail';
}

/** "1 enviado" / "3 enviados" — plural simples para o toast de resumo. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function CatalogBulkSendDialog({ products, open, onOpenChange, onSent }: CatalogBulkSendDialogProps) {
  const [step, setStep] = useState<'review' | 'selectContact' | 'sending' | 'done'>('review');
  const [sentCount, setSentCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [isSendingFlag, setIsSendingFlag] = useState(false);

  const {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  } = useContactSearch(step === 'selectContact' ? 'selectContact' : 'configure');

  const { profile } = useAuth();

  const handleClose = (v: boolean) => {
    onOpenChange(v);
    if (!v) {
      setStep('review');
      resetContactSelection();
      setSentCount(0);
      setFailCount(0);
      setIsSendingFlag(false);
    }
  };

  const handleSendAll = async () => {
    if (!selectedContact) return;
    setStep('sending');
    setIsSendingFlag(true);
    setSentCount(0);
    setFailCount(0);
    let ok = 0;
    let partial = 0;
    let fail = 0;
    const sentIds: string[] = [];
    for (const product of products) {
      const result = await sendSingleProduct(selectedContact, product, profile?.id);
      if (result === 'ok') { ok++; sentIds.push(product.id); }
      else if (result === 'partial') { partial++; }
      else { fail++; }
      setSentCount((c) => c + 1);
    }
    setFailCount(fail);
    setIsSendingFlag(false);
    if (partial === 0 && fail === 0) {
      toast.success(`✅ ${ok} produto${ok !== 1 ? 's' : ''} enviado${ok !== 1 ? 's' : ''}!`, { description: `Para ${selectedContact.name}` });
    } else {
      toast.warning('Envio concluído com falhas', {
        description: `${plural(ok, 'enviado', 'enviados')}, ${plural(partial, 'parcial', 'parciais')}, ${plural(fail, 'falha', 'falhas')} — para ${selectedContact.name}. Itens não concluídos seguem selecionados para reenvio.`,
      });
    }
    // R2-MOD-007 — só os concluídos saem da seleção; falhados/parciais ficam para retry.
    onSent?.(sentIds);
    handleClose(false);
  };

  const progress = products.length > 0 ? Math.round((sentCount / products.length) * 100) : 0;
  const firstImageUrl = products[0]?.primary_image_url ?? undefined;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent aria-describedby={undefined} className="max-w-lg max-h-[85vh] p-0 gap-0">

        {/* step 1: revisão da lista */}
        {step === 'review' && (
          <>
            <DialogHeader className="p-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Package className="w-5 h-5 text-primary" />
                Enviar {products.length} produto{products.length !== 1 ? 's' : ''}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                Revise os produtos e selecione o contato. Cada produto será enviado com sua imagem e descrição.
              </p>
            </DialogHeader>

            <ScrollArea className="max-h-[50vh]">
              <div className="px-5 pb-4 space-y-2">
                {products.map((p) => (
                  <div key={p.id} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/40 border border-border/30">
                    <div className="w-10 h-10 rounded-md overflow-hidden bg-muted shrink-0">
                      <ProductThumb
                        src={p.primary_image_url}
                        fallbackSrc={p.primary_image_fallback_url}
                        alt={p.name}
                        sizes="40px"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{formatPrice(p.sale_price)}</p>
                    </div>
                    {p.is_stockout && (
                      <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-destructive/10 text-destructive border border-destructive/20">
                        Esgotado
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-4 border-t flex gap-2">
              <Button variant="outline" className={`flex-1 ${CATALOG_FOCUS_VISIBLE}`} onClick={() => handleClose(false)}>Cancelar</Button>
              <Button
                className={`flex-1 gap-2 ${CATALOG_FOCUS_VISIBLE}`}
                onClick={() => { setStep('selectContact'); resetContactSelection(); }}
              >
                <Send className="w-4 h-4" />
                Selecionar Contato
              </Button>
            </div>
          </>
        )}

        {/* step 2: seleção de contato */}
        {step === 'selectContact' && (
          <ContactSelectionStep
            productName={`${products.length} produto${products.length !== 1 ? 's' : ''} selecionado${products.length !== 1 ? 's' : ''}`}
            productImageUrl={firstImageUrl}
            selectedImagesCount={products.length}
            template="informal"
            templateLabels={TEMPLATE_LABELS}
            contactSearch={contactSearch}
            onContactSearchChange={setContactSearch}
            contactResults={contactResults}
            searchingContacts={searchingContacts}
            selectedContact={selectedContact}
            onSelectContact={setSelectedContact}
            isSending={isSendingFlag}
            onBack={() => setStep('review')}
            onSend={handleSendAll}
          />
        )}

        {/* step 3: enviando... */}
        {step === 'sending' && (
          <div className="p-8 flex flex-col items-center gap-5">
            <Loader2 className="w-10 h-10 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-base font-semibold">
                Enviando produto {sentCount + 1} de {products.length}…
              </p>
              {sentCount < products.length && (
                <p className="text-sm text-muted-foreground mt-1 truncate max-w-[280px]">
                  {products[sentCount]?.name}
                </p>
              )}
            </div>
            <Progress value={progress} className="w-full" />
            <p className="text-xs text-muted-foreground tabular-nums">{progress}%</p>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
