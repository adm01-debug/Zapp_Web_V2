import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato de segurança dos endpoints de IA (IA-011, IA-012, IA-013, IA-014).
 *
 * Estes testes provam a FORMA do código dos handlers: que cada endpoint de IA
 * paga autentica ANTES de gastar provedor, que a identidade de serviço não é
 * comparada com `===`, que o webhook da ElevenLabs valida assinatura de verdade
 * (bloqueando) e que o handler de áudio confere posse do objeto antes de baixar.
 *
 * Antes da correção do Bloco 02 este arquivo falha: as quatro funções abaixo não
 * chamavam nenhuma verificação de identidade em código.
 */
describe('endpoints de IA — contrato de autenticação (IA-011)', () => {
  const semIdentidade = [
    'voice-agent',
    'classify-audio-meme',
    'classify-emoji',
    'classify-sticker',
  ];

  for (const fn of semIdentidade) {
    it(`${fn} autentica o chamador antes de chamar o provedor`, () => {
      const source = read(`supabase/functions/${fn}/index.ts`);
      const auth = source.indexOf('requireAiIdentity');
      const provider = source.indexOf('ai.gateway.lovable.dev');
      expect(auth, `${fn} não usa requireAiIdentity`).toBeGreaterThan(-1);
      expect(provider, `${fn} não chama o gateway`).toBeGreaterThan(-1);
      expect(auth, `${fn} chama o provedor antes de autenticar`).toBeLessThan(provider);
    });
  }
});

describe('identidade de serviço — contrato (IA-012)', () => {
  it('ai-transcribe-audio não compara a service role key com ===', () => {
    const source = read('supabase/functions/ai-transcribe-audio/index.ts');
    expect(source).not.toContain('_token === _svcKey');
    expect(source).toContain('requireAiIdentityOrService');
  });
});

describe('elevenlabs-webhook — assinatura bloqueante (IA-013)', () => {
  const source = read('supabase/functions/elevenlabs-webhook/index.ts');

  it('usa o verificador bloqueante e não o modo sombra', () => {
    expect(source).toContain('verifyElevenLabsSignature');
    expect(source).not.toContain('logElevenLabsAuthShadow');
  });

  it('recusa a requisição antes de gravar quando a assinatura não confere', () => {
    const vereditoIdx = source.indexOf('verifyElevenLabsSignature');
    const insertIdx = source.indexOf(".from('audit_logs')");
    expect(insertIdx).toBeGreaterThan(-1);
    expect(vereditoIdx).toBeGreaterThan(-1);
    expect(vereditoIdx).toBeLessThan(insertIdx);
    expect(source).toMatch(/status:\s*401|401,\s*req\)/);
  });

  it('não persiste o corpo cru do webhook no banco', () => {
    expect(source).not.toContain('details: body');
  });
});

describe('ai-transcribe-audio — autorização por objeto (IA-014)', () => {
  const source = read('supabase/functions/ai-transcribe-audio/index.ts');

  it('confere visibilidade da mensagem com o cliente do chamador antes de baixar', () => {
    const visibilidade = source.indexOf('assertMessageVisibleToCaller');
    const download = source.indexOf('downloadAudio(');
    expect(visibilidade).toBeGreaterThan(-1);
    expect(download).toBeGreaterThan(-1);
    expect(visibilidade).toBeLessThan(download);
  });
});
