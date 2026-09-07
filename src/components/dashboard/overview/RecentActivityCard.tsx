import { History } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { DashboardCard, SectionHeader, VerTodasButton } from './DashboardCard';
import { getInitials, getAvatarColor } from '@/lib/avatar-colors';
import { navigateToView } from '@/hooks/system/useNavigationHistory';
import type { ConversationEventItem } from '@/hooks/dashboard/useRecentConversationEvents';
import { cn } from '@/lib/utils';

interface RecentActivityCardProps {
  items: ConversationEventItem[];
}

export function RecentActivityCard({ items }: RecentActivityCardProps) {
  return (
    <DashboardCard testid="activity-card" className="min-h-[220px]">
      <SectionHeader
        icon={History}
        title="Atividade Recente"
        tileSize={44}
        right={<VerTodasButton onClick={() => navigateToView('audit-logs')} />}
      />
      {items.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-[12px] text-muted-foreground min-h-[120px]">
          Sem atividade hoje
        </div>
      ) : (
        <div className="flex flex-col">
          {items.slice(0, 4).map((item) => {
            const { bg, text } = getAvatarColor(item.actorName);
            return (
              <div key={item.id} data-testid="activity-row" className="h-[41px] flex items-center gap-2.5">
                <span className={cn('w-[30px] h-[30px] rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0', bg, text)}>
                  {getInitials(item.actorName)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-foreground truncate">{item.actorName}</p>
                  <p className="text-[11px] text-foreground-secondary truncate">{item.text}</p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0 ml-auto">
                  <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                    há {formatDistanceToNow(new Date(item.createdAt), { locale: ptBR })}
                  </span>
                  <span className="w-2 h-2 rounded-full bg-dash-blue" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </DashboardCard>
  );
}
