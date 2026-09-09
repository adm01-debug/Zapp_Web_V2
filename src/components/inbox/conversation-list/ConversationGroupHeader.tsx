import { Pin } from 'lucide-react';

interface ConversationGroupHeaderProps {
  title: string;
  count: number;
  pinned?: boolean;
}

export function ConversationGroupHeader({ title, count, pinned = false }: ConversationGroupHeaderProps) {
  return (
    <div
      className="flex h-8 items-center gap-2 px-4 text-[13px] font-semibold text-foreground"
      data-testid="conversation-group-header"
    >
      {pinned && <Pin className="h-3.5 w-3.5 text-primary" aria-hidden="true" />}
      <span>{title} ({count.toLocaleString('pt-BR')})</span>
    </div>
  );
}
