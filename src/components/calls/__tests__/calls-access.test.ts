/**
 * Acesso e fronteiras do módulo de Telefonia — etapas T07, T11 e T13.
 *
 * Substitui `voip-security-gaps.test.ts`, que listava lacunas sem afirmar nada
 * sobre o código. A primeira versão deste arquivo repetiu o defeito: eram 5
 * `it.todo`, 0 asserções, e o vitest marcava o arquivo como *skipped* — o gate
 * passava sem proteger nada. A auditoria adversarial de 29/09 pegou isso.
 *
 * Aqui ficam **asserções que valem hoje** e que travam invariantes do módulo.
 * Os `it.todo` do fim continuam nomeando o que depende de código que ainda não
 * existe (com a etapa dona) — `it.todo` é honesto; `expect(true).toBe(true)`
 * fingiria passar, e é proibido neste diretório.
 *
 * Onde a auditoria de 30/09 achou rede furada, o teste ganhou dentes:
 * - o detector do `ilike` por sufixo (T14) acusava código legítimo
 *   (`valor.slice(0, 13)`, `x.replace('%', '')`); agora só pega o padrão de
 *   sufixo e **se testa** — 4 casos legítimos + 4 de sufixo, no mesmo arquivo;
 * - o T13 deixou de ser `it.todo`: a anotação tem que sair pela RPC
 *   `set_call_agent_notes` e os 4 métodos legados têm que estar `@deprecated`;
 * - `Math.random()` reintroduzido em `persistence.ts` deixava tudo verde (só o
 *   Sonar S2245 pegava) — agora há assert de fonte, ignorando comentários.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { midiaUsaSrtp } from '@/lib/calls/adapters/SipCallAdapter';

const SRC = join(process.cwd(), 'src');

/** Superfície de telefonia: é aqui que a regra de acesso vale. */
const DIRETORIOS = [
  'components/calls',
  'hooks/communication',
  'hooks/calls',
  'hooks/sip',
  'providers',
  'lib/calls',
].map((relativo) => join(SRC, relativo));

function fontesDe(raiz: string): string[] {
  let entradas: string[];
  try {
    entradas = readdirSync(raiz);
  } catch {
    return []; // diretório ainda não existe (etapa futura)
  }
  const saida: string[] = [];
  for (const entrada of entradas) {
    if (entrada === '__tests__' || entrada === 'node_modules') continue;
    const caminho = join(raiz, entrada);
    if (statSync(caminho).isDirectory()) saida.push(...fontesDe(caminho));
    else if (/\.(ts|tsx)$/.test(entrada)) saida.push(caminho);
  }
  return saida;
}

const FONTES = DIRETORIOS.flatMap(fontesDe);

/**
 * Padrão PROIBIDO de casamento de telefone por **sufixo** dentro de um
 * `ilike('phone', …)` — o que o T14 removeu.
 *
 * A primeira versão deste detector pegava qualquer `%`, `slice(`/`substring(`/
 * `substr(` dentro do valor, e acusava código **legítimo**: `valor.slice(0, 13)`
 * (normalizar E.164), `valor.slice(0)` e `x.replace('%', '')`. A auditoria
 * adversarial de 30/09 rodou os quatro casos e mostrou o falso positivo. Agora
 * só entram as três formas reais do SUFIXO:
 *   1. o valor **começa** com `%` — `'%12345678'`, `'%' + x`, `` `%${x}` `` (é
 *      assim que se escreve "termina com");
 *   2. variável nomeada como sufixo (`sufixo`, `suffix`, `ultimos`, `last8`…);
 *   3. índice **negativo** (`.slice(-8)`, `.substring(-8)`, `.substr(-8)`) — a
 *      forma computada do sufixo.
 * O contexto `ilike('phone', …)` continua obrigatório: `phone.ilike.%x%` do
 * PostgREST (busca por conteúdo, em `useCallHistory.ts`) não é sufixo, e o
 * `idsArray.slice(-50)` de `useTranscriptionNotifications.ts` não é telefone.
 */
const ILIKE_POR_SUFIXO = new RegExp(
  [
    /ilike\s*\(\s*['"]phone['"]\s*,\s*['"`]%/, // '%…' | '%' + x | `%${x}`
    /ilike\s*\(\s*['"]phone['"]\s*,\s*[^)]*?\b(?:sufixo|suffix|ultimos|ultimos8|last8|lastDigits)\b/i,
    /ilike\s*\(\s*['"]phone['"]\s*,\s*[^)]*?\.(?:slice|substring|substr)\(\s*-/,
  ]
    .map((parte) => parte.source)
    .join('|'),
  'i',
);

/**
 * Fonte sem comentários — assert de fonte vale sobre **código**.
 *
 * `persistence.ts` cita `Math.random()` no comentário que explica por que ele
 * NÃO é usado; um assert cru acusaria a própria documentação. O guard `[^:]`
 * evita comer `https://` de uma URL que esteja em código.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/gm, '$1');
}

describe('Telefonia — acesso e fronteiras (T07)', () => {
  it('encontra a superfície de telefonia (o teste não passa por vacuidade)', () => {
    // Sem isto, um erro de caminho faria todos os casos abaixo passarem vazios.
    expect(FONTES.length).toBeGreaterThan(5);
    expect(FONTES.some((f) => f.endsWith('useSipClient.ts'))).toBe(true);
  });

  it('nenhum arquivo da telefonia carrega a chave service_role', () => {
    // O cliente do front nunca pode ter poder de contornar RLS. Se alguém
    // trouxer a service_role para o módulo, este teste fica vermelho.
    const suspeitos = FONTES.filter((arquivo) =>
      /service_role|SERVICE_ROLE_KEY/i.test(readFileSync(arquivo, 'utf8')),
    );
    expect(suspeitos).toEqual([]);
  });

  it('o hook de SIP não fala SIP direto: a fronteira é o adapter (invariante do T09)', () => {
    const hook = readFileSync(join(SRC, 'hooks/communication/useSipClient.ts'), 'utf8');
    expect(hook).not.toMatch(/from 'sip\.js'/);
    expect(hook).toMatch(/CallEngine/);
  });

  it('o motor e o adapter não importam React (testáveis sem React — invariante do T09)', () => {
    for (const relativo of [
      'lib/calls/adapters/CallEngine.ts',
      'lib/calls/adapters/SipCallAdapter.ts',
      'lib/calls/adapters/CallAdapter.ts',
    ]) {
      expect(readFileSync(join(SRC, relativo), 'utf8'), relativo).not.toMatch(/from\s+['"]react['"]/);
    }
  });

  it('o casamento de telefone nunca volta ao sufixo de 8 dígitos (invariante do T14)', () => {
    // O fallback removido era `ilike('%' + últimos 8 dígitos)`. Se voltar,
    // chamadas de outro DDD são vinculadas ao contato errado.
    for (const arquivo of FONTES) {
      const conteudo = readFileSync(arquivo, 'utf8');
      expect(conteudo, arquivo).not.toMatch(ILIKE_POR_SUFIXO);
    }
  });

  it('o detector de sufixo acusa o padrão proibido e ignora código legítimo (T14)', () => {
    // Prova do detector em si: sem estes casos, estreitar o regex poderia
    // deixá-lo cego (verde por não acusar mais nada) e ninguém perceberia.
    const legitimos = [
      // normalizar E.164: pega os 13 primeiros dígitos — prefixo, não sufixo
      "supabase.from('contacts').select('id').ilike('phone', valor.slice(0, 13))",
      "supabase.from('contacts').select('id').ilike('phone', valor.slice(0))",
      // limpeza de máscara do LIKE: `%` citado, não usado como curinga
      "supabase.from('contacts').select('id').ilike('phone', x.replace('%', ''))",
      // prefixo de DDD (`55…`): a busca é "começa com", não "termina com"
      "supabase.from('contacts').select('id').ilike('phone', `${ddd}%`)",
      // o valor pode ser uma variante vinda de `phoneQueryVariants` (T14)
      "supabase.from('contacts').select('id').ilike('phone', variante)",
    ];
    for (const amostra of legitimos) {
      expect(amostra, amostra).not.toMatch(ILIKE_POR_SUFIXO);
    }

    const porSufixo = [
      "supabase.from('contacts').select('id').ilike('phone', `%${ultimos8}`)",
      "supabase.from('contacts').select('id').ilike('phone', '%' + sufixo)",
      "supabase.from('contacts').select('id').ilike('phone', valor.slice(-8))",
      "supabase.from('contacts').select('id').ilike('phone', '%99992048')",
    ];
    for (const amostra of porSufixo) {
      expect(amostra, amostra).toMatch(ILIKE_POR_SUFIXO);
    }
  });
});

describe('Telefonia — anotação da chamada e métodos legados (T13)', () => {
  const HOOK_CALLS = join(SRC, 'hooks/communication/useCalls.ts');

  it('T13/T66: a anotação humana sai pela RPC `set_call_agent_notes` — nenhum arquivo da telefonia escreve a coluna de anotação', () => {
    const hook = readFileSync(HOOK_CALLS, 'utf8');

    // O nome da RPC é constante (contrato da migration 20260927100000) e o
    // call site usa a constante: renomear um lado sem o outro fica vermelho.
    expect(hook).toMatch(/const SET_CALL_AGENT_NOTES_RPC\s*=\s*['"]set_call_agent_notes['"]/);
    expect(hook).toMatch(/supabase\.rpc\(\s*SET_CALL_AGENT_NOTES_RPC\s*,\s*\{/);
    expect(hook).toMatch(/p_call_id:\s*callId/);
    expect(hook).toMatch(/p_notes:\s*notes/);

    // Aceite do plano (o `grep` por escrita direta de `notes` em `src`) NÃO
    // fecha como está escrito: `src/hooks/crm/useContactSummaryNote.ts:23`
    // grava `notes`, mas na tabela `contacts` (CRM), fora da telefonia. Decisão
    // registrada: o assert é escopado à superfície de telefonia (FONTES).
    const escrevemNotes = FONTES.filter((arquivo) =>
      /\.(?:update|insert|upsert)\s*\(\s*\{[^}]*\bnotes\b/.test(readFileSync(arquivo, 'utf8')),
    );
    expect(escrevemNotes).toEqual([]);
  });

  it('T13: os 4 métodos legados do `useCalls` estão marcados `@deprecated`', () => {
    const hook = readFileSync(HOOK_CALLS, 'utf8');
    for (const metodo of ['startCall', 'answerCall', 'endCall', 'missCall']) {
      expect(hook, metodo).toMatch(
        new RegExp(`\\*\\s*@deprecated[\\s\\S]{0,700}?const ${metodo}\\s*=`),
      );
    }
    // O plano diz "usados só pelo `CallDialog` até T21"; a realidade medida é
    // `CallDialog` (+ os 4) E `IncomingCallAlert` (`answerCall`/`missCall`).
    // A JSDoc registra isso — remover os legados no T21 depende dos dois.
    expect(hook).toMatch(/CallDialog/);
    expect(hook).toMatch(/IncomingCallAlert/);
  });

  it('T11: o id da chamada não cai em PRNG previsível (`Math.random`)', () => {
    // A auditoria de 30/09 provou: reintroduzir `Math.random()` no fallback de
    // `preencherSemCrypto` deixa a suíte inteira VERDE — só o gate do Sonar
    // (`typescript:S2245`) pega. Este assert é de FONTE e olha só o código:
    // `persistence.ts` cita `Math.random()` no comentário que explica por que
    // ele NÃO é usado, e um assert cru acusaria a própria documentação.
    const codigo = semComentarios(readFileSync(join(SRC, 'lib/calls/persistence.ts'), 'utf8'));
    expect(codigo).not.toMatch(/Math\.random/);
    // O fallback existe e é o contador — sem isto o assert acima passaria até
    // se a função sumisse.
    expect(codigo).toMatch(/preencherSemCrypto/);
    expect(codigo).toMatch(/contadorUuid/);
  });
});

describe('Telefonia — asserções pendentes, com a etapa dona', () => {
  it.todo("T43/T45: `useMyCalls` nunca envia `p_scope='all'` quando o usuário não é admin/supervisor");
});

describe('Telefonia — lacunas herdadas (não cobertas pelas 100 etapas)', () => {
  it.todo('espera, transferência e conferência de chamada');
});

/**
 * SL-002: o `it.todo` de "enforcement de SRTP explícito nas opções do
 * SessionDescriptionHandler" virou teste.
 *
 * O `it.todo` era honesto quanto à lacuna: as opções de mídia pediam só áudio
 * (`{ audio: true, video: false }`) e **nenhum** ponto do app olhava o SDP
 * negociado — uma sessão em RTP claro (`RTP/AVP`) seguia para o áudio remoto
 * como se fosse segura. O que se prova aqui é o veredito sobre o SDP (teste de
 * comportamento, com a função real) e a ligação dele no motor (a fonte, que é o
 * estilo deste arquivo). O comportamento fim-a-fim — a sessão em claro NÃO
 * ficar "ativa" — está em `src/lib/calls/adapters/__tests__/CallEngine.test.ts`.
 */
describe('Telefonia — SRTP explícito (SL-002)', () => {
  const ADAPTER_SIP = join(SRC, 'lib/calls/adapters/SipCallAdapter.ts');
  const MOTOR = join(SRC, 'lib/calls/adapters/CallEngine.ts');
  const CONEXAO = join(SRC, 'hooks/sip/useSipConnection.ts');

  it('o perfil do SDP decide: SAVP (DTLS/SDES-SRTP) segue, RTP/AVP (em claro) não', () => {
    expect(midiaUsaSrtp('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n')).toBe(true); // WebRTC
    expect(midiaUsaSrtp('v=0\r\nm=audio 9 RTP/SAVPF 0 8\r\n')).toBe(true); // SDES-SRTP
    expect(midiaUsaSrtp('v=0\r\nm=audio 49170 RTP/AVP 0\r\n')).toBe(false); // RTP em claro
    // Basta UMA mídia em claro para a sessão inteira não valer.
    expect(midiaUsaSrtp('v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\nm=video 9 RTP/AVP 96\r\n')).toBe(false);
    // Sem `m=` não houve negociação de mídia: não há o que atestar.
    expect(midiaUsaSrtp('v=0\r\n')).toBe(false);
  });

  it('o veredito sai do SDP NEGOCIADO da sessão (DTLS vem do que foi trocado, não da config)', () => {
    const adapter = readFileSync(ADAPTER_SIP, 'utf8');
    expect(adapter).toMatch(/export function midiaUsaSrtp/);
    expect(adapter).toMatch(/remoteDescription\?\.sdp/);
    expect(adapter).toMatch(/midiaCriptografada\(session: Session\): boolean \| null/);
  });

  it('o motor consulta o adapter antes de marcar a chamada como atendida', () => {
    const motor = readFileSync(MOTOR, 'utf8');
    expect(motor).toMatch(/this\.adapter\.midiaCriptografada\(session\)/);
    // A consulta precede o bookkeeping: sessão em claro não pode aparecer como
    // "ativa" nem virar chamada atendida no banco.
    expect(motor.indexOf('midiaCriptografada(session)')).toBeLessThan(
      motor.indexOf("setStatus('active')"),
    );
  });

  it('as opções do SessionDescriptionHandler exigem o transporte cifrado (RTCP muxado + bundle)', () => {
    const conexao = readFileSync(CONEXAO, 'utf8');
    expect(conexao).toMatch(/sessionDescriptionHandlerFactoryOptions/);
    expect(conexao).toMatch(/peerConnectionConfiguration:\s*\{[^}]*rtcpMuxPolicy:\s*'require'/);
    expect(conexao).toMatch(/peerConnectionConfiguration:\s*\{[^}]*bundlePolicy:\s*'max-bundle'/);
  });
});
