import React, { useState, useMemo, useEffect } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
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
  Pencil, User,
} from 'lucide-react';
import { ExternalProduct, useExternalCatalog } from '@/hooks/integrations/useExternalCatalog';
import { toast } from '@/hooks/ui/use-toast';
import { cn } from '@/lib/utils';
import {
  type MessageTemplate, type SendMode, buildMessage, collectAllImages,
} from './sendProductUtils';
import { useContactSearch, useSendToContact } from './useSendProduct';
import { ContactSelectionStep } from './ContactSelectionStep';

interface SendProductDialogProps {
  product: ExternalProduct;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirmSend?: (text: string, images: string[]) => void;
}

const TEMPLATE_LABELS: Record<MessageTemplate, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
};

export const SendProductDialog: React.FC<SendProductDialogProps> = ({
  product, open, onOpenChange, onConfirmSend,
}) => {
  const { fetchProduct } = useExternalCatalog();
  const [fullProduct, setFullProduct] = useState<ExternalProduct>(product);
  const [loadingVariants, setLoadingVariants] = useState(false);
  const [template, setTemplate] = useState<MessageTemplate>('informal');
  const [isEditing, setIsEditing] = useState(false);
  const [customMessage, setCustomMessage] = useState('');
  const [sendMode, setSendMode] = useState<SendMode>('product');
  const [selectedColorGroup, setSelectedColorGroup] = useState<string | null>(null);
  const [step, setStep] = useState<'configure' | 'selectContact'>('configure');

  const {
    contactSearch, setContactSearch,
    contactResults, searchingContacts,
    selectedContact, setSelectedContact,
    resetContactSelection,
  } = useContactSearch(step);

  const { isSending, sendProductToContact } = useSendToContact(() => {
    onOpenChange(false);
    setStep('configure');
    resetContactSelection();
  });

  useEffect(() => {
    if (open && (!product.variants || product.variants.length === 0)) {
      setLoadingVariants(true);
      fetchProduct(product.id).then((p) => { if (p) setFullProduct(p); }).finally(() => setLoadingVariants(false));
    } else {
      setFullProduct(product);
    }
  }, [open, product.id]);

  const variantGroups = useMemo(
    () => groupVariantsByColor(fullProduct.variants || []),
    [fullProduct.variants]
  );

  const activeGroup = selectedColorGroup
    ? variantGroups.find((g: { colorName: string }) => g.colorName === selectedColorGroup) || null
    : null;

  const allImages = useMemo(() => collectAllImages(fullProduct), [fullProduct]);
  const visibleImages = useMemo(() => {
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

  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  useEffect(() => { setSelectedImages(new Set(visibleImages.map((i) => i.url))); }, [visibleImages]);

  const message = isEditing ? customMessage : buildMessage(fullProduct, template, sendMode === 'variant' ? activeGroup : null);

  const toggleImage = (url: string) => {
    setSelectedImages((prev) => { const next = new Set(prev); if (next.has(url)) next.delete(url); else next.add(url); return next; });
  };

  const handleEditMessage = () => { if (!isEditing) setCustomMessage(message); setIsEditing(!isEditing); };

  const handleCopyDescription = async () => {
    try { await navigator.clipboard.writeText(message); toast({ title: '✅ Copiado!' }); } catch { toast({ title: 'Erro ao copiar', variant: 'destructive' }); }
  };

  const handleDownloadImages = () => {
    const urls = Array.from(selectedImages);
    if (urls.length === 0) { toast({ title: 'Nenhuma foto selecionada', variant: 'destructive' }); return; }
    urls.forEach((url, i) => {
      const a = document.createElement('a'); a.href = url; a.download = `${fullProduct.name.replace(/\s+/g, '_')}_${i + 1}.jpg`;
      a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); document.body.removeChild(a);
    });
    toast({ title: `📥 Download iniciado`, description: `${urls.length} foto(s)` });
  };

  const handleSend = () => {
    const imgs = Array.from(selectedImages);
    if (onConfirmSend) { onConfirmSend(message, imgs); onOpenChange(false); }
    else { setStep('selectContact'); resetContactSelection(); }
  };

  const handleSendToContact = async () => {
    if (!selectedContact) { toast({ title: 'Selecione um contato', variant: 'destructive' }); return; }
    await sendProductToContact(selectedContact, message, Array.from(selectedImages));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) { setStep('configure'); resetContactSelection(); } }}>
      <DialogContent className="max-w-lg max-h-[85vh] p-0 gap-0">
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
                {variantGroups.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Button variant={sendMode === 'product' ? 'default' : 'outline'} size="sm" className="text-xs h-8 gap-1.5" onClick={() => { setSendMode('product'); setSelectedColorGroup(null); setIsEditing(false); }}>
                        <Package className="w-3.5 h-3.5" />Produto Completo
                      </Button>
                      <Button variant={sendMode === 'variant' ? 'default' : 'outline'} size="sm" className="text-xs h-8 gap-1.5" onClick={() => { setSendMode('variant'); if (!selectedColorGroup && variantGroups.length > 0) setSelectedColorGroup(variantGroups[0].colorName); setIsEditing(false); }}>
                        <Palette className="w-3.5 h-3.5" />Variação Específica
                      </Button>
                    </div>

                    {sendMode === 'variant' && (
                      <div className="space-y-2">
                        <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Selecione a variação</span>
                        <div className="grid grid-cols-2 gap-2">
                          {variantGroups.map((group: { colorName: string; images: string[]; colorHex?: string; variants: { stock_quantity: number }[] }) => {
                            const isSelected = selectedColorGroup === group.colorName;
                            const groupStock = group.variants.reduce((s, v) => s + v.stock_quantity, 0);
                            return (
                              <button key={group.colorName} onClick={() => { setSelectedColorGroup(group.colorName); setIsEditing(false); }}
                                className={cn('flex items-center gap-3 p-2.5 rounded-lg border-2 transition-all text-left', isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border/50 hover:border-border')}>
                                {group.images[0] ? <img src={group.images[0]} alt={group.colorName} className="w-10 h-10 rounded-md object-cover flex-shrink-0" loading="lazy" />
                                  : group.colorHex ? <div className="w-10 h-10 rounded-md border flex-shrink-0" style={{ backgroundColor: group.colorHex }} />
                                    : <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center flex-shrink-0"><Palette className="w-4 h-4 text-muted-foreground" /></div>}
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    {group.colorHex && <div className="w-3 h-3 rounded-full border border-border/50 flex-shrink-0" style={{ backgroundColor: group.colorHex }} />}
                                    <span className="font-medium text-sm truncate">{group.colorName}</span>
                                  </div>
                                  <span className="text-[11px] text-muted-foreground">{group.images.length} foto{group.images.length !== 1 ? 's' : ''} · {groupStock} un.</span>
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

                {visibleImages.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{selectedImages.size} de {visibleImages.length} fotos selecionadas</span>
                      <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => selectedImages.size === visibleImages.length ? setSelectedImages(new Set()) : setSelectedImages(new Set(visibleImages.map((i) => i.url)))}>
                        {selectedImages.size === visibleImages.length ? 'Desmarcar todas' : 'Selecionar todas'}
                      </Button>
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      {visibleImages.map((img) => (
                        <button key={img.url} onClick={() => toggleImage(img.url)} className={cn('relative w-16 h-16 rounded-lg overflow-hidden border-2 transition-all', selectedImages.has(img.url) ? 'border-primary ring-2 ring-primary/30' : 'border-border/50 opacity-60 hover:opacity-100')}>
                          <img src={img.url} alt={img.label} className="w-full h-full object-cover" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
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
              </div>
            </ScrollArea>

            <div className="p-4 border-t flex items-center gap-2">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancelar</Button>
              <div className="flex flex-1">
                <Button className="flex-1 rounded-r-none gap-2" onClick={handleSend}><User className="w-4 h-4" />Selecionar Contato</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button className="rounded-l-none border-l border-primary-foreground/20 px-2"><ChevronDown className="w-4 h-4" /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem onClick={handleCopyDescription}><Copy className="w-4 h-4 mr-2" />Copiar Descrição</DropdownMenuItem>
                    <DropdownMenuItem onClick={handleDownloadImages}><Download className="w-4 h-4 mr-2" />Download ({selectedImages.size} fotos)</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </>
        )}

        {step === 'selectContact' && (
          <ContactSelectionStep
            productName={fullProduct.name}
            productImageUrl={fullProduct.primary_image_url}
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
            onBack={() => setStep('configure')}
            onSend={handleSendToContact}
          />
        )}
      </DialogContent>
    </Dialog>
  );
};
