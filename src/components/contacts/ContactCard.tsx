import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MessageSquare, Pencil, Trash2, MoreVertical, Phone, Mail, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { HighlightText } from './HighlightText';
import { canDeleteContact } from './contactPermissions';
import type { ContactItemProps } from './types';

export function ContactCard({
  contact, isSelected, onToggleSelect, onOpenDetails, onOpenChat, onEdit, onDelete, index, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);
  const displayName = `${contact.name}${contact.surname ? ' ' + contact.surname : ''}`.trim();
  const company = companyName || contact.company;
  // Em telas sem `:hover` real (toque) o `group-hover` nunca dispara e o checkbox
  // ficaria eternamente invisivel. No ponteiro grosso ele nasce visivel; no desktop
  // segue revelado no hover e no foco de teclado (`focus-within`).
  const ponteiroGrosso = usePointerCoarse();

  // Sem telefone nem e-mail o bloco do meio nasce vazio: sem altura mínima fixa
  // o card encolhe e não sobra vão (o rodapé mt-auto só empurra quando há folga).
  const hasContactInfo = !!(contact.phone || contact.email);

  // "Último contato em" quando há mensagem real; fallback para data de cadastro
  const footerLabel = contact.last_message_at
    ? `Último contato em ${format(new Date(contact.last_message_at), 'dd MMM yyyy', { locale: ptBR })}`
    : `Cadastrado em ${format(new Date(contact.created_at), 'dd MMM yyyy', { locale: ptBR })}`;

  return (
    <div
      data-testid="contact-card"
      className={cn(
        "card-lift card-glow group relative flex flex-col rounded-[14px] bg-card p-4 cursor-pointer",
        "transition-[transform,border-color,box-shadow] duration-150",
        hasContactInfo ? "min-h-[164px]" : "min-h-[120px]",
        isSelected
          ? "ring-1 ring-primary border-primary/60 bg-primary/5"
          : "border-border/70"
      )}
      onClick={() => onOpenDetails(contact.id)}
    >
      {/* Selection checkbox — revelado no hover (desktop) e sempre visivel no toque */}
      <div
        className={cn(
          "absolute top-3 left-3 z-10 transition-opacity duration-150 focus-within:opacity-100",
          isSelected || ponteiroGrosso ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
          aria-label={isSelected ? `Desmarcar ${contact.name}` : `Selecionar ${contact.name}`}
          className="bg-background/90"
        />
      </div>

      {/* Menu "⋮": só o que é exclusivo dele (Excluir). "Conversar" e "Editar"
          ficam num único lugar — o rodapé abaixo — para não haver 4 alvos de
          clique pras mesmas 2 ações. Sem permissão de exclusão o menu não tem
          item nenhum, então o botão nem aparece (o gate continua sendo o
          `contact.can_delete` confirmado pelo banco). */}
      {canDeleteContact(contact) && (
        <div
          className="absolute top-3 right-3 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-muted" aria-label={`Ações do contato ${contact.name}`}>
                <MoreVertical className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
                <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      {/* Avatar + Name row */}
      <div className="flex items-start gap-3">
        <Avatar data-testid="contact-avatar" className="w-16 h-16 shrink-0 ring-2 ring-border/70">
          <AvatarImage src={contact.avatar_url || undefined} alt={contact.name || 'Avatar'} />
          <AvatarFallback className={cn('font-bold text-lg', avatarColors.bg, avatarColors.text)}>
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1 pt-0.5">
          <HighlightText
            text={displayName}
            highlight={searchQuery}
            className="text-sm font-semibold text-foreground leading-tight block truncate pr-8"
          />
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn("h-6 px-2.5 rounded-full text-xs font-medium gap-1.5 shrink-0", typeConfig.badgeClass)}
            >
              {typeConfig.iconNode}
              {typeConfig.label}
            </Badge>
            {contact.nickname && (
              <span className="text-xs text-muted-foreground truncate">({contact.nickname})</span>
            )}
          </div>
          {company && (
            <p className="text-sm text-muted-foreground truncate mt-1">{company}</p>
          )}
        </div>
      </div>

      {/* Contact info — space-y-1.5 per Navy plan spec */}
      <div className="mt-3 space-y-1.5">
        {contact.phone && (
          <div className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
            <Phone className="w-[15px] h-[15px] shrink-0 text-muted-foreground" />
            <a
              href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground/80 truncate hover:text-primary transition-colors"
            >
              {contact.phone}
            </a>
          </div>
        )}
        {contact.email && (
          <div className="flex items-center gap-2 text-sm" onClick={(e) => e.stopPropagation()}>
            <Mail className="w-[15px] h-[15px] shrink-0 text-muted-foreground" />
            <a
              href={`mailto:${contact.email}`}
              className="truncate text-muted-foreground hover:text-primary transition-colors"
            >
              {contact.email}
            </a>
          </div>
        )}
      </div>

      {/* Footer — pt-2 fecha o gap final */}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground/80 min-w-0">
          <Clock className="w-[14px] h-[14px] shrink-0" />
          <span className="truncate">{footerLabel}</span>
        </div>
        <div
          className="flex items-center gap-1.5 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50"
            onClick={() => onOpenChat(contact.id)}
            title="Conversar"
          >
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50"
            onClick={() => onEdit(contact)}
            title="Editar"
          >
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
