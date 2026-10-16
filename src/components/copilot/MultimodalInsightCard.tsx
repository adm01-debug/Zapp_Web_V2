/**
 * CV-109–110: MultimodalInsightCard
 * Shows a contextual badge and an action button when multimodal content
 * (audio, image or document) has been detected in the conversation.
 */

import React from 'react';
import { MultimodalContext } from '@/hooks/copilot/useMultimodalContext';

export interface MultimodalInsightCardProps {
  context: MultimodalContext;
  onActionClick?: (action: string) => void;
}

function sentimentEmoji(sentiment: 'positive' | 'neutral' | 'negative'): string {
  if (sentiment === 'positive') return '😊';
  if (sentiment === 'negative') return '😟';
  return '😐';
}

function AudioBadge({ context }: { context: MultimodalContext }) {
  if (!context.hasAudio || !context.audioAnalysis) return null;
  const { sentiment } = context.audioAnalysis;
  return (
    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
      <span aria-hidden>🎙️</span>
      <span>Cliente enviou áudio — {sentimentEmoji(sentiment)}</span>
    </div>
  );
}

function ImageBadge({
  context,
  onActionClick,
}: {
  context: MultimodalContext;
  onActionClick?: (action: string) => void;
}) {
  if (!context.hasImage || !context.imageContext) return null;
  const { suggestedAction } = context.imageContext;
  if (suggestedAction === 'none') return null;

  const label =
    suggestedAction === 'request_mockup' ? 'Solicitar mockup' : 'Enviar catálogo';

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden>🖼️</span>
      <button
        type="button"
        className="text-sm text-primary underline-offset-2 hover:underline focus:outline-none"
        onClick={() => onActionClick?.(suggestedAction)}
      >
        {label}
      </button>
    </div>
  );
}

function DocumentBadge({
  context,
  onActionClick,
}: {
  context: MultimodalContext;
  onActionClick?: (action: string) => void;
}) {
  if (!context.hasDocument || !context.documentContext) return null;
  const { suggestedReply } = context.documentContext;

  return (
    <div className="flex items-center gap-2">
      <span aria-hidden>📄</span>
      <button
        type="button"
        className="text-sm text-primary underline-offset-2 hover:underline focus:outline-none"
        onClick={() => onActionClick?.(suggestedReply)}
      >
        {suggestedReply}
      </button>
    </div>
  );
}

/**
 * Renders a compact insight card only when there is a primary suggested action.
 * Priority for display: image > document > audio.
 */
export function MultimodalInsightCard({
  context,
  onActionClick,
}: MultimodalInsightCardProps) {
  if (!context.primarySuggestedAction) return null;

  return (
    <div
      role="region"
      aria-label="Insight multimodal"
      className="rounded-lg border border-border bg-muted/40 px-3 py-2 flex flex-col gap-1.5"
    >
      {context.hasImage && (
        <ImageBadge context={context} onActionClick={onActionClick} />
      )}
      {context.hasDocument && !context.hasImage && (
        <DocumentBadge context={context} onActionClick={onActionClick} />
      )}
      {context.hasAudio && !context.hasImage && !context.hasDocument && (
        <AudioBadge context={context} />
      )}
    </div>
  );
}
