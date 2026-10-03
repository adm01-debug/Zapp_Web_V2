import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Clock, Download, FileText, Mail, MessageSquare, NotebookPen, Phone, Tag, User, Users, X } from 'lucide-react';
import type { EmailAttachment, EmailMessage, EmailThread } from '@/hooks/integrations/useGmail';
import { useContactNotes } from '@/hooks/crm/useContactNotes';
import { formatEmailFileSize } from '@/lib/emailAttachments';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ContextAttachment = EmailAttachment & { gmail_message_id?: string };

interface EmailContactPanelProps {
  thread: EmailThread;
  messages?: EmailMessage[];
  attachments?: ContextAttachment[];
  relatedThreads?: EmailThread[];
  labels?: Array<{ gmail_label_id: string; name: string }>;
  onClose: () => void;
  onCompose?: (email: string) => void;
  onDownloadAttachment?: (attachment: ContextAttachment) => void;
  onSelectRelated?: (thread: EmailThread) => void;
}

function getInitials(name?: string | null, email?: string): string {
  if (name) return name.split(' ').map(word => word[0]).slice(0, 2).join('').toUpperCase();
  if (email) return email[0]?.toUpperCase() || '?';
  return '?';
}

const SYSTEM_LABELS = new Set(['INBOX', 'UNREAD', 'SENT', 'IMPORTANT', 'DRAFT', 'TRASH', 'SPAM', 'STARRED']);

function uniqueParticipants(messages: EmailMessage[]): string[] {
  const participants = new Set<string>();
  messages.forEach(message => {
    if (message.from_address) participants.add(message.from_address);
    message.to_addresses.forEach(address => participants.add(address));
    message.cc_addresses.forEach(address => participants.add(address));
  });
  return Array.from(participants);
}

export function EmailContactPanel({
  thread, messages = [], attachments = [], relatedThreads = [], labels = [], onClose, onCompose,
  onDownloadAttachment, onSelectRelated,
}: EmailContactPanelProps) {
  const contact = thread.contact;
  const displayName = contact?.name || contact?.email || thread.last_from_name || thread.last_from_address || 'Não vinculado ao CRM';
  const displayEmail = contact?.email || thread.last_from_address || '';
  const participants = useMemo(() => uniqueParticipants(messages), [messages]);
  const displayLabels = thread.label_ids
    .filter(labelId => !SYSTEM_LABELS.has(labelId) && !labelId.startsWith('CATEGORY_'))
    .map(labelId => labels.find(label => label.gmail_label_id === labelId)?.name || labelId);
  const [accordionValue, setAccordionValue] = useState<string[]>(['info', 'participants', 'files', 'tags']);

  return (
    <div className="flex h-full w-80 flex-col overflow-hidden bg-[#041421] text-slate-100">
      <div className="flex shrink-0 items-center justify-between border-b border-cyan-300/10 bg-[#061827] p-4">
        <h3 className="text-sm font-semibold">Detalhes da conversa</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar detalhes"><X className="h-4 w-4" /></Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="flex flex-col items-center border-b border-cyan-300/10 pb-4 text-center">
            <Avatar className="mb-3 h-20 w-20 ring-2 ring-blue-500/40 ring-offset-4 ring-offset-[#041421]">
              <AvatarFallback className="bg-blue-500/10 text-lg font-bold text-blue-200">{getInitials(displayName, displayEmail)}</AvatarFallback>
            </Avatar>
            <h4 className="text-base font-semibold text-slate-100">{displayName}</h4>
            {displayEmail && <p className="mt-0.5 max-w-full truncate text-xs text-slate-400">{displayEmail}</p>}
            <Button variant="outline" size="sm" className="mt-3 h-8 rounded-full border-cyan-300/10 bg-[#071a2a]" disabled={!displayEmail || !onCompose} onClick={() => displayEmail && onCompose?.(displayEmail)}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />E-mail
            </Button>
          </div>

          <Accordion type="multiple" value={accordionValue} onValueChange={setAccordionValue}>
            <PanelSection value="info" icon={User} title="Sobre">
              <div className="space-y-2.5">
                <InfoRow icon={Mail} label="Email" value={displayEmail} />
                <InfoRow icon={Phone} label="Telefone" value={contact?.phone} />
                <InfoRow icon={Building2} label="Empresa" value={contact?.company} />
                <InfoRow icon={User} label="Cargo" value={contact?.job_title} />
                <InfoRow icon={MessageSquare} label="Assunto" value={thread.subject || '(Sem assunto)'} />
                <InfoRow icon={Clock} label="Última mensagem" value={thread.last_message_at ? format(new Date(thread.last_message_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }) : '-'} />
                <InfoRow icon={MessageSquare} label="Mensagens" value={`${thread.message_count} mensagens na thread`} />
              </div>
            </PanelSection>

            <PanelSection value="participants" icon={Users} title={`Participantes (${participants.length || (displayEmail ? 1 : 0)})`}>
              <div className="space-y-2">
                {(participants.length ? participants : displayEmail ? [displayEmail] : []).map(address => (
                  <div key={address} className="flex items-center gap-2 rounded-lg bg-cyan-300/5 px-2 py-2 text-xs"><Mail className="h-3.5 w-3.5 text-blue-300" /><span className="min-w-0 truncate">{address}</span></div>
                ))}
                {!participants.length && !displayEmail && <p className="text-xs text-slate-400">Participantes ainda não disponíveis.</p>}
              </div>
            </PanelSection>

            <PanelSection value="files" icon={FileText} title={`Anexos (${attachments.length})`}>
              <div className="space-y-2">
                {attachments.map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-cyan-300/10 bg-[#071a2a] p-2">
                    <FileText className="h-4 w-4 shrink-0 text-blue-300" />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs text-slate-200">{attachment.filename || 'Anexo'}</p><p className="text-3xs text-slate-500">{formatEmailFileSize(attachment.size_bytes || 0)}</p></div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Baixar ${attachment.filename || 'anexo'}`} disabled={!attachment.gmail_message_id || !onDownloadAttachment} onClick={() => onDownloadAttachment?.(attachment)}><Download className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {!attachments.length && <p className="text-xs text-slate-400">Nenhum anexo nesta conversa.</p>}
              </div>
            </PanelSection>

            <PanelSection value="related" icon={MessageSquare} title={`Conversas relacionadas (${relatedThreads.length})`}>
              <div className="space-y-2">
                {relatedThreads.map(related => (
                  <button key={related.id} type="button" className="block w-full rounded-lg border border-cyan-300/10 bg-[#071a2a] p-2 text-left hover:bg-blue-500/10" onClick={() => onSelectRelated?.(related)} disabled={!onSelectRelated}>
                    <p className="truncate text-xs font-medium text-slate-200">{related.subject || '(Sem assunto)'}</p><p className="mt-1 truncate text-3xs text-slate-500">{related.snippet}</p>
                  </button>
                ))}
                {!relatedThreads.length && <p className="text-xs text-slate-400">Nenhuma outra conversa vinculada a este contato.</p>}
              </div>
            </PanelSection>

            <PanelSection value="tags" icon={Tag} title="Tags e marcadores">
              <div className="flex flex-wrap gap-1.5">
                {[...(thread.tags || []), ...(contact?.tags || [])].map(tag => <Badge key={tag} variant="secondary" className="text-3xs">{tag}</Badge>)}
                {displayLabels.map(label => <Badge key={label} variant="outline" className="text-3xs">{label}</Badge>)}
                {!(thread.tags?.length || contact?.tags?.length || displayLabels.length) && <p className="text-xs text-slate-400">Nenhuma tag</p>}
              </div>
            </PanelSection>

            {thread.contact_id && <ContactNotes contactId={thread.contact_id} />}
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}

function ContactNotes({ contactId }: { contactId: string }) {
  const { notes, addNote, isAdding, isLoading, error } = useContactNotes(contactId);
  const [content, setContent] = useState('');
  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await addNote(trimmed, 'note');
    setContent('');
  };
  return (
    <PanelSection value="notes" icon={NotebookPen} title={`Notas internas (${notes.length})`}>
      <div className="space-y-2">
        {isLoading && <p className="text-xs text-slate-400">Carregando notas…</p>}
        {error && <p role="alert" className="text-xs text-red-300">Não foi possível carregar as notas.</p>}
        {notes.slice(0, 5).map(note => <div key={note.id} className="rounded-lg bg-cyan-300/5 p-2 text-xs text-slate-300">{note.content}</div>)}
        {!isLoading && !error && notes.length === 0 && <p className="text-xs text-slate-400">Nenhuma nota para este contato.</p>}
        <div className="flex gap-1">
          <Input aria-label="Nova nota do contato" value={content} onChange={event => setContent(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit(); }} placeholder="Adicionar nota…" className="h-8 border-cyan-300/10 bg-[#071a2a] text-xs" />
          <Button type="button" size="sm" className="h-8 bg-blue-600" disabled={!content.trim() || isAdding} onClick={() => void submit()}>Salvar</Button>
        </div>
      </div>
    </PanelSection>
  );
}

function PanelSection({ value, icon: Icon, title, children }: { value: string; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return <AccordionItem value={value} className="border-cyan-300/10"><AccordionTrigger className="py-2 text-xs font-semibold uppercase text-slate-400 hover:no-underline"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{title}</span></AccordionTrigger><AccordionContent className="pb-3">{children}</AccordionContent></AccordionItem>;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-500" /><div className="min-w-0"><p className="text-3xs text-slate-500">{label}</p><p className="truncate text-xs text-slate-200">{value}</p></div></div>;
}
