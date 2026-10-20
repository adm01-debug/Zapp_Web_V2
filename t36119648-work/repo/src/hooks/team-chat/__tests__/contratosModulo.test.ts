import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '@/hooks/team-chat/queryKeys';
import { DEPARTMENT_AUDIT_ACTIONS } from '@/hooks/team-chat/teamChatTypes';

/**
 * SL-081 (F50/F51/F52) — prova que o README do módulo não promete nada que o
 * código não faça. O README é lido como contrato:
 *
 *  - toda linha da tabela "Fonte de dados por hook" tem de casar com o arquivo
 *    do hook (`.from('<tabela>')`, `.rpc('<rpc>')`, `channel(\`<canal>\`)`,
 *    bucket do storage) e o nome de tabela/RPC tem de existir em `types.ts`;
 *  - toda fábrica citada no README existe em `queryKeys.ts` (e vice-versa);
 *  - o vocabulário de auditoria do README é o mesmo do CHECK
 *    `department_audit_logs_action_check` da última migration que o define;
 *  - nenhuma chave literal sobrou no módulo (chave escrita como array no
 *    próprio arquivo), nem no código nem nos testes.
 */

/**
 * Sobe do `cwd` até a raiz do projeto. O runner roda com jsdom, onde
 * `import.meta.url` não é `file:` — não dá para derivar o caminho dele.
 */
function acharRaiz(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, 'src', 'hooks', 'team-chat', 'README.md'))) {
    const pai = dirname(dir);
    if (pai === dir) {
      throw new Error(`raiz do projeto não encontrada a partir de ${process.cwd()}`);
    }
    dir = pai;
  }
  return dir;
}

const RAIZ = acharRaiz();
const MODULE_DIR = join(RAIZ, 'src', 'hooks', 'team-chat');

const README = readFileSync(join(MODULE_DIR, 'README.md'), 'utf8');
const TYPES_TS = readFileSync(join(MODULE_DIR, '..', '..', 'integrations', 'supabase', 'types.ts'), 'utf8');

function secao(titulo: string): string {
  const partes = README.split(/^## /m).slice(1);
  const achada = partes.find((p) => p.split('\n')[0]?.trim() === titulo);
  if (achada === undefined) throw new Error(`README sem a seção "${titulo}"`);
  return achada;
}

function linhasDaTabela(titulo: string): string[][] {
  return secao(titulo)
    .split('\n')
    .filter((l) => l.startsWith('|'))
    .slice(2) // cabeçalho + separador
    .map((l) => l.split('|').slice(1, -1).map((c) => c.replace(/`/g, '').trim()));
}

function arquivosDoModulo(): string[] {
  return readdirSync(MODULE_DIR)
    .filter((n) => /\.tsx?$/.test(n))
    .map((n) => join(MODULE_DIR, n));
}

describe('README do Team Chat — nomes têm correspondente no código', () => {
  const linhas = linhasDaTabela('Fonte de dados por hook');

  it('a tabela tem as 4 colunas e pelo menos 20 linhas', () => {
    expect(linhas.length).toBeGreaterThanOrEqual(20);
    for (const linha of linhas) expect(linha).toHaveLength(4);
  });

  it.each(linhasDaTabela('Fonte de dados por hook'))(
    '%s usa %s %s (arquivo %s)',
    (hook, arquivo, tipo, nome) => {
      const caminho = join(MODULE_DIR, arquivo);
      expect(existsSync(caminho), `arquivo ${arquivo} não existe`).toBe(true);
      const fonte = readFileSync(caminho, 'utf8');

      // o hook citado é exportado por esse arquivo
      const exportado = new RegExp(`export (async )?(function|const) ${hook}\\b`).test(fonte);
      expect(exportado, `${arquivo} não exporta ${hook}`).toBe(true);

      if (tipo === 'tabela' || tipo === 'rpc') {
        const chamada = tipo === 'tabela' ? `.from('${nome}')` : `.rpc('${nome}'`;
        expect(fonte.includes(chamada), `${arquivo} não chama ${chamada}`).toBe(true);
        expect(TYPES_TS.includes(`      ${nome}: {`), `${nome} não existe em types.ts`).toBe(true);
      } else if (tipo === 'canal') {
        const modelo = nome.replace('<conversationId>', '${conversationId}');
        // canal fixo usa aspas simples; canal por conversa usa template literal.
        // o canal pode vir com opções na frente, então basta o nome na chamada
        const variantes = [`channel('${modelo}'`, `channel(\`${modelo}\``];
        expect(
          variantes.some((v) => fonte.includes(v)),
          `${arquivo} não abre o canal ${modelo}`,
        ).toBe(true);
      } else if (tipo === 'storage') {
        expect(fonte.includes(`'${nome}'`), `${arquivo} não usa o bucket ${nome}`).toBe(true);
      } else {
        throw new Error(`tipo desconhecido na tabela do README: ${tipo}`);
      }
    },
  );

  it('todo canal citado no README é aberto e fechado com removeChannel no arquivo do hook', () => {
    const canais = linhasDaTabela('Fonte de dados por hook').filter((l) => l[2] === 'canal');
    expect(canais.length).toBeGreaterThanOrEqual(5);
    for (const [, arquivo] of canais) {
      const fonte = readFileSync(join(MODULE_DIR, arquivo), 'utf8');
      expect(fonte.includes('removeChannel'), `${arquivo} não fecha o canal`).toBe(true);
    }
  });

  it('todo tipo derivado citado no README é exportado por teamChatTypes.ts', () => {
    const tipos = secao('Tipos derivados (`teamChatTypes.ts`)').matchAll(/`([A-Za-z]+)`/g);
    const teamChatTypes = readFileSync(join(MODULE_DIR, 'teamChatTypes.ts'), 'utf8');
    let citados = 0;
    for (const [, nome] of tipos) {
      citados += 1;
      expect(
        new RegExp(`export type ${nome}\\b|export interface ${nome}\\b`).test(teamChatTypes),
        `teamChatTypes.ts não exporta ${nome}`,
      ).toBe(true);
    }
    expect(citados).toBeGreaterThanOrEqual(8);
  });
});

describe('README do Team Chat — fábricas de chave', () => {
  function resolver(path: string): unknown {
    return path
      .replace(/^queryKeys\.?/, '')
      .split('.')
      .filter(Boolean)
      .reduce<unknown>((acc, parte) => (acc as Record<string, unknown>)?.[parte], queryKeys);
  }

  it('toda fábrica citada no README existe em queryKeys.ts', () => {
    const citadas = new Set([...README.matchAll(/`(queryKeys[A-Za-z0-9_.]*)\(/g)].map((m) => m[1]));
    expect(citadas.size).toBeGreaterThanOrEqual(10);
    for (const path of citadas) {
      expect(typeof resolver(path), `${path} não é função em queryKeys.ts`).toBe('function');
    }
  });

  it('toda fábrica de queryKeys.ts está citada no README', () => {
    const citadas = new Set([...README.matchAll(/`(queryKeys[A-Za-z0-9_.]*)\(/g)].map((m) => m[1]));
    const faltando: string[] = [];
    for (const [nome, valor] of Object.entries(queryKeys)) {
      if (typeof valor === 'function') {
        if (!citadas.has(`queryKeys.${nome}`)) faltando.push(`queryKeys.${nome}`);
        continue;
      }
      for (const [sub, fn] of Object.entries(valor as Record<string, unknown>)) {
        if (typeof fn === 'function' && !citadas.has(`queryKeys.${nome}.${sub}`)) {
          faltando.push(`queryKeys.${nome}.${sub}`);
        }
      }
    }
    expect(faltando).toEqual([]);
  });
});

describe('README do Team Chat — vocabulário de auditoria', () => {
  const texto = secao('Vocabulário de auditoria');

  it('o vocabulário do README é o CHECK da última migration que o define', () => {
    const dir = join(RAIZ, 'supabase', 'migrations');
    const definidoras = readdirSync(dir)
      .filter((n) => n.endsWith('.sql'))
      .sort()
      .filter((n) =>
        readFileSync(join(dir, n), 'utf8').includes(
          'ADD CONSTRAINT department_audit_logs_action_check',
        ),
      );
    const ultima = definidoras[definidoras.length - 1];
    expect(ultima, 'nenhuma migration define department_audit_logs_action_check').toBeDefined();
    // O cabeçalho da migration é um comentário de rollback com o CHECK ANTIGO:
    // sem tirar os comentários o teste compararia com a versão anterior.
    const sql = readFileSync(join(dir, ultima as string), 'utf8')
      .split('\n')
      .filter((linha) => !linha.trimStart().startsWith('--'))
      .join('\n');
    const lista = /department_audit_logs_action_check CHECK \(action IN \(([\s\S]*?)\)\)/.exec(sql);
    expect(lista, 'CHECK não encontrado na migration').not.toBeNull();
    const doBanco = [...(lista as RegExpExecArray)[1].matchAll(/'([a-z_]+)'/g)]
      .map((m) => m[1])
      .sort();
    expect(doBanco).toEqual([...DEPARTMENT_AUDIT_ACTIONS].sort());
  });

  it('o README lista todos os verbos e nenhum verbo inventado', () => {
    for (const verbo of DEPARTMENT_AUDIT_ACTIONS) {
      expect(texto.includes(`\`${verbo}\``), `README não lista ${verbo}`).toBe(true);
    }
    const noReadme = new Set([...texto.matchAll(/`([a-z_]+)`/g)].map((m) => m[1]));
    const extras = [...noReadme].filter(
      (v) => !(DEPARTMENT_AUDIT_ACTIONS as readonly string[]).includes(v),
    );
    // o nome do CHECK é citado de propósito; qualquer outro verbo é invenção.
    expect(extras).toEqual(['department_audit_logs_action_check']);
  });
});

describe('Team Chat — nenhuma chave literal no módulo (F52)', () => {
  it('não há chave de cache escrita como array no módulo, código ou teste', () => {
    const infratores = arquivosDoModulo()
      .filter((p) => /queryKey:\s*\[/.test(readFileSync(p, 'utf8')))
      .map((p) => p.replace(`${RAIZ}/`, ''));
    expect(infratores).toEqual([]);
  });
});
