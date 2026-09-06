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
  MessageSquare, Edit, Trash2, MoreVertical, Phone, Mail, Building2, Clock,
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

  return (
    <div
      className={cn(
        "group relative rounded-xl border bg-card cursor-pointer",
        "transition-all duration-150 overflow-hidden",
        "hover:border-primary/25 hover:shadow-md hover:shadow-black/10",
        isSelected
          ? "ring-2 ring-primary/40 border-primary/30 bg-primary/5"
          : "border-border/40 hover:bg-muted/20"
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Selection checkbox - shows on hover or when selected */}
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

      {/* Actions dropdown - always visible */}
      <div
        className="absolute top-2.5 right-2.5 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="w-7 h-7 hover:bg-muted">
              <MoreVertical className="w-3.5 h-3.5" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onOpenChat(contact.id)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" />Conversar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Edit className="w-3.5 h-3.5 mr-2" />Editar
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
              <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-4 pt-4 pb-3 space-y-3">
        {/* Avatar + Name row */}
        <div className="flex items-start gap-3">
          <Avatar className="w-14 h-14 shrink-0 ring-2 ring-border/30">
            <AvatarImage src={contact.avatar_url || undefined} />
            <AvatarFallback className={cn('font-bold text-sm', avatarColors.bg, avatarColors.text)}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 pt-1">
            <HighlightText
              text={displayName}
              highlight={searchQuery}
              className="font-semibold text-sm text-foreground leading-snug block truncate pr-7"
            />
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <Badge
                variant="outline"
                className={cn("text-[10px] h-4 px-1.5 font-medium gap-1 shrink-0", typeConfig.badgeClass)}
              >
                {typeConfig.iconNode}
                {typeConfig.label}
              </Badge>
              {contact.nickname && (
                <span className="text-[10px] text-muted-foreground truncate">({contact.nickname})</span>
              )}
            </div>
          </div>
        </div>

        {/* Company */}
        {(contact.company || companyName) && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Building2 className="w-3 h-3 shrink-0" />
            <span className="truncate">{companyName || contact.company}</span>
          </div>
        )}

        {/* Contact info */}
        <div className="space-y-1">
          {contact.phone && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
              <Phone className="w-3 h-3 shrink-0" />
              <a
                href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-[11px] truncate hover:text-primary transition-colors"
              >
                {contact.phone}
              </a>
            </div>
          )}
          {contact.email && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground" onClick={(e) => e.stopPropagation()}>
              <Mail className="w-3 h-3 shrink-0" />
              <a
                href={`mailto:${contact.email}`}
                className="truncate text-[11px] hover:text-primary transition-colors"
              >
                {contact.email}
              </a>
            </div>
          )}
        </div>

        {/* Tags */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
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

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-border/20">
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
            <Clock className="w-3 h-3 shrink-0" />
            <span>Último contato em {format(new Date(contact.created_at), "dd MMM yyyy", { locale: ptBR })}</span>
          </div>
          <div
            className="flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 hover:bg-primary/10 hover:text-primary"
              onClick={() => onOpenChat(contact.id)}
              title="Conversar"
            >
              <MessageSquare className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="w-6 h-6 hover:bg-muted"
              onClick={() => onEdit(contact)}
              title="Editar"
            >
              <Edit className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
