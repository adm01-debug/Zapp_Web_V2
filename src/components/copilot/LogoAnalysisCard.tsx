import React from 'react';
import type { LogoAnalysisResult } from '@/hooks/copilot/useLogoAnalysis';

export interface LogoAnalysisCardProps {
  result: LogoAnalysisResult;
  onRequestVector?: () => void;
  className?: string;
}

export function LogoAnalysisCard({ result, onRequestVector, className = '' }: LogoAnalysisCardProps) {
  if (!result.isLogo) return null;

  const isGood = result.quality === 'good';

  return (
    <div
      className={`rounded-lg border p-3 ${isGood ? 'border-green-300 bg-green-50' : 'border-yellow-400 bg-yellow-50'} ${className}`}
    >
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-base">{isGood ? '✅' : '⚠️'}</span>
        <span className={`text-xs font-semibold ${isGood ? 'text-green-800' : 'text-yellow-800'}`}>
          {isGood ? 'Logo adequado para gravação' : 'Logo pode ter problemas na gravação'}
        </span>
      </div>

      {result.issues.length > 0 && (
        <ul className="mb-2 space-y-0.5">
          {result.issues.map((issue, i) => (
            <li key={i} className="text-[10px] text-yellow-700">· {issue}</li>
          ))}
        </ul>
      )}

      {result.suggestion && (
        <p className="mb-2 rounded bg-yellow-100 px-2 py-1 text-[10px] text-yellow-800">
          {result.suggestion}
        </p>
      )}

      {result.quality === 'poor' && onRequestVector && (
        <button
          onClick={onRequestVector}
          className="rounded bg-yellow-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-yellow-700"
        >
          Pedir vetor ao cliente
        </button>
      )}
    </div>
  );
}
