import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MessageSquare, Pencil, Trash2, MoreVertical, Phone, Mail, Clock,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { HighlightText } from './HighlightText';
import type { ContactItemProps } from './types';

export function ContactCard({
  contact, isSelected, onToggleSelect, onOpenChat, onEdit, onDelete, index, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);
  const displayName = `${contact.name}${contact.surname ? ' ' + contact.surname : ''}`.trim();
  const company = companyName || contact.company;

  // "Último contato em" quando há mensagem real; fallback para data de cadastro
  const footerLabel = contact.last_message_at
    ? `Último contato em ${format(new Date(contact.last_message_at), 'dd MMM yyyy', { locale: ptBR })}`
    : `Cadastrado em ${format(new Date(contact.created_at), 'dd MMM yyyy', { locale: ptBR })}`;

  return (
    <div
      data-testid="contact-card"
      className={cn(
        "card-lift card-glow group relative flex flex-col min-h-[164px] rounded-[14px] bg-card p-4 cursor-pointer",
        "transition-[transform,border-color,box-shadow] duration-150",
        isSelected
          ? "ring-1 ring-primary border-primary/60 bg-primary/5"
          : "border-border/70"
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Selection checkbox */}
      <div
        className={cn(
          "absolute top-3 left-3 z-10 transition-opacity duration-150",
          isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
          className="bg-background/90"
        />
      </div>

      {/* Actions dropdown */}
      <div
        className="absolute top-3 right-3 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-8 h-8 hover:bg-muted">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onOpenChat(contact.id)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" />Conversar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Pencil className="w-3.5 h-3.5 mr-2" />Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

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
            className="text-base font-semibold text-foreground leading-tight block truncate pr-8"
          />
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <Badge
              variant="outline"
              className={cn("h-6 px-2.5 rounded-full text-[12.5px] font-medium gap-1.5 shrink-0", typeConfig.badgeClass)}
            >
              {typeConfig.iconNode}
              {typeConfig.label}
            </Badge>
            {contact.nickname && (
              <span className="text-[12px] text-muted-foreground truncate">({contact.nickname})</span>
            )}
          </div>
          {company && (
            <p className="text-[13.5px] text-muted-foreground truncate mt-1">{company}</p>
          )}
        </div>
      </div>

      {/* Contact info — space-y-1.5 per Navy plan spec */}
      <div className="mt-3 space-y-1.5">
        {contact.phone && (
          <div className="flex items-center gap-2 text-[13.5px]" onClick={(e) => e.stopPropagation()}>
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
          <div className="flex items-center gap-2 text-[13.5px]" onClick={(e) => e.stopPropagation()}>
            <Mail className="w-[15px] h-[15px] shrink-0 text-muted-foreground" />
            <a
              href={`mailto:${contact.email}`}
              className="truncate text-[hsl(215_30%_78%)] hover:text-primary transition-colors"
            >
              {contact.email}
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {contact.tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5 rounded">
              {tag}
            </Badge>
          ))}
          {contact.tags.length > 2 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5 rounded">
              +{contact.tags.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Footer — pt-2 fecha o gap final */}
      <div className="mt-auto pt-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground/80 min-w-0">
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
