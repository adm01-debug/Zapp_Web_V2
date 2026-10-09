import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// F94 · Multiplix — contrato dos documentos do módulo.
//
// O defeito real: `docs/multiplix/SCHEMA.md`, `ARQUITETURA.md` e `COMPONENTES.md` não existiam, e a
// "receita de módulo" (lazyViews + nav + permissão + flag) não estava em nenhum lugar. Documento que
// não existe não pode mentir; documento que existe e diverge do código mente todo dia.
//
// Por isso este contrato NÃO confere texto solto: ele trata os docs como artefato sob teste e usa o
// CÓDIGO como fonte independente —
//   * as tabelas de `SCHEMA.md` são comparadas (nos dois sentidos) com as `multiplix_*` reais de
//     `src/integrations/supabase/types.ts`;
//   * toda fonte citada em `ARQUITETURA.md` tem de existir (tabela, RPC do ZAPP, RPC do Singu ou enum);
//   * todo caminho citado em `COMPONENTES.md` tem de existir no disco;
//   * a receita de `DESIGN_TOKENS_MAP.md` é comparada com `NavigationService` de verdade (importado) e
//     com a linha real de `src/pages/lazyViews.ts`.
//
// Se o código mudar (id de nav, permissão, tabela, componente), o doc tem de mudar junto — senão
// este teste fica vermelho.

const RAIZ = process.cwd();
const TYPES = 'src/integrations/supabase/types.ts';
const SCHEMA = 'docs/multiplix/SCHEMA.md';
const ARQUITETURA = 'docs/multiplix/ARQUITETURA.md';
const COMPONENTES = 'docs/multiplix/COMPONENTES.md';
const DESIGN_TOKENS = 'docs/multiplix/DESIGN_TOKENS_MAP.md';
const LAZY_VIEWS = 'src/pages/lazyViews.ts';

function ler(rel: string): string {
  return readFileSync(`${RAIZ}/${rel}`, 'utf8');
}

function existe(rel: string): boolean {
  return existsSync(`${RAIZ}/${rel}`);
}

/** Seção markdown: do cabeçalho `## <inicio>` até o próximo `## ` (exclusivo). */
function secao(md: string, inicio: string): string {
  const de = md.indexOf(inicio);
  if (de === -1) return '';
  const resto = md.slice(de + inicio.length);
  const ate = resto.indexOf('\n## ');
  return ate === -1 ? resto : resto.slice(0, ate);
}

/** Tokens entre crases que parecem nome de tabela/RPC/função do módulo. */
function tokensMultiplix(texto: string): string[] {
  return Array.from(texto.matchAll(/`(multiplix_[a-z0-9_]+)`/g)).map((m) => m[1]);
}

/** Bloco de `types.ts` entre dois marcadores de topo da seção (Tables/Functions/Enums). */
function blocoTypes(de: string, ate: string | null): string {
  const src = ler(TYPES);
  const inicio = src.indexOf(de);
  if (inicio === -1) throw new Error(`types.ts: marcador "${de}" não encontrado`);
  const fim = ate ? src.indexOf(ate, inicio) : src.length;
  return src.slice(inicio, fim === -1 ? src.length : fim);
}

/** Entradas `multiplix_*` de um bloco de types.ts (tabelas, funções ou enums). */
function nomesMultiplix(bloco: string): string[] {
  return Array.from(bloco.matchAll(/^ {6}(multiplix_[a-z0-9_]+):/gm)).map((m) => m[1]);
}

const TABELAS = nomesMultiplix(blocoTypes('    Tables: {', '    Views: {'));
const FUNCOES_ZAPP = nomesMultiplix(blocoTypes('    Functions: {', '    Enums: {'));
const ENUMS = nomesMultiplix(blocoTypes('    Enums: {', null));

/** RPCs do outro banco (Singu): um arquivo `.sql` por RPC. */
const RPCS_SINGU = readdirSync(`${RAIZ}/supabase/migrations/_foreign/singu`)
  .filter((f) => f.endsWith('.sql'))
  .map((f) => f.replace(/\.sql$/, ''));

/** Funções `public.multiplix_*` declaradas nas migrations (inclui triggers internos). */
const FUNCOES_MIGRATION = Array.from(
  new Set(
    readdirSync(`${RAIZ}/supabase/migrations`)
      .filter((f) => f.endsWith('.sql'))
      .flatMap((f) =>
        Array.from(
          ler(`supabase/migrations/${f}`).matchAll(/FUNCTION public\.(multiplix_[a-z0-9_]+)/g),
        ).map((m) => m[1]),
      ),
  ),
);

const CONHECIDOS = new Set<string>([...TABELAS, ...FUNCOES_ZAPP, ...ENUMS, ...RPCS_SINGU, ...FUNCOES_MIGRATION]);

describe('F94 · docs/multiplix existem e batem com o código', () => {
  it('os três documentos existem e têm conteúdo real', () => {
    for (const doc of [SCHEMA, ARQUITETURA, COMPONENTES]) {
      expect(existe(doc), `${doc} precisa existir`).toBe(true);
      expect(ler(doc).length, `${doc} não pode ser um esqueleto vazio`).toBeGreaterThan(500);
    }
  });

  it('as fontes de verdade usadas pelo contrato foram lidas do código (pré-condição)', () => {
    // Guarda contra "teste que passa porque o parser não achou nada".
    expect(TABELAS.length).toBeGreaterThanOrEqual(9);
    expect(RPCS_SINGU.length).toBeGreaterThanOrEqual(5);
    expect(FUNCOES_MIGRATION.length).toBeGreaterThanOrEqual(4);
    expect(TABELAS).toContain('multiplix_dispatches');
    expect(TABELAS).toContain('multiplix_recipients');
  });

  describe('SCHEMA.md', () => {
    it('declara exatamente as tabelas multiplix_* que existem no banco', () => {
      const sec = secao(ler(SCHEMA), '## Tabelas');
      expect(sec, 'SCHEMA.md precisa da seção "## Tabelas"').not.toBe('');
      const declaradas = Array.from(new Set(tokensMultiplix(sec))).sort();
      // Igualdade nos dois sentidos: tabela nova no código sem doc = vermelho;
      // tabela citada no doc que não existe no banco = vermelho.
      expect(declaradas).toEqual([...TABELAS].sort());
    });

    it('cita apenas RPCs do ZAPP que existem no banco ou nas migrations', () => {
      const sec = secao(ler(SCHEMA), '## RPCs no banco do ZAPP');
      expect(sec, 'SCHEMA.md precisa da seção de RPCs').not.toBe('');
      const citadas = Array.from(new Set(tokensMultiplix(sec)));
      expect(citadas.length).toBeGreaterThanOrEqual(4);
      const fantasmas = citadas.filter((t) => !CONHECIDOS.has(t));
      expect(fantasmas, `RPC(s) citada(s) que não existem: ${fantasmas.join(', ')}`).toEqual([]);
    });
  });

  describe('ARQUITETURA.md', () => {
    it('traz o diagrama mermaid de componentes do módulo', () => {
      const md = ler(ARQUITETURA);
      const blocos = Array.from(md.matchAll(/```mermaid\n([\s\S]*?)```/g)).map((m) => m[1]);
      expect(blocos.length, 'ARQUITETURA.md precisa de blocos mermaid').toBeGreaterThanOrEqual(1);
      const grafo = blocos.find((b) => b.includes('graph TD'));
      expect(grafo, 'precisa do grafo de componentes (graph TD)').toBeTruthy();
      for (const no of ['MultiplixView', 'useMultiplixDispatches', 'multiplix-dispatch', 'multiplix-send']) {
        expect(grafo!, `o grafo precisa citar ${no}`).toContain(no);
      }
    });

    it('tem a tabela "Métrica → Fonte" e toda fonte citada existe', () => {
      const sec = secao(ler(ARQUITETURA), '## Métrica → Fonte de Dado');
      expect(sec, 'ARQUITETURA.md precisa da seção "Métrica → Fonte de Dado"').not.toBe('');

      const linhas = sec
        .split('\n')
        .filter((l) => l.trim().startsWith('|'))
        .filter((l) => !/^\|\s*-+/.test(l.trim()));
      // -1 cabeçalho · a tabela precisa de corpo de verdade.
      expect(linhas.length - 1, 'a tabela de métricas precisa de linhas').toBeGreaterThanOrEqual(10);

      const fantasmas: string[] = [];
      for (const linha of linhas) {
        if (/n[ãa]o mostrar|n[ãa]o implementar/i.test(linha)) continue; // linha explícita de "não existe"
        for (const token of Array.from(new Set(tokensMultiplix(linha)))) {
          if (!CONHECIDOS.has(token)) fantasmas.push(token);
        }
      }
      expect(Array.from(new Set(fantasmas)), 'fonte citada que não existe no código').toEqual([]);
    });
  });

  describe('COMPONENTES.md', () => {
    it('cita todos os componentes do módulo que existem em src/components/multiplix', () => {
      const doc = ler(COMPONENTES);
      const componentes = readdirSync(`${RAIZ}/src/components/multiplix`).filter((f) => f.endsWith('.tsx'));
      expect(componentes.length).toBeGreaterThanOrEqual(3);
      for (const arquivo of componentes) {
        expect(doc, `${arquivo} precisa aparecer em COMPONENTES.md`).toContain(arquivo);
      }
    });

    it('todo caminho de código citado existe no disco', () => {
      const doc = ler(COMPONENTES);
      const caminhos = Array.from(
        new Set(
          Array.from(doc.matchAll(/`((?:src|supabase|tests|scripts|docs)\/[A-Za-z0-9_./-]+)`/g)).map((m) => m[1]),
        ),
      );
      expect(caminhos.length).toBeGreaterThanOrEqual(20);
      const quebrados = caminhos.filter((c) => !existe(c));
      expect(quebrados, `caminho(s) citado(s) que não existem: ${quebrados.join(', ')}`).toEqual([]);
    });
  });

  describe('DESIGN_TOKENS_MAP.md — receita de módulo (lazyViews + nav + permissão + flag)', () => {
    // Código de verdade, não cópia: o item de menu vem do serviço que a UI usa.
    it('o item de nav do Multiplix existe e tem o gate por permissão nomeada', async () => {
      const { NavigationService } = await import('../../src/services/navigation.service');
      const item = NavigationService.getPrimaryNav().find((i) => i.id === 'multiplix');
      expect(item, 'NavigationService precisa do item "multiplix"').toBeTruthy();
      expect(item!.permission, 'o gate do Multiplix é a permissão nomeada').toBe('multiplix.dispatch.create');
      // Nega por omissão (papel de staff sem a permissão) e libera quem tem a permissão.
      expect(NavigationService.canAccess('multiplix', ['admin', 'supervisor'], [])).toBe(false);
      expect(NavigationService.canAccess('multiplix', [], ['multiplix.dispatch.create'])).toBe(true);
    });

    it('a receita documentada reproduz o item real de nav e a linha real do lazyViews', () => {
      const doc = ler(DESIGN_TOKENS);
      expect(doc, 'a receita precisa estar em DESIGN_TOKENS_MAP.md').toContain('Receita de módulo');

      // Linha real do lazyViews: a receita tem de citá-la, não parafraseá-la.
      const linhaLazy = ler(LAZY_VIEWS)
        .split('\n')
        .map((l) => l.trim())
        .find((l) => /^export const (\w+) = lazyWithRetry\(\(\) => import\('@\/components\/multiplix\//.test(l));
      expect(linhaLazy, 'lazyViews.ts precisa exportar a view do Multiplix').toBeTruthy();
      expect(doc, 'a receita precisa citar a linha real do lazyViews').toContain(linhaLazy!);

      const exportNome = linhaLazy!.match(/^export const (\w+)/)![1];
      expect(exportNome).toBe('MultiplixView');
      expect(doc).toContain(exportNome);

      // Os 4 passos da receita, com os valores reais.
      expect(doc).toContain("id: 'multiplix'");
      expect(doc).toContain('multiplix.dispatch.create');
      expect(doc).toContain('src/pages/lazyViews.ts');
      expect(doc).toContain('src/services/navigation.service.ts');
      // A flag é passo da receita e o mecanismo citado existe de verdade.
      expect(doc).toContain('useFeatureFlag');
      expect(existe('src/hooks/system/useFeatureFlag.ts')).toBe(true);
    });
  });
});
