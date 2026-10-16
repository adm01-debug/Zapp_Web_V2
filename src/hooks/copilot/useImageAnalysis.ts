/**
 * CV-103–104: useImageAnalysis
 * Detects when a customer sends an image and classifies it based on
 * conversation context to suggest the next best action.
 */

export interface ImageContext {
  isLogo: boolean;
  isProduct: boolean;
  isReference: boolean;
  isScreenshot: boolean;
  suggestedAction: 'request_mockup' | 'send_catalog' | 'none';
}

interface Message {
  id: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';
  content?: string;
  caption?: string;
  filename?: string;
  duration?: number;
}

const LOGO_KEYWORDS = ['logo', 'marca', 'arte', 'logotipo', 'logomarca', 'brand'];
const PRODUCT_KEYWORDS = ['produto', 'modelo', 'item', 'catálogo', 'caneta', 'camiseta', 'brinde'];
const SCREENSHOT_KEYWORDS = ['screenshot', 'print', 'tela', 'captura'];

function buildConversationText(messages: Message[]): string {
  return messages
    .map(m => [m.content, m.caption].filter(Boolean).join(' '))
    .join(' ')
    .toLowerCase();
}

/**
 * Scans the last 5 messages for an image message.
 * Uses the surrounding conversation context to classify the image.
 * Returns null when no image is found.
 */
export function useImageAnalysis(messages: Message[]): ImageContext | null {
  const recent = messages.slice(-5);
  const hasImage = recent.some(m => m.type === 'image');
  if (!hasImage) return null;

  // Use all recent messages as context
  const contextText = buildConversationText(recent);

  const isLogo = LOGO_KEYWORDS.some(kw => contextText.includes(kw));
  const isProduct = !isLogo && PRODUCT_KEYWORDS.some(kw => contextText.includes(kw));
  const isScreenshot = SCREENSHOT_KEYWORDS.some(kw => contextText.includes(kw));
  const isReference = !isLogo && !isProduct && !isScreenshot;

  let suggestedAction: ImageContext['suggestedAction'] = 'none';
  if (isLogo) suggestedAction = 'request_mockup';
  else if (isProduct) suggestedAction = 'send_catalog';

  return { isLogo, isProduct, isReference, isScreenshot, suggestedAction };
}
