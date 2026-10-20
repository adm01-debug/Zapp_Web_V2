import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useLayoutEffect, useRef } from 'react';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Phone, Mail, Building, Briefcase, Tag, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { getAvatarColor, getInitials } from '@/lib/avatar-colors';
import type { Contact } from './types';

/**
 * Comparar é uma leitura lado a lado: no máximo 3 contatos (a CT-089 aplica o
 * mesmo limite na seleção do módulo). Menos de 2 não é comparação.
 */
const MAX_CONTATOS = 3;

interface ContactCompareDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contacts: Contact[];
}

const FIELDS: { key: keyof Contact; label: string; icon: React.ReactNode }[] = [
  { key: 'phone', label: 'Telefone', icon: <Phone className="h-3.5 w-3.5" aria-hidden="true" /> },
  { key: 'email', label: 'E-mail', icon: <Mail className="h-3.5 w-3.5" aria-hidden="true" /> },
  { key: 'company', label: 'Empresa', icon: <Building className="h-3.5 w-3.5" aria-hidden="true" /> },
  { key: 'job_title', label: 'Cargo', icon: <Briefcase className="h-3.5 w-3.5" aria-hidden="true" /> },
  { key: 'contact_type', label: 'Tipo', icon: <Tag className="h-3.5 w-3.5" aria-hidden="true" /> },
];

/** Valor de exibição de um campo: string sem espaços nas pontas; o resto é vazio. */
function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor.trim() : valor == null ? '' : String(valor);
}

export function ContactCompareDialog({ open, onOpenChange, contacts }: ContactCompareDialogProps) {
  // Guarda quem tinha o foco antes de abrir para devolvê-lo ao fechar (Esc ou
  // clique fora): a comparação é uma leitura, o foco volta para o gatilho.
  // useLayoutEffect: roda antes do foco automático do Radix entrar no diálogo.
  const focoAnteriorRef = useRef<HTMLElement | null>(null);
  const conteudoRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    if (!open) return;
    const ativo = document.activeElement;
    if (ativo instanceof HTMLElement && !conteudoRef.current?.contains(ativo)) {
      focoAnteriorRef.current = ativo;
    }
  }, [open]);

  if (contacts.length < 2) return null;

  const colunas = contacts.slice(0, MAX_CONTATOS);
  const criadoEm = colunas.map((c) => format(new Date(c.created_at), 'dd/MM/yyyy', { locale: ptBR }));
  const criadoDifere = criadoEm.some((v) => v !== criadoEm[0]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        ref={conteudoRef}
        className="flex max-h-[85vh] w-full max-w-3xl flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
        onCloseAutoFocus={(event) => {
          if (!focoAnteriorRef.current) return;
          event.preventDefault();
          focoAnteriorRef.current.focus();
        }}
      >
        <DialogHeader className="space-y-1 border-b border-border/60 px-5 py-4 text-left">
          <p className="text-2xs font-medium uppercase tracking-wide text-muted-foreground">
            Contatos / Comparação
          </p>
          <DialogTitle className="font-display text-xl">Comparar contatos</DialogTitle>
          <DialogDescription>
            {colunas.length} contatos lado a lado. As diferenças ficam destacadas.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th
                    scope="col"
                    className="w-32 px-4 py-3 text-left text-2xs font-medium uppercase tracking-wide text-muted-foreground"
                  >
                    Dados
                  </th>
                  {colunas.map((c) => (
                    <th key={c.id} scope="col" className="px-4 py-3 text-center align-top">
                      <div className="mx-auto flex min-w-0 flex-col items-center gap-2">
                        <Avatar className="h-11 w-11">
                          <AvatarImage src={c.avatar_url || undefined} alt={c.name || 'Avatar'} />
                          <AvatarFallback className={cn(getAvatarColor(c.name).bg, getAvatarColor(c.name).text)}>
                            {getInitials(c.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="max-w-[12rem] truncate font-display text-sm font-semibold text-foreground">
                          {texto(c.name) || '—'}
                        </span>
                        {texto(c.contact_type) && (
                          <Badge variant="secondary" className="text-2xs">
                            {texto(c.contact_type)}
                          </Badge>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELDS.map((field) => {
                  const valores = colunas.map((c) => texto(c[field.key]));
                  const difere = valores.some((v) => v !== valores[0]);

                  return (
                    <tr
                      key={field.key}
                      data-diff={difere ? 'true' : undefined}
                      className={cn('border-b border-border/60', difere && 'bg-primary/5')}
                    >
                      <th scope="row" className="px-4 py-3 text-left align-middle">
                        <span className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                          {field.icon}
                          {field.label}
                        </span>
                      </th>
                      {colunas.map((c, i) => {
                        const valor = valores[i];
                        const celulaDifere = difere && valor !== valores[0];
                        return (
                          <td
                            key={c.id}
                            data-diff={celulaDifere ? 'true' : undefined}
                            className={cn(
                              'px-4 py-3 text-center align-middle',
                              celulaDifere ? 'font-medium text-primary' : 'text-foreground',
                            )}
                          >
                            {valor || (
                              <span className="italic text-muted-foreground/50" aria-label="Não informado">
                                —
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                <tr
                  data-diff={criadoDifere ? 'true' : undefined}
                  className={cn('border-b border-border/60', criadoDifere && 'bg-primary/5')}
                >
                  <th scope="row" className="px-4 py-3 text-left align-middle">
                    <span className="flex items-center gap-2 text-2xs font-medium uppercase tracking-wide text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      Criado em
                    </span>
                  </th>
                  {colunas.map((c, i) => {
                    const celulaDifere = criadoDifere && criadoEm[i] !== criadoEm[0];
                    return (
                      <td
                        key={c.id}
                        data-diff={celulaDifere ? 'true' : undefined}
                        className={cn(
                          'px-4 py-3 text-center align-middle',
                          celulaDifere ? 'font-medium text-primary' : 'text-foreground',
                        )}
                      >
                        {criadoEm[i]}
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
