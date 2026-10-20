import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, UserPlus, X } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { ContactService } from '@/services/contact.service';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { formatPhoneBR } from '@/lib/calls/phone';
import { cn } from '@/lib/utils';
import { useContactsSearch } from '@/hooks/crm/useContactsSearch';

/** Contato exibido/selecionado. `phone`/`avatarUrl` são opcionais. */
export interface ContactOption {
  id: string;
  name: string;
  phone?: string | null;
  avatarUrl?: string | null;
}

interface Props {
  /** Contato selecionado (id). `null` = nenhum. */
  value: string | null;
  onChange: (contactId: string | null) => void;
  /** Opcional: dados do contato já selecionado — evita o lookup por id. */
  selectedContact?: ContactOption | null;
  /** Texto do gatilho quando não há contato. Default: "Contato". */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** `id` do gatilho, para o `<Label htmlFor>` do formulário. */
  id?: string;
  /** `data-testid` do gatilho focável (usado pelos atalhos de teclado). */
  testId?: string;
}

/** Avatar de 18px: foto quando existe, senão a inicial sobre a cor determinística. */
function ContactAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  if (avatarUrl) {
    return <img src={avatarUrl} alt="" className="h-[18px] w-[18px] shrink-0 rounded-full object-cover" />;
  }
  const colors = getAvatarColor(name || '?');
  return (
    <span className={cn('flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full text-[9px] font-bold', colors.bg, colors.text)}>
      {getInitials(name)}
    </span>
  );
}

/**
 * Lista de busca por nome/telefone. Isolada num componente próprio para o hook
 * (e as queries agregadas de `useContactsSearch`) só montarem enquanto o
 * popover está aberto — fechado, custo zero.
 */
function ContactSearchList({
  selectedId,
  onSelect,
}: {
  selectedId?: string;
  onSelect: (contact: ContactOption) => void;
}) {
  const { contacts, loading, handleSearchChange } = useContactsSearch();

  return (
    <Command shouldFilter={false}>
      <CommandInput
        autoFocus
        data-testid="contact-combobox-input"
        placeholder="Buscar por nome ou telefone…"
        onValueChange={handleSearchChange}
      />
      <CommandList>
        <CommandEmpty data-testid="contact-combobox-empty">
          {loading ? 'Buscando…' : 'Nenhum contato encontrado'}
        </CommandEmpty>
        {contacts.map((c) => (
          <CommandItem
            key={c.id}
            value={c.id}
            data-testid="contact-combobox-option"
            onSelect={() =>
              onSelect({ id: c.id, name: c.name, phone: c.phone, avatarUrl: c.avatar_url })
            }
            className="gap-2"
          >
            <ContactAvatar name={c.name} avatarUrl={c.avatar_url} />
            <span className="min-w-0 flex-1 truncate">{c.name || c.phone}</span>
            <span className="shrink-0 text-2xs text-muted-foreground">{formatPhoneBR(c.phone)}</span>
            {c.id === selectedId && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
          </CommandItem>
        ))}
      </CommandList>
    </Command>
  );
}

/**
 * Combobox de contato do módulo de Tarefas (etapas 24 e 39): busca por
 * nome/telefone sobre `useContactsSearch`; com contato escolhido mostra avatar +
 * nome e o `×` remove. Controlado por `value` (id) / `onChange`.
 */
export function ContactCombobox({
  value,
  onChange,
  selectedContact,
  placeholder = 'Contato',
  disabled,
  className,
  id,
  testId,
}: Props) {
  const [open, setOpen] = useState(false);
  const [escolhidos, setEscolhidos] = useState<Record<string, ContactOption>>({});

  // Nome/avatar do contato atual: o que o chamador passou, o que já foi escolhido
  // nesta sessão, ou — em último caso — um lookup por id (valor vindo de fora).
  const conhecido = value ? (selectedContact ?? escolhidos[value] ?? null) : null;

  const { data: buscado } = useQuery({
    queryKey: ['contact-combobox', value],
    enabled: !!value && !conhecido,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ContactOption | null> => {
      if (!value) return null;
      const { data, error } = await ContactService.getById(value);
      if (error) throw error;
      return data ? { id: data.id, name: data.name, phone: data.phone, avatarUrl: data.avatar_url } : null;
    },
  });

  const atual: ContactOption | null = value ? (conhecido ?? buscado ?? { id: value, name: 'Contato' }) : null;

  const selecionar = (contact: ContactOption) => {
    setEscolhidos((prev) => ({ ...prev, [contact.id]: contact }));
    onChange(contact.id);
    setOpen(false);
  };

  return (
    <div
      data-testid="contact-combobox"
      className={cn(value ? 'chip-active' : 'chip-btn', value && 'pr-1', className)}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            id={id}
            data-testid={testId}
            disabled={disabled}
            aria-haspopup="listbox"
            aria-expanded={open}
            aria-label={atual ? `Contato ${atual.name}. Clique para trocar` : placeholder}
            className="inline-flex min-w-0 items-center gap-1 outline-none disabled:opacity-50"
          >
            {atual ? (
              <>
                <ContactAvatar name={atual.name} avatarUrl={atual.avatarUrl} />
                <span className="max-w-[120px] truncate">{atual.name}</span>
              </>
            ) : (
              <>
                <UserPlus className="h-3.5 w-3.5" />
                <span>{placeholder}</span>
              </>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[320px] p-0" data-testid="contact-combobox-popover">
          {open && <ContactSearchList selectedId={value ?? undefined} onSelect={selecionar} />}
        </PopoverContent>
      </Popover>
      {value && (
        <button
          type="button"
          aria-label="Remover contato"
          data-testid="contact-combobox-clear"
          onClick={() => onChange(null)}
          className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
