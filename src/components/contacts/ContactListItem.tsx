import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  MessageSquare, Edit, Trash2, MoreVertical, Phone, Mail,
  Building2, ArrowUpRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { usePointerCoarse } from '@/components/tasks/shared/pointerMedia';
import { HighlightText } from './HighlightText';
import { ContactPortrait } from './ContactPortrait';
import { toContactDisplay } from './contactDisplay';
import { canDeleteContact } from './contactPermissions';
import type { ContactItemProps } from './types';

/**
 * ZD-061 — linha horizontal da lista, no visual de
 * `docs/design/contatos-redesign-2026-10-12` (`.zc-list .zc-contact`): retrato à
 * esquerda e corpo em 4 colunas (nome+empresa, cargo, canais, última interação).
 *
 * O alinhamento entre linhas continua vindo de um `grid` no root com trilhas
 * determinísticas (`auto` + `minmax(0,1fr)`) — nada de largura vinda do conteúdo de
 * cada linha (contrato de ContactListItemGrid.test.tsx). Selo de tipo e localização
 * não aparecem nesta visão: o design os esconde com `display:none` na lista.
 */
export function ContactListItem({
  contact, isSelected, onToggleSelect, onOpenDetails, onOpenChat, onEdit, onDelete, companyName, searchQuery,
}: ContactItemProps) {
  const display = toContactDisplay(contact, { companyName });
  // Sem `:hover` real (toque) o `group-hover` nao dispara e as acoes ficariam
  // inacessiveis. No ponteiro grosso elas nascem visiveis; no desktop seguem no hover e
  // no foco de teclado (`focus-within`).
  const ponteiroGrosso = usePointerCoarse();
  const ultimaInteracao = display.ultimoContato ?? 'Não registrada';

  return (
    <div
      data-testid="contact-list-item"
      data-contact-nav="item"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenDetails(contact.id); } }}
      className={cn(
        "group relative grid grid-cols-[auto_minmax(0,1fr)] items-center gap-[13px] p-[9px] rounded-[10px]",
        "border border-border/70 bg-card card-lift card-glow cursor-pointer",
        "max-[559px]:gap-[10px]",
        isSelected && "ring-1 ring-primary border-primary/60 bg-primary/5"
      )}
      onClick={() => onOpenDetails(contact.id)}
    >
      {/* Retrato (`.zc-list .zc-photo-wrap` / `.zc-photo-button`): 82x102, e 73x119 no
          celular. A seta do design (`.zc-photo-open`) fica no canto inferior direito e
          cede lugar aos botoes de acao quando eles aparecem no hover/foco. */}
      <div className="relative isolate w-[82px] shrink-0 max-[559px]:w-[73px]">
        <button
          type="button"
          className="group/photo relative block h-[102px] w-full overflow-hidden rounded-[7px] bg-[hsl(var(--contacts-raised))] text-left max-[559px]:h-[119px]"
          onClick={(e) => { e.stopPropagation(); onOpenDetails(contact.id); }}
          aria-label={`Abrir ${display.nomeCompleto ?? contact.name}`}
        >
          <ContactPortrait
            contact={contact}
            className="h-full w-full"
            initialsClassName="text-[26px] tracking-[-1px]"
          />
          <span
            className="pointer-events-none absolute inset-0"
            style={{ background: 'linear-gradient(180deg, hsl(0 0% 0% / 0.06) 0%, transparent 42%, transparent 62%, hsl(0 0% 0% / 0.55) 100%)' }}
          />
          <span
            className="pointer-events-none absolute right-[5px] bottom-[5px] z-[2] grid h-[23px] w-[23px] place-items-center rounded-[6px] text-white"
            style={{
              background: 'linear-gradient(145deg, hsl(var(--contacts-blue)), hsl(221 83% 35%))',
              border: '1px solid hsl(221 83% 70% / 0.4)',
            }}
          >
            <ArrowUpRight className="h-3 w-3" />
          </span>
        </button>

        {/* Acoes rapidas — o design nao as tem na lista; o sistema sim (contrato de
            controlesToque.test.tsx). */}
        <div
          className={cn(
            "absolute right-[5px] bottom-[5px] z-[3] flex items-center gap-1 transition-opacity focus-within:opacity-100",
            ponteiroGrosso ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="outline"
            size="icon"
            className="h-[23px] w-[23px] rounded-[6px] border border-[hsl(0_0%_100%/0.18)] bg-[hsl(240_5%_13%/0.9)] text-[hsl(228_20%_92%)] hover:border-primary/60 hover:bg-[hsl(240_5%_13%)]"
            onClick={() => onOpenChat(contact.id)}
            title="Conversar"
          >
            <MessageSquare className="h-3 w-3" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="h-[23px] w-[23px] rounded-[6px] border border-[hsl(0_0%_100%/0.18)] bg-[hsl(240_5%_13%/0.9)] text-[hsl(228_20%_92%)] hover:border-primary/60 hover:bg-[hsl(240_5%_13%)]"
                aria-label={`Ações do contato ${contact.name}`}
              >
                <MoreVertical className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              <DropdownMenuItem onClick={() => onEdit(contact)}>
                <Edit className="mr-2 h-3.5 w-3.5" />Editar
              </DropdownMenuItem>
              {/* Item so aparece quando o usuario pode excluir ESTE contato (a permissao
                  vem do banco em `contact.can_delete`). */}
              {canDeleteContact(contact) && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDelete(contact)}>
                    <Trash2 className="mr-2 h-3.5 w-3.5" />Excluir
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Corpo (`.zc-list .zc-contact-body`): 4 colunas no desktop, 3 no medio (a
          "ultima interacao" sai), 2 no tablet (nome cima, canais ao lado) e 1 no
          celular (cargo e ultima interacao saem). */}
      <div data-testid="contact-list-item-body" className="grid min-w-0 grid-cols-[1.1fr_1fr_1.4fr_120px] items-center gap-[18px] py-1 pr-[10px] max-[1199px]:grid-cols-[1.1fr_1fr_1.2fr] max-[1199px]:gap-[14px] max-[899px]:grid-cols-[1fr_1fr] max-[899px]:gap-[8px_15px] max-[559px]:grid-cols-1 max-[559px]:gap-[9px] max-[559px]:pr-1">
        {/* 1. Nome + empresa (+ etiquetas, que o sistema tem e o design nao) */}
        <div className="min-w-0">
          <HighlightText
            text={display.nomeCompleto ?? contact.name}
            highlight={searchQuery}
            className="mb-[7px] block font-display text-[20px] font-medium leading-[1.2] tracking-[-0.4px] text-foreground [overflow-wrap:anywhere] max-[559px]:text-[21px]"
          />
          {display.empresa && (
            <p className="m-0 flex items-center gap-1.5 text-[11px] leading-[1.35] text-[hsl(var(--contacts-ink))]">
              <Building2 className="h-[13px] w-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              <span className="min-w-0 truncate">{display.empresa}</span>
            </p>
          )}
          {contact.tags && contact.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {contact.tags.slice(0, 2).map((tag) => (
                <Badge key={tag} variant="secondary" className="h-[18px] px-1.5 text-3xs">{tag}</Badge>
              ))}
              {contact.tags.length > 2 && (
                <Badge variant="secondary" className="h-[18px] px-1.5 text-3xs">+{contact.tags.length - 2}</Badge>
              )}
            </div>
          )}
        </div>

        {/* 2. Cargo (`.zc-job`) */}
        <p className="m-0 min-h-0 text-[11px] leading-[1.7] text-[hsl(var(--contacts-muted))] max-[899px]:col-start-1 max-[899px]:row-start-2 max-[559px]:hidden">
          {display.cargo ?? ''}
        </p>

        {/* 3. Canais (`.zc-contact-lines` sem borda e sem padding na lista) */}
        <div className="grid min-w-0 gap-1 max-[899px]:col-start-2 max-[899px]:row-span-2 max-[899px]:row-start-1 max-[559px]:col-start-1 max-[559px]:row-span-1 max-[559px]:row-start-auto max-[559px]:gap-1.5">
          {display.telefone && (
            <div className="flex min-w-0 items-center gap-2 text-xs text-[hsl(var(--contacts-ink))] max-[559px]:text-[11px]" onClick={(e) => e.stopPropagation()}>
              <Phone className="h-[13px] w-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              <a
                href={`https://wa.me/${contact.phone.replace(/\D/g, '')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate transition-colors hover:text-primary"
                title={display.telefone}
              >
                {display.telefone}
              </a>
            </div>
          )}
          {display.email && (
            <div className="flex min-w-0 items-center gap-2 text-xs text-[hsl(var(--contacts-ink))] max-[559px]:text-[11px]" onClick={(e) => e.stopPropagation()}>
              <Mail className="h-[13px] w-[13px] shrink-0 text-[hsl(var(--contacts-quiet))]" />
              <a
                href={`mailto:${display.email}`}
                className="truncate text-[hsl(var(--contacts-muted))] transition-colors hover:text-primary"
                title={display.email}
              >
                {display.email}
              </a>
            </div>
          )}
        </div>

        {/* 4. Ultima interacao (`.zc-last`) — sai no medio e no celular, como no design */}
        <div className="grid min-w-0 gap-[5px] text-[11px] text-[hsl(var(--contacts-quiet))] max-[1199px]:hidden">
          <span className="truncate">Última interação</span>
          <strong className="truncate text-[11px] font-normal text-[hsl(var(--contacts-ink))]" title={ultimaInteracao}>
            {ultimaInteracao}
          </strong>
        </div>

        {/* Selecao (`.zc-list .zc-card-selection`): 21x21 no canto superior direito da
            LINHA — por isso vive dentro do corpo sem ancestral posicionado, ancorando no
            root (`relative`). Continua oculta no ponteiro fino ate hover/foco. */}
        <div
          className={cn(
            "absolute top-[5px] right-[5px] z-[3] grid h-[21px] w-[21px] place-items-center rounded-[5px] border border-[hsl(0_0%_100%/0.23)] bg-[hsl(240_10%_8%/0.76)] shadow-[0_2px_8px_hsl(0_0%_0%/0.25)] transition-opacity focus-within:opacity-100",
            ponteiroGrosso && "h-[38px] w-[38px] rounded-[9px]",
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
                : "h-[11px] w-[11px] [&_svg]:hidden"
            )}
          />
        </div>
      </div>
    </div>
  );
}