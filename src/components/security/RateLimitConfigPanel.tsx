// Painel admin de rate limiting. Invariante do salvar (R2-AUTH-023): o conjunto novo é
// gravado ANTES de o antigo ser removido — um erro no INSERT não pode esvaziar a tabela.
import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Save, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RateLimitRule {
  id: string;
  name: string;
  endpoint: string;
  max_requests: number;
  window_seconds: number;
  is_active: boolean;
}

const DEFAULT_RULES: Omit<RateLimitRule, 'id'>[] = [
  { name: 'Login', endpoint: '/auth/login', max_requests: 5, window_seconds: 300, is_active: true },
  { name: 'API Geral', endpoint: '/api/*', max_requests: 100, window_seconds: 60, is_active: true },
  { name: 'Mensagens', endpoint: '/messages/send', max_requests: 30, window_seconds: 60, is_active: true },
  { name: 'Webhooks', endpoint: '/webhooks/*', max_requests: 500, window_seconds: 60, is_active: true },
  { name: 'Exportação', endpoint: '/export/*', max_requests: 5, window_seconds: 3600, is_active: true },
];

export function RateLimitConfigPanel() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  // Ids das linhas que estão gravadas hoje no banco. É o único conjunto que o
  // salvar pode remover: sem isso, uma leitura falha viraria "remover tudo".
  const [persistedIds, setPersistedIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rate_limit_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      // R2-AUTH-023: sem saber o que já está gravado, salvar substituiria (ou
      // duplicaria) a configuração do admin — o painel bloqueia o salvamento.
      setRules([]);
      setPersistedIds([]);
      setLoadError(true);
    } else if (data && data.length > 0) {
      setRules(data.map(r => ({
        id: r.id,
        name: r.name || r.endpoint_pattern,
        endpoint: r.endpoint_pattern,
        max_requests: r.max_requests,
        window_seconds: r.window_seconds,
        is_active: r.is_active ?? true,
      })));
      setPersistedIds(data.map(r => r.id));
      setLoadError(false);
    } else {
      // Initialize with defaults
      setRules(DEFAULT_RULES.map((r, i) => ({ ...r, id: `temp-${i}` })));
      setPersistedIds([]);
      setLoadError(false);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    fetchRules();
  }, [fetchRules]);

  const updateRule = (id: string, updates: Partial<RateLimitRule>) => {
    setRules(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const addRule = () => {
    setRules(prev => [...prev, {
      id: `temp-${Date.now()}`,
      name: 'Nova Regra',
      endpoint: '/api/custom',
      max_requests: 60,
      window_seconds: 60,
      is_active: true,
    }]);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const saveRules = async () => {
    const invalid = rules.find(r =>
      r.name.trim() === '' ||
      r.endpoint.trim() === '' ||
      r.max_requests < 1 ||
      r.window_seconds < 1
    );
    if (invalid) {
      toast.error('Preencha nome, endpoint, máximo de requisições e janela antes de salvar');
      return;
    }

    setSaving(true);
    try {
      const toInsert = rules.map(r => ({
        name: r.name.trim(),
        endpoint_pattern: r.endpoint.trim(),
        max_requests: r.max_requests,
        window_seconds: r.window_seconds,
        is_active: r.is_active,
      }));

      // R2-AUTH-023: grava o conjunto novo ANTES de remover o antigo. Antes era
      // DELETE global → INSERT: um erro no INSERT (RLS, rede, validação) deixava
      // a tabela sem nenhuma regra e o admin perdia a configuração inteira.
      const { data: inserted, error: insertError } = await supabase
        .from('rate_limit_configs')
        .insert(toInsert)
        .select('id');

      if (insertError) throw insertError;

      // Só agora remove o conjunto anterior — e só as linhas que foram lidas do
      // banco (as `temp-*` são locais e não existem na tabela).
      if (persistedIds.length > 0) {
        const { error: deleteError } = await supabase
          .from('rate_limit_configs')
          .delete()
          .in('id', persistedIds);

        if (deleteError) {
          // Desfaz o conjunto recém-gravado: melhor voltar ao anterior do que
          // deixar as duas versões acumuladas na tabela.
          const insertedIds = ((inserted ?? []) as Array<{ id: string }>)
            .map(row => row.id)
            .filter(Boolean);
          if (insertedIds.length > 0) {
            const { error: rollbackError } = await supabase
              .from('rate_limit_configs')
              .delete()
              .in('id', insertedIds);
            if (rollbackError) {
              // O desfazer também falhou: os dois conjuntos seguem gravados e é
              // isso que o refetch do catch põe na tela. O aviso diz o que houve.
              toast.error('Erro ao salvar regras: o conjunto anterior e o novo ficaram gravados, revise a lista');
            }
          }
          throw deleteError;
        }
      }

      toast.success('Regras de rate limit salvas!');
      await fetchRules();
    } catch {
      toast.error('Erro ao salvar regras');
      // A tela tem de mostrar o que ficou gravado de fato (inclusive se a
      // limpeza do conjunto recém-gravado também falhou).
      await fetchRules();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (loadError) {
    return (
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Rate Limiting Granular
            </CardTitle>
            <CardDescription>
              Configure limites de requisições por endpoint
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12">
          <AlertTriangle className="w-6 h-6 text-destructive" />
          <p className="text-sm text-muted-foreground text-center">
            Não foi possível carregar as regras. Salvar neste estado apagaria a configuração atual.
          </p>
          <Button variant="outline" size="sm" onClick={fetchRules}>
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Rate Limiting Granular
            </CardTitle>
            <CardDescription>
              Configure limites de requisições por endpoint
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={addRule}>
              <Plus className="w-4 h-4 mr-1" />
              Regra
            </Button>
            <Button size="sm" onClick={saveRules} disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
              Salvar
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {rules.map((rule) => (
            <motion.div
              key={rule.id}
              layout
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className="border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Switch
                    checked={rule.is_active}
                    onCheckedChange={(checked) => updateRule(rule.id, { is_active: checked })}
                  />
                  <div>
                    <Input
                      value={rule.name}
                      onChange={(e) => updateRule(rule.id, { name: e.target.value })}
                      className="h-7 text-sm font-medium border-none bg-transparent p-0"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" onClick={() => removeRule(rule.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Endpoint</Label>
                  <Input
                    value={rule.endpoint}
                    onChange={(e) => updateRule(rule.id, { endpoint: e.target.value })}
                    className="h-8 text-xs font-mono"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Max Requisições</Label>
                  <Input
                    type="number"
                    value={rule.max_requests}
                    onChange={(e) => updateRule(rule.id, { max_requests: Number.parseInt(e.target.value) || 1 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Janela (seg)</Label>
                  <Input
                    type="number"
                    value={rule.window_seconds}
                    onChange={(e) => updateRule(rule.id, { window_seconds: Number.parseInt(e.target.value) || 60 })}
                    className="h-8 text-xs"
                  />
                </div>
              </div>

              {!rule.is_active && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="w-3 h-3" />
                  Regra desativada
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
