import React from 'react';
import type { AudioTone } from '@/hooks/copilot/useAudioToneDetector';

export interface AudioToneIndicatorProps {
  tone: AudioTone;
  confidence: number;
  className?: string;
}

const TONE_CONFIG: Record<AudioTone, { bg: string; text: string; border: string; icon: string; label: string }> = {
  urgent: { bg: 'bg-orange-50', text: 'text-orange-800', border: 'border-orange-400', icon: '⚡', label: 'Urgência detectada' },
  irritated: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-400', icon: '😤', label: 'Irritação detectada' },
  enthusiastic: { bg: 'bg-green-50', text: 'text-green-800', border: 'border-green-400', icon: '🌟', label: 'Entusiasmo detectado' },
  neutral: { bg: 'bg-gray-50', text: 'text-gray-600', border: 'border-gray-200', icon: '😐', label: 'Tom neutro' },
};

export function AudioToneIndicator({ tone, confidence, className = '' }: AudioToneIndicatorProps) {
  const cfg = TONE_CONFIG[tone];
  const pct = Math.round(confidence * 100);

  return (
    <div className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${cfg.bg} ${cfg.border} ${className}`}>
      <span className="text-sm">{cfg.icon}</span>
      <span className={`text-[10px] font-medium ${cfg.text}`}>
        {cfg.label} · {pct}%
      </span>
    </div>
  );
}
