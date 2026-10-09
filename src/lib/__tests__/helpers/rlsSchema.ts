/**
 * Resolvedor de estado EFETIVO de RLS a partir das migrations reais.
 *
 * Lê `supabase/migrations/*.sql` em ordem cronológica (o nome do arquivo
 * começa pelo timestamp) e aplica as operações de policy em sequência:
 *   - CREATE POLICY soma; DROP POLICY subtrai; ALTER POLICY mescla
 *     (USING/WITH CHECK/TO) ou renomeia (RENAME TO);
 *   - drop dinâmico `format('DROP POLICY %I ON public.X', policyname)`
 *     limpa a tabela — e honra o filtro `AND cmd = 'SELECT'` do
 *     `pg_policies` quando presente na mesma cláusula;
 *   - DROP TABLE/DROP VIEW remove as policies junto; `ALTER PUBLICATION
 *     ... DROP TABLE` NÃO remove (só tira a tabela da replicação).
 *
 * O resultado deste resolvedor foi validado contra
 * `supabase/schema-manifest.json` (dump do banco real, 2026-10-04):
 * 100% dos nomes de policy do schema public batem, nos dois sentidos.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface EffectivePolicy {
  name: string;
  command: 'ALL' | 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';
  roles: string;
  using: string | null;
  check: string | null;
}

export type PolicyState = Map<string, EffectivePolicy[]>;

const EVENTO = new RegExp(
  [
    /CREATE\s+POLICY\s+("(?<cn>[^"]+)"|(?<cn2>\b\w+\b))\s+ON\s+(?<ct>(?:\w+\s*\.\s*)?\w+)(?<cb>[\s\S]*?);/,
    /DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?("(?<dn>[^"]+)"|(?<dn2>\b\w+\b))\s+ON\s+(?<dt>(?:\w+\s*\.\s*)?\w+)/,
    /ALTER\s+POLICY\s+("(?<an>[^"]+)"|(?<an2>\b\w+\b))\s+ON\s+(?<at>(?:\w+\s*\.\s*)?\w+)(?<ab>[\s\S]*?);/,
    /format\(\s*'DROP\s+POLICY\s+(?:IF\s+EXISTS\s+)?%I\s+ON\s+(?<ft>(?:\w+\s*\.\s*)?\w+)'/,
    /ALTER\s+PUBLICATION\s+\S+\s+DROP\s+TABLE\s+(?:\w+\s*\.\s*)?\w+/,
    /DROP\s+(?:TABLE|VIEW)\s+(?:IF\s+EXISTS\s+)?(?<tt>(?:\w+\s*\.\s*)?\w+)/,
  ]
    .map((parte) => parte.source)
    .join('|'),
  'gis',
);

function semComentarios(sql: string): string {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
}

function nomeTabela(bruto: string): string {
  const partes = bruto.replace(/\s+/g, '').split('.');
  return partes.length === 1 ? `public.${partes[0].toLowerCase()}` : partes.join('.').toLowerCase();
}

function balanceado(texto: string, inicio: number): string {
  let profundidade = 0;
  for (let i = inicio; i < texto.length; i++) {
    if (texto[i] === '(') profundidade++;
    else if (texto[i] === ')') {
      profundidade--;
      if (profundidade === 0) return texto.slice(inicio + 1, i);
    }
  }
  return texto.slice(inicio + 1);
}

function parseCorpo(corpo: string): Omit<EffectivePolicy, 'name'> {
  const pol: Omit<EffectivePolicy, 'name'> = {
    command: 'ALL',
    roles: 'public',
    using: null,
    check: null,
  };
  const comando = /\bFOR\s+(ALL|SELECT|INSERT|UPDATE|DELETE)\b/i.exec(corpo);
  if (comando) pol.command = comando[1].toUpperCase() as EffectivePolicy['command'];
  const alvo = /\bTO\s+([\w\s,]+?)(?=\s+USING\b|\s+WITH\s+CHECK\b|\s*$)/i.exec(corpo);
  if (alvo) pol.roles = alvo[1].replace(/\s+/g, '').toLowerCase();
  const usando = /\bUSING\s*\(/i.exec(corpo);
  if (usando) pol.using = balanceado(corpo, usando.index + usando[0].length - 1);
  const check = /\bWITH\s+CHECK\s*\(/i.exec(corpo);
  if (check) pol.check = balanceado(corpo, check.index + check[0].length - 1);
  return pol;
}

function tabelaDo(state: PolicyState, tabela: string): EffectivePolicy[] {
  let lista = state.get(tabela);
  if (!lista) {
    lista = [];
    state.set(tabela, lista);
  }
  return lista;
}

/** Aplica o SQL de migrations (em ordem) e devolve o estado efetivo por `schema.tabela`. */
export function resolvePolicyState(migrations: { name: string; sql: string }[]): PolicyState {
  const state: PolicyState = new Map();
  for (const { sql: bruto } of migrations) {
    const sql = semComentarios(bruto);
    for (const ev of sql.matchAll(EVENTO)) {
      const g = ev.groups!;
      if (g.tt) {
        state.delete(nomeTabela(g.tt));
        continue;
      }
      if (g.ft) {
        const t = nomeTabela(g.ft);
        const janela = sql.slice(Math.max(0, ev.index! - 500), ev.index! + ev[0].length + 500);
        let cmd: string | null = null;
        for (const mc of janela.matchAll(/cmd\s*=\s*'(SELECT|INSERT|UPDATE|DELETE|\*)'/gi)) {
          const perto = janela.slice(Math.max(0, mc.index! - 150), mc.index! + mc[0].length + 150);
          if (new RegExp(`tablename\\s*=\\s*'${t.split('.').pop()}'`, 'i').test(perto)) {
            cmd = mc[1].toUpperCase();
            break;
          }
        }
        const lista = state.get(t);
        if (lista && cmd) {
          state.set(t, lista.filter((p) => p.command !== cmd));
        } else {
          state.set(t, []);
        }
        continue;
      }
      if (g.dt) {
        const lista = state.get(nomeTabela(g.dt));
        if (lista) {
          state.set(
            nomeTabela(g.dt),
            lista.filter((p) => p.name !== (g.dn ?? g.dn2)),
          );
        }
        continue;
      }
      if (g.ct) {
        const nome = g.cn ?? g.cn2!;
        const corpo = parseCorpo(g.cb);
        const lista = tabelaDo(state, nomeTabela(g.ct)).filter((p) => p.name !== nome);
        lista.push({ name: nome, ...corpo });
        state.set(nomeTabela(g.ct), lista);
        continue;
      }
      if (g.at) {
        const t = nomeTabela(g.at);
        const nome = g.an ?? g.an2!;
        const lista = state.get(t);
        if (!lista) continue;
        const renomear = /^\s*RENAME\s+TO\s+(?:"([^"]+)"|(\w+))/i.exec(g.ab);
        if (renomear) {
          const alvo = lista.find((p) => p.name === nome);
          if (alvo) alvo.name = renomear[1] ?? renomear[2];
          continue;
        }
        const alvo = lista.find((p) => p.name === nome);
        if (!alvo) continue;
        const novo = parseCorpo(g.ab);
        if (/\bTO\s+/i.test(g.ab)) alvo.roles = novo.roles;
        if (novo.using !== null) alvo.using = novo.using;
        if (novo.check !== null) alvo.check = novo.check;
      }
    }
  }
  return state;
}

let cache: PolicyState | null = null;

/** Estado efetivo das policies resolvendo `supabase/migrations/*.sql` em ordem cronológica. */
export function resolveEffectivePolicies(): PolicyState {
  if (cache) return cache;
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const migrations = readdirSync(dir)
    .filter((nome) => nome.endsWith('.sql'))
    .sort()
    .map((name) => ({ name, sql: readFileSync(join(dir, name), 'utf8') }));
  cache = resolvePolicyState(migrations);
  return cache;
}

/** Policies efetivas de uma tabela do schema public (ex.: `policiesOn(state, 'contacts')`). */
export function policiesOn(state: PolicyState, tabela: string): EffectivePolicy[] {
  return state.get(tabela.includes('.') ? tabela : `public.${tabela}`) ?? [];
}

/** Instante do snapshot do banco real registrado em `schema-manifest.json` (ISO UTC). */
export function snapshotDoManifest(): string {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'supabase', 'schema-manifest.json'), 'utf8'),
  ) as { generated_at?: string };
  if (!manifest.generated_at) throw new Error('schema-manifest.json sem generated_at');
  return manifest.generated_at;
}

/**
 * Tabelas cujas policies sao tocadas por migration POSTERIOR ao snapshot
 * informado (comparacao de versao pelo prefixo de 14 digitos do arquivo).
 *
 * Existe para nao transformar o drift em falso vermelho: o
 * `schema-manifest.json` e artefato DERIVADO, regenerado pelo workflow
 * `types-sync` depois que a migration chega ao banco oficial — e o proprio
 * `docs/MIGRATIONS.md` proibe commitá-lo junto da migration. Enquanto a
 * sincronizacao nao chega, esta tabela fica de fora da paridade (as
 * assercoes de predicado dos testes de RLS continuam valendo para ela).
 */
const cacheTransito = new Map<string, Set<string>>();

export function tabelasComPolicyPosterior(snapshotIso: string = snapshotDoManifest()): Set<string> {
  const guardado = cacheTransito.get(snapshotIso);
  if (guardado) return guardado;
  const limite = snapshotIso.replace(/\D/g, '').slice(0, 14);
  const dir = join(process.cwd(), 'supabase', 'migrations');
  const tocadas = new Set<string>();
  const operacao = /\bPOLICY\b[\s\S]{0,140}?\bON\s+(?:public\s*\.\s*)?"?([A-Za-z_]\w*)/gi;
  for (const nome of readdirSync(dir).filter((arquivo) => arquivo.endsWith('.sql')).sort()) {
    const versao = nome.slice(0, 14);
    if (!/^\d{14}$/.test(versao) || versao <= limite) continue;
    const sql = semComentarios(readFileSync(join(dir, nome), 'utf8'));
    for (const op of sql.matchAll(operacao)) tocadas.add(`public.${op[1].toLowerCase()}`);
  }
  cacheTransito.set(snapshotIso, tocadas);
  return tocadas;
}

/** Nomes de policy que o manifest do banco real registra para a tabela (ordem alfabética). */
export function manifestPolicyNames(tabela: string): string[] {
  const manifest = JSON.parse(
    readFileSync(join(process.cwd(), 'supabase', 'schema-manifest.json'), 'utf8'),
  ) as { policies: Record<string, string> };
  return Object.keys(manifest.policies)
    .filter((chave) => chave.split('.')[0] === tabela)
    .map((chave) => chave.slice(chave.indexOf('.') + 1).replace(/^"|"$/g, ''))
    .sort();
}

/**
 * Nomes de policy do estado resolvido comparados com o manifest do banco real.
 *
 * `estrito` = paridade exata exigida. Fica `false` para tabela tocada por
 * migration de policy POSTERIOR ao snapshot: o manifest e artefato derivado,
 * sincronizado pelo workflow `types-sync` so depois que a migration chega ao
 * banco oficial (`docs/MIGRATIONS.md` proibe commitá-lo junto da migration).
 * Nesse caso o teste exige apenas que nenhuma policy do banco real tenha
 * sumido — e as assercoes de predicado continuam valendo para toda policy.
 */
export function paridadeDeNomes(
  policies: EffectivePolicy[],
  tabela: string,
): { estrito: boolean; manifest: string[]; resolvido: string[] } {
  return {
    estrito: !tabelasComPolicyPosterior().has(`public.${tabela}`),
    manifest: manifestPolicyNames(tabela),
    resolvido: policies.map((p) => p.name).sort(),
  };
}

/** `true` quando o primeiro `(` e o último `)` envolvem a expressão inteira. */
function parensEnvolvemTudo(expr: string): boolean {
  let profundidade = 0;
  for (let i = 0; i < expr.length; i++) {
    if (expr[i] === '(') profundidade++;
    else if (expr[i] === ')') {
      profundidade--;
      if (profundidade === 0) return i === expr.length - 1;
    }
  }
  return false;
}

/**
 * Predicado normalizado para comparar com `true`/`false` literais.
 * Remove só os parênteses que envolvem a expressão inteira — predicados
 * terminados em `)`, como `f(auth.uid())`, não podem ser truncados.
 */
export function normSql(expr: string | null): string {
  let e = (expr ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  while (e.startsWith('(') && e.endsWith(')') && parensEnvolvemTudo(e)) {
    e = e.slice(1, -1).trim();
  }
  return e;
}

export type ComandoRls = 'SELECT' | 'INSERT' | 'UPDATE' | 'DELETE';

/** `true` quando a policy se aplica ao comando — `FOR ALL` cobre os quatro. */
export function cobreComando(p: EffectivePolicy, comando: ComandoRls): boolean {
  return p.command === 'ALL' || p.command === comando;
}

/**
 * Predicado efetivo de uma policy para `comando`, na semântica do Postgres:
 * SELECT/UPDATE/DELETE são filtrados pelo USING; INSERT é barrado pelo
 * WITH CHECK — e `FOR ALL` sem WITH CHECK usa o próprio USING como CHECK.
 * Predicado omitido vale 'true' (irrestrito).
 */
export function predicadoEfetivo(p: EffectivePolicy, comando: ComandoRls): string {
  const bruto = comando === 'INSERT' ? (p.check ?? p.using) : p.using;
  return normSql(bruto) || 'true';
}

/**
 * `true` quando `comando` está protegido: existe ao menos uma policy que o
 * cobre (`FOR ALL` conta) e toda policy cobridora tem predicado efetivo
 * restrito (diferente de 'true') atendendo `exigencia`.
 */
export function comandoProtegido(
  policies: EffectivePolicy[],
  comando: ComandoRls,
  exigencia: RegExp,
): boolean {
  const cobertura = policies.filter((p) => cobreComando(p, comando));
  return (
    cobertura.length > 0 &&
    cobertura.every((p) => {
      const efetivo = predicadoEfetivo(p, comando);
      return efetivo !== 'true' && exigencia.test(efetivo);
    })
  );
}
