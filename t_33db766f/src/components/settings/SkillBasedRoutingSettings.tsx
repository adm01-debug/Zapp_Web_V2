import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/ui/use-toast';
import { Plus, X, Brain, Users, Star } from 'lucide-react';

const SKILL_SUGGESTIONS = [
  'Português', 'Inglês', 'Espanhol', 'Suporte Técnico', 'Vendas',
  'Financeiro', 'Cobrança', 'Onboarding', 'Premium', 'Reclamações'
];

export function SkillBasedRoutingSettings() {
  const queryClient = useQueryClient();
  const [newSkill, setNewSkill] = useState('');
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedQueue, setSelectedQueue] = useState<string>('');
  const [newQueueSkill, setNewQueueSkill] = useState('');
  const [newQueueMinLevel, setNewQueueMinLevel] = useState(1);

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-skills'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, name').eq('is_active', true);
      return data || [];
    },
  });

  const { data: queues = [] } = useQuery({
    queryKey: ['queues-for-skills'],
    queryFn: async () => {
      const { data } = await supabase.from('queues').select('id, name, color').eq('is_active', true);
      return data || [];
    },
  });

  const { data: agentSkills = [] } = useQuery({
    queryKey: ['agent-skills', selectedProfile],
    queryFn: async () => {
      if (!selectedProfile) return [];
      const { data } = await supabase
        .from('agent_skills')
        .select('*')
        .eq('profile_id', selectedProfile);
      return data || [];
    },
    enabled: !!selectedProfile,
  });

  const { data: queueSkills = [] } = useQuery({
    queryKey: ['queue-skills', selectedQueue],
    queryFn: async () => {
      if (!selectedQueue) return [];
      const { data } = await supabase
        .from('queue_skill_requirements')
        .select('*')
        .eq('queue_id', selectedQueue);
      return data || [];
    },
    enabled: !!selectedQueue,
  });

  const addSkill = useMutation({
    mutationFn: async ({ profileId, skillName, level }: { profileId: string; skillName: string; level: number }) => {
      const { error } = await supabase.from('agent_skills').insert({
        profile_id: profileId,
        skill_name: skillName,
        skill_level: level,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      setNewSkill('');
      toast({ title: 'Skill adicionada com sucesso!' });
    },
  });

  const removeSkill = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('agent_skills').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['agent-skills'] }),
  });

  const addQueueRequirement = useMutation({
    mutationFn: async ({ queueId, skillName, minLevel }: { queueId: string; skillName: string; minLevel: number }) => {
      const { error } = await supabase.from('queue_skill_requirements').insert({
        queue_id: queueId,
        skill_name: skillName,
        min_level: minLevel,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['queue-skills'] });
      setNewQueueSkill('');
      toast({ title: 'Requisito de skill adicionado!' });
    },
  });

  const removeQueueRequirement = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('queue_skill_requirements').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['queue-skills'] }),
  });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          Roteamento por Habilidades
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure habilidades dos agentes e requisitos das filas para distribuição inteligente.
        </p>
      </div>

      {/* Agent Skills Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Users className="w-4 h-4" />
            Habilidades dos Agentes
          </CardTitle>
          <CardDescription>Atribua competências e níveis de proficiência a cada agente.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedProfile} onValueChange={setSelectedProfile}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um agente" />
            </SelectTrigger>
            <SelectContent>
              {profiles.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedProfile && (
            <>
              <div className="flex flex-wrap gap-2">
                {agentSkills.map(skill => (
                  <Badge key={skill.id} variant="secondary" className="gap-1 py-1.5 px-3">
                    {skill.skill_name}
                    <span className="flex items-center gap-0.5 ml-1">
                      {Array.from({ length: skill.skill_level || 1 }).map((_, i) => (
                        <Star key={i} className="w-3 h-3 fill-primary text-primary" />
                      ))}
                    </span>
                    <button onClick={() => removeSkill.mutate(skill.id)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Nome da skill (ex: Inglês)"
                  value={newSkill}
                  onChange={e => setNewSkill(e.target.value)}
                  list="skill-suggestions"
                />
                <datalist id="skill-suggestions">
                  {SKILL_SUGGESTIONS.map(s => <option key={s} value={s} />)}
                </datalist>
                <Select defaultValue="3" onValueChange={v => {}}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(l => (
                      <SelectItem key={l} value={String(l)}>Nível {l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newSkill.trim()) {
                      addSkill.mutate({ profileId: selectedProfile, skillName: newSkill.trim(), level: 3 });
                    }
                  }}
                  disabled={!newSkill.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Queue Requirements Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Brain className="w-4 h-4" />
            Requisitos das Filas
          </CardTitle>
          <CardDescription>Defina quais habilidades são necessárias para atender cada fila.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Select value={selectedQueue} onValueChange={setSelectedQueue}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione uma fila" />
            </SelectTrigger>
            <SelectContent>
              {queues.map(q => (
                <SelectItem key={q.id} value={q.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ backgroundColor: q.color }} />
                    {q.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {selectedQueue && (
            <>
              <div className="flex flex-wrap gap-2">
                {queueSkills.map(req => (
                  <Badge key={req.id} variant="outline" className="gap-1 py-1.5 px-3">
                    {req.skill_name} (min: {req.min_level})
                    <button onClick={() => removeQueueRequirement.mutate(req.id)} className="ml-1 hover:text-destructive">
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Skill necessária"
                  value={newQueueSkill}
                  onChange={e => setNewQueueSkill(e.target.value)}
                  list="skill-suggestions"
                />
                <Select defaultValue="1" onValueChange={v => setNewQueueMinLevel(Number(v))}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(l => (
                      <SelectItem key={l} value={String(l)}>Min: {l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="sm"
                  onClick={() => {
                    if (newQueueSkill.trim()) {
                      addQueueRequirement.mutate({ queueId: selectedQueue, skillName: newQueueSkill.trim(), minLevel: newQueueMinLevel });
                    }
                  }}
                  disabled={!newQueueSkill.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
