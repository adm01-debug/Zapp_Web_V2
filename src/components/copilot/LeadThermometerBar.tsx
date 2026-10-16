import React from 'react';
import type { LeadTemperature, TemperatureLevel } from '@/hooks/copilot/useLeadThermometer';

export interface LeadThermometerBarProps {
  temperature: LeadTemperature;
  className?: string;
}

const LEVEL_COLORS: Record<TemperatureLevel, string> = {
  cold: 'bg-blue-400',
  warm: 'bg-yellow-400',
  hot: 'bg-orange-500',
  burning: 'bg-red-500',
};

const LEVEL_TEXT_COLORS: Record<TemperatureLevel, string> = {
  cold: 'text-blue-700',
  warm: 'text-yellow-700',
  hot: 'text-orange-700',
  burning: 'text-red-700',
};

const LEVEL_ICONS: Record<TemperatureLevel, string> = {
  cold: '🧊',
  warm: '🌤️',
  hot: '🔥',
  burning: '🚀',
};

export function LeadThermometerBar({ temperature, className = '' }: LeadThermometerBarProps) {
  const { score, level, label, breakdown } = temperature;
  const barColor = LEVEL_COLORS[level];
  const textColor = LEVEL_TEXT_COLORS[level];
  const icon = LEVEL_ICONS[level];

  return (
    <div className={`rounded-lg border border-gray-200 bg-white p-3 ${className}`}>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600">Temperatura do lead</span>
        <span className={`text-xs font-semibold ${textColor}`}>
          {icon} {label}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: `${score}%` }}
        />
      </div>

      <div className="mt-1 flex items-center justify-between">
        <span className="text-xs text-gray-400">0</span>
        <span className={`text-sm font-bold ${textColor}`}>{score}/100</span>
        <span className="text-xs text-gray-400">100</span>
      </div>

      {/* Breakdown */}
      <div className="mt-2 grid grid-cols-3 gap-1">
        {Object.entries(breakdown).map(([key, pts]) => (
          <div key={key} className="flex flex-col items-center rounded bg-gray-50 px-1 py-1">
            <span className="text-xs font-semibold text-gray-700">{pts}pts</span>
            <span className="text-[10px] capitalize text-gray-400">{key}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
