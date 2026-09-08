import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Cake, Shield, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format, differenceInYears, isSameDay, addYears } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { TeamConversation } from '@/hooks/chat/useTeamChat';

interface MemberProfile {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  job_title: string | null;
  department: string | null;
  role: string | null;
  is_active: boolean | null;
  created_at: string;
  birthday: string | null;
}

export type { MemberProfile };

export function getBirthdayInfo(birthday: string | null) {
  if (!birthday) return null;
  const date = new Date(birthday);
  const today = new Date();
  const age = differenceInYears(today, date);
  let nextBirthday = new Date(today.getFullYear(), date.getMonth(), date.getDate());
  if (nextBirthday < today && !isSameDay(nextBirthday, today)) nextBirthday = addYears(nextBirthday, 1);
  const isToday = isSameDay(nextBirthday, today);
  const daysUntil = Math.ceil((nextBirthday.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return { date, age, isToday, daysUntil };
}

export function getRoleBadge(role: string | null) {
  const map: Record<string, { label: string; className: string }> = {
    admin: { label: 'Admin', className: 'bg-destructive/10 text-destructive border-destructive/20' },
    supervisor: { label: 'Supervisor', className: 'bg-chart-4/10 text-chart-4 border-chart-4/20' },
    agent: { label: 'Agente', className: 'bg-primary/10 text-primary border-primary/20' },
  };
  return map[role || ''] || { label: role || 'Membro', className: 'bg-muted text-muted-foreground' };
}

export function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p className="text-sm text-foreground break-words">{value}</p>
      </div>
    </div>
  );
}

interface DirectProfileHeaderProps {
  memberProfile: MemberProfile | null;
  isLoading: boolean;
}

export function DirectProfileHeader({ memberProfile, isLoading }: DirectProfileHeaderProps) {
  if (isLoading) {
    return (
      <div className="flex flex-col items-center py-6 px-4">
        <Skeleton className="h-20 w-20 rounded-full mb-3" />
        <Skeleton className="h-4 w-32 mb-1" />
        <Skeleton className="h-3 w-24" />
      </div>
    );
  }
  if (!memberProfile) return null;

  const birthdayInfo = getBirthdayInfo(memberProfile.birthday);
  const roleBadge = getRoleBadge(memberProfile.role);

  return (
    <div className="flex flex-col items-center py-6 px-4">
      <div className="relative mb-3">
        <Avatar className="h-20 w-20 ring-2 ring-border">
          <AvatarImage src={memberProfile.avatar_url || undefined} alt={memberProfile.name || 'Membro'} />
          <AvatarFallback className="text-xl bg-primary/10 text-primary">{memberProfile.name?.charAt(0) || '?'}</AvatarFallback>
        </Avatar>
        {memberProfile.is_active && <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-success border-2 border-card" />}
        {birthdayInfo?.isToday && <div className="absolute -top-1 -right-1 text-lg" title="Aniversário hoje!">🎂</div>}
      </div>
      <h3 className="text-base font-bold text-foreground">{memberProfile.name}</h3>
      {memberProfile.job_title && <p className="text-xs text-muted-foreground mt-0.5">{memberProfile.job_title}</p>}
      <div className="flex items-center gap-2 mt-2">
        <Badge variant="outline" className={cn('text-[10px] px-2', roleBadge.className)}><Shield className="w-2.5 h-2.5 mr-1" />{roleBadge.label}</Badge>
        <Badge variant="outline" className={cn('text-[10px] px-2', memberProfile.is_active ? 'bg-success/10 text-success border-success/20' : '')}>
          {memberProfile.is_active ? 'Online' : 'Offline'}
        </Badge>
      </div>
      {birthdayInfo && (
        <div className={cn('mt-3 w-full rounded-lg px-3 py-2 text-center', birthdayInfo.isToday ? 'bg-chart-4/10 border border-chart-4/20' : 'bg-muted/50')}>
          <div className="flex items-center justify-center gap-1.5 text-xs">
            <Cake className="w-3.5 h-3.5" />
            {birthdayInfo.isToday ? (
              <span className="font-semibold text-chart-4">🎉 Aniversário hoje! {birthdayInfo.age} anos</span>
            ) : (
              <span className="text-muted-foreground">
                {format(birthdayInfo.date, "dd 'de' MMMM", { locale: ptBR })} ({birthdayInfo.age} anos)
                {birthdayInfo.daysUntil <= 30 && birthdayInfo.daysUntil > 0 && <span className="text-chart-4 ml-1">• em {birthdayInfo.daysUntil} dias</span>}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function GroupProfileHeader({ conversation }: { conversation: TeamConversation }) {
  return (
    <div className="flex flex-col items-center py-6 px-4">
      <Avatar className="h-20 w-20 mb-3 ring-2 ring-border">
        <AvatarImage src={conversation.avatar_url || undefined} alt={conversation.name || 'Avatar'} />
        <AvatarFallback className="text-xl bg-primary/10 text-primary"><Users className="w-8 h-8" /></AvatarFallback>
      </Avatar>
      <h3 className="text-base font-bold text-foreground">{conversation.name}</h3>
      <p className="text-xs text-muted-foreground mt-0.5">{conversation.members?.length || 0} membros</p>
    </div>
  );
}
