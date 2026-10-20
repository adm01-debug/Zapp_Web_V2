import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { AlertTriangle, Send, X, Paperclip, ChevronDown, ChevronUp, Loader2, Minimize2, Maximize2 } from 'lucide-react';
import { useGmail, type EmailAttachment, type EmailMessage } from '@/hooks/integrations/useGmail';
import { toast } from 'sonner';
import { fileToEmailAttachment, formatEmailFileSize, validateEmailAttachments } from '@/lib/emailAttachments';
import { invalidEmailTokens, parseEmailAddressList, prefixEmailSubject, resolveReplyRecipients } from '@/lib/emailRecipients';
import { formatEmailComposerHtml } from '@/lib/emailComposeFormat';
import { emailHtmlToText } from '@/lib/emailRichText';
import { EmailRichTextEditor } from './EmailRichTextEditor';
import {
  emailDraftSessionKey,
  readEmailDraftSession,
  removeEmailDraftSession,
  writeEmailDraftSession,
} from '@/lib/emailDraftSession';
import { isEmailOutcomeUnknown } from '@/lib/emailErrorState';

interface EmailComposerProps {
  accountId?: string;
  mode: 'new' | 'reply' | 'reply-all' | 'forward';
  replyTo?: EmailMessage;
  threadId?: string;
  defaultTo?: string;
  forwardAttachments?: Array<EmailAttachment & { gmail_message_id: string }>;
  onClose: () => void;
  onSent?: () => void;
}

export function EmailComposer({
  accountId,
  mode,
  replyTo,
  threadId,
  defaultTo,
  forwardAttachments = [],
  onClose,
  onSent,
}: EmailComposerProps) {
  const { sendEmail, replyEmail, saveDraft, deleteDraft, getAttachmentContent, activeAccount } = useGmail(accountId);
  const resolvedAccountId = accountId || activeAccount?.id;
  const replyRecipients = replyTo && (mode === 'reply' || mode === 'reply-all')
    ? resolveReplyRecipients(replyTo, mode, activeAccount?.email_address)
    : { to: [], cc: [] };
  const draftStorageKey = useMemo(() => emailDraftSessionKey({
    userId: activeAccount?.user_id,
    accountId: resolvedAccountId,
    mode,
    threadId,
    messageId: replyTo?.id,
  }), [activeAccount?.user_id, mode, replyTo?.id, resolvedAccountId, threadId]);
  const [restoredDraft] = useState(() => readEmailDraftSession(draftStorageKey));

  const [to, setTo] = useState(() => {
    if (restoredDraft) return restoredDraft.to;
    if (defaultTo) return defaultTo;
    if ((mode === 'reply' || mode === 'reply-all') && replyTo) return replyRecipients.to.join(', ');
    return '';
  });

  const [cc, setCc] = useState(() => {
    if (restoredDraft) return restoredDraft.cc;
    if (mode === 'reply-all' && replyTo?.cc_addresses?.length) {
      return replyRecipients.cc.join(', ');
    }
    return '';
  });
  const [bcc, setBcc] = useState(() => restoredDraft?.bcc || '');
  const [subject, setSubject] = useState(() => {
    if (restoredDraft) return restoredDraft.subject;
    if (!replyTo) return '';
    if (mode === 'forward') return prefixEmailSubject(replyTo.subject || '', 'Fwd');
    return prefixEmailSubject(replyTo.subject || '', 'Re');
  });
  const [initialBody] = useState(() => {
    if (restoredDraft) {
      return restoredDraft.isUsingHtml
        ? { html: restoredDraft.body, text: emailHtmlToText(restoredDraft.body) }
        : { html: formatEmailComposerHtml(restoredDraft.body), text: restoredDraft.body };
    }
    let text = '';
    if (mode === 'forward' && replyTo) {
      text = `\n\n---------- Mensagem encaminhada ----------\nDe: ${replyTo.from_name || replyTo.from_address}\nData: ${new Date(replyTo.internal_date).toLocaleString('pt-BR')}\nAssunto: ${replyTo.subject}\nPara: ${replyTo.to_addresses.join(', ')}\n\n${replyTo.body_text || ''}`;
    } else if ((mode === 'reply' || mode === 'reply-all') && replyTo) {
      text = `\n\nEm ${new Date(replyTo.internal_date).toLocaleString('pt-BR')}, ${replyTo.from_name || replyTo.from_address} escreveu:\n> ${(replyTo.body_text || '').split('\n').join('\n> ')}`;
    }
    return { html: formatEmailComposerHtml(text), text };
  });
  const [body, setBody] = useState(initialBody.html);
  const [bodyText, setBodyText] = useState(initialBody.text);

  const [showCcBcc, setShowCcBcc] = useState(cc !== '' || bcc !== '');
  const [isMinimized, setIsMinimized] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sendLockRef = useRef(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [missingAttachmentNames, setMissingAttachmentNames] = useState<string[]>(() => restoredDraft?.attachmentNames || []);
  // R2-COM-004: o encaminhamento abre junto com a mensagem, mas os metadados de anexo chegam numa
  // segunda consulta (useGmail: threadAttachments). A seleção acompanha as chegadas novas sem
  // ressuscitar o que o usuário removeu de propósito — por isso é conciliada por id, e não
  // inicializada uma única vez com a lista do primeiro render.
  const [selectedForwardAttachmentIds, setSelectedForwardAttachmentIds] = useState<Set<string>>(() => new Set(forwardAttachments.map(attachment => attachment.id)));
  const knownForwardAttachmentIdsRef = useRef(new Set(forwardAttachments.map(attachment => attachment.id)));
  const dismissedForwardAttachmentIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const arrived = forwardAttachments.filter(attachment => !knownForwardAttachmentIdsRef.current.has(attachment.id));
    if (arrived.length === 0) return;
    arrived.forEach(attachment => knownForwardAttachmentIdsRef.current.add(attachment.id));
    const selectable = arrived.filter(attachment => !dismissedForwardAttachmentIdsRef.current.has(attachment.id));
    if (selectable.length === 0) return;
    setSelectedForwardAttachmentIds(current => {
      const next = new Set(current);
      selectable.forEach(attachment => next.add(attachment.id));
      return next;
    });
  }, [forwardAttachments]);
  const [draftDirty, setDraftDirty] = useState(false);
  const [draftStatus, setDraftStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [discardConfirmationOpen, setDiscardConfirmationOpen] = useState(false);
  const [discardError, setDiscardError] = useState<string | null>(null);
  const [sendOutcomeUnknown, setSendOutcomeUnknown] = useState(false);
  const saveDraftMutateAsync = saveDraft?.mutateAsync;
  const draftIdRef = useRef<string | undefined>(restoredDraft?.draftId);
  const draftRevisionRef = useRef(0);
  const draftSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const draftTimerRef = useRef<number | undefined>(undefined);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  useEffect(() => {
    if (!draftStorageKey) return;
    const hasPersistableContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || bodyText.trim() || attachments.length || missingAttachmentNames.length);
    if (!hasPersistableContent && !draftIdRef.current) {
      removeEmailDraftSession(draftStorageKey);
      return;
    }
    writeEmailDraftSession(draftStorageKey, {
      draftId: draftIdRef.current,
      to,
      cc,
      bcc,
      subject,
      body,
      isUsingHtml: true,
      attachmentNames: attachments.length ? attachments.map(file => file.name) : missingAttachmentNames,
      updatedAt: new Date().toISOString(),
    });
  }, [attachments, bcc, body, bodyText, cc, draftStatus, draftStorageKey, missingAttachmentNames, subject, to]);

  const markDraftDirty = useCallback(() => {
    draftRevisionRef.current += 1;
    setDraftDirty(true);
  }, []);

  const isSending = sendEmail.isPending || replyEmail.isPending;
  const hasDraftContent = Boolean(to.trim() || cc.trim() || bcc.trim() || subject.trim() || bodyText.trim() || attachments.length || selectedForwardAttachmentIds.size);
  const selectedForwardAttachments = useMemo(
    () => forwardAttachments.filter(attachment => selectedForwardAttachmentIds.has(attachment.id)),
    [forwardAttachments, selectedForwardAttachmentIds],
  );
  // A mensagem anuncia anexo, mas os metadados ainda não chegaram (segunda consulta do thread).
  const forwardAttachmentsPending = mode === 'forward' && forwardAttachments.length === 0 && Boolean(replyTo?.has_attachments);

  const prepareAttachments = useCallback(async () => {
    const localAttachments = await Promise.all(attachments.map(fileToEmailAttachment));
    const originalAttachments = await Promise.all(selectedForwardAttachments.map(async attachment => ({
      filename: attachment.filename || 'anexo',
      mimeType: attachment.mime_type || 'application/octet-stream',
      content: await getAttachmentContent(attachment),
    })));
    return [...originalAttachments, ...localAttachments];
  }, [attachments, getAttachmentContent, selectedForwardAttachments]);

  useEffect(() => {
    if (!draftDirty || !saveDraftMutateAsync || (!to.trim() && !subject.trim() && !bodyText.trim() && attachments.length === 0)) return;
    const revision = draftRevisionRef.current;
    let queued = false;
    const timer = window.setTimeout(() => {
      queued = true;
      draftTimerRef.current = undefined;
      draftSaveQueueRef.current = draftSaveQueueRef.current.catch(() => undefined).then(async () => {
        if (mountedRef.current) setDraftStatus('saving');
        try {
          const preparedAttachments = await prepareAttachments();
          const response = await saveDraftMutateAsync({
            draft_id: draftIdRef.current,
            thread_id: threadId,
            to: parseEmailAddressList(to), cc: parseEmailAddressList(cc), bcc: parseEmailAddressList(bcc),
            subject, text_body: bodyText, html_body: body,
            attachments: preparedAttachments.length ? preparedAttachments : undefined,
          });
          const remoteDraftId = response?.draft_id as string | undefined;
          if (remoteDraftId) {
            draftIdRef.current = remoteDraftId;
          }
          if (mountedRef.current && revision === draftRevisionRef.current) {
            setDraftDirty(false);
            setDraftStatus('saved');
          }
        } catch {
          if (mountedRef.current) setDraftStatus('error');
        }
      });
    }, 1200);
    draftTimerRef.current = timer;
    return () => { if (!queued) window.clearTimeout(timer); };
  }, [attachments.length, bcc, body, bodyText, cc, draftDirty, prepareAttachments, saveDraftMutateAsync, subject, threadId, to]);

  const handleSend = async () => {
    if (sendLockRef.current || !to.trim()) return;

    const invalid = [...invalidEmailTokens(to), ...invalidEmailTokens(cc), ...invalidEmailTokens(bcc)];
    if (invalid.length > 0) {
      toast.error(`Revise os destinatários inválidos: ${invalid.join(', ')}`);
      return;
    }

    const toList = parseEmailAddressList(to);
    const ccList = parseEmailAddressList(cc);
    const bccList = parseEmailAddressList(bcc);
    if (toList.length === 0) {
      toast.error('Informe ao menos um destinatário válido.');
      return;
    }
    const attachmentError = validateEmailAttachments(attachments, selectedForwardAttachments.map(attachment => ({ name: attachment.filename || 'anexo', size: attachment.size_bytes || 0 })));
    if (attachmentError) {
      toast.error(attachmentError);
      return;
    }

    sendLockRef.current = true;
    setSendOutcomeUnknown(false);
    try {
      if (draftTimerRef.current !== undefined) {
        window.clearTimeout(draftTimerRef.current);
        draftTimerRef.current = undefined;
      }
      setDraftDirty(false);
      await draftSaveQueueRef.current;
      const preparedAttachments = await prepareAttachments();
      if (mode === 'reply' || mode === 'reply-all') {
        if (!threadId || !replyTo?.gmail_message_id) throw new Error('A conversa original não está disponível para resposta.');
        await replyEmail.mutateAsync({
          thread_id: threadId,
          message_id: replyTo.gmail_message_id,
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject,
          text_body: bodyText,
          html_body: body,
          attachments: preparedAttachments.length ? preparedAttachments : undefined,
        });
      } else {
        await sendEmail.mutateAsync({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject,
          text_body: bodyText,
          html_body: body,
          attachments: preparedAttachments.length ? preparedAttachments : undefined,
        });
      }

      onSent?.();
      if (draftIdRef.current && deleteDraft) await deleteDraft.mutateAsync(draftIdRef.current).catch(() => undefined);
      removeEmailDraftSession(draftStorageKey);
      onClose();
    } catch (error) {
      if (isEmailOutcomeUnknown(error)) {
        setSendOutcomeUnknown(true);
        toast.warning('Não foi possível confirmar o resultado do envio. Confira a pasta Enviados antes de tentar novamente.');
      } else {
        toast.error(error instanceof Error ? error.message : 'Não foi possível enviar o email.');
      }
    } finally {
      sendLockRef.current = false;
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const next = [...attachments, ...files];
    const error = validateEmailAttachments(next, selectedForwardAttachments.map(attachment => ({ name: attachment.filename || 'anexo', size: attachment.size_bytes || 0 })));
    if (error) toast.error(error);
    else { setAttachments(next); setMissingAttachmentNames([]); markDraftDirty(); }
    e.target.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
    markDraftDirty();
  };

  const discardDraft = async () => {
    if (draftTimerRef.current !== undefined) {
      window.clearTimeout(draftTimerRef.current);
      draftTimerRef.current = undefined;
    }
    setDraftDirty(false);
    await draftSaveQueueRef.current;
    if (draftIdRef.current && deleteDraft) {
      try {
        await deleteDraft.mutateAsync(draftIdRef.current);
      } catch (error) {
        if (mountedRef.current) {
          setDiscardError(error instanceof Error ? error.message : 'Não foi possível excluir o rascunho remoto.');
        }
        toast.error('Não foi possível descartar o rascunho remoto. A composição e o rascunho local foram mantidos.');
        return;
      }
    }
    setDiscardError(null);
    removeEmailDraftSession(draftStorageKey);
    onClose();
  };

  const modeLabels = {
    new: 'Nova mensagem',
    reply: 'Responder',
    'reply-all': 'Responder a todos',
    forward: 'Encaminhar',
  };

  return createPortal((
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      className="fixed bottom-20 right-2 z-50 w-[520px] max-w-[calc(100vw-16px)] sm:bottom-4 sm:right-20 sm:max-w-[calc(100vw-96px)]"
    >
      <Card className="border-border bg-card text-card-foreground shadow-xl">
        {/* Header */}
        <CardHeader className="flex flex-row items-center justify-between border-b border-border bg-inbox-panel p-3">
          <div className="flex items-center gap-2">
            <Send className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium">{modeLabels[mode]}</span>
            {activeAccount && (
              <Badge variant="outline" className="text-3xs px-1">
                {activeAccount.email_address}
              </Badge>
            )}
            {draftStatus !== 'idle' && <span className={`text-3xs ${draftStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>{draftStatus === 'saving' ? 'Salvando…' : draftStatus === 'saved' ? 'Rascunho salvo' : 'Falha ao salvar rascunho'}</span>}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setIsMinimized(!isMinimized)} aria-label={isMinimized ? 'Expandir compositor' : 'Minimizar compositor'}>
              {isMinimized ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose} aria-label="Fechar e manter rascunho">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </CardHeader>

        <AnimatePresence>
          {!isMinimized && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              <CardContent className="space-y-2 bg-card p-3">
                {/* To */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-12 shrink-0">Para:</Label>
                  <Input
                    value={to}
                    aria-label="Destinatários"
                    onChange={(e) => { setTo(e.target.value); markDraftDirty(); }}
                    placeholder="destinatario@email.com"
                    className="h-8 border-input bg-input text-sm"
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
                        <Input aria-label="Cópia" value={cc} onChange={(e) => { setCc(e.target.value); markDraftDirty(); }} className="h-8 border-input bg-input text-sm" />
                      </div>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground w-12 shrink-0">Bcc:</Label>
                        <Input aria-label="Cópia oculta" value={bcc} onChange={(e) => { setBcc(e.target.value); markDraftDirty(); }} className="h-8 border-input bg-input text-sm" />
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Subject */}
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground w-12 shrink-0">Assunto:</Label>
                  <Input
                    value={subject}
                    aria-label="Assunto"
                    onChange={(e) => { setSubject(e.target.value); markDraftDirty(); }}
                    placeholder="Assunto do email"
                    className="h-8 border-input bg-input text-sm"
                  />
                </div>

                <EmailRichTextEditor
                  content={body}
                  onChange={(html, text) => { setBody(html); setBodyText(text); markDraftDirty(); }}
                  onSubmit={() => void handleSend()}
                />

                <div className="flex items-center justify-end border-b border-border pb-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => fileInputRef.current?.click()}
                    title="Anexar arquivo"
                    aria-label="Anexar arquivo"
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

                {missingAttachmentNames.length > 0 && (
                  <div role="status" className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[hsl(var(--warning-text))]">
                    O rascunho foi restaurado, mas o navegador não pode reabrir arquivos locais. Anexe novamente: {missingAttachmentNames.join(', ')}.
                    <Button type="button" variant="ghost" size="sm" className="ml-2 h-6 px-2 text-[hsl(var(--warning-text))]" onClick={() => setMissingAttachmentNames([])}>Dispensar</Button>
                  </div>
                )}

                {sendOutcomeUnknown && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-[hsl(var(--warning-text))]">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div><p className="font-medium">Resultado do envio não confirmado</p><p className="mt-0.5 opacity-80">A conexão terminou sem uma resposta conclusiva. O email pode ter sido aceito pelo Gmail. Confira a pasta Enviados antes de tentar novamente para evitar duplicidade.</p></div>
                  </div>
                )}

                {discardError && (
                  <div role="alert" className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div><p className="font-medium">Rascunho remoto não descartado</p><p className="mt-0.5 opacity-80">Não foi possível excluir o rascunho no Gmail: {discardError} A composição e o rascunho local foram mantidos; tente descartar novamente.</p></div>
                  </div>
                )}

                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {attachments.map((file, i) => (
                      <Badge key={i} variant="secondary" className="text-3xs gap-1">
                        <Paperclip className="w-2.5 h-2.5" />
                        <span className="max-w-[220px] truncate">{file.name}</span>
                        <span className="text-muted-foreground">{formatEmailFileSize(file.size)}</span>
                        <button type="button" aria-label={`Remover ${file.name}`} onClick={() => removeAttachment(i)} className="ml-0.5 hover:text-destructive">
                          <X className="w-2.5 h-2.5" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}

                {forwardAttachmentsPending && (
                  <div role="status" className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-2 py-1 text-3xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Carregando anexos da mensagem original…
                  </div>
                )}

                {selectedForwardAttachments.length > 0 && (
                  <div className="space-y-1 rounded-lg border border-primary/20 bg-primary/5 p-2" aria-label="Anexos da mensagem encaminhada">
                    <p className="text-3xs font-medium text-primary">Anexos originais incluídos</p>
                    <div className="flex flex-wrap gap-1">
                      {selectedForwardAttachments.map(attachment => (
                        <Badge key={attachment.id} variant="secondary" className="gap-1 text-3xs">
                          <Paperclip className="h-2.5 w-2.5" /><span className="max-w-[220px] truncate">{attachment.filename || 'Anexo'}</span>
                          <span className="text-muted-foreground">{formatEmailFileSize(attachment.size_bytes || 0)}</span>
                          <button type="button" aria-label={`Remover ${attachment.filename || 'anexo'}`} onClick={() => { dismissedForwardAttachmentIdsRef.current.add(attachment.id); setSelectedForwardAttachmentIds(current => { const next = new Set(current); next.delete(attachment.id); return next; }); markDraftDirty(); }}><X className="h-2.5 w-2.5" /></button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Send Button */}
                <div className="flex items-center justify-between pt-1">
                  <Button variant="ghost" size="sm" onClick={() => { if (hasDraftContent) setDiscardConfirmationOpen(true); else void discardDraft(); }}>
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
      <AlertDialog open={discardConfirmationOpen} onOpenChange={setDiscardConfirmationOpen}>
        <AlertDialogContent className="border-border bg-popover text-popover-foreground">
          <AlertDialogHeader><AlertDialogTitle>Descartar este rascunho?</AlertDialogTitle><AlertDialogDescription className="text-muted-foreground">O rascunho remoto e os anexos desta composição serão removidos. Fechar pelo X mantém o rascunho.</AlertDialogDescription></AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Continuar editando</AlertDialogCancel><AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void discardDraft()}>Descartar rascunho</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </motion.div>
  ), document.body);
}
