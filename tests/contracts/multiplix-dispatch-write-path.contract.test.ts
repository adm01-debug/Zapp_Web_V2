/**
 * F54 (Bloco E) — CONTRATO do CAMINHO DE ESCRITA do Multiplix.
 *
 * O Bloco E tira a escrita do navegador: o front para de falar com as tabelas do
 * dispatcher e passa a chamar a edge `multiplix-dispatch`, que valida escopo e so
 * entao muta. Este contrato prova a fronteira:
 *   (a) NENHUM arquivo em `src/` insere/atualiza/apaga `multiplix_dispatches`,
 *       `multiplix_blocks` ou `multiplix_delivery_items` — a escrita passa pela edge;
 *   (b) as acoes de ESCRITA da edge conferem dono (`created_by = ctx.userId`, ou
 *       `manage_all`) ANTES de mutar;
 *   (c) `confirm` e o UNICO caminho que muda o status do dispatch para
 *       `scheduled`/`sending` — e quem faz isso e a RPC transacional, nao um UPDATE solto.
 *
 * Sem rede: le `src/` e a edge como TEXTO. Roda nos DOIS runners da CI:
 *   - `deno test --config scripts/ci/deno.json --frozen --allow-read tests/contracts/<este>`
 *   - `bun run test:contracts` (vitest)
 * Harness dual: `Deno.test` no Deno, `it()` no vitest; as assercoes sao unicas.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const IS_DENO = typeof Deno !== 'undefined' && typeof (Deno as { test?: unknown }).test === 'function';

type CaseFn = () => void | Promise<void>;
let registrar: (name: string, fn: CaseFn) => void;
if (IS_DENO) {
  registrar = (name, fn) => { Deno.test(name, fn); };
} else {
  const spec = 'vit' + 'est';
  const mod = (await import(spec)) as { it: (name: string, fn: CaseFn) => void };
  registrar = (name, fn) => { mod.it(name, fn); };
}

function assert(cond: unknown, msg: string): void {
  if (!cond) throw new Error(`[contrato F54] ${msg}`);
}

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel: string): string => readFileSync(resolve(ROOT, rel), 'utf8');

const EDGE = 'supabase/functions/multiplix-dispatch';
const INDEX = `${EDGE}/index.ts`;
const ACTION_FILES = ['blocks', 'audience', 'inspect', 'lifecycle'].map((n) => `${EDGE}/actions/${n}.ts`);

const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/** Caminhos relativos de arquivos sob um diretorio do repo (por extensao). */
function walk(relDir: string, ext: RegExp = /\.(ts|tsx)$/): string[] {
  const out: string[] = [];
  const abs = resolve(ROOT, relDir);
  for (const entry of readdirSync(abs)) {
    const childAbs = resolve(abs, entry);
    const childRel = `${relDir}/${entry}`;
    if (statSync(childAbs).isDirectory()) out.push(...walk(childRel, ext));
    else if (ext.test(entry)) out.push(childRel);
  }
  return out.sort();
}

// ---------------------------------------------------------------------------
// (a) o front nao escreve direto nas tabelas do dispatcher.
// ---------------------------------------------------------------------------

const TARGET_TABLES = ['multiplix_dispatches', 'multiplix_blocks', 'multiplix_delivery_items'];
const MUTATOR = /\.(insert|update|upsert|delete)\s*\(/;

/** Acha uma referencia a tabela e, na janela ate o fim do comando, um mutador. */
function directWriteHits(): string[] {
  const hits: string[] = [];
  for (const file of walk('src')) {
    const src = stripComments(read(file));
    for (const table of TARGET_TABLES) {
      for (const quote of ["'", '"']) {
        const needle = `${quote}${table}${quote}`;
        let idx = src.indexOf(needle);
        while (idx >= 0) {
          const semi = src.indexOf(';', idx);
          const stop = semi < 0 ? idx + 400 : Math.min(semi + 1, idx + 400);
          const window = src.slice(idx, stop);
          if (MUTATOR.test(window)) {
            hits.push(`${file}: ${table} -> ${MUTATOR.exec(window)?.[0]}`);
          }
          idx = src.indexOf(needle, idx + needle.length);
        }
      }
    }
  }
  return hits;
}

registrar('(a) o front NAO escreve direto em multiplix_dispatches/blocks/delivery_items', () => {
  const hits = directWriteHits();
  assert(hits.length === 0, `escrita direta no front (a escrita deve passar pela edge):\n${hits.join('\n')}`);

  // Nao-vacuidade: a varredura ENXERGA as tabelas — a leitura existe no front.
  const hook = read('src/hooks/integrations/useMultiplixDispatches.ts');
  assert(
    hook.includes("fromTable('multiplix_dispatches')") && hook.includes('.select('),
    'esperava a leitura de multiplix_dispatches no front (sem ela o scan seria vazio)',
  );
});

// ---------------------------------------------------------------------------
// (b) escopo: dono conferido antes de mutar.
// ---------------------------------------------------------------------------

registrar('(b) as acoes de escrita da edge conferem dono (created_by = ctx.userId) antes de mutar', () => {
  const index = stripComments(read(INDEX));
  const ownerInWhere = [...index.matchAll(/\.eq\('created_by',\s*ctx\.userId\)/g)].length;
  assert(
    ownerInWhere >= 2,
    `draft.update e draft.discard devem escopar por created_by no WHERE (achei ${ownerInWhere})`,
  );
  assert(/p_created_by:\s*ctx\.userId/.test(index), 'draft.create deve gravar p_created_by = ctx.userId');

  const blocks = stripComments(read(`${EDGE}/actions/blocks.ts`));
  assert(
    /function guardEditableDispatch[\s\S]*?row\.created_by !== ctx\.userId/.test(blocks),
    'blocks: guardEditableDispatch deve comparar row.created_by com ctx.userId',
  );
  const guardCalls = [...blocks.matchAll(/guardEditableDispatch\(ctx,/g)].length;
  assert(guardCalls === 3, `blocks: cada mutacao deve chamar guardEditableDispatch (achei ${guardCalls})`);
  const firstGuard = blocks.indexOf('guardEditableDispatch(ctx,');
  const writeIdxs = ['.insert(', '.update(', '.delete(', ".rpc('reorder_multiplix_blocks'"]
    .map((t) => blocks.indexOf(t))
    .filter((i) => i >= 0);
  assert(writeIdxs.length > 0, 'blocks: nenhuma escrita encontrada (scan quebrado)');
  assert(
    firstGuard >= 0 && firstGuard < Math.min(...writeIdxs),
    'blocks: a guarda de dono deve vir ANTES da primeira escrita',
  );

  const lifecycle = stripComments(read(`${EDGE}/actions/lifecycle.ts`));
  assert(
    lifecycle.includes('resolveScope(ctx, dispatch.created_by)'),
    'confirm/status devem resolver o escopo a partir do created_by do dispatch',
  );
  assert(
    /!scope\.isOwner\s*&&\s*!scope\.manageAll/.test(lifecycle),
    'sem dono nem manage_all a acao deve ser NEGADA (404/403)',
  );
});

// ---------------------------------------------------------------------------
// (c) confirm e o unico caminho que transiciona o status.
// ---------------------------------------------------------------------------

registrar('(c) confirm e o UNICO caminho que muda o status para scheduled/sending', () => {
  const files = [INDEX, ...ACTION_FILES];
  for (const file of files) {
    const src = stripComments(read(file));
    const directSet = /status:\s*['"](scheduled|sending)['"]/.exec(src);
    assert(
      directSet === null,
      `${file}: nenhum TS pode setar status scheduled/sending direto (achei ${directSet?.[0]})`,
    );
  }

  // A unica RPC que transiciona o status e a do confirm, e so o lifecycle.ts a chama.
  for (const file of files) {
    const src = stripComments(read(file));
    if (file === `${EDGE}/actions/lifecycle.ts`) {
      assert(src.includes("rpc('multiplix_confirm_dispatch'"), 'lifecycle.ts deve chamar a RPC do confirm');
    } else {
      assert(
        !src.includes('multiplix_confirm_dispatch'),
        `${file}: so o confirm pode chamar multiplix_confirm_dispatch`,
      );
    }
  }

  // A transicao de status vive na RPC SQL (mesma transacao da materializacao).
  const migrations = walk('supabase/migrations', /\.sql$/).filter((f) => f.includes('multiplix_confirm_dispatch'));
  assert(migrations.length > 0, 'nenhuma migration de multiplix_confirm_dispatch encontrada');
  const sql = migrations.map((f) => read(f)).join('\n');
  assert(
    /'scheduled'::public\.multiplix_dispatch_status/.test(sql),
    'a RPC do confirm deve transicionar o dispatch para scheduled',
  );
  assert(
    /'sending'::public\.multiplix_dispatch_status/.test(sql),
    'a RPC do confirm deve transicionar o dispatch para sending',
  );
});
