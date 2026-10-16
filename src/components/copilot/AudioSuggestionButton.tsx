import React, { useRef } from 'react';

export interface AudioSuggestionButtonProps {
  audioUrl: string | null;
  isGenerating: boolean;
  onGenerate: () => void;
  onClear: () => void;
  className?: string;
}

/**
 * CV-108 — Áudio sugerido.
 * Button to generate TTS audio from the suggestion text.
 * The vendor always listens before deciding — audio is never auto-sent.
 */
export function AudioSuggestionButton({
  audioUrl,
  isGenerating,
  onGenerate,
  onClear,
  className = '',
}: AudioSuggestionButtonProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {audioUrl ? (
        <>
          {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
          <audio ref={audioRef} src={audioUrl} controls className="h-7 w-full max-w-[180px]" />
          <button
            onClick={onClear}
            className="text-[10px] text-gray-400 hover:text-gray-600"
            aria-label="Descartar áudio"
          >
            ✕
          </button>
        </>
      ) : (
        <button
          onClick={onGenerate}
          disabled={isGenerating}
          className="flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 disabled:opacity-50"
        >
          {isGenerating ? (
            <span className="animate-pulse">⏳ Gerando áudio…</span>
          ) : (
            <>🔊 Ouvir sugestão</>
          )}
        </button>
      )}
    </div>
  );
}
