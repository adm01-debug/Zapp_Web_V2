/**
 * CV-039 — Mapa de múltiplos interessados mencionados na conversa.
 */
import React from 'react';
import { Users } from 'lucide-react';

interface Stakeholder {
  name: string;
  role: string;
  first_mention_msg_id?: string;
}

interface StakeholdersCardProps {
  stakeholders: Stakeholder[];
  onGoToMessage?: (msgId: string) => void;
}

export function StakeholdersCard({ stakeholders, onGoToMessage }: StakeholdersCardProps) {
  if (!stakeholders.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <Users className="h-3.5 w-3.5" />
        Quem decide
      </p>
      <div className="space-y-1">
        {stakeholders.map((s, i) => (
          <div key={i} className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs">
            <div>
              <span className="font-medium">{s.name}</span>
              {s.role && <span className="ml-1 text-muted-foreground">· {s.role}</span>}
            </div>
            {s.first_mention_msg_id && onGoToMessage && (
              <button
                type="button"
                onClick={() => onGoToMessage(s.first_mention_msg_id!)}
                className="text-[10px] text-primary underline-offset-2 hover:underline"
              >
                ver menção
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
