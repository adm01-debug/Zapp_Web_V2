import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ContactListItem } from './ContactListItem';
import type { Contact } from './types';
import type { CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

interface ContactGroupedListProps {
  contacts: Contact[];
  selectedIds: string[];
  onToggleSelect: (id: string, selected: boolean) => void;
  onOpenDetails: (id: string) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  getCRMData?: (phone: string) => CRMBatchResult | undefined;
  searchQuery?: string;
}

/**
 * ZD-062 — lista agrupada por empresa no visual do design
 * (`.zc-group-heading`): cabeçalho de seção com ícone pequeno e título em caixa alta,
 * e os cards SOLTOS embaixo — sem a caixa com borda que envolvia o grupo antes.
 * O botão de colapso é do sistema (o design não tem) e continua sendo o cabeçalho.
 */
export function ContactGroupedList({
  contacts, selectedIds, onToggleSelect, onOpenDetails, onOpenChat, onEdit, onDelete, getCRMData, searchQuery,
}: ContactGroupedListProps) {
  const groups = useMemo(() => {
    const map = new Map<string, Contact[]>();
    contacts.forEach(c => {
      const key = c.company?.trim() || 'Sem empresa';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return Array.from(map.entries()).sort((a, b) => {
      if (a[0] === 'Sem empresa') return 1;
      if (b[0] === 'Sem empresa') return -1;
      return b[1].length - a[1].length;
    });
  }, [contacts]);

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggleGroup = (key: string) => {
    const next = new Set(collapsed);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    setCollapsed(next);
  };

  return (
    <div className="space-y-1">
      {groups.map(([company, members], gi) => {
        const isCollapsed = collapsed.has(company);
        return (
          <motion.div
            key={company}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.03 }}
          >
            <button
              onClick={() => toggleGroup(company)}
              className="mt-[13px] mb-[2px] flex w-full items-center gap-2 text-left"
              aria-expanded={!isCollapsed}
            >
              {company === 'Sem empresa' ? (
                <Users className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              ) : (
                <Building2 className="h-[15px] w-[15px] shrink-0 text-[hsl(var(--contacts-blue))]" />
              )}
              <span className="flex-1 truncate text-xs font-medium uppercase tracking-wider text-[hsl(var(--contacts-ink))]">
                {company}
              </span>
              <Badge variant="secondary" className="h-5 px-2 text-3xs font-medium">
                {members.length}
              </Badge>
              <ChevronDown className={cn(
                'h-4 w-4 shrink-0 text-[hsl(var(--contacts-quiet))] transition-transform duration-200',
                isCollapsed && '-rotate-90'
              )} />
            </button>

            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="space-y-2 pt-1">
                    {members.map((contact, index) => (
                      <ContactListItem
                        key={contact.id}
                        contact={contact}
                        isSelected={selectedIds.includes(contact.id)}
                        onToggleSelect={onToggleSelect}
                        onOpenDetails={onOpenDetails}
                        onOpenChat={onOpenChat}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        index={index}
                        companyName={getCRMData?.(contact.phone)?.company_name}
                        searchQuery={searchQuery}
                      />
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        );
      })}
    </div>
  );
}