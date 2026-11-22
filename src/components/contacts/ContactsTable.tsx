import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, Edit, Trash2, MoreVertical, ArrowUpRight, Tag,
  ArrowUp, ArrowDown, ArrowUpDown, Columns3,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { ContactTypeBadge } from './ContactTypeBadge';
import { CompanyLogo } from './CompanyLogo';
import { ContactPortrait } from './ContactPortrait';
import { HighlightText } from './HighlightText';
import { toContactDisplay } from './contactDisplay';
import type { Contact } from './types';
import { canDeleteContact } from './contactPermissions';
import type { CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

type SortField = 'name' | 'type' | 'phone' | 'email' | 'company' | 'job_title' | 'created_at';
type SortDir = 'asc' | 'desc';

/** ZD-064 — colunas que o usuário pode esconder (o nome fica sempre). */
type ColumnKey = 'type' | 'phone' | 'email' | 'company' | 'job_title' | 'tags';

const COLUNAS: Array<{ key: ColumnKey; label: string }> = [
  { key: 'type', label: 'Tipo' },
  { key: 'phone', label: 'Telefone' },
  { key: 'email', label: 'Email' },
  { key: 'company', label: 'Empresa' },
  { key: 'job_title', label: 'Cargo' },
  { key: 'tags', label: 'Etiquetas' },
];

interface ContactsTableProps {
  contacts: Contact[];
  selectedIds: string[];
  onSelectIds: (ids: string[]) => void;
  onOpenDetails: (id: string) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  getCRMData?: (phone: string) => CRMBatchResult | undefined;
  searchQuery?: string;
}

/**
 * ZD-065 — ordenação única e explícita: cada `th` sortável envolve um `<button>`
 * real (alcançável por teclado) com a seta do design e `aria-sort` correto no `th`.
 */
function SortableHeader({ label, field, sortField, sortDir, onSort }: {
  label: string; field: SortField; sortField: SortField | null; sortDir: SortDir;
  onSort: (field: SortField) => void;
}) {
  const isActive = sortField === field;
  return (
    <th
      aria-sort={isActive ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="whitespace-nowrap border-b border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-[13px_11px] text-left font-medium text-[hsl(var(--contacts-muted))]"
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className="flex items-center gap-1.5 text-[11px] font-medium text-inherit transition-colors hover:text-[hsl(var(--contacts-ink))]"
      >
        {label}
        {isActive ? (
          sortDir === 'asc'
            ? <ArrowUp className="h-[11px] w-[11px] text-primary" />
            : <ArrowDown className="h-[11px] w-[11px] text-primary" />
        ) : (
          <ArrowUpDown className="h-[11px] w-[11px] opacity-40" />
        )}
      </button>
    </th>
  );
}

/** ZD-063 — tabela no visual `.zc-table` do design. */
export function ContactsTable({
  contacts, selectedIds, onSelectIds, onOpenDetails, onOpenChat, onEdit, onDelete, getCRMData, searchQuery,
}: ContactsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [hiddenCols, setHiddenCols] = useState<Set<ColumnKey>>(new Set());
  const [painelColunas, setPainelColunas] = useState(false);
  // Sem `:hover` real (toque) o `group-hover` nao dispara e a coluna de acoes ficaria
  // inacessivel. No ponteiro grosso ela nasce visivel; no desktop segue no hover e no
  // foco de teclado (`focus-within`).
  const ponteiroGrosso = usePointerCoarse();

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const ver = (key: ColumnKey) => !hiddenCols.has(key);

  const toggleColuna = (key: ColumnKey) => {
    setHiddenCols((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sortedContacts = useMemo(() => {
    if (!sortField) return contacts;
    return [...contacts].sort((a, b) => {
      let valA = '', valB = '';
      switch (sortField) {
        case 'name': valA = a.name.toLowerCase(); valB = b.name.toLowerCase(); break;
        case 'type': valA = a.contact_type || ''; valB = b.contact_type || ''; break;
        case 'phone': valA = a.phone; valB = b.phone; break;
        case 'email': valA = a.email || ''; valB = b.email || ''; break;
        case 'company': valA = a.company || ''; valB = b.company || ''; break;
        case 'job_title': valA = a.job_title || ''; valB = b.job_title || ''; break;
        case 'created_at': valA = a.created_at; valB = b.created_at; break;
      }
      const cmp = valA.localeCompare(valB);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [contacts, sortField, sortDir]);

  return (
    <div>
      {/* ZD-064 — escolha de colunas. Painel inline (não um menu) para não disputar
          `aria-haspopup="menu"` com o menu de ações de cada linha. */}
      <div className="mb-2 flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 text-[11px] text-[hsl(var(--contacts-muted))]"
          aria-expanded={painelColunas}
          onClick={() => setPainelColunas((v) => !v)}
        >
          <Columns3 className="h-3.5 w-3.5" />
          Colunas
        </Button>
      </div>
      {painelColunas && (
        <div className="mb-2 flex flex-wrap items-center gap-3 rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-3">
          {COLUNAS.map(({ key, label }) => (
            <label key={key} className="flex items-center gap-1.5 text-[11px] text-[hsl(var(--contacts-ink))]">
              <Checkbox
                checked={ver(key)}
                onCheckedChange={() => toggleColuna(key)}
                aria-label={`Mostrar coluna ${label}`}
              />
              {label}
            </label>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-[10px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-panel))]">
        <table className="w-full border-collapse text-[11px]" role="grid" aria-label="Lista de contatos">
          <thead>
            <tr>
              <th
                aria-label="Seleção"
                className="w-10 border-b border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-[13px_11px]"
              >
                <Checkbox
                  checked={selectedIds.length === contacts.length && contacts.length > 0}
                  onCheckedChange={(checked) => onSelectIds(checked ? contacts.map(c => c.id) : [])}
                  aria-label="Selecionar todos"
                />
              </th>
              <SortableHeader label="Contato" field="name" sortField={sortField} sortDir={sortDir} onSort={handleSort} />
              {ver('type') && <SortableHeader label="Tipo" field="type" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              {ver('phone') && <SortableHeader label="Telefone" field="phone" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              {ver('email') && <SortableHeader label="Email" field="email" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              {ver('company') && <SortableHeader label="Empresa" field="company" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              {ver('job_title') && <SortableHeader label="Cargo" field="job_title" sortField={sortField} sortDir={sortDir} onSort={handleSort} />}
              {ver('tags') && (
                <th className="whitespace-nowrap border-b border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-[13px_11px] text-left text-[11px] font-medium text-[hsl(var(--contacts-muted))]">
                  Etiquetas
                </th>
              )}
              <th className="whitespace-nowrap border-b border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] p-[13px_11px] text-right text-[11px] font-medium text-[hsl(var(--contacts-muted))]">
                Ações
              </th>
            </tr>
          </thead>
          <tbody data-testid="contacts-table-body">
            {sortedContacts.map((contact, index) => {
              const display = toContactDisplay(contact, { companyName: getCRMData?.(contact.phone)?.company_name });
              const crmData = getCRMData?.(contact.phone);
              const isSelected = selectedIds.includes(contact.id);
              return (
                <motion.tr
                  key={contact.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.015 }}
                  data-contact-nav="item"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); onOpenDetails(contact.id); } }}
                  className={cn(
                    "group cursor-pointer transition-colors hover:bg-[hsl(var(--contacts-raised))]",
                    isSelected && "ring-1 ring-primary border-primary/60 bg-primary/5"
                  )}
                  onClick={() => onOpenDetails(contact.id)}
                >
                  <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] last:border-0">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) =>
                        onSelectIds(checked ? [...selectedIds, contact.id] : selectedIds.filter(id => id !== contact.id))
                      }
                      aria-label={isSelected ? `Desmarcar ${contact.name}` : `Selecionar ${contact.name}`}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px]">
                    <div className="flex min-w-[165px] items-center gap-[9px] text-xs text-[hsl(var(--contacts-ink))]">
                      <ContactPortrait
                        contact={contact}
                        className="h-[39px] w-[35px] shrink-0 rounded-[6px]"
                        initialsClassName="text-[15px] tracking-normal"
                      />
                      <span className="min-w-0">
                        <HighlightText
                          text={display.nomeCompleto ?? contact.name}
                          highlight={searchQuery}
                          className="block truncate font-medium"
                        />
                        {display.apelido && (
                          <span className="block truncate text-[11px] text-[hsl(var(--contacts-quiet))]">({display.apelido})</span>
                        )}
                      </span>
                    </div>
                  </td>
                  {ver('type') && (
                    <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px]">
                      <ContactTypeBadge type={contact.contact_type} size="sm" />
                    </td>
                  )}
                  {ver('phone') && (
                    <td className="whitespace-nowrap border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] text-[hsl(var(--contacts-muted))]">
                      {display.telefone ?? <span className="text-[hsl(var(--contacts-quiet))]">—</span>}
                    </td>
                  )}
                  {ver('email') && (
                    <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] text-[hsl(var(--contacts-muted))]">
                      {display.email
                        ? <span className="block max-w-[190px] truncate">{display.email}</span>
                        : <span className="text-[hsl(var(--contacts-quiet))]">—</span>}
                    </td>
                  )}
                  {ver('company') && (
                    <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] text-[hsl(var(--contacts-muted))]">
                      {display.empresa ? (
                        <div className="flex items-center gap-1.5">
                          <CompanyLogo
                            logoUrl={crmData?.logo_url}
                            companyName={crmData?.company_name}
                            fallbackCompanyName={contact.company}
                            size="xs"
                          />
                          <span className="block max-w-[150px] truncate">{display.empresa}</span>
                        </div>
                      ) : <span className="text-[hsl(var(--contacts-quiet))]">—</span>}
                    </td>
                  )}
                  {ver('job_title') && (
                    <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] text-[hsl(var(--contacts-muted))]">
                      {display.cargo
                        ? <span className="block max-w-[150px] truncate">{display.cargo}</span>
                        : <span className="text-[hsl(var(--contacts-quiet))]">—</span>}
                    </td>
                  )}
                  {ver('tags') && (
                    <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px]">
                      <div className="flex flex-wrap gap-1">
                        {contact.tags?.map(tag => (
                          <span
                            key={tag}
                            className="inline-block whitespace-nowrap rounded-[5px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] px-[5px] py-[3px] text-[11px] text-[hsl(var(--contacts-ink))]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </td>
                  )}
                  <td className="border-b border-[hsl(var(--contacts-soft-line))] p-[14px_11px] text-right">
                    <div
                      className={cn(
                        "flex items-center justify-end gap-1 transition-opacity focus-within:opacity-100",
                        ponteiroGrosso ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                      )}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-[30px] w-[30px] rounded-[7px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-ink))] hover:border-primary/60 hover:bg-[hsl(var(--contacts-page))]"
                        onClick={() => onOpenChat(contact.id)}
                        title="Conversar"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-[30px] w-[30px] rounded-[7px] border border-[hsl(var(--contacts-line))] bg-[hsl(var(--contacts-raised))] text-[hsl(var(--contacts-ink))] hover:border-primary/60 hover:bg-[hsl(var(--contacts-page))]"
                            aria-label={`Ações do contato ${contact.name}`}
                          >
                            <MoreVertical className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(contact)}><Edit className="mr-2 h-4 w-4" />Editar</DropdownMenuItem>
                          <DropdownMenuItem><Tag className="mr-2 h-4 w-4" />Gerenciar etiquetas</DropdownMenuItem>
                          {/* Mesmo gate da lista e do card: o item só aparece quando o banco
                              diz que este contato pode ser excluído (`contact.can_delete`). */}
                          {canDeleteContact(contact) && (
                            <>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}><Trash2 className="mr-2 h-4 w-4" />Excluir</DropdownMenuItem>
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-[30px] w-[30px] rounded-[7px] text-[hsl(var(--contacts-muted))] hover:text-primary"
                        onClick={() => onOpenDetails(contact.id)}
                        aria-label={`Abrir ficha de ${contact.name}`}
                        title="Abrir ficha"
                      >
                        <ArrowUpRight className="h-[14px] w-[14px]" />
                      </Button>
                    </div>
                  </td>
                </motion.tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}