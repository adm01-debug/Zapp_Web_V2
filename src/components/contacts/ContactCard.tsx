import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Checkbox } from '@/components/ui/checkbox';
import {
  MessageSquare, Pencil, Trash2, MoreVertical, Phone, Mail,
  MapPin, ArrowUpRight, Building2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { HighlightText } from './HighlightText';
import { canDeleteContact } from './contactPermissions';
import { calculateContactHealth, type ContactHealth, type ContactHealthInput } from '@/lib/contactHealth';
import { ContactPortrait } from './ContactPortrait';
import { ContactTypeBadge } from './ContactTypeBadge';
import { toContactDisplay } from './contactDisplay';
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
  const display = toContactDisplay(contact, { companyName });
  const ponteiroGrosso = usePointerCoarse();

  // "Última interação" quando há mensagem real; sem nenhuma data → 'Não registrada'
  const ultimaInteracao = display.ultimoContato ?? 'Não registrada';
  const temCanal = Boolean(display.telefone || display.email);

  return (
    <div
      data-testid="contact-card"
      className={cn(
        "contact-card group relative flex min-w-0 flex-col overflow-hidden rounded-[13px] cursor-pointer card-lift card-glow",
        "min-h-[120px]",
        temCanal && "min-h-[164px]",
        isSelected
          ? "contact-card-selected ring-1 ring-primary bg-primary/5 border-primary/60"
          : "hover:border-[hsl(221_20%_48%)]"
      )}
      style={{
        background: 'linear-gradient(148deg, hsl(var(--contacts-panel)) 0%, hsl(var(--contacts-panel)) 65%, hsl(var(--contacts-page)))',
      }}
      onClick={() => onOpenDetails(contact.id)}
    >
      {/* Selection — caixa do design (`.zc-card-selection`): 25px, 28px no mobile
          estreito e 38px no ponteiro grosso. Continua oculta no ponteiro fino até
          hover/foco de teclado (contrato de controlesToque.test.tsx). */}
      <div
        className={cn(
          "absolute top-3 right-3 z-[3] grid h-[25px] w-[25px] place-items-center rounded-[7px] border border-[hsl(0_0%_100%/0.23)] bg-[hsl(240_10%_8%/0.76)] shadow-[0_2px_8px_hsl(0_0%_0%/0.25)] transition-opacity duration-150 focus-within:opacity-100",
          "max-[559px]:top-[14px] max-[559px]:right-[14px] max-[559px]:h-7 max-[559px]:w-7 max-[559px]:rounded-[8px]",
          ponteiroGrosso && "h-[38px] w-[38px] rounded-[10px]",
          isSelected || ponteiroGrosso ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelect(contact.id, !!checked)}
          aria-label={isSelected ? `Desmarcar ${contact.name}` : `Selecionar ${contact.name}`}
          className={cn(
            "border-[hsl(0_0%_100%/0.6)] bg-transparent shadow-none",
            ponteiroGrosso
              ? "h-[18px] w-[18px] [&_svg]:h-[14px] [&_svg]:w-[14px]"
              : "h-[13px] w-[13px] [&_svg]:hidden max-[559px]:h-[14px] max-[559px]:w-[14px]",
          )}
        />
      </div>

      {/* Menu "⋮": só o que é exclusivo dele (Excluir). */}
      {canDeleteContact(contact) && (
        <div
          className="absolute top-3 right-11 z-[3] max-[559px]:right-[46px]"
          onClick={(e) => e.stopPropagation()}
        >
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="w-8 h-8 text-[hsl(228_20%_92%)] hover:bg-[hsl(0_0%_100%/0.14)]" aria-label={`Ações do contato ${contact.name}`}>
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

      {/* Retrato grande (design) — foto ou iniciais */}
      <div className="relative isolate">
        <button
          type="button"
          className="group/photo block w-full relative overflow-hidden rounded-t-[12px] bg-[hsl(var(--contacts-raised))] text-left h-[338px] sm:h-[311px] lg:h-[285px] xl:h-[296px] 2xl:h-[308px]"
          onClick={(e) => { e.stopPropagation(); onOpenDetails(contact.id); }}
          aria-label={`Abrir ${display.nomeCompleto ?? contact.name}`}
        >
          <ContactPortrait contact={contact} className="h-full w-full" />
          <span className="pointer-events-none absolute inset-0" style={{ background: 'linear-gradient(180deg, hsl(0 0% 0% / 0.08) 0%, transparent 40%, transparent 66%, hsl(0 0% 0% / 0.85) 100%)' }} />

          <span className="pointer-events-none absolute top-3 left-3 z-[2] max-[559px]:top-[14px] max-[559px]:left-[14px]">
            <ContactTypeBadge type={contact.contact_type} size="overlay" />
          </span>

          <span className="absolute left-[15px] bottom-4 z-[2] flex max-w-[calc(100%-69px)] items-center gap-1.5 text-[11px] text-[hsl(228_20%_96%)] max-[559px]:left-[17px] max-[559px]:bottom-[19px]">
            <MapPin className="w-[13px] h-[13px] shrink-0" />
            <span className="min-w-0 truncate">{display.regiao ?? display.uf ?? 'Localização não informada'}</span>
          </span>

          <span className="pointer-events-none absolute right-[13px] bottom-3 z-[2] grid place-items-center w-[34px] h-[34px] rounded-[9px] text-white max-[559px]:right-[15px] max-[559px]:bottom-[14px] max-[559px]:w-[37px] max-[559px]:h-[37px]"
            style={{ background: 'linear-gradient(145deg, hsl(var(--contacts-blue)), hsl(221 83% 35%))', border: '1px solid hsl(221 83% 70% / 0.4)', boxShadow: '0 3px 13px hsl(0 0% 0% / 0.4)' }}
          >
            <ArrowUpRight className="w-[17px] h-[17px]" />
          </span>
        </button>
      </div>

      {/* Corpo do card — paddings por faixa, como no design */}
      <div className="flex flex-col flex-1 p-4 max-[1399px]:p-[15px_14px_13px] max-[899px]:p-[17px_17px_14px] max-[559px]:p-[18px_19px_16px] 2xl:p-[17px_18px_15px]">
        <HighlightText
          text={display.nomeCompleto ?? contact.name}
          highlight={searchQuery}
          className="font-display text-[24px] font-medium leading-[1.16] tracking-[-0.55px] text-foreground block [overflow-wrap:anywhere] mb-[7px] max-[559px]:text-[27px] 2xl:text-[25px]"
        />
        {display.empresa && (
          <p className="flex items-center gap-[6px] text-xs leading-[1.35] text-[hsl(var(--contacts-ink))] m-0 mb-[7px] max-[559px]:mb-2 max-[559px]:text-[13px] 2xl:text-[13px]">
            <Building2 className="w-[13px] h-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
            <span className="min-w-0 truncate">{display.empresa}</span>
          </p>
        )}
        {display.cargo && (
          <p className="text-xs leading-[1.7] text-[hsl(var(--contacts-muted))] min-h-[41px] m-0 max-[559px]:min-h-0">
            {display.cargo}
          </p>
        )}
        {/* Tags — mesmo padrão do ContactListItem: até 2 + contador do resto */}
        {contact.tags && contact.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-2">
            {contact.tags.slice(0, 2).map(tag => (
              <Badge key={tag} variant="secondary" className="text-3xs h-5 px-1.5">{tag}</Badge>
            ))}
            {contact.tags.length > 2 && (
              <Badge variant="secondary" className="text-3xs h-5 px-1.5">+{contact.tags.length - 2}</Badge>
            )}
          </div>
        )}

        {/* Linhas de contato */}
        <div className="grid gap-[9px] mt-3 pt-[13px] border-t border-[hsl(var(--contacts-soft-line))] max-[559px]:gap-[11px] max-[559px]:mt-[14px] max-[559px]:pt-[15px]">
          {display.telefone && (
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--contacts-ink))] min-w-0 max-[559px]:text-[13px] 2xl:text-[13px]" onClick={(e) => e.stopPropagation()}>
              <Phone className="w-[13px] h-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              <a href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                className="truncate hover:text-primary transition-colors">
                {display.telefone}
              </a>
            </div>
          )}
          {display.email && (
            <div className="flex items-center gap-2 text-xs text-[hsl(var(--contacts-ink))] min-w-0 max-[559px]:text-[13px] 2xl:text-[13px]" onClick={(e) => e.stopPropagation()}>
              <Mail className="w-[13px] h-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              <a href={`mailto:${display.email}`} className="truncate text-muted-foreground hover:text-primary transition-colors">
                {display.email}
              </a>
            </div>
          )}
        </div>

        {/* Completude do cadastro — discreta. */}
        <ContactHealthIndicator input={contact} className="mt-3" />

        {/* "Última interação" — a linha `.zc-last` do design */}
        <div className="flex items-center justify-between gap-[10px] border-t border-[hsl(var(--contacts-soft-line))] text-[11px] text-[hsl(var(--contacts-quiet))] mt-auto pt-[11px] mt-[17px] max-[559px]:mt-[18px] max-[559px]:pt-[13px]">
          <span className="min-w-0 truncate">Última interação</span>
          <strong className="whitespace-nowrap text-[11px] font-normal text-[hsl(var(--contacts-ink))]">{ultimaInteracao}</strong>
        </div>

        {/* Ações rápidas — o design não as tem no card; o sistema sim (contrato
            de ContactPolimento.test.tsx: um botão "Conversar" e um "Editar"). */}
        <div className="mt-2.5 flex shrink-0 items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button variant="outline" size="icon" className="w-9 h-9 rounded-[9px] border border-border bg-card hover:bg-muted hover:border-primary/50"
            onClick={() => onOpenChat(contact.id)} title="Conversar">
            <MessageSquare className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="icon" className="w-9 h-9 rounded-[9px] border border-border bg-card hover:bg-muted hover:border-primary/50"
            onClick={() => onEdit(contact)} title="Editar">
            <Pencil className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}