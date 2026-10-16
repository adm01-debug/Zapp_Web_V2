/**
 * CV-105–106: useDocumentAnalysis
 * Detects when a customer sends a document and classifies it by inspecting
 * the filename and caption for known keywords.
 */

export interface DocumentContext {
  isPriceList: boolean;
  isBriefing: boolean;
  isContract: boolean;
  isUnknown: boolean;
  extractedData: Record<string, string>;
  suggestedReply: string;
}

interface Message {
  id: string;
  type: 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';
  content?: string;
  caption?: string;
  filename?: string;
  duration?: number;
}

const PRICE_LIST_KEYWORDS = ['tabela', 'preço', 'preco', 'price', 'lista', 'valor', 'valores'];
const BRIEFING_KEYWORDS = ['briefing', 'criativo', 'arte', 'layout', 'brief', 'material'];
const CONTRACT_KEYWORDS = ['contrato', 'pedido', 'nf', 'nota fiscal', 'ordem', 'compra', 'fatura', 'invoice'];

function classifyDocument(text: string): Pick<DocumentContext, 'isPriceList' | 'isBriefing' | 'isContract' | 'isUnknown'> {
  const lower = text.toLowerCase();
  const isPriceList = PRICE_LIST_KEYWORDS.some(kw => lower.includes(kw));
  const isBriefing = BRIEFING_KEYWORDS.some(kw => lower.includes(kw));
  const isContract = CONTRACT_KEYWORDS.some(kw => lower.includes(kw));
  const isUnknown = !isPriceList && !isBriefing && !isContract;
  return { isPriceList, isBriefing, isContract, isUnknown };
}

function buildSuggestedReply(classification: Pick<DocumentContext, 'isPriceList' | 'isBriefing' | 'isContract' | 'isUnknown'>): string {
  if (classification.isPriceList) {
    return 'Recebi sua tabela! Deixa eu verificar os itens e te passo o melhor preço.';
  }
  if (classification.isBriefing) {
    return 'Recebi o briefing! Vou analisar e te envio uma proposta em breve.';
  }
  if (classification.isContract) {
    return 'Recebi o documento! Vou verificar os detalhes e te retorno em seguida.';
  }
  return 'Recebi seu arquivo! Vou analisar e entro em contato.';
}

/**
 * Scans the last 5 messages for a document message.
 * Classifies the document and provides a suggested reply.
 * Returns null when no document is found.
 */
export function useDocumentAnalysis(messages: Message[]): DocumentContext | null {
  const recent = messages.slice(-5);
  const docMsg = [...recent].reverse().find(m => m.type === 'document');
  if (!docMsg) return null;

  const searchText = [docMsg.filename, docMsg.caption, docMsg.content]
    .filter(Boolean)
    .join(' ');

  const classification = classifyDocument(searchText);
  const suggestedReply = buildSuggestedReply(classification);

  return {
    ...classification,
    extractedData: {},
    suggestedReply,
  };
}
