import { useState } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { AlertTriangle, Loader2, RefreshCw, Search, ShieldAlert, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  CONTACT_AUDIT_KIND_LABELS,
  CONTACT_AUDIT_KINDS,
  CONTACT_AUDIT_OPERATION_LABELS,
  CONTACT_AUDIT_OPERATIONS,
  CONTACT_AUDIT_PERIOD_LABELS,
  DEFAULT_CONTACT_AUDIT_FILTERS,
  useContactAuditTrail,
  type ContactAuditEvent,
  type ContactAuditFilters,
  type ContactAuditKind,
  type ContactAuditOperation,
  type ContactAuditOperationFilter,
  type ContactAuditPeriod,
} from '@/hooks/security/useContactAuditTrail';
import {
  contactAuditAuthorLabel,
  contactAuditContactLabel,
  contactAuditMarkerTransition,
} from './contactAuditLabels';

const PERIODOS: ContactAuditPeriod[] = [7, 30, 90, 0];

const OPERATION_BADGE: Record<ContactAuditOperation, string> = {
  delete: 'bg-destructive/10 text-destructive',
  purge: 'bg-destructive/15 text-destructive',
  restore: 'bg-success/10 text-success',
  block: 'bg-warning/10 text-warning',
  unblock: 'bg-success/10 text-success',
  update_marker: 'bg-muted text-muted-foreground',
};

const quando = (iso: string): string =>
  formatDistanceToNow(new Date(iso), { addSuffix: true, locale: ptBR });

const vazioPorTipo: Record<ContactAuditKind, { titulo: string; detalhe: string }> = {
  deletion: {
    titulo: 'Nenhuma exclusão no período escolhido',
    detalhe: 'Amplie o período ou limpe a busca para ver o histórico completo.',
  },
  block: {
    titulo: 'Nenhum bloqueio registrado',
    detalhe:
      'A trilha é gravada por trigger sempre que o contato é bloqueado ou desbloqueado — sem registro aqui, ninguém bloqueou contato neste período.',
  },
};

/**
 * Trilha auditável de exclusões/restaurações (`contact_deletion_audit`) e bloqueios/desbloqueios
 * (`contact_block_audit`) de contatos.
 *
 * A tela é a primeira consumidora das duas tabelas: os triggers gravavam autor e momento e nada
 * mostrava. Leitura restrita a admin/supervisão pela RLS das duas tabelas — quem não é staff não
 * recebe linha nenhuma (a tela avisa isso em vez de mostrar vazio enganoso).
 */
export const ContactAuditTrailPanel = () => {
  const [filtros, setFiltros] = useState<ContactAuditFilters>(DEFAULT_CONTACT_AUDIT_FILTERS);
  const [termo, setTermo] = useState('');
  const { eventos, isLoading, isError, isFetching, hasMore, carregandoMais, carregarMais, refetch } =
    useContactAuditTrail(filtros);

  const aplicarBusca = () => {
    setFiltros((atual) => ({ ...atual, search: termo.trim() }));
  };

  return (
    <Card className="p-5" data-testid="trilha-contatos-painel">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
            <UserX className="h-5 w-5 text-primary" />
            Trilha de contatos
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Quem excluiu, restaurou, bloqueou ou desbloqueou um contato — gravado por trigger dentro
            do banco, não pela tela. Visível só para admin e supervisão.
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 text-xs"
          data-testid="trilha-contatos-atualizar"
          onClick={() => refetch()}
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Atualizar
        </Button>
      </div>

      <Tabs
        value={filtros.kind}
        onValueChange={(valor) => {
          if (!valor) return;
          setFiltros((atual) => ({
            ...atual,
            kind: valor as ContactAuditKind,
            operation: 'todas',
          }));
        }}
        className="mt-4"
      >
        <TabsList>
          {CONTACT_AUDIT_KINDS.map((tipo) => (
            <TabsTrigger key={tipo} value={tipo} data-testid={`trilha-aba-${tipo}`}>
              {CONTACT_AUDIT_KIND_LABELS[tipo]}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <select
          aria-label="Operação"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          data-testid="trilha-operacao"
          value={filtros.operation}
          onChange={(evento) =>
            setFiltros((atual) => ({
              ...atual,
              operation: evento.target.value as ContactAuditOperationFilter,
            }))
          }
        >
          <option value="todas">Todas as operações</option>
          {CONTACT_AUDIT_OPERATIONS[filtros.kind].map((operacao) => (
            <option key={operacao} value={operacao}>
              {CONTACT_AUDIT_OPERATION_LABELS[operacao]}
            </option>
          ))}
        </select>

        <select
          aria-label="Período"
          className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground"
          data-testid="trilha-periodo"
          value={String(filtros.period)}
          onChange={(evento) =>
            setFiltros((atual) => ({
              ...atual,
              period: Number(evento.target.value) as ContactAuditPeriod,
            }))
          }
        >
          {PERIODOS.map((periodo) => (
            <option key={periodo} value={String(periodo)}>
              {CONTACT_AUDIT_PERIOD_LABELS[periodo]}
            </option>
          ))}
        </select>

        <div className="flex min-w-[240px] flex-1 items-center gap-2">
          <Input
            aria-label="Buscar contato"
            placeholder="Buscar por nome ou telefone"
            data-testid="trilha-busca"
            value={termo}
            onChange={(evento) => setTermo(evento.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') aplicarBusca();
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1"
            data-testid="trilha-buscar"
            onClick={aplicarBusca}
          >
            <Search className="h-3.5 w-3.5" />
            Buscar
          </Button>
          {filtros.search ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 text-xs"
              data-testid="trilha-limpar"
              onClick={() => {
                setTermo('');
                setFiltros((atual) => ({ ...atual, search: '' }));
              }}
            >
              Limpar
            </Button>
          ) : null}
        </div>
      </div>

      {isLoading ? (
        <div className="mt-4 space-y-2" data-testid="trilha-carregando">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      ) : isError ? (
        <div className="mt-6 text-center" data-testid="trilha-erro">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
          <h3 className="text-sm font-semibold text-foreground">
            Não foi possível carregar a trilha de contatos
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            A leitura é restrita a admin e supervisão. Se você é staff, tente novamente.
          </p>
          <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
            <RefreshCw className="mr-2 h-3.5 w-3.5" />
            Tentar de novo
          </Button>
        </div>
      ) : eventos.length === 0 ? (
        <div className="mt-6 text-center" data-testid="trilha-vazio">
          <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-sm font-semibold text-foreground">
            {vazioPorTipo[filtros.kind].titulo}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">{vazioPorTipo[filtros.kind].detalhe}</p>
        </div>
      ) : (
        <>
          <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
            <span data-testid="trilha-total">
              {eventos.length} registro{eventos.length === 1 ? '' : 's'}
            </span>
            {isFetching ? <span>Atualizando…</span> : null}
          </div>

          <div className="mt-2 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Operação</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Marcador</TableHead>
                  <TableHead>Autor</TableHead>
                  <TableHead>Quando</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {eventos.map((evento: ContactAuditEvent) => (
                  <TableRow key={evento.id} data-testid={`trilha-evento-${evento.id}`}>
                    <TableCell>
                      <Badge className={OPERATION_BADGE[evento.operation]} variant="secondary">
                        {CONTACT_AUDIT_OPERATION_LABELS[evento.operation]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {contactAuditContactLabel(evento)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {contactAuditMarkerTransition(evento)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {contactAuditAuthorLabel(evento)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {quando(evento.performedAt)}
                      <span className="ml-1 opacity-70">
                        {format(new Date(evento.performedAt), 'dd/MM HH:mm', { locale: ptBR })}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {hasMore ? (
            <div className="mt-4 text-center">
              <Button
                variant="outline"
                size="sm"
                data-testid="trilha-carregar-mais"
                disabled={carregandoMais}
                onClick={() => carregarMais()}
              >
                {carregandoMais ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : null}
                Carregar mais
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
};
