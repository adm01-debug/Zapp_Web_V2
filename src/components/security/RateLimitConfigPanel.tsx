import { useState, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Shield, Save, Plus, Trash2, AlertTriangle, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface RateLimitRule {
  id: string;
  name: string;
  endpoint: string;
  max_requests: number;
  window_seconds: number;
  is_active: boolean;
  action: 'block' | 'throttle' | 'alert';
}

const DEFAULT_RULES: Omit<RateLimitRule, 'id'>[] = [
  { name: 'Login', endpoint: '/auth/login', max_requests: 5, window_seconds: 300, is_active: true, action: 'block' },
  { name: 'API Geral', endpoint: '/api/*', max_requests: 100, window_seconds: 60, is_active: true, action: 'throttle' },
  { name: 'Mensagens', endpoint: '/messages/send', max_requests: 30, window_seconds: 60, is_active: true, action: 'throttle' },
  { name: 'Webhooks', endpoint: '/webhooks/*', max_requests: 500, window_seconds: 60, is_active: true, action: 'alert' },
  { name: 'Exportação', endpoint: '/export/*', max_requests: 5, window_seconds: 3600, is_active: true, action: 'block' },
];

export function RateLimitConfigPanel() {
  const [rules, setRules] = useState<RateLimitRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('rate_limit_configs')
      .select('*')
      .order('created_at', { ascending: true });

    if (!error && data && data.length > 0) {
      setRules(data.map(r => ({
        id: r.id,
        name: r.name || r.endpoint_pattern,
        endpoint: r.endpoint_pattern,
        max_requests: r.max_requests,
        window_seconds: r.window_seconds,
        is_active: r.is_active ?? true,
        action: 'block' as RateLimitRule['action'],
      })));
    } else {
      // Initialize with defaults
      setRules(DEFAULT_RULES.map((r, i) => ({ ...r, id: `temp-${i}` })));
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
      action: 'throttle',
    }]);
  };

  const removeRule = (id: string) => {
    setRules(prev => prev.filter(r => r.id !== id));
  };

  const saveRules = async () => {
    setSaving(true);
    try {
      // Delete existing rules
      await supabase.from('rate_limit_configs').delete().neq('id', '00000000-0000-0000-0000-000000000000');

      // Insert updated rules
      const toInsert = rules.map(r => ({
        name: r.name,
        endpoint_pattern: r.endpoint,
        max_requests: r.max_requests,
        window_seconds: r.window_seconds,
        is_active: r.is_active,
      }));

      const { error } = await supabase.from('rate_limit_configs').insert(toInsert);
      if (error) throw error;

      toast.success('Regras de rate limit salvas!');
      await fetchRules();
    } catch (err) {
      toast.error('Erro ao salvar regras');
    } finally {
      setSaving(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'block': return <Badge variant="destructive">Bloquear</Badge>;
      case 'throttle': return <Badge className="bg-warning/10 text-warning border-warning/30">Limitar</Badge>;
      case 'alert': return <Badge variant="outline">Alertar</Badge>;
      default: return null;
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
                  {getActionBadge(rule.action)}
                  <Button variant="ghost" size="icon" onClick={() => removeRule(rule.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
                    onChange={(e) => updateRule(rule.id, { max_requests: parseInt(e.target.value) || 1 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Janela (seg)</Label>
                  <Input
                    type="number"
                    value={rule.window_seconds}
                    onChange={(e) => updateRule(rule.id, { window_seconds: parseInt(e.target.value) || 60 })}
                    className="h-8 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ação</Label>
                  <Select
                    value={rule.action}
                    onValueChange={(v) => updateRule(rule.id, { action: v as RateLimitRule['action'] })}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="block">Bloquear</SelectItem>
                      <SelectItem value="throttle">Limitar</SelectItem>
                      <SelectItem value="alert">Alertar</SelectItem>
                    </SelectContent>
                  </Select>
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
