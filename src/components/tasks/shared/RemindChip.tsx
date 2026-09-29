import { Bell, BellRing } from 'lucide-react';

interface Props { remindAt: string; notifiedAt?: string | null; }

export function RemindChip({ remindAt, notifiedAt }: Props) {
  const due = new Date(remindAt) <= new Date();
  const Icon = due ? BellRing : Bell;
  const time = new Date(remindAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const day  = new Date(remindAt).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-medium ${due && !notifiedAt ? 'text-destructive' : 'text-muted-foreground'}`}
      title={`Lembrete: ${day} ${time}`}
    >
      <Icon className="h-3 w-3" />
      {time}
    </span>
  );
}
