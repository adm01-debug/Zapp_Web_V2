import { useCallback, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Inbox, MailOpen, Star, Flag, Send, FileText, AlertOctagon, Trash2, Tag } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { EmailLabel } from '@/hooks/integrations/useGmail';

/**
 * Pastas fixas do Gmail (espelho dos system labels). O id é o `gmail_label_id`
 * que aparece em `email_threads.label_ids`; `UNREAD`, `STARRED` e `IMPORTANT`
 * têm flag própria na thread e são resolvidos pelo consumidor.
 */
const GMAIL_SYSTEM_FOLDERS: ReadonlyArray<{ id: string; name: string; icon: LucideIcon }> = [
  { id: 'INBOX', name: 'Inbox', icon: Inbox },
  { id: 'UNREAD', name: 'Não lidos', icon: MailOpen },
  { id: 'STARRED', name: 'Favoritos', icon: Star },
  { id: 'IMPORTANT', name: 'Importantes', icon: Flag },
  { id: 'SENT', name: 'Enviados', icon: Send },
  { id: 'DRAFT', name: 'Rascunhos', icon: FileText },
  { id: 'SPAM', name: 'Spam', icon: AlertOctagon },
  { id: 'TRASH', name: 'Lixeira', icon: Trash2 },
];

const SYSTEM_IDS = new Set(GMAIL_SYSTEM_FOLDERS.map((folder) => folder.id));

interface GmailFolderEntry {
  id: string;
  name: string;
  icon: LucideIcon;
  color?: string | null;
  /** Contagem vinda do hook (`message_count` do rótulo); 0 quando não houver. */
  count: number;
}

/**
 * Pastas fixas seguidas dos marcadores personalizados da consulta. A contagem
 * sai do próprio rótulo (`email_labels.message_count`); pasta sem linha ainda
 * aparece, só não mostra número.
 */
function gmailFolderEntries(labels: EmailLabel[]): GmailFolderEntry[] {
  const byId = new Map(labels.map((label) => [label.gmail_label_id, label]));
  const system: GmailFolderEntry[] = GMAIL_SYSTEM_FOLDERS.map((folder) => ({
    ...folder,
    count: byId.get(folder.id)?.message_count ?? 0,
  }));
  const user: GmailFolderEntry[] = labels
    .filter((label) => label.label_type === 'user' && !SYSTEM_IDS.has(label.gmail_label_id))
    .map((label) => ({
      id: label.gmail_label_id,
      name: label.name,
      icon: Tag,
      color: label.color,
      count: label.message_count,
    }));
  return [...system, ...user];
}

interface GmailLabelSidebarProps {
  labels: EmailLabel[];
  activeLabel: string;
  onSelectLabel: (labelId: string) => void;
  className?: string;
}

/**
 * Barra lateral de pastas/marcadores do Gmail. No celular vira um seletor nativo
 * (mesmas pastas e o mesmo estado). Teclado: ↑/↓ percorrem, Home/End vão ao
 * extremo; a pasta atual carrega `aria-current="page"`.
 */
export function GmailLabelSidebar({ labels, activeLabel, onSelectLabel, className }: GmailLabelSidebarProps) {
  const navRef = useRef<HTMLElement | null>(null);
  const entries = useMemo(() => gmailFolderEntries(labels), [labels]);
  const systemEntries = entries.slice(0, GMAIL_SYSTEM_FOLDERS.length);
  const userEntries = entries.slice(GMAIL_SYSTEM_FOLDERS.length);

  const onNavKeyDown = useCallback((event: KeyboardEvent<HTMLElement>) => {
    const nav = navRef.current;
    if (!nav) return;
    const items = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-folder-item="true"]'));
    if (items.length === 0) return;
    const current = items.findIndex((item) => item === document.activeElement);
    if (current < 0) return;
    let next = current;
    if (event.key === 'ArrowDown') next = (current + 1) % items.length;
    else if (event.key === 'ArrowUp') next = (current - 1 + items.length) % items.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = items.length - 1;
    else return;
    event.preventDefault();
    items[next]?.focus();
  }, []);

  const renderItem = (entry: GmailFolderEntry) => {
    const active = entry.id === activeLabel;
    const Icon = entry.icon;
    return (
      <li key={entry.id}>
        <button
          type="button"
          data-folder-item="true"
          onClick={() => onSelectLabel(entry.id)}
          aria-current={active ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition-colors',
            active ? 'bg-primary/10 font-semibold text-primary' : 'text-foreground hover:bg-muted',
          )}
        >
          <Icon
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
            style={active || !entry.color ? undefined : { color: entry.color }}
          />
          <span className="flex-1 truncate text-left">{entry.name}</span>
          {entry.count > 0 && (
            <Badge variant={active ? 'default' : 'secondary'} className="ml-auto h-5 min-w-5 px-1 text-3xs">
              {entry.count > 99 ? '99+' : entry.count}
            </Badge>
          )}
        </button>
      </li>
    );
  };

  return (
    <div className={cn('flex min-h-0 flex-col', className)}>
      <div className="p-2 md:hidden">
        <label className="sr-only" htmlFor="gmail-folder-select">
          Pasta do Gmail
        </label>
        <select
          id="gmail-folder-select"
          value={activeLabel}
          onChange={(event) => onSelectLabel(event.target.value)}
          className="h-8 w-full rounded-md border bg-background px-2 text-sm"
        >
          {entries.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name}
            </option>
          ))}
        </select>
      </div>

      <nav
        ref={navRef}
        aria-label="Pastas do Gmail"
        onKeyDown={onNavKeyDown}
        className="hidden min-h-0 flex-1 overflow-y-auto py-2 md:block"
      >
        <ul className="space-y-0.5 px-2">{systemEntries.map(renderItem)}</ul>
        {userEntries.length > 0 && (
          <>
            <p className="mt-2 px-3 text-3xs font-semibold uppercase tracking-wide text-muted-foreground">
              Marcadores
            </p>
            <ul className="space-y-0.5 px-2">{userEntries.map(renderItem)}</ul>
          </>
        )}
      </nav>
    </div>
  );
}

export default GmailLabelSidebar;
