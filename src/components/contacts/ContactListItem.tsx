import React from 'react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, Edit, Trash2, MoreVertical, Phone, Mail,
  Building2, Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { HighlightText } from './HighlightText';
import type { ContactItemProps } from './types';

export function ContactListItem({
  contact, isSelected, onToggleSelect, onOpenChat, onEdit, onDelete, index, companyLogo, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);

  return (
    <div
      className={cn(
        "group flex items-center gap-3 h-16 px-4 rounded-xl border border-border/70 bg-card",
        "hover:bg-muted/40 hover:border-primary/30 transition-all duration-150 cursor-pointer",
        isSelected && "bg-primary/5 border-primary/60"
      )}
      onClick={() => onOpenChat(contact.id)}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
        />
      </div>

      {/* Avatar */}
      <div className="relative shrink-0">
        <Avatar className="w-10 h-10 ring-2 ring-border/70">
          <AvatarImage src={contact.avatar_url || undefined} alt={contact.name || 'Avatar'} />
          <AvatarFallback className={cn('font-semibold text-xs', avatarColors.bg, avatarColors.text)}>
            {getInitials(contact.name)}
          </AvatarFallback>
        </Avatar>
        <div className={cn(
          "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background",
          typeConfig.dotBg
        )} />
      </div>

      {/* Name & type */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <HighlightText
            text={`${contact.name} ${contact.surname || ''}`.trim()}
            highlight={searchQuery}
            className="font-semibold text-sm text-foreground truncate block"
          />
          <Badge
            variant="outline"
            className={cn("h-6 px-2.5 rounded-full text-[12.5px] font-medium gap-1.5 shrink-0", typeConfig.badgeClass)}
          >
            {typeConfig.iconNode}
            {typeConfig.label}
          </Badge>
        </div>
        {(contact.company || companyName || contact.job_title) && (
          <div className="flex items-center gap-2 mt-0.5">
            {(contact.company || companyName) && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Building2 className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[120px]">{companyName || contact.company}</span>
              </span>
            )}
            {contact.job_title && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Briefcase className="w-3 h-3 shrink-0" />
                {contact.job_title}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Phone */}
      {contact.phone && (
        <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground min-w-[130px]" onClick={(e) => e.stopPropagation()}>
          <Phone className="w-3 h-3 shrink-0" />
          <a
            href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-mono text-[11px] hover:text-primary transition-colors truncate"
          >
            {contact.phone}
          </a>
        </div>
      )}

      {/* Email */}
      {contact.email && (
        <div className="hidden xl:flex items-center gap-1.5 text-xs text-muted-foreground min-w-[160px]" onClick={(e) => e.stopPropagation()}>
          <Mail className="w-3 h-3 shrink-0" />
          <a
            href={`mailto:${contact.email}`}
            className="truncate text-[11px] hover:text-primary transition-colors"
          >
            {contact.email}
          </a>
        </div>
      )}

      {/* Tags */}
      {contact.tags && contact.tags.length > 0 && (
        <div className="hidden lg:flex items-center gap-1 min-w-[100px]">
          {contact.tags.slice(0, 2).map(tag => (
            <Badge key={tag} variant="secondary" className="text-[10px] h-4 px-1.5">
              {tag}
            </Badge>
          ))}
          {contact.tags.length > 2 && (
            <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
              +{contact.tags.length - 2}
            </Badge>
          )}
        </div>
      )}

      {/* Date */}
      <span className="hidden md:block text-[11px] text-muted-foreground shrink-0">
        {format(new Date(contact.created_at), "dd/MM/yy", { locale: ptBR })}
      </span>

      {/* Actions */}
      <div
        className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50" onClick={() => onOpenChat(contact.id)} title="Conversar">
          <MessageSquare className="w-4 h-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50">
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
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
    </div>
  );
}
