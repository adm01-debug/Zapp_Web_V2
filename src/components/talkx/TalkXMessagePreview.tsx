import React, { useState, useMemo } from 'react';
import { Eye, ChevronLeft, ChevronRight, User, Building2, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Contact {
  id: string;
  name: string;
  nickname: string | null;
  phone: string;
  company: string | null;
  avatar_url: string | null;
}

interface Props {
  messageTemplate: string;
  contacts: Contact[];
  mediaUrl?: string;
  mediaType?: string;
}

function personalize(template: string, contact: Contact): string {
  const firstName = (contact.name || '').split(' ')[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  return template
    .replace(/\{\{nome\}\}/gi, firstName)
    .replace(/\{\{nome_completo\}\}/gi, contact.name || '')
    .replace(/\{\{apelido\}\}/gi, contact.nickname || firstName)
    .replace(/\{\{empresa\}\}/gi, contact.company || '')
    .replace(/\{\{saudacao\}\}/gi, greeting);
}

export function TalkXMessagePreview({ messageTemplate, contacts, mediaUrl, mediaType }: Props) {
  const [currentIndex, setCurrentIndex] = useState(0);

  const safeContacts = useMemo(() => {
    if (contacts.length === 0) {
      return [{
        id: 'sample',
        name: 'João Silva',
        nickname: 'Joãozinho',
        phone: '5511999999999',
        company: 'Empresa Exemplo',
        avatar_url: null,
      }];
    }
    return contacts;
  }, [contacts]);

  const currentContact = safeContacts[currentIndex] || safeContacts[0];
  const preview = useMemo(
    () => personalize(messageTemplate, currentContact),
    [messageTemplate, currentContact]
  );

  const goNext = () => setCurrentIndex((i) => Math.min(i + 1, safeContacts.length - 1));
  const goPrev = () => setCurrentIndex((i) => Math.max(i - 1, 0));

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Eye className="w-4 h-4 text-primary" />
            Preview por contato
          </CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {currentIndex + 1} / {safeContacts.length}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Contact info bar */}
        <div className="flex items-center gap-3 bg-muted/40 rounded-xl p-2.5">
          <div className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
            {currentContact.avatar_url ? (
              <img src={currentContact.avatar_url} alt="" className="w-full h-full rounded-full object-cover"  loading="lazy" decoding="async"/>
            ) : (
              (currentContact.name || '?')[0].toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{currentContact.name}</p>
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-0.5">
                <Phone className="w-2.5 h-2.5" />
                {currentContact.phone}
              </span>
              {currentContact.company && (
                <span className="flex items-center gap-0.5">
                  <Building2 className="w-2.5 h-2.5" />
                  {currentContact.company}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={goPrev}
              disabled={currentIndex === 0}
              aria-label="Contato anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              onClick={goNext}
              disabled={currentIndex >= safeContacts.length - 1}
              aria-label="Próximo contato"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* WhatsApp-style bubble */}
        <div className="bg-muted/30 rounded-xl p-4 border border-border/30">
          <div className="flex flex-col items-end gap-2">
            {mediaUrl && mediaType === 'image' && (
              <img src={mediaUrl} alt="Preview" className="rounded-lg max-h-32 w-auto"  loading="lazy" decoding="async"/>
            )}
            <div className="bg-primary/10 rounded-xl rounded-tr-sm p-3 text-sm text-foreground max-w-[85%] whitespace-pre-wrap">
              {preview || <span className="text-muted-foreground italic">Digite uma mensagem...</span>}
            </div>
            <span className="text-[10px] text-muted-foreground">
              {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
