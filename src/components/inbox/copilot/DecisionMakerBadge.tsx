/**
 * CV-038 — Indicador do papel do decisor na compra.
 * Quando "intermediário", o painel sugere material para encaminhar.
 */
import React from 'react';
import { UserCheck, UserX, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

const ROLE_META: Record<string, { label: string; icon: typeof UserCheck; color: string }> = {
  buyer: { label: 'Decisor direto', icon: UserCheck, color: 'text-green-600 dark:text-green-400' },
  approver: { label: 'Aprovador', icon: UserCheck, color: 'text-indigo-600 dark:text-indigo-400' },
  user: { label: 'Usuário', icon: Users, color: 'text-sky-600 dark:text-sky-400' },
  intermediary: { label: 'Intermediário', icon: UserX, color: 'text-orange-600 dark:text-orange-400' },
  unknown: { label: 'Papel não identificado', icon: Users, color: 'text-muted-foreground' },
};

interface DecisionMakerBadgeProps {
  role: string | null;
  onRequestForwardingMaterial?: () => void;
}

export function DecisionMakerBadge({ role, onRequestForwardingMaterial }: DecisionMakerBadgeProps) {
  if (!role || role === 'unknown') return null;
  const meta = ROLE_META[role] ?? ROLE_META.unknown;
  const Icon = meta.icon;

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Icon className={cn('h-3.5 w-3.5', meta.color)} />
      <span className={cn('font-medium', meta.color)}>{meta.label}</span>
      {role === 'intermediary' && onRequestForwardingMaterial && (
        <button
          type="button"
          onClick={onRequestForwardingMaterial}
          className="ml-1 rounded border border-orange-400/40 bg-orange-400/10 px-1.5 py-0.5 text-[10px] font-medium text-orange-700 hover:bg-orange-400/20 dark:text-orange-300 transition-colors"
        >
          Gerar resumo para encaminhar
        </button>
      )}
    </div>
  );
}
