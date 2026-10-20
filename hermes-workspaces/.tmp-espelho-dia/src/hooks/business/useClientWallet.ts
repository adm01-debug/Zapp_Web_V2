import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/ui/use-toast';

interface WalletRule {
  id: string;
  name: string;
  agent_id: string;
  whatsapp_connection_id: string | null;
  priority: number;
  is_active: boolean;
  agent?: { name: string };
  connection?: { name: string; phone_number: string } | null;
}

interface Profile { id: string; name: string; }
interface Connection { id: string; name: string; phone_number: string; }

/** De onde veio a última falha registrada pelo hook. */
type WalletErrorSource = 'load' | 'toggle' | 'delete';

export function useClientWallet() {
  const [rules, setRules] = useState<WalletRule[]>([]);
  const [agents, setAgents] = useState<Profile[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 });
  // Falha deixou de ser engolida: a mensagem e a origem sobem para a interface.
  const [error, setError] = useState<string | null>(null);
  const [errorSource, setErrorSource] = useState<WalletErrorSource | null>(null);
  const isError = error !== null;

  const fetchData = useCallback(async () => {
    setLoading(true);
    let falha: string | null = null;
    const anotar = (message: string) => { falha ??= message; };

    const { data: rulesData, error: rulesError } = await supabase
      .from('client_wallet_rules').select('*').order('priority', { ascending: false });

    if (rulesError) {
      anotar(rulesError.message);
    } else if (rulesData) {
      const agentIds = [...new Set(rulesData.map(r => r.agent_id))];
      const connectionIds = [...new Set(rulesData.map(r => r.whatsapp_connection_id).filter(Boolean))] as string[];

      const { data: agentsData, error: agentsError } = await supabase.from('profiles').select('id, name').in('id', agentIds);
      if (agentsError) anotar(agentsError.message);
      const { data: connectionsData, error: connectionsError } = connectionIds.length > 0
        ? await supabase.from('whatsapp_connections').select('id, name, phone_number').in('id', connectionIds)
        : { data: [] as Connection[], error: null };
      if (connectionsError) anotar(connectionsError.message);

      setRules(rulesData.map(rule => ({
        ...rule,
        agent: agentsData?.find(a => a.id === rule.agent_id),
        connection: connectionsData?.find(c => c.id === rule.whatsapp_connection_id),
      })) as WalletRule[]);
    }

    const { data: allAgents, error: allAgentsError } = await supabase.from('profiles').select('id, name').order('name');
    if (allAgentsError) anotar(allAgentsError.message);
    else if (allAgents) setAgents(allAgents);

    const { data: allConnections, error: allConnectionsError } = await supabase.from('whatsapp_connections').select('id, name, phone_number').order('name');
    if (allConnectionsError) anotar(allConnectionsError.message);
    else if (allConnections) setConnections(allConnections);

    if (falha) {
      // A lista que já estava na tela fica onde está; o motivo sobe e é avisado.
      setError(falha);
      setErrorSource('load');
      toast({ title: 'Erro ao carregar as regras da carteira', description: falha, variant: 'destructive' });
    } else {
      setError(null);
      setErrorSource(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddRule = async () => {
    if (!newRule.name || !newRule.agent_id) {
      toast({ title: 'Erro', description: 'Preencha o nome e selecione um vendedor.', variant: 'destructive' });
      return;
    }
    const { error } = await supabase.from('client_wallet_rules').insert({
      name: newRule.name, agent_id: newRule.agent_id,
      whatsapp_connection_id: newRule.whatsapp_connection_id || null, priority: newRule.priority,
    });
    if (error) {
      toast({ title: 'Erro ao criar regra', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Regra criada!', description: 'A regra de carteira foi adicionada.' });
      setIsAddDialogOpen(false);
      setNewRule({ name: '', agent_id: '', whatsapp_connection_id: '', priority: 0 });
      fetchData();
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    // Estado otimista: a tela muda na hora. O valor anterior é lido do estado
    // atual (só leitura) e a escrita é funcional, para não perder mudanças
    // simultâneas de outra linha.
    const anterior = rules.find(r => r.id === id)?.is_active;
    setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: isActive } : r));

    const { error } = await supabase.from('client_wallet_rules').update({ is_active: isActive }).eq('id', id);
    if (error) {
      // Rollback: o banco recusou, então a tela volta ao valor anterior e o
      // motivo é avisado.
      if (anterior !== undefined) {
        setRules(prev => prev.map(r => r.id === id ? { ...r, is_active: anterior } : r));
      }
      setError(error.message);
      setErrorSource('toggle');
      toast({ title: 'Erro ao alterar a regra', description: error.message, variant: 'destructive' });
    } else {
      setError(null);
      setErrorSource(null);
    }
  };

  const handleDeleteRule = async (id: string) => {
    // Estado otimista: sai da lista na hora. Guardamos a posição original para
    // repor no mesmo lugar se o banco recusar.
    const indice = rules.findIndex(r => r.id === id);
    const removida = indice >= 0 ? rules[indice] : undefined;
    setRules(prev => prev.filter(r => r.id !== id));

    const { error } = await supabase.from('client_wallet_rules').delete().eq('id', id);
    if (error) {
      if (removida) {
        setRules(prev => {
          if (prev.some(r => r.id === id)) return prev; // já voltou (outra escrita)
          const next = [...prev];
          next.splice(Math.min(indice, next.length), 0, removida);
          return next;
        });
      }
      setError(error.message);
      setErrorSource('delete');
      toast({ title: 'Erro ao excluir a regra', description: error.message, variant: 'destructive' });
    } else {
      setError(null);
      setErrorSource(null);
      toast({ title: 'Regra excluída', description: 'A regra foi removida com sucesso.' });
    }
  };

  return {
    rules, agents, connections, loading,
    error, isError, errorSource,
    isAddDialogOpen, setIsAddDialogOpen,
    newRule, setNewRule,
    handleAddRule, handleToggleActive, handleDeleteRule,
  };
}

export type { WalletRule, Profile, Connection, WalletErrorSource };
