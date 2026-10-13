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
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { HighlightText } from './HighlightText';
import { canDeleteContact } from './contactPermissions';
import type { ContactItemProps } from './types';

export function ContactListItem({
  contact, isSelected, onToggleSelect, onOpenDetails, onOpenChat, onEdit, onDelete, index, companyName, searchQuery,
}: ContactItemProps) {
  const typeConfig = CONTACT_TYPE_CONFIG[contact.contact_type || 'cliente'] || CONTACT_TYPE_CONFIG.cliente;
  const avatarColors = getAvatarColor(contact.name);
  // Sem `:hover` real (toque) o `group-hover` nao dispara e a barra de acoes ficaria
  // inacessivel. No ponteiro grosso ela nasce visivel; no desktop segue no hover e no
  // foco de teclado (`focus-within`).
  const ponteiroGrosso = usePointerCoarse();

  return (
    <div
      data-testid="contact-list-item"
      className={cn(
        // Grid com template definido por breakpoint: cada largura tem o mesmo número de
        // trilhas para TODAS as linhas, então as colunas ficam alinhadas (fr/auto resolvem
        // igual em linhas de mesma largura). Antes era flexbox com `min-w-[130px]` etc., o
        // que desalinhava entre linhas porque a largura vinha do conteúdo de cada uma.
        "group grid items-center gap-3 h-16 px-4 rounded-xl border border-border/70 bg-card",
        "grid-cols-[auto_auto_minmax(0,1fr)_auto]",                                          // < md: checkbox, avatar, nome, ações
        "md:grid-cols-[auto_auto_minmax(0,1fr)_auto_auto]",                                  // md: + data
        "lg:grid-cols-[auto_auto_minmax(0,2fr)_minmax(0,1fr)_auto_auto]",                          // lg: + telefone
        "xl:grid-cols-[auto_auto_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto_auto]",             // xl: + email
        "hover:bg-muted/40 hover:border-primary/30 transition-all duration-150 cursor-pointer",
        isSelected && "ring-1 ring-primary border-primary/60 bg-primary/5"
      )}
      onClick={() => onOpenDetails(contact.id)}
    >
      {/* Checkbox */}
      <div onClick={(e) => e.stopPropagation()}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
          aria-label={isSelected ? `Desmarcar ${contact.name}` : `Selecionar ${contact.name}`}
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
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <HighlightText
            text={`${contact.name} ${contact.surname || ''}`.trim()}
            highlight={searchQuery}
            className="font-semibold text-sm text-foreground truncate block"
          />
          <Badge
            variant="outline"
            className={cn("h-6 px-2.5 rounded-full text-xs font-medium gap-1.5 shrink-0", typeConfig.badgeClass)}
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

      {/* Phone — a célula existe sempre (mesmo sem telefone) para manter a trilha do grid
          alinhada com as outras linhas; o conteúdo é que aparece só quando há telefone. */}
      <div className="hidden lg:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0" onClick={(e) => e.stopPropagation()}>
        {contact.phone && (
          <>
            <Phone className="w-3 h-3 shrink-0" />
            <a
              href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-2xs hover:text-primary transition-colors truncate"
            >
              {contact.phone}
            </a>
          </>
        )}
      </div>

      {/* Email */}
      <div className="hidden xl:flex items-center gap-1.5 text-xs text-muted-foreground min-w-0" onClick={(e) => e.stopPropagation()}>
        {contact.email && (
          <>
            <Mail className="w-3 h-3 shrink-0" />
            <a
              href={`mailto:${contact.email}`}
              className="truncate text-2xs hover:text-primary transition-colors"
            >
              {contact.email}
            </a>
          </>
        )}
      </div>

      {/* Date */}
      <span className="hidden md:block text-2xs text-muted-foreground shrink-0">
        {format(new Date(contact.created_at), "dd/MM/yy", { locale: ptBR })}
      </span>

      {/* Actions — revelada no hover (desktop) e sempre visivel no toque */}
      <div
        className={cn(
          "flex items-center gap-0.5 transition-opacity shrink-0 focus-within:opacity-100",
          ponteiroGrosso ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Button variant="outline" size="icon" className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50" onClick={() => onOpenChat(contact.id)} title="Conversar">
          <MessageSquare className="w-4 h-4" />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon" className="w-9 h-9 rounded-[10px] border border-border bg-card hover:bg-muted hover:border-primary/50" aria-label={`Ações do contato ${contact.name}`}>
              <MoreVertical className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Edit className="w-3.5 h-3.5 mr-2" />Editar
            </DropdownMenuItem>
            {/* Item só aparece quando o usuário pode excluir ESTE contato (a permissão vem
                do banco em `contact.can_delete`). Antes aparecia sempre e o erro só surgia
                no clique -- débito do #1187. */}
            {canDeleteContact(contact) && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
                  <Trash2 className="w-3.5 h-3.5 mr-2" />Excluir
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
