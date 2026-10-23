import React from 'react';

export interface SecurityCheckItem {
  id: string;
  label: string;
  status: 'pass' | 'fail' | 'pending';
  note?: string;
}

export interface SecurityReviewPanelProps {
  items: SecurityCheckItem[];
  className?: string;
}

const STATUS_CONFIG: Record<SecurityCheckItem['status'], { icon: string; textCls: string; bgCls: string }> = {
  pass: { icon: '✅', textCls: 'text-green-700', bgCls: 'bg-green-50' },
  fail: { icon: '❌', textCls: 'text-red-700', bgCls: 'bg-red-50' },
  pending: { icon: '⏳', textCls: 'text-yellow-700', bgCls: 'bg-yellow-50' },
};

/**
 * CV-120 — Revisão de segurança dedicada.
 * Displays the checklist of security review items (RLS, edges, Realtime)
 * for the RADAR. All critical findings must be pass before pilot launch.
 */
export function SecurityReviewPanel({ items, className = '' }: SecurityReviewPanelProps) {
  const allPass = items.every(i => i.status === 'pass');

  return (
    <div className={`rounded-lg border border-gray-200 bg-gray-50 p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <span className="text-base">{allPass ? '🔒' : '⚠️'}</span>
        <span className="text-xs font-semibold text-gray-800">Revisão de segurança do RADAR</span>
        {allPass && (
          <span className="ml-auto rounded-full bg-green-200 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-green-800">
            OK para piloto
          </span>
        )}
      </div>
      <ul className="space-y-1">
        {items.map(item => {
          const cfg = STATUS_CONFIG[item.status];
          return (
            <li
              key={item.id}
              className={`flex items-start gap-1.5 rounded px-2 py-0.5 text-[10px] ${cfg.bgCls} ${cfg.textCls}`}
            >
              <span className="mt-px">{cfg.icon}</span>
              <span className="font-medium">{item.label}</span>
              {item.note && <span className="ml-auto text-gray-500">{item.note}</span>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
