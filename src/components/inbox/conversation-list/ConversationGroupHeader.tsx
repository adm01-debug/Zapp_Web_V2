import { Pin } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ConversationGroupHeaderProps {
  label: string;
  count: number;
  icon?: LucideIcon;
}

export function ConversationGroupHeader({ label, count, icon: Icon = Pin }: ConversationGroupHeaderProps) {
  return (
    <div className="h-8 px-4 flex items-center gap-2 text-[13px] font-semibold text-foreground">
      <Icon className="w-3.5 h-3.5 text-muted-foreground" />
      {label} ({count})
    </div>
  );
}
