import { useMemo, useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Building2, Clock, Download, FileText, Globe, Instagram, Linkedin, Mail, MessageSquare, NotebookPen, Phone, RefreshCw, Tag, User, Users, X } from 'lucide-react';
import type { EmailAttachment, EmailMessage, EmailThread } from '@/hooks/integrations/useGmail';
import { useContactNotes } from '@/hooks/crm/useContactNotes';
import { useEmailContactContext } from '@/hooks/crm/useEmailContactContext';
import { CompanyLogo } from '@/components/contacts/CompanyLogo';
import { formatEmailFileSize } from '@/lib/emailAttachments';
import { companySocialLinks, normalizeExternalUrl } from '@/lib/emailCompanyLinks';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

type ContextAttachment = EmailAttachment & { gmail_message_id?: string };

interface EmailContactPanelProps {
  accountId?: string;
  accountEmail?: string;
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

const INITIAL_LIST_SIZE = 5;

function uniqueParticipants(messages: EmailMessage[]): string[] {
  const participants = new Set<string>();
  messages.forEach(message => {
    [message.from_address, ...message.to_addresses, ...message.cc_addresses].forEach(address => {
      const normalized = address?.trim().toLowerCase();
      if (normalized) participants.add(normalized);
    });
  });
  return Array.from(participants);
}

export function EmailContactPanel({
  accountId, accountEmail, thread, messages = [], attachments = [], relatedThreads = [], labels = [], onClose, onCompose,
  onDownloadAttachment, onSelectRelated,
}: EmailContactPanelProps) {
  const contact = thread.contact;
  const displayName = contact?.name || contact?.email || thread.last_from_name || thread.last_from_address || 'Não vinculado ao CRM';
  const displayEmail = contact?.email || thread.last_from_address || '';
  const participants = useMemo(() => uniqueParticipants(messages), [messages]);
  const [showAllParticipants, setShowAllParticipants] = useState(false);
  const [showAllAttachments, setShowAllAttachments] = useState(false);
  const [showAllRelated, setShowAllRelated] = useState(false);
  const companyQuery = useEmailContactContext({ accountId, threadId: thread.id, contactId: thread.contact_id });
  const companyContext = companyQuery.data;
  const company = companyContext?.company ?? null;
  const website = normalizeExternalUrl(company?.website);
  const socialLinks = companySocialLinks(company?.socials);
  const linkedin = socialLinks.find(link => link.platform === 'linkedin')?.url;
  const instagram = socialLinks.find(link => link.platform === 'instagram')?.url;
  const displayLabels = thread.label_ids
    .filter(labelId => !SYSTEM_LABELS.has(labelId) && !labelId.startsWith('CATEGORY_'))
    .map(labelId => labels.find(label => label.gmail_label_id === labelId)?.name || labelId);
  const tags = uniqueTags(thread.tags || [], contact?.tags || [], displayLabels);
  const [accordionValue, setAccordionValue] = useState<string[]>(['info', 'participants', 'files', 'tags']);

  return (
    <div className="flex h-full w-80 flex-col overflow-hidden bg-inbox-panel text-foreground">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-inbox-panel p-4">
        <h3 className="text-sm font-semibold">Detalhes da conversa</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar detalhes"><X className="h-4 w-4" /></Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          <div className="flex flex-col items-center border-b border-border pb-4 text-center">
            <Avatar className="mb-3 h-20 w-20 ring-2 ring-primary/40 ring-offset-4 ring-offset-background">
              <AvatarFallback className="bg-primary/10 text-lg font-bold text-primary">{getInitials(displayName, displayEmail)}</AvatarFallback>
            </Avatar>
            <h4 className="text-base font-semibold text-foreground">{displayName}</h4>
            {displayEmail && <p className="mt-0.5 max-w-full truncate text-xs text-muted-foreground">{displayEmail}</p>}
            <Button variant="outline" size="sm" className="mt-3 h-8 rounded-full" disabled={!displayEmail || !onCompose} onClick={() => displayEmail && onCompose?.(displayEmail)}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />E-mail
            </Button>
          </div>

          <CompanyContextSection
            company={company}
            status={companyQuery.status}
            isFetching={companyQuery.isFetching}
            error={companyQuery.error}
            linked={companyContext?.source.linked ?? false}
            consultedAt={companyContext?.source.consultedAt ?? null}
            website={website}
            linkedin={linkedin}
            instagram={instagram}
            onRefresh={() => void companyQuery.refetch()}
          />

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
                {(participants.length ? participants : displayEmail ? [displayEmail] : []).slice(0, showAllParticipants ? undefined : INITIAL_LIST_SIZE).map(address => (
                  <div key={address} className="flex items-center gap-2 rounded-lg bg-muted/50 px-2 py-2 text-xs"><Mail className="h-3.5 w-3.5 text-primary" /><span className="min-w-0 truncate">{address}</span>{address === accountEmail?.trim().toLowerCase() && <span className="ml-auto shrink-0 text-3xs text-muted-foreground">Você</span>}</div>
                ))}
                {participants.length > INITIAL_LIST_SIZE && <ListToggle expanded={showAllParticipants} remaining={participants.length - INITIAL_LIST_SIZE} onClick={() => setShowAllParticipants(value => !value)} />}
                {!participants.length && !displayEmail && <p className="text-xs text-muted-foreground">Participantes ainda não disponíveis.</p>}
              </div>
            </PanelSection>

            <PanelSection value="files" icon={FileText} title={`Anexos (${attachments.length})`}>
              <div className="space-y-2">
                {attachments.slice(0, showAllAttachments ? undefined : INITIAL_LIST_SIZE).map(attachment => (
                  <div key={attachment.id} className="flex items-center gap-2 rounded-lg border border-border bg-card p-2">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1"><p className="truncate text-xs text-foreground">{attachment.filename || 'Anexo'}</p><p className="text-3xs text-muted-foreground">{formatEmailFileSize(attachment.size_bytes || 0)}</p></div>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label={`Baixar ${attachment.filename || 'anexo'}`} disabled={!attachment.gmail_message_id || !onDownloadAttachment} onClick={() => onDownloadAttachment?.(attachment)}><Download className="h-3.5 w-3.5" /></Button>
                  </div>
                ))}
                {attachments.length > INITIAL_LIST_SIZE && <ListToggle expanded={showAllAttachments} remaining={attachments.length - INITIAL_LIST_SIZE} onClick={() => setShowAllAttachments(value => !value)} />}
                {!attachments.length && <p className="text-xs text-muted-foreground">Nenhum anexo nesta conversa.</p>}
              </div>
            </PanelSection>

            <PanelSection value="related" icon={MessageSquare} title={`Conversas relacionadas (${relatedThreads.length})`}>
              <div className="space-y-2">
                {relatedThreads.slice(0, showAllRelated ? undefined : INITIAL_LIST_SIZE).map(related => (
                  <button key={related.id} type="button" className="block w-full rounded-lg border border-border bg-card p-2 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir conversa relacionada: ${related.subject || 'sem assunto'}`} onClick={() => onSelectRelated?.(related)} disabled={!onSelectRelated}>
                    <p className="truncate text-xs font-medium text-foreground">{related.subject || '(Sem assunto)'}</p><p className="mt-1 truncate text-3xs text-muted-foreground">{related.snippet}</p>
                  </button>
                ))}
                {relatedThreads.length > INITIAL_LIST_SIZE && <ListToggle expanded={showAllRelated} remaining={relatedThreads.length - INITIAL_LIST_SIZE} onClick={() => setShowAllRelated(value => !value)} />}
                {!relatedThreads.length && <p className="text-xs text-muted-foreground">Nenhuma outra conversa vinculada a este contato.</p>}
              </div>
            </PanelSection>

            <PanelSection value="tags" icon={Tag} title="Tags e marcadores">
              <div className="flex flex-wrap gap-1.5">
                {tags.map(tag => <Badge key={tag.key} variant={tag.source === 'Gmail' ? 'outline' : 'secondary'} className="gap-1 text-3xs" aria-label={`${tag.value}, origem ${tag.source}`}><span>{tag.value}</span><span className="text-[9px] text-muted-foreground">{tag.source}</span></Badge>)}
                {!tags.length && <p className="text-xs text-muted-foreground">Nenhuma tag</p>}
              </div>
            </PanelSection>

            {thread.contact_id && <ContactNotes contactId={thread.contact_id} />}
          </Accordion>
        </div>
      </ScrollArea>
    </div>
  );
}

function uniqueTags(threadTags: string[], contactTags: string[], gmailLabels: string[]) {
  const tags = new Map<string, { key: string; value: string; source: 'Conversa' | 'Contato' | 'Gmail' }>();
  const append = (values: string[], source: 'Conversa' | 'Contato' | 'Gmail') => values.forEach(raw => {
    const value = raw.trim();
    const key = value.toLocaleLowerCase('pt-BR');
    if (key && !tags.has(key)) tags.set(key, { key, value, source });
  });
  append(threadTags, 'Conversa');
  append(contactTags, 'Contato');
  append(gmailLabels, 'Gmail');
  return [...tags.values()];
}

function CompanyContextSection({
  company, status, isFetching, error, linked, consultedAt, website, linkedin, instagram, onRefresh,
}: {
  company: NonNullable<ReturnType<typeof useEmailContactContext>['data']>['company'] | null;
  status: string;
  isFetching: boolean;
  error: Error | null;
  linked: boolean;
  consultedAt: string | null;
  website: string | null;
  linkedin?: string;
  instagram?: string;
  onRefresh: () => void;
}) {
  if (status === 'disabled') return <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">Dados empresariais indisponíveis: integração CRM desativada ou contato não vinculado.</div>;
  if (status === 'loading' && isFetching) return <div className="flex items-center gap-2 rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground"><RefreshCw className="h-3.5 w-3.5 animate-spin" />Buscando dados da empresa no Singu CRM…</div>;
  if (error && !company) return <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">Não foi possível atualizar os dados empresariais. As informações da conversa continuam disponíveis.<Button variant="ghost" size="sm" className="ml-1 h-6 px-1 text-xs" onClick={onRefresh}>Tentar novamente</Button></div>;
  if (!company) return <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground">Nenhuma empresa vinculada ao Singu CRM para este contato.</div>;
  const relationshipLabels: Record<string, string> = { cliente: 'Cliente', fornecedor: 'Fornecedor', transportadora: 'Transportadora' };
  return (
    <section aria-label="Empresa vinculada" className="space-y-3 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <CompanyLogo logoUrl={company.logoUrl} companyName={company.name} size="md" className="h-9 w-9 text-xs" />
        <div className="min-w-0 flex-1"><p className="text-3xs font-medium uppercase text-muted-foreground">Empresa vinculada</p><p className="truncate text-sm font-semibold text-foreground">{company.name}</p>{company.legalName && company.legalName !== company.name && <p className="truncate text-3xs text-muted-foreground">{company.legalName}</p>}</div>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Atualizar dados da empresa" disabled={isFetching} onClick={onRefresh}><RefreshCw className={isFetching ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /></Button>
      </div>
      {error && <p role="status" className="rounded bg-warning/10 px-2 py-1 text-3xs text-warning-foreground">Dados empresariais anteriores exibidos; a atualização falhou.</p>}
      {company.relationships.length > 0 ? <div className="flex flex-wrap gap-1">{company.relationships.map(type => <Badge key={type} variant="secondary" className="text-3xs">{relationshipLabels[type] || type}</Badge>)}</div> : <p className="text-3xs text-muted-foreground">{company.relationshipsKnown ? 'Empresa não classificada.' : 'Classificação empresarial indisponível.'}</p>}
      <div className="grid grid-cols-2 gap-1.5">
        <CompanyLink href={website} icon={Globe} label="Site" />
        <CompanyLink href={linkedin} icon={Linkedin} label="LinkedIn" known={company.socialsKnown} />
        <CompanyLink href={instagram} icon={Instagram} label="Instagram" known={company.socialsKnown} />
      </div>
      <CompanyDescription company={company} website={website} />
      <p className="text-3xs text-muted-foreground">{linked ? 'Vinculada ao Singu CRM.' : 'Dados consultados no Singu CRM.'}{formatContextTimestamp(company.updatedAt, 'dd/MM/yyyy') ? ` Atualizado no CRM em ${formatContextTimestamp(company.updatedAt, 'dd/MM/yyyy')}.` : formatContextTimestamp(consultedAt, 'dd/MM/yyyy HH:mm') ? ` Consultado em ${formatContextTimestamp(consultedAt, 'dd/MM/yyyy HH:mm')}.` : ''}</p>
    </section>
  );
}

function CompanyDescription({ company, website }: { company: NonNullable<NonNullable<ReturnType<typeof useEmailContactContext>['data']>['company']>; website: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const longDescription = Boolean(company.about && company.about.length > 280);
  const description = company.about && !expanded ? company.about.slice(0, 280) : company.about;
  return <div className="space-y-1 border-t border-border pt-2"><p className="text-3xs font-medium uppercase text-muted-foreground">Sobre a empresa</p>{company.industry && <p className="text-xs text-foreground">{company.industry}</p>}{company.location && <p className="text-xs text-muted-foreground">{company.location}</p>}{description ? <><p className="whitespace-pre-wrap break-words text-xs text-foreground">{description}{longDescription && !expanded ? '…' : ''}</p>{longDescription && <Button type="button" variant="link" className="h-auto p-0 text-xs" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ver menos' : 'Ver mais'}</Button>}</> : <p className="text-xs text-muted-foreground">{company.aboutKnown ? 'Descrição não informada.' : 'Descrição empresarial indisponível.'}</p>}{!website && <p className="text-3xs text-muted-foreground">Site não informado.</p>}</div>;
}

function formatContextTimestamp(value: string | null, pattern: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return isValid(date) ? format(date, pattern, { locale: ptBR }) : null;
}

function CompanyLink({ href, icon: Icon, label, known = true }: { href?: string | null; icon: React.ComponentType<{ className?: string }>; label: string; known?: boolean }) {
  if (!href) return <span className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-3xs text-muted-foreground" aria-label={`${label} ${known ? 'não informado' : 'indisponível'}`}><Icon className="h-3.5 w-3.5" />{label}</span>;
  return <a href={href} target="_blank" rel="noopener noreferrer" className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-3xs text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Abrir ${label} da empresa em nova janela`}><Icon className="h-3.5 w-3.5" />{label}</a>;
}

function ContactNotes({ contactId }: { contactId: string }) {
  const { notes, addNote, isAdding, isLoading, error } = useContactNotes(contactId);
  const [content, setContent] = useState('');
  const [showAllNotes, setShowAllNotes] = useState(false);
  const submit = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    await addNote(trimmed, 'note');
    setContent('');
  };
  return (
    <PanelSection value="notes" icon={NotebookPen} title={`Notas internas (${notes.length})`}>
      <div className="space-y-2">
        {isLoading && <p className="text-xs text-muted-foreground">Carregando notas…</p>}
        {error && <p role="alert" className="text-xs text-destructive">Não foi possível carregar as notas.</p>}
        {notes.slice(0, showAllNotes ? undefined : INITIAL_LIST_SIZE).map(note => <div key={note.id} className="rounded-lg bg-muted/50 p-2 text-xs text-foreground"><p className="whitespace-pre-wrap break-words">{note.content}</p><p className="mt-1 text-3xs text-muted-foreground">{note.author?.name || 'Autor não identificado'}{formatContextTimestamp(note.created_at, 'dd/MM/yyyy HH:mm') ? ` · ${formatContextTimestamp(note.created_at, 'dd/MM/yyyy HH:mm')}` : ''}</p></div>)}
        {notes.length > INITIAL_LIST_SIZE && <ListToggle expanded={showAllNotes} remaining={notes.length - INITIAL_LIST_SIZE} onClick={() => setShowAllNotes(value => !value)} />}
        {!isLoading && !error && notes.length === 0 && <p className="text-xs text-muted-foreground">Nenhuma nota para este contato.</p>}
        <div className="flex gap-1">
          <Input aria-label="Nova nota do contato" value={content} onChange={event => setContent(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') void submit(); }} placeholder="Adicionar nota…" className="h-8 border-input bg-input text-xs" />
          <Button type="button" size="sm" className="h-8" disabled={!content.trim() || isAdding} onClick={() => void submit()}>Salvar</Button>
        </div>
      </div>
    </PanelSection>
  );
}

function ListToggle({ expanded, remaining, onClick }: { expanded: boolean; remaining: number; onClick: () => void }) {
  return <Button type="button" variant="link" size="sm" className="h-auto px-0 text-xs" onClick={onClick}>{expanded ? 'Ver menos' : `Ver todos${remaining > 0 ? ` (+${remaining})` : ''}`}</Button>;
}

function PanelSection({ value, icon: Icon, title, children }: { value: string; icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return <AccordionItem value={value} className="border-border"><AccordionTrigger className="py-2 text-xs font-semibold uppercase text-muted-foreground hover:no-underline"><span className="flex items-center gap-2"><Icon className="h-3.5 w-3.5" />{title}</span></AccordionTrigger><AccordionContent className="pb-3">{children}</AccordionContent></AccordionItem>;
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="flex items-start gap-2"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" /><div className="min-w-0"><p className="text-3xs text-muted-foreground">{label}</p><p className="truncate text-xs text-foreground">{value}</p></div></div>;
}
