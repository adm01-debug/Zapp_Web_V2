import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { log } from '@/lib/logger';
import { FloatingParticles } from '@/components/dashboard/FloatingParticles';
import { AuroraBorealis } from '@/components/effects/AuroraBorealis';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, AlertCircle, Settings } from 'lucide-react';
import { QueueCharts } from '@/components/queues/QueueCharts';
import { QueueMetricsCards } from './queue-details/QueueMetricsCards';
import { QueueContactsTable } from './queue-details/QueueContactsTable';

interface QueueDetailsData { id: string; name: string; description: string | null; color: string; max_wait_time_minutes: number; created_at: string; }
interface QueueMember { id: string; profile_id: string; profile: { name: string; avatar_url: string | null; is_active: boolean }; }
interface QueueContact { id: string; name: string; phone: string; avatar_url: string | null; assigned_to: string | null; created_at: string; assigned_agent?: { name: string; avatar_url: string | null }; messages_count: number; last_message_at: string | null; }
interface QueueMetrics { totalContacts: number; assignedContacts: number; waitingContacts: number; avgResponseTime: string; resolvedToday: number; }

export default function QueueDetails() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [queue, setQueue] = useState<QueueDetailsData | null>(null);
  const [members, setMembers] = useState<QueueMember[]>([]);
  const [contacts, setContacts] = useState<QueueContact[]>([]);
  const [metrics, setMetrics] = useState<QueueMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { if (!authLoading && !user) navigate('/auth'); }, [user, authLoading, navigate]);
  useEffect(() => { if (id && user) fetchQueueData(); }, [id, user]);

  const fetchQueueData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      const { data: queueData, error: queueError } = await supabase.from('queues').select('*').eq('id', id).single();
      if (queueError) throw queueError;
      setQueue(queueData);

      const { data: membersData } = await supabase.from('queue_members').select('id, profile_id, profile:profiles(name, avatar_url, is_active)').eq('queue_id', id);
      setMembers(membersData as unknown as QueueMember[]);

      const { data: contactsData } = await supabase.from('contacts').select('id, name, phone, avatar_url, assigned_to, created_at').eq('queue_id', id).order('created_at', { ascending: false }).limit(50);

      const contactsWithDetails = await Promise.all(
        (contactsData || []).map(async (contact) => {
          const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('contact_id', contact.id);
          const { data: lastMessage } = await supabase.from('messages').select('created_at').eq('contact_id', contact.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
          let assignedAgent = null;
          if (contact.assigned_to) { const { data } = await supabase.from('profiles').select('name, avatar_url').eq('id', contact.assigned_to).maybeSingle(); assignedAgent = data; }
          return { ...contact, messages_count: count || 0, last_message_at: lastMessage?.created_at || null, assigned_agent: assignedAgent };
        })
      );
      setContacts(contactsWithDetails);

      const totalContacts = contactsWithDetails.length;
      const assignedContacts = contactsWithDetails.filter(c => c.assigned_to).length;
      setMetrics({ totalContacts, assignedContacts, waitingContacts: totalContacts - assignedContacts, avgResponseTime: '~3 min', resolvedToday: Math.floor(assignedContacts * 0.7) });
    } catch (error) { log.error('Error fetching queue data:', error); }
    finally { setLoading(false); }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-6"><AuroraBorealis /><FloatingParticles />
        <div className="flex items-center gap-4"><Skeleton className="h-10 w-10" /><Skeleton className="h-8 w-64" /></div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">{[1,2,3,4].map(i => <Skeleton key={i} className="h-32" />)}</div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center"><AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" /><h2 className="text-xl font-semibold text-foreground mb-2">Fila não encontrada</h2><Button onClick={() => navigate('/')}>Voltar</Button></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AuroraBorealis /><FloatingParticles />
      <PageHeader title={queue.name} subtitle={queue.description || undefined} showBack onBack={() => navigate('/')}
        breadcrumbs={[{ label: 'Filas', onClick: () => navigate('/'), href: '/' }, { label: queue.name }]}
        actions={<Button variant="outline" size="sm" className="gap-2"><Settings className="w-4 h-4" />Configurar</Button>}
      />
      <div className="p-6 space-y-6">
        {metrics && <QueueMetricsCards metrics={metrics} />}
        {queue && <QueueCharts queueId={queue.id} queueColor={queue.color} />}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Card className="border border-secondary/20 bg-card/50 backdrop-blur">
            <CardHeader><CardTitle className="text-lg flex items-center gap-2"><Users className="w-5 h-5" />Equipe ({members.length})</CardTitle></CardHeader>
            <CardContent>
              <ScrollArea className="h-[300px]">
                <div className="space-y-3">
                  {members.length === 0 ? <p className="text-sm text-muted-foreground text-center py-4">Nenhum atendente nesta fila</p> :
                    members.map((member) => (
                      <div key={member.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/20 transition-colors">
                        <Avatar className="w-10 h-10"><AvatarImage src={member.profile?.avatar_url || undefined} /><AvatarFallback className="bg-primary/10 text-primary">{member.profile?.name?.[0] || '?'}</AvatarFallback></Avatar>
                        <div className="flex-1 min-w-0"><p className="font-medium text-foreground truncate">{member.profile?.name}</p><p className="text-xs text-muted-foreground">{member.profile?.is_active ? 'Ativo' : 'Inativo'}</p></div>
                        <Badge variant="secondary" className={member.profile?.is_active ? 'bg-success/10 text-success' : 'bg-muted/30'}>{member.profile?.is_active ? 'Online' : 'Offline'}</Badge>
                      </div>
                    ))
                  }
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
          <QueueContactsTable contacts={contacts} />
        </div>
      </div>
    </div>
  );
}
