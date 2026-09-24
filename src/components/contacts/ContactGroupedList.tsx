import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Building, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ContactListItem } from './ContactListItem';
import type { Contact } from './types';
import type { CRMBatchResult } from '@/hooks/crm/useExternalContact360Batch';

interface ContactGroupedListProps {
  contacts: Contact[];
  selectedIds: string[];
  onToggleSelect: (id: string, selected: boolean) => void;
  onOpenChat: (id: string) => void;
  onEdit: (contact: Contact) => void;
  onDelete: (contact: Contact) => void;
  getCRMData?: (phone: string) => CRMBatchResult | undefined;
  searchQuery?: string;
}

export function ContactGroupedList({
  contacts, selectedIds, onToggleSelect, onOpenChat, onEdit, onDelete, getCRMData, searchQuery,
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
    <div className="space-y-3">
      {groups.map(([company, members], gi) => {
        const isCollapsed = collapsed.has(company);
        return (
          <motion.div
            key={company}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: gi * 0.03 }}
            className="rounded-xl border border-border/40 overflow-hidden bg-card"
          >
            {/* Group Header */}
            <button
              onClick={() => toggleGroup(company)}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors"
            >
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                {company === 'Sem empresa' ? (
                  <Users className="w-3.5 h-3.5 text-muted-foreground" />
                ) : (
                  <Building className="w-3.5 h-3.5 text-primary" />
                )}
              </div>
              <span className="text-sm font-semibold text-foreground flex-1 text-left truncate">
                {company}
              </span>
              <Badge variant="secondary" className="text-3xs h-5 px-2 font-medium">
                {members.length}
              </Badge>
              <ChevronDown className={cn(
                'w-4 h-4 text-muted-foreground transition-transform duration-200',
                isCollapsed && '-rotate-90'
              )} />
            </button>

            {/* Group Content */}
            <AnimatePresence initial={false}>
              {!isCollapsed && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-border/20 space-y-1 p-1">
                    {members.map((contact, index) => (
                      <ContactListItem
                        key={contact.id}
                        contact={contact}
                        isSelected={selectedIds.includes(contact.id)}
                        onToggleSelect={onToggleSelect}
                        onOpenChat={onOpenChat}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        index={index}
                        companyLogo={getCRMData?.(contact.phone)?.logo_url}
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
