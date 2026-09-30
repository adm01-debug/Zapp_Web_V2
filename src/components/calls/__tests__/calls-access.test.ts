/**
 * Acesso e fronteiras do módulo de Telefonia — etapa T07.
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
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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
      expect(readFileSync(join(SRC, relativo), 'utf8'), relativo).not.toMatch(/from 'react'/);
    }
  });

  it('o casamento de telefone nunca volta ao sufixo de 8 dígitos (invariante do T14)', () => {
    // O fallback removido era `ilike('%' + últimos 8 dígitos)`. Se voltar,
    // chamadas de outro DDD são vinculadas ao contato errado.
    for (const arquivo of FONTES) {
      const conteudo = readFileSync(arquivo, 'utf8');
      expect(conteudo, arquivo).not.toMatch(/ilike\s*\(\s*['"]phone['"]\s*,\s*[`'"]%/i);
    }
  });
});

describe('Telefonia — asserções pendentes, com a etapa dona', () => {
  it.todo("T43/T45: `useMyCalls` nunca envia `p_scope='all'` quando o usuário não é admin/supervisor");
  it.todo('T13/T66: `set_call_agent_notes` é o único caminho de escrita de anotação humana');
  it.todo('T13: a coluna `notes` (metadado do provedor) nunca aparece em payload de escrita do front');
});

describe('Telefonia — lacunas herdadas (não cobertas pelas 100 etapas)', () => {
  it.todo('espera, transferência e conferência de chamada');
  it.todo('enforcement de SRTP explícito nas opções do SessionDescriptionHandler');
});
