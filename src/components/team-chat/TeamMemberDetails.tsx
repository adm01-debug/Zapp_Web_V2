import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/hooks/auth/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { X, Phone, Mail, Briefcase, Building2, Cake, Calendar, ChevronDown, User, Users, ChevronsDownUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';
import {
  type MemberProfile, getBirthdayInfo, getRoleBadge, InfoRow,
  DirectProfileHeader, GroupProfileHeader,
} from './TeamMemberProfileHeader';

function SectionHeader({ icon: Icon, label, open, onToggle }: { icon: React.ElementType; label: string; open: boolean; onToggle: () => void }) {
  return (
    <CollapsibleTrigger onClick={onToggle} className="flex items-center gap-2 w-full py-2.5 px-4 text-xs font-medium text-muted-foreground hover:bg-muted/50 transition-colors">
      <Icon className="w-3.5 h-3.5" /><span className="flex-1 text-left uppercase tracking-wider">{label}</span>
      <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
    </CollapsibleTrigger>
  );
}

interface TeamMemberDetailsProps { conversation: TeamConversation; onClose: () => void; }

export function TeamMemberDetails({ conversation, onClose }: TeamMemberDetailsProps) {
  const { profile } = useAuth();
  const [sections, setSections] = useState({ info: true, team: false, activity: false });
  const toggleAll = () => { const allClosed = !sections.info && !sections.team && !sections.activity; setSections({ info: allClosed, team: allClosed, activity: allClosed }); };

  const otherMemberId = conversation.type === 'direct' ? conversation.members?.find(m => m.profile_id !== profile?.id)?.profile_id : null;

  const { data: memberProfile, isLoading } = useQuery({
    queryKey: ['team-member-profile', otherMemberId || conversation.id],
    queryFn: async () => {
      if (conversation.type === 'direct' && otherMemberId) {
        const { data, error } = await supabase.from('profiles').select('id, name, email, phone, avatar_url, job_title, department, role, is_active, created_at, birthday').eq('id', otherMemberId).single();
        if (error) throw error;
        return data as MemberProfile;
      }
      return null;
    },
    enabled: conversation.type === 'direct' && !!otherMemberId,
  });

  const memberIds = conversation.members?.map(m => m.profile_id) || [];
  const { data: groupMembers = [] } = useQuery({
    queryKey: ['team-group-members', conversation.id, memberIds.join(',')],
    queryFn: async () => {
      if (memberIds.length === 0) return [];
      const { data, error } = await supabase.from('profiles').select('id, name, email, phone, avatar_url, job_title, department, role, is_active, created_at, birthday').in('id', memberIds);
      if (error) throw error;
      return (data || []) as MemberProfile[];
    },
    enabled: conversation.type === 'group' && memberIds.length > 0,
  });

  return (
    <div className="w-[300px] border-l border-border flex flex-col bg-card h-full" role="complementary" aria-label="Detalhes da conversa">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <h3 className="text-sm font-semibold flex items-center gap-1.5"><span className="w-1 h-4 bg-primary rounded-full" />{conversation.type === 'direct' ? 'Detalhes do Colaborador' : 'Detalhes do Grupo'}</h3>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleAll} title="Recolher/Expandir"><ChevronsDownUp className="w-3.5 h-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose} aria-label="Fechar"><X className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {conversation.type === 'direct' ? <DirectProfileHeader memberProfile={memberProfile ?? null} isLoading={isLoading} /> : <GroupProfileHeader conversation={conversation} />}

        {conversation.type === 'direct' && memberProfile && (
          <Collapsible open={sections.info} onOpenChange={(o) => setSections(s => ({ ...s, info: o }))}>
            <SectionHeader icon={User} label="Informações" open={sections.info} onToggle={() => setSections(s => ({ ...s, info: !s.info }))} />
            <CollapsibleContent>
              <div className="px-4 pb-3">
                <InfoRow icon={Mail} label="Email" value={memberProfile.email} />
                <InfoRow icon={Phone} label="Telefone" value={memberProfile.phone} />
                <InfoRow icon={Briefcase} label="Cargo" value={memberProfile.job_title} />
                <InfoRow icon={Building2} label="Departamento" value={memberProfile.department} />
                <InfoRow icon={Cake} label="Aniversário" value={memberProfile.birthday ? format(new Date(memberProfile.birthday), "dd 'de' MMMM 'de' yyyy", { locale: ptBR }) : null} />
                <InfoRow icon={Calendar} label="Membro desde" value={format(new Date(memberProfile.created_at), "dd/MM/yyyy", { locale: ptBR })} />
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {conversation.type === 'group' && (
          <Collapsible open={sections.team} onOpenChange={(o) => setSections(s => ({ ...s, team: o }))}>
            <SectionHeader icon={Users} label={`Membros (${groupMembers.length})`} open={sections.team} onToggle={() => setSections(s => ({ ...s, team: !s.team }))} />
            <CollapsibleContent>
              <div className="px-2 pb-3 space-y-0.5">
                {groupMembers.map(member => {
                  const mBirthday = getBirthdayInfo(member.birthday);
                  const mRole = getRoleBadge(member.role);
                  return (
                    <div key={member.id} className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-muted/50 transition-colors">
                      <div className="relative">
                        <Avatar className="h-9 w-9"><AvatarImage src={member.avatar_url || undefined} alt={member.name || 'Membro'} /><AvatarFallback className="text-xs bg-muted">{member.name?.charAt(0) || '?'}</AvatarFallback></Avatar>
                        {member.is_active && <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-success border-2 border-card" />}
                        {mBirthday?.isToday && <div className="absolute -top-1 -right-1 text-xs">🎂</div>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{member.name}</p>
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] text-muted-foreground truncate">{member.job_title || mRole.label}</span>
                          {mBirthday && mBirthday.daysUntil <= 7 && mBirthday.daysUntil > 0 && <Badge variant="outline" className="text-[8px] px-1 py-0 bg-chart-4/10 text-chart-4 border-chart-4/20">🎂 {mBirthday.daysUntil}d</Badge>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {conversation.type === 'group' && groupMembers.length > 0 && (
          <Collapsible open={sections.activity} onOpenChange={(o) => setSections(s => ({ ...s, activity: o }))}>
            <SectionHeader icon={Cake} label="Próximos Aniversários" open={sections.activity} onToggle={() => setSections(s => ({ ...s, activity: !s.activity }))} />
            <CollapsibleContent>
              <div className="px-4 pb-3 space-y-2">
                {groupMembers.filter(m => m.birthday).map(m => ({ ...m, bInfo: getBirthdayInfo(m.birthday)! })).sort((a, b) => a.bInfo.daysUntil - b.bInfo.daysUntil).slice(0, 5).map(member => (
                  <div key={member.id} className="flex items-center gap-2.5 text-sm">
                    <Cake className={cn('w-3.5 h-3.5 shrink-0', member.bInfo.isToday ? 'text-chart-4' : 'text-muted-foreground')} />
                    <span className="truncate flex-1">{member.name}</span>
                    <span className={cn('text-[10px] shrink-0', member.bInfo.isToday ? 'text-chart-4 font-semibold' : 'text-muted-foreground')}>
                      {member.bInfo.isToday ? '🎉 Hoje!' : `${format(member.bInfo.date, 'dd/MM')} (${member.bInfo.daysUntil}d)`}
                    </span>
                  </div>
                ))}
                {groupMembers.filter(m => m.birthday).length === 0 && <p className="text-xs text-muted-foreground text-center py-2">Nenhum aniversário cadastrado</p>}
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}
      </ScrollArea>
    </div>
  );
}
