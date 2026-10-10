import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Plus, Trash2, Loader2, Users, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { motion, AnimatePresence } from 'framer-motion';

interface Profile {
  id: string;
  user_id: string;
  name: string;
  email: string | null;
}

interface Grant {
  id: string;
  agent_id: string;
  can_see_agent_id: string;
  agent_profile?: Profile;
  target_profile?: Profile;
}

export function VisibilityGrantsManager() {
  const [grants, setGrants] = useState<Grant[]>([]);
  const [specialAgents, setSpecialAgents] = useState<Profile[]>([]);
  const [allAgents, setAllAgents] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedSpecialAgent, setSelectedSpecialAgent] = useState('');
  const [selectedTargetAgent, setSelectedTargetAgent] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);

    // Fetch special agents (users with special_agent role)
    const { data: specialAgentRoles } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'special_agent');

    const specialAgentUserIds = specialAgentRoles?.map(r => r.user_id) || [];

    // Fetch all profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, user_id, name, email')
      .order('name');

    if (profiles) {
      setAllAgents(profiles);
      setSpecialAgents(profiles.filter(p => specialAgentUserIds.includes(p.user_id)));
    }

    // Fetch existing grants
    const { data: grantsData } = await supabase
      .from('agent_visibility_grants')
      .select('id, agent_id, can_see_agent_id');

    if (grantsData && profiles) {
      const mapped = grantsData.map(g => ({
        ...g,
        agent_profile: profiles.find(p => p.id === g.agent_id),
        target_profile: profiles.find(p => p.id === g.can_see_agent_id),
      }));
      setGrants(mapped);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddGrant = async () => {
    if (!selectedSpecialAgent || !selectedTargetAgent) return;
    if (selectedSpecialAgent === selectedTargetAgent) {
      toast.error('O agente não pode visualizar a si mesmo');
      return;
    }

    setSaving(true);

    // Get current user's profile for granted_by
    const { data: { user } } = await supabase.auth.getUser();
    let grantedBy: string | undefined;
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();
      grantedBy = profile?.id;
    }

    const { error } = await supabase
      .from('agent_visibility_grants')
      .insert({
        agent_id: selectedSpecialAgent,
        can_see_agent_id: selectedTargetAgent,
        granted_by: grantedBy,
      });

    if (error) {
      if (error.code === '23505') {
        toast.error('Esta permissão já existe');
      } else {
        toast.error('Erro ao adicionar permissão');
      }
    } else {
      toast.success('Permissão de visibilidade adicionada');
      setSelectedTargetAgent('');
      fetchData();
    }
    setSaving(false);
  };

  const handleRemoveGrant = async (grantId: string) => {
    const { error } = await supabase
      .from('agent_visibility_grants')
      .delete()
      .eq('id', grantId);

    if (error) {
      toast.error('Erro ao remover permissão');
    } else {
      toast.success('Permissão removida');
      fetchData();
    }
  };

  // Group grants by special agent
  const grantsByAgent = specialAgents.map(agent => ({
    agent,
    grants: grants.filter(g => g.agent_id === agent.id),
  }));

  // Filter target agents (exclude the selected special agent)
  const availableTargets = allAgents.filter(a => a.id !== selectedSpecialAgent);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (specialAgents.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6 text-center">
          <Star className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">Nenhum Agente Especial</h3>
          <p className="text-muted-foreground text-sm">
            Primeiro atribua a role "Agente Especial" a um usuário na aba Usuários para configurar visibilidade.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Add new grant */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Adicionar Visibilidade</CardTitle>
          <CardDescription>
            Defina quais contatos/chats um Agente Especial pode visualizar além dos seus
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-3 flex-wrap">
            <div className="space-y-2 min-w-[200px] flex-1">
              <label className="text-sm font-medium">Agente Especial</label>
              <Select value={selectedSpecialAgent} onValueChange={setSelectedSpecialAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o agente especial" />
                </SelectTrigger>
                <SelectContent>
                  {specialAgents.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center pb-2">
              <ArrowRight className="w-5 h-5 text-muted-foreground" />
            </div>

            <div className="space-y-2 min-w-[200px] flex-1">
              <label className="text-sm font-medium">Pode ver contatos de</label>
              <Select value={selectedTargetAgent} onValueChange={setSelectedTargetAgent}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o agente alvo" />
                </SelectTrigger>
                <SelectContent>
                  {availableTargets.map(agent => (
                    <SelectItem key={agent.id} value={agent.id}>
                      {agent.name} {agent.email ? `(${agent.email})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleAddGrant}
              disabled={!selectedSpecialAgent || !selectedTargetAgent || saving}
              className="mb-0"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Existing grants grouped by special agent */}
      <div className="grid gap-4 md:grid-cols-2">
        {grantsByAgent.map(({ agent, grants: agentGrants }) => (
          <Card key={agent.id}>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-warning/10 flex items-center justify-center">
                  <Star className="w-4 h-4 text-warning" />
                </div>
                <div>
                  <CardTitle className="text-base">{agent.name}</CardTitle>
                  <CardDescription className="text-xs">{agent.email}</CardDescription>
                </div>
              </div>
              <Badge variant="secondary" className="w-fit">
                <Users className="w-3 h-3 mr-1" />
                Vê {agentGrants.length + 1} agente{agentGrants.length !== 0 ? 's' : ''} (incluindo si mesmo)
              </Badge>
            </CardHeader>
            <CardContent className="space-y-2">
              {agentGrants.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-3">
                  Nenhuma visibilidade extra configurada
                </p>
              ) : (
                <AnimatePresence mode="popLayout">
                  {agentGrants.map(grant => (
                    <motion.div
                      key={grant.id}
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50"
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center">
                          <span className="text-xs font-medium">
                            {grant.target_profile?.name?.charAt(0).toUpperCase() || '?'}
                          </span>
                        </div>
                        <div>
                          <p className="text-sm font-medium">{grant.target_profile?.name}</p>
                          <p className="text-xs text-muted-foreground">{grant.target_profile?.email}</p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveGrant(grant.id)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
