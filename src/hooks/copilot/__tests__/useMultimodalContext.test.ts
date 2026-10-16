/**
 * Tests for Phase 11 multimodal hooks (CV-101–110).
 */

import { useAudioAnalysis } from '../useAudioAnalysis';
import { useImageAnalysis } from '../useImageAnalysis';
import { useDocumentAnalysis } from '../useDocumentAnalysis';
import { useMultimodalContext } from '../useMultimodalContext';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MessageType = 'text' | 'audio' | 'image' | 'document' | 'video' | 'sticker';

function msg(
  type: MessageType,
  opts: { content?: string; caption?: string; filename?: string; duration?: number } = {},
) {
  return { id: Math.random().toString(36).slice(2), type, ...opts };
}

// ---------------------------------------------------------------------------
// useAudioAnalysis
// ---------------------------------------------------------------------------

describe('useAudioAnalysis', () => {
  it('returns null when no audio message is present', () => {
    const messages = [msg('text', { content: 'Olá, tudo bem?' })];
    expect(useAudioAnalysis(messages)).toBeNull();
  });

  it('detects an audio message and returns basic analysis', () => {
    const messages = [msg('audio', { duration: 12 })];
    const result = useAudioAnalysis(messages);
    expect(result).not.toBeNull();
    expect(result!.duration_seconds).toBe(12);
  });

  it('detects urgency keywords in transcription', () => {
    const messages = [
      msg('audio', { content: 'Preciso disso urgente, preciso pra hoje!' }),
    ];
    const result = useAudioAnalysis(messages);
    expect(result).not.toBeNull();
    expect(result!.hasUrgency).toBe(true);
  });

  it('detects urgency keyword "rápido"', () => {
    const messages = [msg('audio', { content: 'Me manda rápido por favor' })];
    const result = useAudioAnalysis(messages);
    expect(result!.hasUrgency).toBe(true);
  });

  it('detects objection keywords in transcription', () => {
    const messages = [
      msg('audio', { content: 'Achei muito caro, estou pensando em cancelar.' }),
    ];
    const result = useAudioAnalysis(messages);
    expect(result!.hasObjection).toBe(true);
  });

  it('classifies positive sentiment', () => {
    const messages = [msg('audio', { content: 'Perfeito, fechado!' })];
    const result = useAudioAnalysis(messages);
    expect(result!.sentiment).toBe('positive');
  });

  it('classifies negative sentiment', () => {
    const messages = [msg('audio', { content: 'Péssimo serviço, muito insatisfeito.' })];
    const result = useAudioAnalysis(messages);
    expect(result!.sentiment).toBe('negative');
  });

  it('only scans the last 5 messages', () => {
    const messages = [
      msg('audio', { content: 'urgente', duration: 5 }),
      msg('text', { content: 'a' }),
      msg('text', { content: 'b' }),
      msg('text', { content: 'c' }),
      msg('text', { content: 'd' }),
      msg('text', { content: 'e' }),
    ];
    // The audio is outside the last-5 window; should not be detected
    expect(useAudioAnalysis(messages)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// useImageAnalysis
// ---------------------------------------------------------------------------

describe('useImageAnalysis', () => {
  it('returns null when no image message is present', () => {
    const messages = [msg('text', { content: 'Olá' })];
    expect(useImageAnalysis(messages)).toBeNull();
  });

  it('classifies as logo and suggests request_mockup when context contains "logo"', () => {
    const messages = [
      msg('text', { content: 'Segue o logo da empresa' }),
      msg('image'),
    ];
    const result = useImageAnalysis(messages);
    expect(result).not.toBeNull();
    expect(result!.isLogo).toBe(true);
    expect(result!.suggestedAction).toBe('request_mockup');
  });

  it('classifies as logo when caption contains "marca"', () => {
    const messages = [msg('image', { caption: 'nossa marca' })];
    const result = useImageAnalysis(messages);
    expect(result!.isLogo).toBe(true);
  });

  it('classifies as product and suggests send_catalog when context contains "produto"', () => {
    const messages = [
      msg('text', { content: 'Qual produto vocês têm?' }),
      msg('image'),
    ];
    const result = useImageAnalysis(messages);
    expect(result!.isProduct).toBe(true);
    expect(result!.suggestedAction).toBe('send_catalog');
  });

  it('classifies as reference when no known keywords are present', () => {
    const messages = [msg('image')];
    const result = useImageAnalysis(messages);
    expect(result!.isReference).toBe(true);
    expect(result!.suggestedAction).toBe('none');
  });
});

// ---------------------------------------------------------------------------
// useDocumentAnalysis
// ---------------------------------------------------------------------------

describe('useDocumentAnalysis', () => {
  it('returns null when no document message is present', () => {
    const messages = [msg('text', { content: 'Olá' })];
    expect(useDocumentAnalysis(messages)).toBeNull();
  });

  it('classifies as price list when filename contains "tabela_precos"', () => {
    const messages = [msg('document', { filename: 'tabela_precos.xlsx' })];
    const result = useDocumentAnalysis(messages);
    expect(result).not.toBeNull();
    expect(result!.isPriceList).toBe(true);
    expect(result!.suggestedReply).toContain('tabela');
  });

  it('classifies as price list when caption contains "preço"', () => {
    const messages = [msg('document', { caption: 'nossa tabela de preço atualizada' })];
    const result = useDocumentAnalysis(messages);
    expect(result!.isPriceList).toBe(true);
  });

  it('classifies as briefing when filename contains "briefing"', () => {
    const messages = [msg('document', { filename: 'briefing_campanha.pdf' })];
    const result = useDocumentAnalysis(messages);
    expect(result!.isBriefing).toBe(true);
    expect(result!.suggestedReply).toContain('briefing');
  });

  it('classifies as contract when filename contains "pedido"', () => {
    const messages = [msg('document', { filename: 'pedido_compra.pdf' })];
    const result = useDocumentAnalysis(messages);
    expect(result!.isContract).toBe(true);
  });

  it('classifies as unknown when no keywords match', () => {
    const messages = [msg('document', { filename: 'foto.jpg' })];
    const result = useDocumentAnalysis(messages);
    expect(result!.isUnknown).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// useMultimodalContext (orchestrator)
// ---------------------------------------------------------------------------

describe('useMultimodalContext', () => {
  it('returns all-false context for plain text messages', () => {
    const messages = [msg('text', { content: 'Olá' })];
    const ctx = useMultimodalContext(messages);
    expect(ctx.hasAudio).toBe(false);
    expect(ctx.hasImage).toBe(false);
    expect(ctx.hasDocument).toBe(false);
    expect(ctx.primarySuggestedAction).toBeNull();
  });

  it('detects audio and sets hasAudio=true', () => {
    const messages = [msg('audio', { duration: 5 })];
    const ctx = useMultimodalContext(messages);
    expect(ctx.hasAudio).toBe(true);
    expect(ctx.audioAnalysis).not.toBeNull();
  });

  it('detects image and sets hasImage=true with primarySuggestedAction', () => {
    const messages = [
      msg('text', { content: 'logo da empresa' }),
      msg('image'),
    ];
    const ctx = useMultimodalContext(messages);
    expect(ctx.hasImage).toBe(true);
    expect(ctx.primarySuggestedAction).toBe('request_mockup');
  });

  it('detects document and sets hasDocument=true with primarySuggestedAction', () => {
    const messages = [msg('document', { filename: 'tabela_precos.xlsx' })];
    const ctx = useMultimodalContext(messages);
    expect(ctx.hasDocument).toBe(true);
    expect(ctx.primarySuggestedAction).toContain('tabela');
  });

  it('prioritises image action over document action', () => {
    const messages = [
      msg('text', { content: 'aqui vai o logo' }),
      msg('image'),
      msg('document', { filename: 'tabela_precos.xlsx' }),
    ];
    const ctx = useMultimodalContext(messages);
    expect(ctx.primarySuggestedAction).toBe('request_mockup');
  });

  it('provides urgency notice from audio when no image/document action', () => {
    const messages = [msg('audio', { content: 'preciso urgente disso agora' })];
    const ctx = useMultimodalContext(messages);
    expect(ctx.primarySuggestedAction).toMatch(/urgência/i);
  });
});
