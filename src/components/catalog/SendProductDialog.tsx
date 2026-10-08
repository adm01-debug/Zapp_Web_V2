import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Drawer, DrawerContent } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/ui/use-mobile';
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle,
  AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { groupVariantsByColor } from './sendProductUtils';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import {
  Send, ChevronDown, Package, Copy, Download, Palette, Check,
  Pencil, User, Link2, History, Loader2,
} from 'lucide-react';
import { ExternalProduct, useExternalProduct } from '@/hooks/integrations/useExternalCatalog';
import { toast } from 'sonner';
import { useCatalogSendReadiness } from '@/hooks/integrations/useCatalogSendReadiness';
import { cn } from '@/lib/utils';
import {
  type MessageTemplate, type SendMode, buildMessage, collectAllImages, downloadImageAsBlob,
} from './sendProductUtils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { AlertCard, personalizePreview } from '@/components/talkx/talkxShared';
import { useContactSearch, useSendToContact, type ContactResult } from './useSendProduct';
import { useAuth } from '@/hooks/auth/useAuth';
import { ContactSelectionStep } from './ContactSelectionStep';
// CT-37 — PhonePreview (prévia estilo WhatsApp) subiu para catalogShared,
// junto com a classe .catalog-phone e os tokens --wa-*.
import { PhonePreview, CATALOG_FOCUS_VISIBLE, productImageAlt } from './catalogShared';

interface SendProductDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSend?: (text: string, images: string[]) => void;
  initialVariantColor?: string;
  /**
   * CT-14/CT-17 — contato da conversa aberta. Com ele preenchido o dialog
   * mostra o card-resumo do contato no passo de configuração, envia direto
   * (pula o passo "Selecionar contato") e continua permitindo trocar.
   */
  presetContact?: ContactResult | null;
}

const TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
};

const MAX_MESSAGE_LENGTH = 2000;
const MAX_IMAGES = 10;
const DRAFT_DEBOUNCE_MS = 500;

/**
 * R2-MOD-011 — teto de fotos aplicado na ENTRADA da seleção (estado inicial e
 * reset). O toggle e o "Adicionar fotos" já travavam em MAX_IMAGES, mas a
 * seleção inicial (e o reset ao trocar modo/cor) marcava TODAS as fotos: um
 * produto com 11+ imagens abria acima do limite anunciado.
 */
const capImageUrls = (images: { url: string }[]): string[] =>
  images.slice(0, MAX_IMAGES).map((i) => i.url);

/** E77 — rascunho de mensagem personalizada não enviada, por produto. */
interface SendDraft {
  template: MessageTemplate;
  customMessage: string;
  sendMode: SendMode;
  selectedColorGroup: string | null;
  savedAt: number;
}

const draftKey = (productId: string) => `catalog.sendDraft.${productId}`;

const readDraft = (productId: string): SendDraft | null => {
  try {
    const raw = sessionStorage.getItem(draftKey(productId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Audit 24/09 — JSON.parse só protege contra sintaxe inválida; um
    // objeto sintaticamente válido mas com shape errado (campo adulterado
    // ou de uma versão antiga do SendDraft) passava direto como
    // `as SendDraft` e quebrava o componente ao restaurar (CRÍTICO 2).
    if (
      !parsed || typeof parsed !== 'object' ||
      typeof parsed.template !== 'string' ||
      typeof parsed.customMessage !== 'string' ||
      typeof parsed.sendMode !== 'string' ||
      (parsed.selectedColorGroup !== null && typeof parsed.selectedColorGroup !== 'string')
    ) {
      return null;
    }
    return parsed as SendDraft;
  } catch { return null; }
};

/** Prévia visual da mensagem/fotos (E74) agora é o PhonePreview de
 * catalogShared (CT-37) — reutilizável e sem hex/tokens locais. */
export const SendProductDialog: React.FC<SendProductDialogProps> = ({
  product, open, onOpenChange, onConfirmSend, initialVariantColor, presetContact = null,
}) => {
  const needsFullProduct = !product.variants || product.variants.length === 0;
  const { data: fetchedProduct, isFetching: loadingVariants } = useExternalProduct(product.id, {
    enabled: open && needsFullProduct,
  });
  const fullProduct: ExternalProduct = fetchedProduct ?? product;
  const [template, setTemplate] = useState<MessageTemplate>('informal');
  const [isEditing, setIsEditing] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('product');
  const [selectedColorGroup, setSelectedColorGroup] = useState<string | null>(null);
  const [step, setStep] = useState<'configure' | 'selectContact'>('configure');

  // E77 — rascunho de mensagem personalizada em sessionStorage.
  const [hasDraft, setHasDraft] = useState(() => readDraft(product.id) !== null);
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false);
  const hasPendingEdit = isEditing && customMessage.trim().length > 0;

  useEffect(() => {
    if (!hasPendingEdit) return;
    const t = setTimeout(() => {
      const draft: SendDraft = { template, customMessage, sendMode, selectedColorGroup, savedAt: Date.now() };
      try { sessionStorage.setItem(draftKey(product.id), JSON.stringify(draft)); } catch { /* ignore */ }
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [hasPendingEdit, template, customMessage, sendMode, selectedColorGroup, product.id]);

  const handleRestoreDraft = () => {
    const draft = readDraft(product.id);
    if (!draft) { setHasDraft(false); return; }
    setTemplate(draft.template);
    setCustomMessage(draft.customMessage);
    setSendMode(draft.sendMode);
    setSelectedColorGroup(draft.selectedColorGroup);
    setIsEditing(true);
    setHasDraft(false);
  };

  const handleDiscardDraft = () => {
    try { sessionStorage.removeItem(draftKey(product.id)); } catch { /* ignore */ }
    setHasDraft(false);
  };

  const {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  } = useContactSearch(step, presetContact);

  const { profile } = useAuth();
  // CT-06 — "Tentar de novo" reabre o dialog no passo de contato (o envio pode
  // ter fechado o dialog no caminho de onConfirmSend) sem perder a seleção.
  const handleRetry = React.useCallback(() => {
    onOpenChange(true);
    setStep('selectContact');
  }, [onOpenChange]);
  const { isSending, sendProgress, sendProductToContact } = useSendToContact(() => {
    try { sessionStorage.removeItem(draftKey(product.id)); } catch { /* ignore */ }
    onOpenChange(false);
    setStep('configure');
    resetContactSelection();
  }, handleRetry);

  // CT-08 — conexão de WhatsApp ativa e contato fora da lista de supressão são
  // pré-requisitos do envio; sem eles o botão fica desabilitado com explicação.
  const sendReadiness = useCatalogSendReadiness(
    step === 'selectContact' || presetContact ? selectedContact : null
  );

  const variantGroups = useMemo(
    () => groupVariantsByColor(fullProduct.variants || []),
    [fullProduct.variants]
  );

  // E78 — deep link com variante: aplica initialVariantColor só na primeira
  // vez que o grupo correspondente aparece em variantGroups, sem sobrescrever
  // uma troca manual do usuário depois disso. Ajuste de estado durante o
  // render (sem efeito, sem ref-durante-render), mesmo padrão já usado abaixo
  // para visibleImagesKey.
  const [appliedInitialVariant, setAppliedInitialVariant] = useState(false);
  if (!appliedInitialVariant && initialVariantColor) {
    const initialMatch = variantGroups.find((g: { colorName: string }) => g.colorName === initialVariantColor);
    if (initialMatch) {
      setAppliedInitialVariant(true);
      setSendMode('variant');
      setSelectedColorGroup(initialMatch.colorName);
    }
  }

  const activeGroup = selectedColorGroup
    ? variantGroups.find((g: { colorName: string }) => g.colorName === selectedColorGroup) || null
    : null;

  const allImages = useMemo(() => collectAllImages(fullProduct), [fullProduct]);
  const baseImages = useMemo(() => {
    if (sendMode === 'variant' && activeGroup) {
      const imgs: { url: string; label: string }[] = [];
      if (fullProduct.primary_image_url) imgs.push({ url: fullProduct.primary_image_url, label: 'Principal' });
      activeGroup.images.forEach((url: string) => {
        if (!imgs.some((i) => i.url === url)) imgs.push({ url, label: activeGroup.colorName });
      });
      return imgs;
    }
    return allImages;
  }, [sendMode, activeGroup, allImages, fullProduct.primary_image_url]);

  // CT-39 — "Adicionar fotos": em modo variante o picker nasce só com as fotos da
  // cor escolhida (baseImages); o botão abaixo acrescenta as fotos das variantes
  // NÃO selecionadas, que é o caso nomeado no plano. Elas vivem em `extraImages`
  // justamente para não entrarem na chave de reset — acrescentar foto não pode
  // apagar a seleção que o agente já fez.
  const [extraImages, setExtraImages] = useState<{ url: string; label: string }[]>([]);
  const visibleImages = useMemo(() => [...baseImages, ...extraImages], [baseImages, extraImages]);

  // Reseta a selecao de fotos sempre que o conjunto de imagens visiveis
  // muda (produto carregado, troca de modo produto/variante ou de cor) -
  // sem efeito e sem ref (o linter deste repo bane ref-durante-render):
  // duas useState comparadas no proprio corpo do render, no padrao
  // documentado em https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes.
  const baseImagesKey = baseImages.map((i) => i.url).join('|');
  const [selectedImages, setSelectedImages] = useState<Set<string>>(() => new Set(capImageUrls(baseImages)));
  const [prevVisibleImagesKey, setPrevVisibleImagesKey] = useState(baseImagesKey);
  if (prevVisibleImagesKey !== baseImagesKey) {
    setPrevVisibleImagesKey(baseImagesKey);
    setSelectedImages(new Set(capImageUrls(baseImages)));
    setExtraImages([]);
  }

  // R2-MOD-011 — com o teto aplicado na entrada, "todas" passa a significar "o
  // máximo possível" (min entre as fotos visíveis e MAX_IMAGES). Sem isso, um
  // produto com 11+ fotos nunca igualaria visibleImages.length e o atalho de um
  // clique para desmarcar tudo sumiria da tela. O `>=` também cobre o estado
  // acima do teto (11 marcadas de 11 visíveis), onde "Desmarcar todas" continua
  // sendo o rótulo correto do botão.
  const allSelectableSelected = selectedImages.size >= Math.min(visibleImages.length, MAX_IMAGES);

  // CT-45 — a mensagem (do modelo ou editada à mão) é personalizada com o
  // contato selecionado: {{nome}}/{{empresa}} resolvem aqui e o preview
  // acompanha a troca de contato. Sem contato, cada caminho devolve o texto
  // cru — chamar o helper com `null` cairia no contato de exemplo
  // ("João Silva"/"Sua Empresa") e mostraria dados que não existem.
  const message = isEditing
    ? (selectedContact ? personalizePreview(customMessage, selectedContact) : customMessage)
    : buildMessage(fullProduct, template, sendMode === 'variant' ? activeGroup : null, selectedContact);
  const messageTooLong = message.length > MAX_MESSAGE_LENGTH;
  const selectedImagesList = useMemo(
    () => visibleImages.filter((i) => selectedImages.has(i.url)),
    [visibleImages, selectedImages]
  );

  const toggleImage = (url: string) => {
    if (selectedImages.has(url)) {
      setSelectedImages((prev) => { const next = new Set(prev); next.delete(url); return next; });
      return;
    }
    if (selectedImages.size >= MAX_IMAGES) {
      toast.error('Limite de 10 fotos por envio', { description: 'Desmarque alguma foto para adicionar outra.' });
      return;
    }
    setSelectedImages((prev) => { const next = new Set(prev); next.add(url); return next; });
  };

  /**
   * R2-MOD-011 — guarda do COMANDO FINAL: recusa (com aviso) qualquer envio
   * acima de MAX_IMAGES fotos e devolve `false` para o chamador abortar. Sem
   * isso, um estado acima do limite (inicial ou restaurado) virava envio real
   * de 11+ imagens.
   */
  const refuseAboveImageLimit = (count: number): boolean => {
    if (count <= MAX_IMAGES) return true;
    toast.error(`Limite de ${MAX_IMAGES} fotos por envio`, {
      description: `Você selecionou ${count} fotos. Desmarque ${count - MAX_IMAGES} para enviar.`,
    });
    return false;
  };

  // CT-39 — acrescenta as fotos das variantes não selecionadas ao picker e já as
  // marca, respeitando o teto de MAX_IMAGES (marcar em massa sem teto furava a
  // trava de 10 fotos do toggleImage).
  const handleAddPhotos = () => {
    const faltantes = allImages.filter((i) => !visibleImages.some((v) => v.url === i.url));
    if (faltantes.length === 0) {
      toast.error('Não há outras fotos para adicionar');
      return;
    }
    setExtraImages((prev) => {
      const next = [...prev];
      faltantes.forEach((f) => { if (!next.some((n) => n.url === f.url)) next.push(f); });
      return next;
    });
    const cabem = Math.max(0, MAX_IMAGES - selectedImages.size);
    setSelectedImages((prev) => {
      const next = new Set(prev);
      faltantes.slice(0, cabem).forEach((f) => next.add(f.url));
      return next;
    });
    toast.success(
      cabem >= faltantes.length
        ? `${faltantes.length} foto(s) adicionada(s)`
        : `${cabem} de ${faltantes.length} adicionada(s) — limite de ${MAX_IMAGES} fotos por envio`
    );
  };

  const handleEditMessage = () => { if (!isEditing) setCustomMessage(message); setIsEditing(!isEditing); };

  const handleCopyDescription = async () => {
    try { await navigator.clipboard.writeText(message); toast.success('✅ Copiado!'); } catch { toast.error('Erro ao copiar'); }
  };

  const handleCopyLink = async () => {
    try {
      // Audit 24/09 (E78) — sem &send=1 este link nunca abria o dialog de
      // envio sozinho, era só um link de listagem inerte (CRÍTICO 1 do
      // audit de ExternalProductManagement.tsx: E78 sem gatilho real).
      const variantParam = sendMode === 'variant' && activeGroup ? `&variant=${encodeURIComponent(activeGroup.colorName)}` : '';
      const url = `${window.location.origin}${window.location.pathname}?view=catalog&product=${fullProduct.id}&send=1${variantParam}`;
      await navigator.clipboard.writeText(url);
      toast.success('✅ Link copiado!');
    } catch { toast.error('Erro ao copiar link'); }
  };

  const handleDownloadImages = async () => {
    const urls = Array.from(selectedImages);
    if (urls.length === 0) { toast.error('Nenhuma foto selecionada'); return; }
    const baseName = fullProduct.name.replace(/\s+/g, '_');
    // CT-39 — sem JSZip/fflate/archiver no bundle (nenhuma dependência nova é
    // autorizada), o "zip" do plano vira o download individual previsto no
    // fallback. Cada foto desce como Blob (o `download` do <a> é ignorado em
    // URL cross-origin, imagedelivery.net) e o toast só promete o que saiu de
    // verdade.
    const results = await Promise.all(
      urls.map((url, i) => downloadImageAsBlob(url, `${baseName}_${i + 1}.jpg`))
    );
    const downloaded = results.filter(Boolean).length;
    if (downloaded === 0) {
      toast.error('Não foi possível baixar as fotos', { description: 'Abra cada foto em uma nova aba.' });
      return;
    }
    toast.success('📥 Download iniciado', { description: `${downloaded} de ${urls.length} foto(s)` });
  };

  const handleSend = () => {
    const imgs = Array.from(selectedImages);
    // R2-MOD-011 — o comando final revalida o teto: um estado acima do limite
    // (ex.: "Selecionar todas" com mais de 10 fotos visíveis) não pode virar
    // envio de 11+ imagens.
    if (!refuseAboveImageLimit(imgs.length)) return;
    if (onConfirmSend) { onConfirmSend(message, imgs); onOpenChange(false); }
    else { setStep('selectContact'); resetContactSelection(); }
  };

  const closeDialog = () => {
    onOpenChange(false);
    setStep('configure');
    resetContactSelection();
  };

  const requestClose = () => {
    if (hasPendingEdit) { setConfirmCloseOpen(true); return; }
    closeDialog();
  };

  const handleConfirmDiscardClose = () => {
    setConfirmCloseOpen(false);
    closeDialog();
  };

  // CT-09 — teclado do dialog: no passo de configuração Ctrl/Cmd+Enter avança
  // para o contato; no passo do contato Ctrl/Cmd+Enter envia (respeitando os
  // mesmos bloqueios do botão). O Esc fica no `onEscapeKeyDown` do
  // DialogContent: o Radix escuta `keydown` em fase de captura no documento
  // (antes de qualquer handler React de bubbling), então só prevenindo lá
  // dentro é possível voltar um passo em vez de fechar o dialog inteiro.
  const handleContentKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (step === 'configure') {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !messageTooLong) {
        e.preventDefault();
        handleSend();
      }
      return;
    }

    const canSend = !!selectedContact && !isSending && !sendReadiness.blocked && !sendReadiness.checking;
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && canSend) {
      e.preventDefault();
      void handleSendToContact();
    }
  };

  const handleEscapeKeyDown = (e: KeyboardEvent) => {
    if (step !== 'selectContact') return;
    e.preventDefault();
    setStep('configure');
  };

  const handleSendToContact = async () => {
    if (!selectedContact) { toast.error('Selecione um contato'); return; }
    // R2-MOD-011 — mesmo teto do handleSend: o envio direto (contato preset ou
    // passo do contato) também recusa estado acima do limite.
    const imgs = Array.from(selectedImages);
    if (!refuseAboveImageLimit(imgs.length)) return;
    await sendProductToContact(
      selectedContact,
      message,
      imgs,
      {
        id: fullProduct.id,
        name: fullProduct.name,
        sku: fullProduct.sku,
        variantLabel: sendMode === 'variant' && activeGroup ? activeGroup.colorName : undefined,
        template,
      },
      profile?.id,
    );
  };

  const isMobile = useIsMobile();

  // CT-30 — o miolo do dialog (passos de configuração/contato) é único; abaixo
  // de md (768px) ele é montado num Drawer (vaul) e acima disso no Dialog atual.
  const requestOpenChange = (v: boolean) => { if (!v) { requestClose(); return; } onOpenChange(v); };

  const panel = (
    <>
        {step === 'configure' && (
          <>
            <DialogHeader className="p-5 pb-3">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Send className="w-5 h-5 text-primary" />
                {sendMode === 'variant' && activeGroup ? `Enviar ${activeGroup.colorName}` : 'Enviar Produto'}
              </DialogTitle>
              <p className="text-sm text-muted-foreground">
                {sendMode === 'variant' ? 'Enviando variação específica do produto' : 'Selecione fotos, modelo de mensagem e envie'}
              </p>
            </DialogHeader>

            <ScrollArea className="max-h-[60vh]">
              <div className="px-5 pb-5 space-y-4">
                {sendMode === 'product' && (
                  <div
                    data-testid="product-info-card"
                    className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border/30"
                  >
                    {fullProduct.primary_image_url && (
                      <img
                        src={fullProduct.primary_image_url}
                        alt={productImageAlt(fullProduct.name)}
                        className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{fullProduct.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {selectedImages.size} foto(s) · Modelo {TEMPLATE_LABELS[template]}
                      </p>
                    </div>
                  </div>
                )}

                {hasDraft && (
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                    <div className="flex items-center gap-2 min-w-0">
                      <History className="w-4 h-4 text-primary flex-shrink-0" />
                      <span className="text-xs text-foreground">Você tem um rascunho não enviado para este produto.</span>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleDiscardDraft}>Descartar</Button>
                      <Button variant="default" size="sm" className="h-7 text-xs" onClick={handleRestoreDraft}>Restaurar rascunho</Button>
                    </div>
                  </div>
                )}

                {variantGroups.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button variant={sendMode === 'product' ? 'default' : 'outline'} size="sm" className={cn('text-xs h-8 gap-1.5', CATALOG_FOCUS_VISIBLE)} onClick={() => { setSendMode('product'); setSelectedColorGroup(null); setIsEditing(false); }}>
                        <Package className="w-3.5 h-3.5" />Produto Completo
                      </Button>
                      <Button variant={sendMode === 'variant' ? 'default' : 'outline'} size="sm" className={cn('text-xs h-8 gap-1.5', CATALOG_FOCUS_VISIBLE)} onClick={() => { setSendMode('variant'); if (!selectedColorGroup && variantGroups.length > 0) setSelectedColorGroup(variantGroups[0].colorName); setIsEditing(false); }}>
                        <Palette className="w-3.5 h-3.5" />Variação Específica
                      </Button>
                    </div>

                    {sendMode === 'variant' && (
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selecione a variação</span>
                        <div className="grid grid-cols-2 gap-2">
                          {variantGroups.map((group: { colorName: string; images: string[]; colorHex?: string | null; variants: { stock_quantity: number }[] }) => {
                            const isSelected = selectedColorGroup === group.colorName;
                            const groupStock = group.variants.reduce((s, v) => s + v.stock_quantity, 0);
                            return (
                              <button key={group.colorName} onClick={() => { setSelectedColorGroup(group.colorName); setIsEditing(false); }}
                                className={cn('flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all text-left', isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/50 hover:border-border', CATALOG_FOCUS_VISIBLE)}>
                                {group.images[0] ? <img src={group.images[0]} alt={productImageAlt(fullProduct.name, group.colorName)} className="w-10 h-10 rounded-md object-cover flex-shrink-0" loading="lazy" />
                                  : group.colorHex ? <div className="w-10 h-10 rounded-md border flex-shrink-0" style={{ backgroundColor: group.colorHex }} />
                                    : <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Palette className="w-4 h-4 text-muted-foreground" /></div>}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    {group.colorHex && <div className="w-3 h-3 rounded-full border border-border/50 flex-shrink-0" style={{ backgroundColor: group.colorHex }} />}
                                    <span className="font-medium text-sm truncate">{group.colorName}</span>
                                  </div>
                                  <span className="text-2xs text-muted-foreground">{group.images.length} foto{group.images.length !== 1 ? 's' : ''} · {groupStock} un.</span>
                                </div>
                                {isSelected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {loadingVariants && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-2 border-primary border-t-transparent" />Carregando variantes...
                  </div>
                )}

                <Separator />

                {/* CT-39 — o botão "Adicionar fotos" só faz sentido em modo
                    variante: ali o picker lista apenas as fotos da cor escolhida
                    e o botão traz as das outras variantes. Em modo produto o
                    picker já lista todas (collectAllImages), então ele nem
                    aparece; o toggle "Selecionar/Desmarcar todas" continua. */}
                {visibleImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{selectedImages.size} de {visibleImages.length} fotos selecionadas</span>
                      <div className="flex items-center gap-3">
                        {sendMode === 'variant' && allImages.some((i) => !visibleImages.some((v) => v.url === i.url)) && (
                          <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={handleAddPhotos}>
                            Adicionar fotos
                          </Button>
                        )}
                        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => allSelectableSelected ? setSelectedImages(new Set()) : setSelectedImages(new Set(visibleImages.map((i) => i.url)))}>
                          {allSelectableSelected ? 'Desmarcar todas' : 'Selecionar todas'}
                        </Button>
                      </div>
                    </div>
                    {/* R2-MOD-011 — quando o produto tem mais fotos que o teto, a
                        seleção inicial fica truncada: a tela precisa explicar o
                        porquê (não é uma seleção "incompleta" silenciosa). */}
                    {baseImages.length > MAX_IMAGES && (
                      <p className="text-xs text-muted-foreground">
                        Limite de {MAX_IMAGES} fotos por envio: as {MAX_IMAGES} primeiras já vêm selecionadas.
                      </p>
                    )}
                    <div className="flex gap-2 flex-wrap">
                      {visibleImages.map((img) => (
                        <button key={img.url} onClick={() => toggleImage(img.url)} className={cn('relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all', selectedImages.has(img.url) ? 'border-primary ring-2 ring-primary/30' : 'border-border/50 opacity-60 hover:opacity-100', CATALOG_FOCUS_VISIBLE)}>
                          <img src={img.url} alt={productImageAlt(fullProduct.name, img.label)} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                          {selectedImages.has(img.url) && <div className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center"><Check className="w-3 h-3 text-primary-foreground" /></div>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Modelo de mensagem</span>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={handleEditMessage}>
                      <Pencil className="w-3 h-3" />{isEditing ? 'Usar modelo' : 'Editar'}
                    </Button>
                  </div>
                  {!isEditing && (
                    <div className="flex gap-2">
                      {(Object.keys(TEMPLATE_LABELS) as MessageTemplate[]).map((t) => (
                        <Button key={t} variant={template === t ? 'default' : 'outline'} size="sm" className="text-xs h-7" onClick={() => { setTemplate(t); setIsEditing(false); }}>
                          {TEMPLATE_LABELS[t]}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="rounded-lg bg-muted/50 border border-border/50 p-4">
                  {isEditing ? (
                    <Textarea value={customMessage} onChange={(e) => setCustomMessage(e.target.value)} className="min-h-[150px] bg-transparent border-0 p-0 focus-visible:ring-0 resize-none text-sm" placeholder="Escreva sua mensagem personalizada..." />
                  ) : (
                    <p className="text-sm whitespace-pre-line leading-relaxed">{message}</p>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className={cn('text-xs', messageTooLong ? 'text-destructive font-medium' : 'text-muted-foreground')}>
                    {message.length}/{MAX_MESSAGE_LENGTH}
                  </span>
                </div>
                {messageTooLong && (
                  <p className="text-xs text-destructive">Mensagem muito longa: reduza para até {MAX_MESSAGE_LENGTH} caracteres para enviar.</p>
                )}

                <Separator />

                <PhonePreview message={message} images={selectedImagesList} />
              </div>
            </ScrollArea>

            <div className="p-4 border-t space-y-2">
              {presetContact && selectedContact && (
                <div className="flex items-center gap-2.5 rounded-lg border border-border/50 bg-muted/40 px-2.5 py-2">
                  <Avatar className="w-8 h-8 shrink-0">
                    <AvatarImage src={selectedContact.avatar_url || undefined} alt={selectedContact.name} />
                    <AvatarFallback className="bg-primary/10 text-primary text-xs">{selectedContact.name?.[0] || '?'}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium truncate">{selectedContact.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{selectedContact.phone}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs shrink-0"
                    onClick={() => setStep('selectContact')}
                  >
                    Trocar
                  </Button>
                </div>
              )}
              {presetContact && sendReadiness.reason && <AlertCard tone="warning">{sendReadiness.reason}</AlertCard>}
              <div className="flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={requestClose}>Cancelar</Button>
              <div className="flex flex-1">
                {/* CT-68 — progresso de envio anunciado: o texto do botão muda a
                    cada lote, mas botão não é região viva; esta é a fonte do
                    anúncio para o leitor de tela (visually hidden). */}
                {isSending && (
                  <span className="sr-only" role="status" aria-live="polite" data-testid="send-progress-live">
                    {sendProgress ? `Enviando ${sendProgress.done} de ${sendProgress.total}` : 'Enviando'}
                  </span>
                )}
                <Button
                  className="flex-1 rounded-r-none gap-2"
                  onClick={presetContact ? handleSendToContact : handleSend}
                  disabled={
                    messageTooLong ||
                    (!!presetContact && (!selectedContact || isSending || sendReadiness.checking || !!sendReadiness.reason))
                  }
                >
                  {presetContact
                    ? (isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />)
                    : <User className="w-4 h-4" />}
                  {presetContact
                    ? (isSending
                        ? (sendProgress ? `Enviando ${sendProgress.done}/${sendProgress.total}...` : 'Enviando...')
                        : `Enviar para ${selectedContact?.name ?? 'contato'}`)
                    : 'Selecionar Contato'}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button aria-label="Mais ações de envio" className="rounded-l-none border-l border-primary-foreground/20 px-2"><ChevronDown className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={handleCopyDescription}><Copy className="w-4 h-4 mr-2" />Copiar Descrição</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadImages}><Download className="w-4 h-4 mr-2" />Download ({selectedImages.size} fotos)</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleCopyLink}><Link2 className="w-4 h-4 mr-2" />Copiar link do produto</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              </div>
            </div>
          </>
        )}

        {step === 'selectContact' && (
          <ContactSelectionStep
            productName={fullProduct.name}
            productImageUrl={fullProduct.primary_image_url ?? undefined}
            selectedImagesCount={selectedImages.size}
            template={template}
            variantLabel={sendMode === 'variant' && activeGroup ? activeGroup.colorName : undefined}
            templateLabels={TEMPLATE_LABELS}
            contactSearch={contactSearch}
            onContactSearchChange={setContactSearch}
            contactResults={contactResults}
            searchingContacts={searchingContacts}
            selectedContact={selectedContact}
            onSelectContact={setSelectedContact}
            isSending={isSending}
            sendBlockedReason={sendReadiness.reason}
            checkingSendReadiness={sendReadiness.checking}
            onRetrySendReadiness={sendReadiness.unavailable ? sendReadiness.retry : null}
            onBack={() => setStep('configure')}
            onSend={handleSendToContact}
          />
        )}
    </>
  );

  return (
    <>
      {isMobile ? (
        <Drawer open={open} onOpenChange={requestOpenChange}>
          <DrawerContent
            data-testid="send-product-drawer"
            aria-describedby={undefined}
            className="max-h-[85vh] gap-0 p-0"
            onKeyDown={handleContentKeyDown}
            onEscapeKeyDown={handleEscapeKeyDown}
          >
            {panel}
          </DrawerContent>
        </Drawer>
      ) : (
        <Dialog open={open} onOpenChange={requestOpenChange}>
          <DialogContent
            data-testid="send-product-dialog"
            aria-describedby={undefined}
            className="max-w-lg max-h-[85vh] p-0 gap-0"
            onKeyDown={handleContentKeyDown}
            onEscapeKeyDown={handleEscapeKeyDown}
          >
            {panel}
          </DialogContent>
        </Dialog>
      )}

      <AlertDialog open={confirmCloseOpen} onOpenChange={setConfirmCloseOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações não enviadas?</AlertDialogTitle>
            <AlertDialogDescription>
              Você tem uma mensagem personalizada que ainda não foi enviada. Fechar agora vai descartá-la.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDiscardClose}>Fechar mesmo assim</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
