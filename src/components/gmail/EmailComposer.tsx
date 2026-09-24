import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Send, X, Paperclip, ChevronDown, ChevronUp,
  Bold, Italic, Link2, List, Loader2, Minimize2, Maximize2
} from 'lucide-react';
import { useGmail, type EmailMessage } from '@/hooks/integrations/useGmail';

interface EmailComposerProps {
  mode: 'new' | 'reply' | 'reply-all' | 'forward';
  replyTo?: EmailMessage;
  threadId?: string;
  defaultTo?: string;
  onClose: () => void;
  onSent?: () => void;
}

export function EmailComposer({
  mode,
  replyTo,
  threadId,
  defaultTo,
  onClose,
  onSent,
}: EmailComposerProps) {
  const { sendEmail, replyEmail, activeAccount } = useGmail();

  const [to, setTo] = useState(() => {
    if (defaultTo) return defaultTo;
    if (mode === 'reply' && replyTo) {
      return replyTo.direction === 'inbound' ? replyTo.from_address : replyTo.to_addresses[0] || '';
    }
    if (mode === 'reply-all' && replyTo) {
      const addrs = replyTo.direction === 'inbound'
        ? [replyTo.from_address, ...replyTo.to_addresses.filter(a => a !== activeAccount?.email_address)]
        : replyTo.to_addresses;
      return addrs.join(', ');
    }
    return '';
  });

  const [cc, setCc] = useState(() => {
    if (mode === 'reply-all' && replyTo?.cc_addresses?.length) {
      return replyTo.cc_addresses.join(', ');
    }
    return '';
  });
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState(() => {
    if (!replyTo) return '';
    if (mode === 'forward') return `Fwd: ${replyTo.subject || ''}`;
    return replyTo.subject?.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject || ''}`;
  });
  const [body, setBody] = useState(() => {
    if (mode === 'forward' && replyTo) {
      return `\n\n---------- Mensagem encaminhada ----------\nDe: ${replyTo.from_name || replyTo.from_address}\nData: ${new Date(replyTo.internal_date).toLocaleString('pt-BR')}\nAssunto: ${replyTo.subject}\nPara: ${replyTo.to_addresses.join(', ')}\n\n${replyTo.body_text || ''}`;
    }
    if ((mode === 'reply' || mode === 'reply-all') && replyTo) {
      return `\n\nEm ${new Date(replyTo.internal_date).toLocaleString('pt-BR')}, ${replyTo.from_name || replyTo.from_address} escreveu:\n> ${(replyTo.body_text || '').split('\n').join('\n> ')}`;
    }
    return '';
  });

  const [showCcBcc, setShowCcBcc] = useState(cc !== '' || bcc !== '');
  const [isMinimized, setIsMinimized] = useState(false);
  const [isUsingHtml, setIsUsingHtml] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachments, setAttachments] = useState<File[]>([]);

  const isSending = sendEmail.isPending || replyEmail.isPending;

  const handleSend = async () => {
    if (!to.trim()) return;

    const toList = to.split(',').map(e => e.trim()).filter(Boolean);
    const ccList = cc ? cc.split(',').map(e => e.trim()).filter(Boolean) : [];
    const bccList = bcc ? bcc.split(',').map(e => e.trim()).filter(Boolean) : [];

    if (mode === 'reply' || mode === 'reply-all') {
      await replyEmail.mutateAsync({
        thread_id: threadId || replyTo?.gmail_message_id || '',
        message_id: replyTo?.gmail_message_id || '',
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject,
        text_body: body,
        html_body: isUsingHtml ? body : undefined,
      });
    } else {
      await sendEmail.mutateAsync({
        to: toList,
        cc: ccList,
        bcc: bccList,
        subject,
        text_body: body,
        html_body: isUsingHtml ? body : undefined,
      });
    }

    onSent?.();
    onClose();
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setAttachments(prev => [...prev, ...files]);
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const modeLabels = {
    new: 'Nova mensagem',
    reply: 'Responder',
    'reply-all': 'Responder a todos',
    forward: 'Encaminhar',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-4 right-4 z-50 w-[520px] max-w-[calc(100vw-32px)]"
    >
      <Card className="shadow-2xl border-primary/20">
        {/* Header */}
        <CardHeader className="p-3 bg-primary/5 flex flex-row items-center justify-between border-b">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{modeLabels[mode]}</span>
            {activeAccount && (
              <Badge variant="outline" className="text-3xs px-1">
                {activeAccount.email_address}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(!isMinimized)}>
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>

        <AnimatePresence>
          {!isMinimized && (
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: 'auto' }}
              exit={{ height: 0 }}
              className="overflow-hidden"
            >
              <CardContent className="p-3 space-y-2">
                {/* To */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-12 shrink-0">Para:</Label>
                  <Input
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="destinatario@email.com"
                    className="h-8 text-sm"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs px-2 h-8 shrink-0"
                    onClick={() => setShowCcBcc(!showCcBcc)}
                  >
                    Cc/Bcc {showCcBcc ? <ChevronUp className="w-3 h-3 ml-1" /> : <ChevronDown className="w-3 h-3 ml-1" />}
                  </Button>
                </div>

                {/* Cc / Bcc */}
                <AnimatePresence>
                  {showCcBcc && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="space-y-2 overflow-hidden"
                    >
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12 shrink-0">Cc:</Label>
                        <Input value={cc} onChange={(e) => setCc(e.target.value)} className="h-8 text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12 shrink-0">Bcc:</Label>
                        <Input value={bcc} onChange={(e) => setBcc(e.target.value)} className="h-8 text-sm" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Subject */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-12 shrink-0">Assunto:</Label>
                  <Input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Assunto do email"
                    className="h-8 text-sm"
                  />
                </div>

                {/* Toolbar */}
                <div className="flex items-center gap-1 border-b pb-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Negrito">
                    <Bold className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Italico">
                    <Italic className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Link">
                    <Link2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" title="Lista">
                    <List className="w-3.5 h-3.5" />
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => fileInputRef.current?.click()}
                    title="Anexar arquivo"
                  >
                    <Paperclip className="w-3.5 h-3.5" />
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                </div>

                {/* Body */}
                <Textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Escreva sua mensagem..."
                  className="min-h-[200px] text-sm resize-y"
                />

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {attachments.map((file, i) => (
                      <Badge key={i} variant="secondary" className="text-3xs gap-1">
                        <Paperclip className="w-2.5 h-2.5" />
                        {file.name}
                        <button onClick={() => removeAttachment(i)} className="ml-0.5 hover:text-destructive">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {/* Send Button */}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={onClose}>
                    Descartar
                  </Button>
                  <Button
                    onClick={handleSend}
                    disabled={!to.trim() || !subject.trim() || isSending}
                    size="sm"
                  >
                    {isSending ? (
                      <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4 mr-1" />
                    )}
                    Enviar
                  </Button>
                </div>
              </CardContent>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </motion.div>
  );
}
