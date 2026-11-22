import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { useContainerColumns, type ColumnsPreference } from '@/hooks/contacts/useContainerColumns';
import { ContactEmptyState } from './ContactEmptyState';
import { ContactCard } from './ContactCard';
import { ContactListItem } from './ContactListItem';
import { ContactGroupedList } from './ContactGroupedList';
import { ContactsTable } from './ContactsTable';
import { ContactKanbanView } from './ContactKanbanView';
import { ContactMapView } from './ContactMapView';
import { ContactAnalyticsDashboard } from './ContactAnalyticsDashboard';
import { ContactsSkeleton } from './ContactsSkeleton';
import type { ContactViewMode } from './ContactViewSwitcher';

const GRID_COLUMNS_CLASS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
};

/** Grade explícita quando a largura do contêiner já foi medida (regra do design). */
const COLUNAS_GRID: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
  4: 'grid-cols-4',
  5: 'grid-cols-5',
  6: 'grid-cols-6',
};

import type { Contact } from './types';
import type { CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

interface ContactContentAreaProps {
  loading: boolean;
  contacts: Contact[];
  viewMode: ContactViewMode;
  gridColumns: number;
  groupByCompany: boolean;
  selectedIds: string[];
  search: string;
  activeFiltersCount: number;
  onToggleSelect: (id: string, selected: boolean) => void;
  onContactClick: (id: string) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  onSelectIds: (ids: string[]) => void;
  onAddContact: () => void;
  onClearSearch?: () => void;
  onClearFilters?: () => void;
  getCRMData: (phone: string) => CRMBatchResult | null;
  /** Total do filtro atual — pode ser maior que `contacts` (recorte carregado). */
  totalCount?: number;
}

export function ContactContentArea({
  loading, contacts, viewMode, gridColumns, groupByCompany,
  selectedIds, search, activeFiltersCount,
  onToggleSelect, onContactClick, onOpenChat, onEdit, onDelete, onSelectIds,
  onAddContact, onClearSearch, onClearFilters, getCRMData, totalCount,
}: ContactContentAreaProps) {
  // Cards entram com fade+slide só na primeira pintura da página — paginar/filtrar não re-anima.
  const [isFirstMount, setIsFirstMount] = useState(true);
  useEffect(() => {
    const id = requestAnimationFrame(() => setIsFirstMount(false));
    return () => cancelAnimationFrame(id);
  }, []);

  // Quantos cards por linha: medido pela largura real do contêiner (o design faz
  // igual). Antes da primeira medida — ou num ambiente sem layout mensurável —
  // vale o mapa responsivo por classes, que garante 1 coluna no celular.
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const { columns: colunasDoContainer, width: larguraDoContainer } = useContainerColumns(
    gradeRef,
    (gridColumns >= 2 && gridColumns <= 6 ? gridColumns : 4) as ColumnsPreference,
  );
  const colunasMedidas = larguraDoContainer !== null && larguraDoContainer > 0;

  /**
   * ZD-068 — navegação por teclado comum às três visões.
   *
   * As linhas/cards da lista e o corpo da tabela são contêineres de foco único
   * (`tabIndex=0`): Tab entra no bloco, e as setas movem o foco entre os itens.
   * Home/End vão ao primeiro/último. O foco nunca é roubado no clique nem na
   * montagem — só quando o teclado é usado dentro do bloco.
   */
  const moverFoco = (atual: HTMLElement, direcao: -1 | 1 | 'inicio' | 'fim') => {
    const seletor = '[data-contact-nav="item"]';
    const itens = Array.from(
      atual.querySelectorAll<HTMLElement>(seletor),
    ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
    if (itens.length === 0) return;

    if (direcao === 'inicio') { itens[0]?.focus(); return; }
    if (direcao === 'fim') { itens[itens.length - 1]?.focus(); return; }

    const focado = document.activeElement as HTMLElement | null;
    const indice = focado ? itens.indexOf(focado) : -1;
    const destino = indice === -1 ? (direcao === 1 ? 0 : itens.length - 1) : indice + direcao;
    if (destino < 0 || destino >= itens.length) return;
    itens[destino]?.focus();
  };

  const aoTeclar = (evento: React.KeyboardEvent<HTMLDivElement>) => {
    const alvo = evento.target as HTMLElement;
    // Só reage quando o foco está no próprio bloco ou num item da navegação —
    // controles internos (checkbox, menu, inputs) mantêm o teclado habitual.
    if (alvo.closest('input, button:not([data-contact-nav]), [role="menu"], textarea, select')) return;

    const tecla = evento.key;
    if (tecla === 'ArrowDown' || tecla === 'ArrowRight') { evento.preventDefault(); moverFoco(evento.currentTarget, 1); }
    else if (tecla === 'ArrowUp' || tecla === 'ArrowLeft') { evento.preventDefault(); moverFoco(evento.currentTarget, -1); }
    else if (tecla === 'Home') { evento.preventDefault(); moverFoco(evento.currentTarget, 'inicio'); }
    else if (tecla === 'End') { evento.preventDefault(); moverFoco(evento.currentTarget, 'fim'); }
  };

  let content: React.ReactNode;

  if (loading) {
    content = <ContactsSkeleton viewMode={viewMode} gridColumns={gridColumns} />;
  } else if (contacts.length === 0) {
    content = (
      <ContactEmptyState
        type={search ? 'no-results' : activeFiltersCount > 0 ? 'filtered-empty' : 'no-contacts'}
        searchQuery={search}
        activeFilters={activeFiltersCount}
        onAddContact={onAddContact}
        onClearSearch={search ? onClearSearch : undefined}
        onClearFilters={activeFiltersCount > 0 ? onClearFilters : undefined}
      />
    );
  } else if (viewMode === 'grid') {
    content = (
      <div
        ref={gradeRef}
        data-contact-nav="grade"
        className={cn(
          "grid gap-4 max-[899px]:gap-[14px] max-[559px]:gap-[13px]",
          // Com largura medida, a contagem vem do contêiner; sem medida (SSR,
          // jsdom sem layout) o mapa por classes é o fallback responsivo.
          colunasMedidas ? COLUNAS_GRID[colunasDoContainer] : GRID_COLUMNS_CLASS[gridColumns] || GRID_COLUMNS_CLASS[4],
        )}
      >
        {contacts.map((contact, index) => (
          <motion.div
            key={contact.id}
            initial={isFirstMount ? { opacity: 0, y: 4 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.15, delay: Math.min(index, 12) * 0.02 }}
          >
            <ContactCard
              contact={contact}
              isSelected={selectedIds.includes(contact.id)}
              onToggleSelect={onToggleSelect}
              onOpenDetails={onContactClick} onOpenChat={onOpenChat}
              onEdit={onEdit} onDelete={onDelete} index={index}
              companyName={getCRMData(contact.phone)?.company_name}
              searchQuery={search}
            />
          </motion.div>
        ))}
      </div>
    );
  } else if (viewMode === 'list' && groupByCompany) {
    content = (
      <ContactGroupedList
        contacts={contacts} selectedIds={selectedIds}
        onToggleSelect={onToggleSelect} onOpenDetails={onContactClick} onOpenChat={onOpenChat}
        onEdit={onEdit} onDelete={onDelete}
        getCRMData={(phone) => getCRMData(phone) ?? undefined} searchQuery={search}
      />
    );
  } else if (viewMode === 'list') {
    content = (
      <div className="space-y-2" data-contact-nav="lista">
        {contacts.map((contact, index) => (
          <ContactListItem
            key={contact.id} contact={contact}
            isSelected={selectedIds.includes(contact.id)}
            onToggleSelect={onToggleSelect}
            onOpenDetails={onContactClick} onOpenChat={onOpenChat}
            onEdit={onEdit} onDelete={onDelete} index={index}
            companyName={getCRMData(contact.phone)?.company_name}
            searchQuery={search}
          />
        ))}
      </div>
    );
  } else if (viewMode === 'kanban') {
    content = <ContactKanbanView contacts={contacts} onContactClick={onContactClick} />;
  } else if (viewMode === 'map') {
    content = <ContactMapView contacts={contacts} onContactClick={onContactClick} totalCount={totalCount} />;
  } else if (viewMode === 'analytics') {
    content = <ContactAnalyticsDashboard contacts={contacts} />;
  } else {
    // ZD-067 — a tabela traz o próprio `.zc-table-wrap` (borda/raio/fundo); o `Card`
    // por fora duplicava a moldura do design.
    content = (
      <div data-contact-nav="tabela">
        <ContactsTable
          contacts={contacts} selectedIds={selectedIds}
          onSelectIds={onSelectIds} onOpenDetails={onContactClick} onOpenChat={onOpenChat}
          onEdit={onEdit} onDelete={onDelete}
          getCRMData={(phone) => getCRMData(phone) ?? undefined} searchQuery={search}
        />
      </div>
    );
  }

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={viewMode}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.12 }}
        onKeyDown={aoTeclar}
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}
