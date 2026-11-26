import { useMemo, useState } from 'react';
import { AlertTriangle, EyeOff, Lock, Printer, RefreshCw, ShieldCheck, Users, Droplets } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  CONTACT_PROTECTION_DEFAULTS,
  CONTACT_PROTECTION_FIELDS,
  CONTACT_PROTECTION_GLOBAL_LABEL,
  CONTACT_PROTECTION_ORIGIN_LABELS,
  CONTACT_PROTECTION_SCOPE_LABELS,
  CONTACT_PROTECTION_SCOPES,
  useContactProtectionPolicies,
  useDeleteContactProtectionPolicy,
  useMyContactProtectionPolicy,
  useSaveContactProtectionPolicy,
  pickProtectionValues,
  type ContactProtectionPolicy,
  type ContactProtectionScope,
  type ContactProtectionValues,
} from '@/hooks/security/useContactProtectionPolicy';

const ICONES: Record<string, typeof Lock> = {
  mascararContato: EyeOff,
  bloquearCopia: Lock,
  bloquearImpressao: Printer,
  marcaDagua: Droplets,
};

const resumo = (valores: ContactProtectionValues): string => {
  const partes = CONTACT_PROTECTION_FIELDS.map(
    (campo) => `${campo.rotulo}: ${valores[campo.chave] ? 'ligado' : 'desligado'}`,
  );
  return `${partes.join(' · ')} · ${valores.limiteFichasHora} fichas/hora`;
};

interface EditorProps {
  /** Identificador estável do escopo, usado nos testids (`global`, `admin`, ...). */
  escopoId: string;
  rotulo: string;
  /** Linha existente; ausente = o escopo só herda o padrão. */
  policy: ContactProtectionPolicy | null;
  /** O que o escopo herda hoje (global ou o padrão embutido). */
  herdado: ContactProtectionValues;
  ehGlobal: boolean;
  salvando: boolean;
  removendo: boolean;
  onSalvar: (valores: ContactProtectionValues) => void;
  onRemover?: () => void;
}

function EscopoEditor({
  escopoId,
  rotulo,
  policy,
  herdado,
  ehGlobal,
  salvando,
  removendo,
  onSalvar,
  onRemover,
}: EditorProps) {
  const [criando, setCriando] = useState(false);
  const base = pickProtectionValues(policy ?? herdado);
  const [valores, setValores] = useState<ContactProtectionValues>(base);

  const editando = ehGlobal || policy !== null || criando;
  const mudou =
    valores.bloquearCopia !== base.bloquearCopia ||
    valores.bloquearImpressao !== base.bloquearImpressao ||
    valores.marcaDagua !== base.marcaDagua ||
    valores.mascararContato !== base.mascararContato ||
    valores.limiteFichasHora !== base.limiteFichasHora;
  const limiteValido = Number.isFinite(valores.limiteFichasHora) && valores.limiteFichasHora >= 0;

  return (
    <div
      className="rounded-lg border border-border p-4"
      data-testid={`protecao-escopo-${escopoId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {ehGlobal ? (
            <ShieldCheck className="h-4 w-4 text-primary" />
          ) : (
            <Users className="h-4 w-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">{rotulo}</span>
          <Badge variant="secondary" className="text-[11px]">
            {policy ? 'regra própria' : 'usando o padrão do sistema'}
          </Badge>
        </div>
        {!editando ? (
          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs"
            data-testid={`protecao-definir-${escopoId}`}
            onClick={() => {
              setValores(herdado);
              setCriando(true);
            }}
          >
            Definir regra própria
          </Button>
        ) : null}
      </div>

      {!editando ? (
        <p className="mt-2 text-xs text-muted-foreground">{resumo(herdado)}</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {CONTACT_PROTECTION_FIELDS.map((campo) => {
              const Icone = ICONES[campo.chave] ?? Lock;
              const ligado = Boolean(valores[campo.chave]);
              return (
                <div key={campo.chave} className="flex items-start gap-3">
                  <Switch
                    id={`${rotulo}-${campo.chave}`}
                    checked={ligado}
                    aria-label={campo.rotulo}
                    data-testid={`protecao-${campo.chave}-${escopoId}`}
                    onCheckedChange={(novo) =>
                      setValores((atual) => ({ ...atual, [campo.chave]: novo }))
                    }
                  />
                  <div>
                    <Label htmlFor={`${rotulo}-${campo.chave}`} className="flex items-center gap-1.5 text-sm">
                      <Icone className="h-3.5 w-3.5 text-muted-foreground" />
                      {campo.rotulo}
                    </Label>
                    <p className="text-xs text-muted-foreground">{campo.ajuda}</p>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div>
              <Label htmlFor={`${rotulo}-limite`} className="text-sm">
                Fichas de contato por hora
              </Label>
              <Input
                id={`${rotulo}-limite`}
                type="number"
                min={0}
                className="mt-1 h-9 w-32"
                data-testid={`protecao-limite-${escopoId}`}
                value={String(valores.limiteFichasHora)}
                onChange={(e) => {
                  setValores((atual) => ({
                    ...atual,
                    limiteFichasHora: Math.max(0, Number(e.target.value) || 0),
                  }));
                }}
              />
              <p className="mt-1 text-xs text-muted-foreground">0 = nenhuma ficha liberada.</p>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                className="h-9"
                data-testid={`protecao-salvar-${escopoId}`}
                disabled={salvando || !limiteValido || (!mudou && policy !== null)}
                onClick={() => onSalvar(valores)}
              >
                {salvando ? <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" /> : null}
                {policy ? 'Salvar regra' : ehGlobal ? 'Criar padrão do sistema' : 'Criar regra'}
              </Button>
              {onRemover && policy ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs text-destructive"
                  data-testid={`protecao-remover-${escopoId}`}
                  disabled={removendo}
                  onClick={onRemover}
                >
                  Remover exceção
                </Button>
              ) : null}
              {ehGlobal && policy ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 text-xs"
                  data-testid={`protecao-restaurar-${escopoId}`}
                  disabled={salvando}
                  onClick={() => setValores(CONTACT_PROTECTION_DEFAULTS)}
                >
                  Restaurar padrão
                </Button>
              ) : null}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Tela da política de proteção de contatos (CT-091).
 *
 * Mostra o que está valendo para quem está logado — resolvido pela RPC
 * `get_my_protection_policy` (papel > global > padrão), que até agora não era chamada por ninguém
 * — e permite ao admin editar o padrão do sistema e a exceção de cada papel.
 */
export const ContactProtectionPolicyPanel = () => {
  const { policies, isLoading, isError, isFetching, refetch } = useContactProtectionPolicies();
  const { policy: minha, isLoading: carregandoMinha } = useMyContactProtectionPolicy();
  const salvar = useSaveContactProtectionPolicy();
  const remover = useDeleteContactProtectionPolicy();

  const porEscopo = useMemo(() => {
    const mapa = new Map<string, ContactProtectionPolicy>();
    for (const p of policies) mapa.set(p.scopeRole ?? 'global', p);
    return mapa;
  }, [policies]);

  const global = porEscopo.get('global') ?? null;
  const efetivoGlobal: ContactProtectionValues = global
    ? pickProtectionValues(global)
    : CONTACT_PROTECTION_DEFAULTS;

  const salvarEscopo = (scopeRole: ContactProtectionScope | null, valores: ContactProtectionValues) => {
    const existente = porEscopo.get(scopeRole ?? 'global') ?? null;
    salvar.mutate({ id: existente?.id ?? null, scopeRole, valores });
  };

  if (isLoading) {
    return (
      <Card className="p-5" data-testid="protecao-carregando">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card className="p-5 text-center" data-testid="protecao-erro">
        <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-destructive" />
        <h3 className="text-sm font-semibold text-foreground">
          Não foi possível ler a política de proteção
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          A leitura das regras exige papel de administrador.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => refetch()}>
          <RefreshCw className="mr-2 h-3.5 w-3.5" />
          Tentar de novo
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="p-5" data-testid="protecao-painel">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Proteção de contatos
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Regra do sistema, gravada no banco e resolvida por papel — não é decisão do navegador.
              Com mais de um papel, vale o de maior privilégio.
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 gap-1 text-xs"
            data-testid="protecao-atualizar"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Atualizar
          </Button>
        </div>

        <div className="mt-4 rounded-lg bg-muted/40 p-3" data-testid="protecao-efetiva">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">Valendo para você</span>
            {carregandoMinha ? (
              <Skeleton className="h-5 w-24" />
            ) : minha ? (
              <Badge variant="secondary" className="text-[11px]">
                {CONTACT_PROTECTION_ORIGIN_LABELS[minha.origem]}
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px]">
                não foi possível ler
              </Badge>
            )}
            {isFetching ? <span className="text-xs text-muted-foreground">Atualizando…</span> : null}
          </div>
          {minha ? (
            <p className="mt-1 text-xs text-muted-foreground" data-testid="protecao-efetiva-resumo">
              {resumo(minha)}
            </p>
          ) : null}
        </div>

        <div className="mt-4 space-y-4">
          <EscopoEditor
            key={`global-${global?.updatedAt ?? 'novo'}`}
            escopoId="global"
            rotulo={CONTACT_PROTECTION_GLOBAL_LABEL}
            policy={global}
            herdado={CONTACT_PROTECTION_DEFAULTS}
            ehGlobal
            salvando={salvar.isPending}
            removendo={remover.isPending}
            onSalvar={(valores) => salvarEscopo(null, valores)}
          />

          {CONTACT_PROTECTION_SCOPES.map((papel) => {
            const policy = porEscopo.get(papel) ?? null;
            return (
              <EscopoEditor
                key={`${papel}-${policy?.updatedAt ?? 'sem-regra'}`}
                escopoId={papel}
                rotulo={CONTACT_PROTECTION_SCOPE_LABELS[papel]}
                policy={policy}
                herdado={efetivoGlobal}
                ehGlobal={false}
                salvando={salvar.isPending}
                removendo={remover.isPending}
                onSalvar={(valores) => salvarEscopo(papel, valores)}
                onRemover={
                  policy
                    ? () => {
                        remover.mutate(policy.id);
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      </Card>
    </div>
  );
};
