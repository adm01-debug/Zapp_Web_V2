import React from 'react';

export interface AITransparencyBadgeProps {
  confidence?: number; // 0–1
  className?: string;
}

/**
 * CV-118 — Transparência para o vendedor.
 * Every RADAR suggestion card must display this badge so the vendor
 * always knows the content is AI-generated and needs review before sending.
 */
export function AITransparencyBadge({ confidence, className = '' }: AITransparencyBadgeProps) {
  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <span className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[9px] font-medium text-blue-600">
        <span>🤖</span>
        <span>Sugestão de IA — revise antes de enviar</span>
      </span>
      {confidence != null && (
        <span className="text-[9px] text-gray-400">
          {Math.round(confidence * 100)}% conf.
        </span>
      )}
    </div>
  );
}
