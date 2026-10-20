import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');

/**
 * Contrato de segurança dos endpoints de IA (IA-011, IA-012, IA-013, IA-014).
 *
 * Reescrito no lote B, depois da verificação adversarial. A primeira versão usava
 * `source.indexOf('nomeDaFuncao')`, que casa primeiro com a **linha de import** e
 * não com a chamada: três mutações de ordem (baixar antes de autorizar, gravar
 * antes de verificar a assinatura, chamar o provedor antes de autenticar)
 * passavam com este contrato verde. Aqui as declarações `import` são removidas
 * antes da busca, então todo índice é o da CHAMADA.
 */
const semImports = (source: string) => source.replace(/^import[\s\S]*?;\s*$/gm, '');
const corpo = (path: string) => semImports(read(path));

/**
 * Canais conhecidos de gasto em provedor.
 *
 * Até o Bloco 03 o único canal era a URL do gateway fixo. O Bloco 04 criou o
 * despacho central (`ai-generate.ts` → `generateWithRouting`), e os consumidores
 * migrados (IA-032 e, aqui, IA-033) deixaram de conter a URL antiga de propósito —
 * o aceite é justamente "não restam chamadas pagas desconhecidas".
 *
 * Se este contrato continuasse preso à URL antiga, ele ficaria VERDE exatamente
 * quando ninguém mais usasse o gateway antigo, ou seja: a asserção mais frágil no
 * momento mais importante. O que o IA-011 protege é a ORDEM (autenticar antes de
 * gastar), então o teste aceita qualquer canal conhecido — e exige que exista um.
 * Os dois canais casam só a CHAMADA (os `import` são removidos antes da busca).
 */
const CANAIS_DE_PROVEDOR = ['generateWithRouting(', 'ai.gateway.lovable.dev'] as const;

/** Índice do primeiro gasto em provedor no corpo do arquivo (-1 se não houver). */
const chamadaDeProvedor = (fonte: string): number => {
  const indices = CANAIS_DE_PROVEDOR.map((canal) => fonte.indexOf(canal)).filter((i) => i > -1);
  return indices.length ? Math.min(...indices) : -1;
};

describe('endpoints de IA — ordem entre autenticação e gasto de provedor (IA-011)', () => {
  const semIdentidade = [
    'voice-agent',
    'classify-audio-meme',
    'classify-emoji',
    'classify-sticker',
  ];

  for (const fn of semIdentidade) {
    it(`${fn} autentica o chamador antes de chamar o provedor`, () => {
      const source = corpo(`supabase/functions/${fn}/index.ts`);
      const auth = source.indexOf('requireAiIdentity');
      const provider = chamadaDeProvedor(source);
      expect(auth, `${fn} não usa requireAiIdentity`).toBeGreaterThan(-1);
      expect(provider, `${fn} não gasta em provedor por canal conhecido`).toBeGreaterThan(-1);
      expect(auth, `${fn} chama o provedor antes de autenticar`).toBeLessThan(provider);
    });
  }

  it('o contrato não confunde import com chamada (guarda do próprio teste)', () => {
    const bruto = read('supabase/functions/classify-emoji/index.ts');
    const limpo = corpo('supabase/functions/classify-emoji/index.ts');
    // No texto original o primeiro casamento é o import; no limpo, a chamada.
    expect(bruto.indexOf('requireAiIdentity')).toBeLessThan(
      limpo.indexOf('requireAiIdentity'),
    );
  });
});

describe('cliente do voice-agent — credencial da sessão (IA-011, regressão A1)', () => {
  const source = read('src/hooks/communication/useVoiceAgent.ts');

  it('manda o access token da sessão para a função', () => {
    expect(source).toContain('supabase.auth.getSession()');
    expect(source).toContain('data.session?.access_token');
    expect(source).toMatch(/processVoiceTranscript\(text, supabaseUrl, authToken\)/);
  });

  it('não usa a anon key pública como credencial da função', () => {
    expect(source).not.toMatch(/processVoiceTranscript\([^)]*SUPABASE_ANON_KEY/);
    expect(source).not.toMatch(/playTtsAudio\([^)]*SUPABASE_ANON_KEY/);
  });
});

describe('identidade de serviço — contrato (IA-012, regressão A2)', () => {
  it('ai-transcribe-audio não compara a service role key com ===', () => {
    const source = read('supabase/functions/ai-transcribe-audio/index.ts');
    expect(source).not.toContain('_token === _svcKey');
    expect(source).toContain('requireAiIdentityOrService');
  });

  it('classify-sticker aceita o chamador interno de serviço (webhook do WhatsApp)', () => {
    const source = corpo('supabase/functions/classify-sticker/index.ts');
    expect(source).toContain('requireAiIdentityOrService(');
  });
});

describe('elevenlabs-webhook — assinatura bloqueante (IA-013)', () => {
  const bruto = read('supabase/functions/elevenlabs-webhook/index.ts');
  const source = corpo('supabase/functions/elevenlabs-webhook/index.ts');

  it('usa o verificador bloqueante e não o modo sombra', () => {
    expect(source).toContain('verifyElevenLabsSignature(');
    expect(bruto).not.toContain('logElevenLabsAuthShadow');
  });

  it('recusa a requisição antes de gravar quando a assinatura não confere', () => {
    const veredito = source.indexOf('verifyElevenLabsSignature(');
    const insert = source.indexOf(".from('audit_logs')");
    expect(insert).toBeGreaterThan(-1);
    expect(veredito).toBeGreaterThan(-1);
    expect(veredito).toBeLessThan(insert);
    expect(source).toMatch(/status:\s*401|401,\s*req\)/);
  });

  it('não persiste o corpo cru do webhook no banco', () => {
    expect(bruto).not.toContain('details: body');
  });

  it('grava só os campos da allowlist', () => {
    for (const campo of ['event_type', 'request_id', 'status', 'entity_id']) {
      expect(source, `allowlist sem ${campo}`).toContain(campo);
    }
  });
});

describe('ai-transcribe-audio — autorização por objeto (IA-014)', () => {
  const source = corpo('supabase/functions/ai-transcribe-audio/index.ts');

  it('confere visibilidade da mensagem com o cliente do chamador antes de baixar', () => {
    const visibilidade = source.indexOf('await assertMessageVisibleToCaller(');
    const download = source.indexOf('await downloadAudio(');
    expect(visibilidade, 'não chama assertMessageVisibleToCaller').toBeGreaterThan(-1);
    expect(download, 'não chama downloadAudio').toBeGreaterThan(-1);
    expect(visibilidade, 'baixa o objeto antes de autorizar').toBeLessThan(download);
  });

  it('recusa mensagem visível sem media_url antes de baixar (R2-API-027)', () => {
    const rejeicao = source.indexOf('if (!authorized.ok)');
    const download = source.indexOf('await downloadAudio(');
    expect(rejeicao, 'não rejeita media_url ausente').toBeGreaterThan(-1);
    expect(rejeicao, 'baixa o path do cliente antes de rejeitar').toBeLessThan(download);
    // A única fonte autorizada é a media_url do registro — nunca a URL do cliente.
    expect(source).toContain('resolveAuthorizedAudioUrl(objectAuthz.mediaUrl)');
    expect(source).toContain('audioUrl = authorized.url');
  });

  it('só aplica a autorização por objeto no caminho de usuário', () => {
    expect(source).toContain('identity.kind === "user"');
  });
});
