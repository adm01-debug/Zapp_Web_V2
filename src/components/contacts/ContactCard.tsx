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
  MessageSquare, Pencil, Trash2, MoreVertical, Phone, Mail, Clock, Briefcase,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { CONTACT_TYPE_CONFIG } from './contactTypeConfig';
import { HighlightText } from './HighlightText';
import { canDeleteContact } from './contactPermissions';
import { calculateContactHealth, type ContactHealth, type ContactHealthInput } from '@/lib/contactHealth';
import type { ContactItemProps } from './types';

/**
 * Cores por nível da completude. Só tokens do sistema (`--primary`, `--warning`,
 * `--warning-text`, `--destructive`, `--destructive-text` — src/styles/tokens.css).
 * O número e o rótulo ao lado da barra são o sinal principal: a cor nunca é o
 * único indicador (requisito de acessibilidade do cartão).
 */
const HEALTH_TONE: Record<ContactHealth['level'], { text: string; bar: string }> = {
  completo: { text: 'text-primary', bar: 'bg-primary' },
  bom: { text: 'text-primary', bar: 'bg-primary' },
  incompleto: { text: 'text-[hsl(var(--warning-text))]', bar: 'bg-warning' },
  critico: { text: 'text-[hsl(var(--destructive-text))]', bar: 'bg-destructive' },
  indefinido: { text: 'text-muted-foreground', bar: 'bg-muted-foreground/40' },
};

/**
 * Completude do cadastro — indicador discreto: barra + número + nível em texto,
 * com os campos que faltam. `size="md"` (a ficha do contato) mostra a lista de
 * faltas visível; no cartão (`sm`) ela fica no `title` para não competir com os
 * dados do contato.
 */
export function ContactHealthIndicator({
  input,
  size = 'sm',
  className,
}: {
  input: ContactHealthInput | null | undefined;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const health = calculateContactHealth(input);
  const tone = HEALTH_TONE[health.level];
  const faltas = health.missing.map((field) => field.label);
  const descricao =
    health.evaluatedCount === 0
      ? 'Sem campos para avaliar'
      : faltas.length === 0
        ? 'Cadastro completo'
        : `Faltam: ${faltas.join(', ')}`;

  return (
    <div
      data-testid="contact-health"
      data-level={health.level}
      title={size === 'sm' ? `Completude do cadastro: ${health.score}% — ${descricao}` : undefined}
      className={cn('flex flex-col gap-1', className)}
    >
      <div className="flex items-center gap-1.5">
        <span className="text-3xs text-muted-foreground">Completude</span>
        <span className={cn('text-xs font-semibold tabular-nums', tone.text)} data-testid="contact-health-score">
          {health.score}%
        </span>
        <span className="text-3xs text-muted-foreground" data-testid="contact-health-level">
          {health.label}
        </span>
      </div>
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={health.score}
        aria-label={`Completude do cadastro: ${health.score} de 100 — ${health.label}`}
        className="h-1 w-full max-w-[120px] rounded-full bg-muted overflow-hidden"
      >
        <div className={cn('h-full rounded-full', tone.bar)} style={{ width: `${health.score}%` }} />
      </div>
      {size === 'md' && (
        <p className="text-3xs text-muted-foreground" data-testid="contact-health-missing">
          {descricao}
        </p>
      )}
    </div>
  );
}

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

      {/* Actions dropdown */}
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
            <DropdownMenuItem onClick={() => onOpenChat(contact.id)}>
              <MessageSquare className="w-3.5 h-3.5 mr-2" />Conversar
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => onEdit(contact)}>
              <Pencil className="w-3.5 h-3.5 mr-2" />Editar
            </DropdownMenuItem>
            {/* Mesmo gate do ContactListItem: o item só aparece quando o banco confirma
                que o usuário pode excluir este contato (`contact.can_delete`). */}
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
            {/* Tags — mesmo padrão do ContactListItem: até 2 + contador do resto */}
            {contact.tags && contact.tags.length > 0 && (
              <>
                {contact.tags.slice(0, 2).map(tag => (
                  <Badge key={tag} variant="secondary" className="text-3xs h-5 px-1.5">
                    {tag}
                  </Badge>
                ))}
                {contact.tags.length > 2 && (
                  <Badge variant="secondary" className="text-3xs h-5 px-1.5">
                    +{contact.tags.length - 2}
                  </Badge>
                )}
              </>
            )}
          </div>
          {company && (
            <p className="text-sm text-muted-foreground truncate mt-1">{company}</p>
          )}
          {contact.job_title && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground truncate mt-1">
              <Briefcase className="w-3 h-3 shrink-0" />
              {contact.job_title}
            </p>
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

      {/* Completude do cadastro — logo abaixo dos dados de contato, discreta. */}
      <ContactHealthIndicator input={contact} className="mt-3" />

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
