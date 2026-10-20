import React, { useMemo } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  Users, MessageSquare, UsersRound, FileText, ShieldCheck,
  ClipboardList, Handshake, UserCheck, Truck, Wrench,
} from 'lucide-react';
import { ConversationWithMessages } from '@/hooks/chat/useRealtimeMessages';

// ---------- types & config ----------

export interface FilterOption {
  value: string;
  label: string;
  icon: typeof Users;
  iconColor: string;
  indent?: boolean;
  /** Function to test if a conversation matches this filter */
  match: (c: ConversationWithMessages) => boolean;
}

const isGroup = (phone: string | null | undefined) =>
  /^\d+-\d+$/.test((phone || '').replace(/\D/g, ''));

export const FILTER_OPTIONS: FilterOption[] = [
  {
    value: 'all',
    label: 'Todos os tipos',
    icon: Users,
    iconColor: 'text-muted-foreground',
    match: () => true,
  },
  {
    value: 'individual',
    label: 'Chats Individuais',
    icon: MessageSquare,
    iconColor: 'text-primary',
    match: (c) => !isGroup(c.contact.phone),
  },
  {
    value: 'grupo',
    label: 'Todos os Grupos',
    icon: UsersRound,
    iconColor: 'text-warning',
    match: (c) => isGroup(c.contact.phone),
  },
  {
    value: 'grupo_orcamentos',
    label: 'Orçamentos | Fornecedores',
    icon: FileText,
    iconColor: 'text-info',
    indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'orcamentos',
  },
  {
    value: 'grupo_aprovacao',
    label: 'Aprovação | Fornecedores',
    icon: ShieldCheck,
    iconColor: 'text-success',
    indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'aprovacao',
  },
  {
    value: 'grupo_os',
    label: 'O.S. | Fornecedores',
    icon: ClipboardList,
    iconColor: 'text-warning',
    indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'os',
  },
  {
    value: 'grupo_acerto',
    label: 'Acerto | Fornecedores',
    icon: Handshake,
    iconColor: 'text-secondary',
    indent: true,
    match: (c) => isGroup(c.contact.phone) && c.contact.group_category === 'acerto',
  },
  {
    value: 'grupo_sem_categoria',
    label: 'Grupos sem categoria',
    icon: UsersRound,
    iconColor: 'text-muted-foreground',
    indent: true,
    match: (c) => isGroup(c.contact.phone) && !c.contact.group_category,
  },
  {
    value: 'cliente',
    label: 'Clientes',
    icon: Users,
    iconColor: 'text-info',
    match: (c) => !isGroup(c.contact.phone) && (c.contact.contact_type || 'cliente') === 'cliente',
  },
  {
    value: 'colaborador',
    label: 'Colaboradores',
    icon: UserCheck,
    iconColor: 'text-success',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'colaborador',
  },
  {
    value: 'fornecedor',
    label: 'Fornecedores',
    icon: Truck,
    iconColor: 'text-secondary',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'fornecedor',
  },
  {
    value: 'prestador_servico',
    label: 'Prestadores de Serviço',
    icon: Wrench,
    iconColor: 'text-warning',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'prestador_servico',
  },
  {
    value: 'transportadora',
    label: 'Transportadoras',
    icon: Truck,
    iconColor: 'text-info',
    match: (c) => !isGroup(c.contact.phone) && c.contact.contact_type === 'transportadora',
  },
];

// Separators go AFTER these values
const SEPARATOR_AFTER = new Set(['individual', 'grupo_sem_categoria']);

// ---------- stats helper ----------

interface FilterStats {
  count: number;
  unread: number;
}

function computeStats(
  conversations: ConversationWithMessages[],
  options: FilterOption[],
): Record<string, FilterStats> {
  const stats: Record<string, FilterStats> = {};
  for (const opt of options) {
    stats[opt.value] = { count: 0, unread: 0 };
  }
  for (const c of conversations) {
    for (const opt of options) {
      if (opt.match(c)) {
        stats[opt.value].count++;
        if (c.unreadCount > 0) stats[opt.value].unread++;
      }
    }
  }
  return stats;
}

// ---------- component ----------

interface ContactTypeFilterProps {
  value: string | null;
  onChange: (value: string | null) => void;
  conversations: ConversationWithMessages[];
}

export const ContactTypeFilter = React.forwardRef<HTMLDivElement, ContactTypeFilterProps>(function ContactTypeFilter({ value, onChange, conversations }, ref) {
  const stats = useMemo(
    () => computeStats(conversations, FILTER_OPTIONS),
    [conversations],
  );

  const activeOption = FILTER_OPTIONS.find((o) => o.value === (value || 'all'));
  const TriggerIcon = activeOption?.icon || Users;

  return (
    <Select
      value={value || 'all'}
      onValueChange={(v) => onChange(v === 'all' ? null : v)}
    >
      <SelectTrigger className="h-7 text-2xs bg-muted/40 border-0 rounded-md focus:ring-1 focus:ring-primary/30 px-2 gap-1">
        <div className="flex items-center gap-1 truncate">
          <TriggerIcon className={cn('w-3 h-3 shrink-0', activeOption?.iconColor || 'text-muted-foreground')} />
          <span className="truncate">{activeOption?.label || 'Todos'}</span>
        </div>
      </SelectTrigger>
      <SelectContent>
        {FILTER_OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const st = stats[opt.value];
          return (
            <div key={opt.value}>
              <SelectItem value={opt.value}>
                <span className={cn('flex items-center gap-2', opt.indent && 'pl-3')}>
                  <Icon className={cn('w-3.5 h-3.5 shrink-0', opt.iconColor)} />
                  <span className="flex-1 truncate text-2xs">{opt.label}</span>
                  {st.count > 0 && (
                    <span className="ml-auto flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-muted-foreground font-medium tabular-nums">
                        {st.count}
                      </span>
                      {st.unread > 0 && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                      )}
                    </span>
                  )}
                </span>
              </SelectItem>
              {SEPARATOR_AFTER.has(opt.value) && <SelectSeparator />}
            </div>
          );
        })}
      </SelectContent>
    </Select>
  );
});

// ---------- helper for filtering ----------

export function filterByContactType(
  conversations: ConversationWithMessages[],
  contactType: string | null,
): ConversationWithMessages[] {
  if (!contactType || contactType === 'all') return conversations;
  const option = FILTER_OPTIONS.find((o) => o.value === contactType);
  if (!option) return conversations;
  return conversations.filter(option.match);
}
