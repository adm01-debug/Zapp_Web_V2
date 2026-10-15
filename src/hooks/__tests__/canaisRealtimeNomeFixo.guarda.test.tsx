import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Guarda: canal de `postgres_changes` (por tabela) não pode ter nome fixo.
 *
 * `supabase.channel(nome)` devolve o canal já existente quando o nome se repete
 * e, desde a realtime-js 2.101, `.on()` num canal já inscrito lança erro — um
 * hook com nome fixo montado em dois componentes ao mesmo tempo derruba a tela.
 * A correção é envolver o tópico em `uniqueRealtimeTopic(...)`, que acrescenta um
 * id por instância. Este teste varre a fonte (não o runtime) para o nome fixo não
 * voltar num PR futuro.
 *
 * Fora do alcance de propósito:
 * - presence/broadcast (usam `\`...${id}\`` ou config, e precisam do MESMO tópico);
 * - tópicos por instância via template com `${...}` (não casam com a regex);
 * - constantes passadas como identificador (ex.: CONNECTIONS_HEALTH_CHANNEL) —
 *   revisão manual.
 */

// `CANAIS_REALTIME_RAIZ` permite apontar a varredura para uma cópia da base
// (ex.: `git archive dia/<data> | tar -x -C .tmp/base-dia`) e provar que a guarda
// REPROVA a árvore anterior à correção. Ausente, varre o `src` do projeto.
const RAIZ = resolve(process.cwd(), process.env.CANAIS_REALTIME_RAIZ ?? 'src');
const DIRETORIOS = [join(RAIZ, 'hooks'), join(RAIZ, 'services'), join(RAIZ, 'lib'), join(RAIZ, 'components')];

// Nomes fixos intencionais (com o porquê). Tudo que não estiver aqui é violação.
const PERMITIDOS = new Map<string, string>([
  [
    'diagnostics-realtime-probe',
    'sonda de diagnóstico: abre e fecha o canal de propósito para medir latência',
  ],
]);

const LITERAL_FIXO = /\.channel\(\s*(['"])([^'"`$]*)\1/g;

function arquivosDeCodigo(dir: string): string[] {
  const encontrados: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const caminho = join(dir, entrada);
    if (statSync(caminho).isDirectory()) {
      if (entrada === '__tests__' || entrada === 'node_modules') continue;
      encontrados.push(...arquivosDeCodigo(caminho));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entrada)) continue;
    if (/\.(test|spec)\.tsx?$/.test(entrada)) continue;
    encontrados.push(caminho);
  }
  return encontrados;
}

function linhaEhComentario(linha: string): boolean {
  const t = linha.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*');
}

describe('canais de realtime: nome fixo proibido', () => {
  it('nenhum `supabase.channel("<nome fixo>")` fora da lista permitida', () => {
    const violacoes: string[] = [];

    for (const caminho of DIRETORIOS.flatMap(arquivosDeCodigo)) {
      const linhas = readFileSync(caminho, 'utf8').split('\n');
      linhas.forEach((linha, indice) => {
        if (linhaEhComentario(linha)) return;
        LITERAL_FIXO.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = LITERAL_FIXO.exec(linha)) !== null) {
          const nome = match[2];
          if (PERMITIDOS.has(nome)) continue;
          violacoes.push(`${caminho}:${indice + 1} -> .channel('${nome}')`);
        }
      });
    }

    expect(
      violacoes,
      `Canal postgres_changes com nome fixo (use uniqueRealtimeTopic(...)):\n${violacoes.join('\n')}`,
    ).toEqual([]);
  });
});
