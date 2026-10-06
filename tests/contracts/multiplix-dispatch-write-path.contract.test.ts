/**
 * F54 (Bloco E) — CONTRATO do CAMINHO DE ESCRITA do Multiplix.
 *
 * O Bloco E tira a escrita do navegador: o front para de falar com as tabelas do
 * dispatcher e passa a chamar a edge `multiplix-dispatch`, que valida escopo e so
 * entao muta. Este contrato prova a fronteira:
 *   (a) NENHUM arquivo em `src/` insere/atualiza/apaga `multiplix_dispatches`,
 *       `multiplix_blocks` ou `multiplix_delivery_items` — a escrita passa pela edge;
 *   (b) as acoes de ESCRITA da edge conferem dono pela IDENTIDADE CANONICA
 *       (`created_by = profiles.id`, resolvido de `profiles.user_id` = auth.uid) e
 *       honram `manage_all` ANTES de mutar — nunca comparando com o `ctx.userId` cru;
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
const ACTION_FILES = ['blocks', 'audience', 'inspect', 'lifecycle', 'listing'].map((n) => `${EDGE}/actions/${n}.ts`);

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

/**
 * Acha uma referencia a tabela e, na janela ate o fim do comando, um mutador.
 * Recebe as fontes (arquivo + conteudo cru) para ser exercitavel tambem contra
 * amostras sinteticas — e o controle positivo/negativo do proprio scanner.
 */
function directWriteHitsIn(sources: Array<{ file: string; src: string }>): string[] {
  const hits: string[] = [];
  for (const { file, src: raw } of sources) {
    const src = stripComments(raw);
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

/** Varre o front (src/) com o detector de escrita direta. */
function directWriteHits(): string[] {
  return directWriteHitsIn(walk('src').map((file) => ({ file, src: read(file) })));
}

registrar('(a) o front NAO escreve direto em multiplix_dispatches/blocks/delivery_items', () => {
  const hits = directWriteHits();
  assert(hits.length === 0, `escrita direta no front (a escrita deve passar pela edge):\n${hits.join('\n')}`);

  // Controle POSITIVO: o MESMO detector acusa uma escrita direta real. Sem isto um
  // zero poderia ser um scanner cego (varrendo zero arquivo ou sem o padrao certo).
  const positivo = directWriteHitsIn([{
    file: '(controle)',
    src: "await supabase.from('multiplix_dispatches').update({ status: 'draft' }).eq('id', id);",
  }]);
  assert(
    positivo.length === 1,
    `o detector nao acusou uma escrita direta sintetica (scanner cego): ${positivo.join(', ') || 'nenhum hit'}`,
  );
  // Controle NEGATIVO: leitura pura NAO e acusada (sem falso-positivo).
  const negativo = directWriteHitsIn([{
    file: '(controle)',
    src: "await supabase.from('multiplix_dispatches').select('id').eq('id', id);",
  }]);
  assert(
    negativo.length === 0,
    `o detector acusou uma leitura como escrita (falso-positivo): ${negativo.join(', ')}`,
  );

  // Estado verdadeiro do front (Bloco E): a leitura do Multiplix saiu do PostgREST
  // direto e passou a ser feita pela EDGE (`dispatch.list`/`recipients.list`). A
  // prova de nao-vacuidade e o caminho de leitura existir — so que na fronteira,
  // nao mais nas tabelas.
  const hook = read('src/hooks/integrations/useMultiplixDispatches.ts');
  assert(
    hook.includes("invokeMultiplixDispatch('dispatch.list'") &&
      hook.includes("invokeMultiplixDispatch('recipients.list'"),
    'esperava a leitura do Multiplix pela edge (dispatch.list/recipients.list) no front',
  );
});

// ---------------------------------------------------------------------------
// (b) escopo: dono conferido antes de mutar.
// ---------------------------------------------------------------------------

registrar('(b) as acoes de escrita conferem dono pela IDENTIDADE CANONICA (profiles.id), nunca pelo auth.uid cru', () => {
  const index = stripComments(read(INDEX));
  // MX08: `multiplix_dispatches.created_by` (e o `p_created_by` da RPC) guarda
  // `profiles.id`, enquanto `requireAuth` entrega o `auth.uid` em `ctx.userId`.
  // Usar o auth.uid como dono negava o PROPRIO dono (404/409) e fazia a criacao
  // cair em `multiplix_draft_owner_not_found` (o defeito de identidades do MX08).
  assert(
    !/\.eq\('created_by',\s*ctx\.userId\)/.test(index),
    'nenhuma escrita pode escopar created_by = ctx.userId (auth.uid != profiles.id)',
  );
  assert(
    /p_created_by:\s*profileId/.test(index),
    'draft.create deve gravar p_created_by = profiles.id resolvido do JWT',
  );
  assert(
    /export async function resolveProfileId/.test(index) && /\.eq\('user_id',\s*ctx\.userId\)/.test(index),
    'a identidade canonica sai de profiles.user_id (auth.uid) -> profiles.id',
  );
  const ownerReads = [...index.matchAll(/readOwnerId\(ctx,/g)].length;
  assert(ownerReads >= 2, `draft.update e draft.discard devem LER o dono antes de mutar (achei ${ownerReads})`);
  const ownerInWhere = [...index.matchAll(/\.eq\('created_by',\s*ownerId\)/g)].length;
  assert(
    ownerInWhere >= 2,
    `draft.update e draft.discard devem escopar por created_by = dono LIDO da linha (achei ${ownerInWhere})`,
  );
  assert(
    /export async function resolveOwnerScope/.test(index) && /profileId === createdBy/.test(index),
    'resolveOwnerScope deve reconhecer o dono comparando com o profiles.id resolvido',
  );

  const blocks = stripComments(read(`${EDGE}/actions/blocks.ts`));
  assert(
    /function guardEditableDispatch[\s\S]*?resolveOwnerScope\(ctx,\s*row\?\.created_by\)/.test(blocks),
    'blocks: guardEditableDispatch deve usar o resolver canonico (profiles.id OU manage_all)',
  );
  assert(
    !/row\.created_by !== ctx\.userId/.test(blocks),
    'blocks: guardEditableDispatch nao pode comparar created_by com o auth.uid',
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
