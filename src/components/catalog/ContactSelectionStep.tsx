import { Search, User, Check, ArrowLeft, Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import type { ContactResult } from './useSendProduct';
import type { MessageTemplate } from './sendProductUtils';

interface ContactSelectionStepProps {
  productName: string;
  productImageUrl?: string;
  selectedImagesCount: number;
  template: MessageTemplate;
  variantLabel?: string;
  templateLabels: Record<MessageTemplate, string>;
  contactSearch: string;
  onContactSearchChange: (v: string) => void;
  contactResults: ContactResult[];
  searchingContacts: boolean;
  selectedContact: ContactResult | null;
  onSelectContact: (c: ContactResult) => void;
  isSending: boolean;
  onBack: () => void;
  onSend: () => void;
}

export function ContactSelectionStep({
  productName, productImageUrl, selectedImagesCount,
  template, variantLabel, templateLabels,
  contactSearch, onContactSearchChange,
  contactResults, searchingContacts,
  selectedContact, onSelectContact,
  isSending, onBack, onSend,
}: ContactSelectionStepProps) {
  return (
    <>
      <DialogHeader className="p-5 pb-3">
        <DialogTitle className="flex items-center gap-2 text-lg">
          <User className="w-5 h-5 text-primary" />
          Selecionar Contato
        </DialogTitle>
        <p className="text-sm text-muted-foreground">
          Escolha para quem enviar <span className="font-medium text-foreground">{productName}</span>
        </p>
      </DialogHeader>

      <div className="px-5 space-y-3">
        <div className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50 border border-border/30">
          {productImageUrl && (
            <img src={productImageUrl} alt={productName} className="w-10 h-10 rounded-md object-cover flex-shrink-0"  loading="lazy" decoding="async"/>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{productName}</p>
            <p className="text-xs text-muted-foreground">
              {selectedImagesCount} foto(s) · Modelo {templateLabels[template]}
              {variantLabel ? ` · ${variantLabel}` : ''}
            </p>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar contato por nome ou telefone..."
            value={contactSearch}
            onChange={(e) => onContactSearchChange(e.target.value)}
            className="pl-9"
            autoFocus
          />
        </div>
      </div>

      <ScrollArea className="max-h-[45vh] px-5 py-2">
        {searchingContacts ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : contactResults.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <User className="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p className="text-sm">{contactSearch.trim() ? 'Nenhum contato encontrado' : 'Busque por nome ou telefone'}</p>
          </div>
        ) : (
          <div className="space-y-1">
            {contactResults.map((contact) => (
              <button
                key={contact.id}
                onClick={() => onSelectContact(contact)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-lg border-2 transition-all text-left',
                  selectedContact?.id === contact.id
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                    : 'border-transparent hover:bg-muted/50'
                )}
              >
                <Avatar className="w-10 h-10 flex-shrink-0">
                  <AvatarImage src={contact.avatar_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-sm">{contact.name?.[0] || '?'}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{contact.name}</p>
                  <p className="text-xs text-muted-foreground">{contact.phone}</p>
                </div>
                {selectedContact?.id === contact.id && <Check className="w-5 h-5 text-primary flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </ScrollArea>

      <div className="p-4 border-t flex items-center gap-2">
        <Button variant="outline" className="gap-1.5" onClick={onBack}>
          <ArrowLeft className="w-4 h-4" />Voltar
        </Button>
        <Button className="flex-1 gap-2" disabled={!selectedContact || isSending} onClick={onSend}>
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          {isSending ? 'Enviando...' : selectedContact ? `Enviar para ${selectedContact.name}` : 'Selecione um contato'}
        </Button>
      </div>
    </>
  );
}
