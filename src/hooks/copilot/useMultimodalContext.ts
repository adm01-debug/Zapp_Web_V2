/**
 * CV-107–108: useMultimodalContext
 * Orchestrates audio, image and document analysis into a single unified context
 * that components can consume without depending on each hook individually.
 */

import { useAudioAnalysis, AudioAnalysisResult } from './useAudioAnalysis';
import { useImageAnalysis, ImageContext } from './useImageAnalysis';
import { useDocumentAnalysis, DocumentContext } from './useDocumentAnalysis';

export interface MultimodalContext {
  hasAudio: boolean;
  hasImage: boolean;
  hasDocument: boolean;
  audioAnalysis: AudioAnalysisResult | null;
  imageContext: ImageContext | null;
  documentContext: DocumentContext | null;
  /** The most relevant suggested action across all modalities. Priority: image > document > audio. */
  primarySuggestedAction: string | null;
}

interface Message {
  id: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';
  content?: string;
  caption?: string;
  filename?: string;
  duration?: number;
}

function resolvePrimaryAction(
  imageContext: ImageContext | null,
  documentContext: DocumentContext | null,
  audioAnalysis: AudioAnalysisResult | null,
): string | null {
  // Priority: image > document > audio
  if (imageContext && imageContext.suggestedAction !== 'none') {
    return imageContext.suggestedAction;
  }
  if (documentContext && documentContext.suggestedReply) {
    return documentContext.suggestedReply;
  }
  if (audioAnalysis) {
    if (audioAnalysis.hasUrgency) return 'Atenção: cliente sinalizou urgência no áudio.';
    if (audioAnalysis.hasObjection) return 'Atenção: cliente mencionou objeção no áudio.';
  }
  return null;
}

/**
 * Composes all three multimodal analysis hooks and returns a unified context.
 */
export function useMultimodalContext(messages: Message[]): MultimodalContext {
  const audioAnalysis = useAudioAnalysis(messages);
  const imageContext = useImageAnalysis(messages);
  const documentContext = useDocumentAnalysis(messages);

  const primarySuggestedAction = resolvePrimaryAction(imageContext, documentContext, audioAnalysis);

  return {
    hasAudio: audioAnalysis !== null,
    hasImage: imageContext !== null,
    hasDocument: documentContext !== null,
    audioAnalysis,
    imageContext,
    documentContext,
    primarySuggestedAction,
  };
}
