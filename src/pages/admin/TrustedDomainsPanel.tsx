import { useId, useMemo, useState } from 'react';
import {
  Globe2, Plus, Trash2, Loader2, AlertTriangle, RotateCw, ShieldCheck, ShieldX,
} from 'lucide-react';
import { toast } from 'sonner';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useProvisionamentoRecente, useTrustedDomains } from './useTrustedDomains';
import {
  TRUSTED_DOMAINS_FALLBACK,
  dominiosEfetivos,
  normalizarDominio,
  serializeTrustedDomains,
  validarDominio,
} from './trustedDomains';

function formatarData(iso: string | null): string {
  if (!iso) return '—';
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return '—';
  return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

export function TrustedDomainsPanel() {
  const inputId = useId();
  const erroId = useId();
  const { dominios, atualizadoEm, isLoading, error, salvar, refetch } = useTrustedDomains();
  const provisionamento = useProvisionamentoRecente();

  // `null` = o admin ainda não mexeu: o rascunho É o que está no banco. Evita
  // copiar o valor para o estado dentro de um efeito (e o rascunho nunca fica
  // preso num valor antigo depois de um refetch).
  const [editado, setEditado] = useState<string[] | null>(null);
  const [novo, setNovo] = useState('');
  const [erroNovo, setErroNovo] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const rascunho = editado ?? dominios;
  const valorSalvo = useMemo(() => serializeTrustedDomains(dominios), [dominios]);
  const alterado = serializeTrustedDomains(rascunho) !== valorSalvo;
  const efetivos = dominiosEfetivos(rascunho);

  const adicionar = () => {
    const problema = validarDominio(novo, rascunho);
    if (problema) {
      setErroNovo(problema);
      return;
    }
    setEditado([...rascunho, normalizarDominio(novo)]);
    setNovo('');
    setErroNovo(null);
  };

  const remover = (dominio: string) => {
    setEditado(rascunho.filter((d) => d !== dominio));
    setErroNovo(null);
  };

  const gravar = async () => {
    setSalvando(true);
    try {
      await salvar(rascunho);
      setEditado(null);
      toast.success('Domínios confiáveis atualizados');
    } catch (falha) {
      const mensagem = falha instanceof Error ? falha.message : String(falha);
      toast.error('Não foi possível salvar os domínios', { description: mensagem });
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <Globe2 className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base">Domínios confiáveis do cadastro automático</CardTitle>
              <CardDescription className="text-xs">
                Quem se cadastra com e-mail de um domínio desta lista recebe o papel Agente
                automaticamente; os demais entram sem papel e ficam registrados como recusados.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-destructive/40 p-6 text-center space-y-3" role="alert">
              <AlertTriangle className="w-8 h-8 mx-auto text-destructive" />
              <div>
                <p className="font-medium">Não foi possível carregar os domínios</p>
                <p className="text-sm text-muted-foreground break-words">{error}</p>
              </div>
              <Button variant="outline" onClick={() => { void refetch(); }}>
                <RotateCw className="w-4 h-4 mr-2" />
                Tentar novamente
              </Button>
            </div>
          ) : (
            <>
              <ul className="space-y-2" aria-label="Domínios confiáveis">
                {rascunho.length === 0 && (
                  <li className="text-sm text-muted-foreground">
                    Nenhum domínio na lista. Enquanto estiver vazia, o cadastro aceita o padrão do
                    banco: <span className="font-medium">{TRUSTED_DOMAINS_FALLBACK}</span>.
                  </li>
                )}
                {rascunho.map((dominio) => (
                  <li
                    key={dominio}
                    className="flex items-center justify-between p-2 rounded-lg bg-muted/40"
                  >
                    <span className="font-mono text-sm">{dominio}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => remover(dominio)}
                      aria-label={`Remover ${dominio}`}
                      disabled={salvando}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                ))}
              </ul>

              <div className="space-y-1">
                <div className="flex flex-col sm:flex-row gap-2">
                  <label htmlFor={inputId} className="sr-only">
                    Novo domínio confiável
                  </label>
                  <Input
                    id={inputId}
                    placeholder="empresa.com.br"
                    value={novo}
                    onChange={(e) => { setNovo(e.target.value); setErroNovo(null); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
                    aria-invalid={erroNovo ? true : undefined}
                    aria-describedby={erroNovo ? erroId : undefined}
                    className="max-w-sm font-mono"
                    disabled={salvando}
                  />
                  <Button variant="outline" onClick={adicionar} disabled={salvando}>
                    <Plus className="w-4 h-4 mr-2" />
                    Adicionar
                  </Button>
                </div>
                {erroNovo && (
                  <p id={erroId} className="text-sm text-destructive" role="alert">
                    {erroNovo}
                  </p>
                )}
              </div>

              {rascunho.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  A comparação é exata: <code className="font-mono">@sub.{efetivos[0]}</code> não
                  entra por causa de <code className="font-mono">@{[efetivos[0]]}</code> — cadastre o
                  subdomínio por inteiro se for o caso.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button onClick={() => { void gravar(); }} disabled={!alterado || salvando}>
                  {salvando ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Salvar domínios
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => { setEditado(null); setNovo(''); setErroNovo(null); }}
                  disabled={!alterado || salvando}
                >
                  Descartar alterações
                </Button>
                <span className="text-xs text-muted-foreground ml-auto">
                  Última gravação: {formatarData(atualizadoEm)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Cadastros aceitos e recusados</CardTitle>
          <CardDescription className="text-xs">
            Registro automático de `role_auto_provisioned` e `role_auto_provision_denied` em
            audit_logs — a prova de que a regra rodou para cada usuário novo.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {provisionamento.isLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : provisionamento.error ? (
            <p className="text-sm text-destructive" role="alert">{provisionamento.error}</p>
          ) : provisionamento.eventos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cadastro passou pela regra ainda.</p>
          ) : (
            <ul className="space-y-2">
              {provisionamento.eventos.map((evento) => {
                const aceito = evento.action === 'role_auto_provisioned';
                return (
                  <li key={evento.id} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-muted/40">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{evento.email ?? '—'}</p>
                      <p className="text-xs text-muted-foreground">
                        {evento.dominio ?? '—'} · {formatarData(evento.created_at)}
                      </p>
                    </div>
                    <Badge variant={aceito ? 'secondary' : 'destructive'} className="flex-shrink-0 gap-1">
                      {aceito ? <ShieldCheck className="w-3 h-3" /> : <ShieldX className="w-3 h-3" />}
                      {aceito ? 'Agente' : 'Recusado'}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}