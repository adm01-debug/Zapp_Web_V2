import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

import {
  cobreComando,
  comandoProtegido,
  manifestPolicyNames,
  policiesOn,
  predicadoEfetivo,
  resolveEffectivePolicies,
  resolvePolicyState,
  snapshotDoManifest,
  tabelasComPolicyPosterior,
  type ComandoRls,
} from './helpers/rlsSchema';

// ─── Guarda de integridade dos testes de RLS (item 166 / R2-GOV-003) ───
// Dois trilhos:
//  1. os testes rls*.test.ts sao proibidos de redefinir funcoes-espelho
//     (canSelectX, isAdminY...) e obrigados a ler o schema real via o
//     resolvedor de migrations;
//  2. o resolvedor prova que nao e ele mesmo um espelho: o conjunto de
//     policies que ele produz para TODO o schema public bate exatamente
//     com supabase/schema-manifest.json (dump do banco real), e fixtures
//     sinteticos provam que CREATE/DROP/ALTER/drop dinamico sao aplicados.

const TESTS_DIR = join(process.cwd(), 'src', 'lib', '__tests__');
const ESTADO = resolveEffectivePolicies();

const ESPELHO_PROIBIDO =
  /\b(?:function\s+|\b(?:const|let|var)\s+)(?:can|is|may)[A-Z]\w*\s*(?:=\s*\(|\()/;

describe('Guarda: testes de RLS leem o schema real, nao um espelho', () => {
  const rlsTests = readdirSync(TESTS_DIR).filter(
    (nome) => /^rls.*\.test\.ts$/.test(nome) && nome !== 'rlsSchemaGuard.test.ts',
  );

  it('existem testes de RLS cobertos por este guarda (nao passa por vacuidade)', () => {
    expect(rlsTests.length).toBeGreaterThanOrEqual(2);
    expect(rlsTests).toContain('rlsGroupAccess.test.ts');
    expect(rlsTests).toContain('rlsConversationAccess.test.ts');
  });

  it('nenhum teste de RLS redefine funcoes-espelho de permissao', () => {
    for (const nome of rlsTests) {
      const fonte = readFileSync(join(TESTS_DIR, nome), 'utf8');
      const suspeito = fonte.match(ESPELHO_PROIBIDO);
      expect(suspeito, `${nome} define funcao-espelho: ${suspeito?.[0]}`).toBeNull();
    }
  });

  it('todo teste de RLS resolve o estado efetivo das policies nas migrations', () => {
    for (const nome of rlsTests) {
      const fonte = readFileSync(join(TESTS_DIR, nome), 'utf8');
      expect(
        /from\s+['"].*helpers\/rlsSchema['"]/.test(fonte) &&
          /resolveEffectivePolicies|resolvePolicyState/.test(fonte),
        `${nome} nao usa o resolvedor de migrations`,
      ).toBe(true);
    }
  });

  it('todo teste de RLS valida pelo ponto unico (predicado efetivo, FOR ALL incluido)', () => {
    // Sem esta amarra um teste pode voltar a filtrar so `command === 'X'` e
    // reabrir a brecha do FOR ALL sem ninguem perceber.
    for (const nome of rlsTests) {
      const fonte = readFileSync(join(TESTS_DIR, nome), 'utf8');
      expect(
        /cobreComando|predicadoEfetivo|comandoProtegido/.test(fonte),
        `${nome} nao usa o ponto unico de validacao por comando`,
      ).toBe(true);
    }
  });

  it('o detector de espelho acusa o padrao proibido e ignora codigo legitimo', () => {
    const espelho = `
      function canSelectGroups(auth: boolean) { return auth; }
      const isAdminOrSupervisor = (r: string) => r === 'admin';
      const mayDelete = () => true;
    `;
    expect(espelho.match(ESPELHO_PROIBIDO)).not.toBeNull();

    const legitimo = `
      function predicadoDeEscrita(p: Policy) { return p.using ?? ''; }
      const policies = policiesOn(ESTADO, 'contacts');
      function usingDe(ps: Policy[], cmd: string) { return ps; }
    `;
    expect(legitimo.match(ESPELHO_PROIBIDO)).toBeNull();
  });
});

describe('Guarda: o resolvedor reflete o schema real (nao e um espelho)', () => {
  it('o estado resolvido das migrations bate com o manifest do banco, tabela a tabela', () => {
    // Para TODA tabela do schema public, os nomes de policy resolvidos das
    // migrations sao exatamente os que o dump do banco real registra. Se uma
    // migration criar/derrubar policy e o manifest nao acompanhar, este teste
    // fica vermelho. As tabelas com migration de policy POSTERIOR ao snapshot
    // ficam de fora: o manifest e artefato derivado, sincronizado pelo
    // `types-sync` depois que a migration chega ao banco oficial — e
    // `docs/MIGRATIONS.md` proibe commitá-lo junto da migration (sem essa
    // tolerancia, um cartao de RLS legitimo travaria em vermelho ate o bot).
    const emTransito = tabelasComPolicyPosterior(snapshotDoManifest());
    const divergencias: string[] = [];
    const tabelas = new Set<string>();
    for (const chave of Object.keys(
      JSON.parse(readFileSync(join(process.cwd(), 'supabase', 'schema-manifest.json'), 'utf8'))
        .policies as Record<string, string>,
    )) {
      tabelas.add(chave.split('.')[0]);
    }
    let comparadas = 0;
    for (const tabela of [...tabelas].sort()) {
      if (emTransito.has(`public.${tabela}`)) continue;
      comparadas += 1;
      const resolvidas = policiesOn(ESTADO, tabela)
        .map((p) => p.name)
        .sort();
      const manifest = manifestPolicyNames(tabela);
      if (JSON.stringify(resolvidas) !== JSON.stringify(manifest)) {
        divergencias.push(
          `${tabela}: migrations=${JSON.stringify(resolvidas)} manifest=${JSON.stringify(manifest)}`,
        );
      }
    }
    expect(divergencias).toEqual([]);
    // O filtro nao pode esvaziar o guarda: sem paridade comparada, nao ha prova.
    expect(comparadas / tabelas.size).toBeGreaterThan(0.9);
  });
});

describe('Guarda: o resolvedor aplica CREATE/DROP/ALTER/drop dinamico', () => {
  const fixture = [
    {
      name: '0001_a.sql',
      sql: `
        CREATE POLICY "todos leem" ON public.widget FOR SELECT TO authenticated USING (true);
        CREATE POLICY "todos escrevem" ON public.widget FOR ALL TO authenticated USING (true) WITH CHECK (true);
      `,
    },
    {
      name: '0002_b.sql',
      sql: `
        DROP POLICY IF EXISTS "todos escrevem" ON public.widget;
        CREATE POLICY "admins escrevem" ON public.widget FOR ALL TO authenticated
          USING (is_admin_or_supervisor(auth.uid())) WITH CHECK (is_admin_or_supervisor(auth.uid()));
      `,
    },
    {
      name: '0003_c.sql',
      sql: `
        ALTER POLICY "todos leem" ON public.widget USING (owner_id = auth.uid());
        ALTER POLICY "admins escrevem" ON public.widget RENAME TO admins_manage_widget;
      `,
    },
    {
      name: '0004_d.sql',
      sql: `
        DO $$ DECLARE pol RECORD; BEGIN
          FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'widget' AND schemaname = 'public'
          LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.widget', pol.policyname); END LOOP;
        END $$;
        CREATE POLICY "widget_final" ON public.widget FOR SELECT TO authenticated USING (true);
      `,
    },
  ];

  it('resolve o estado efetivo de um fixture sintetico', () => {
    const estado = resolvePolicyState(fixture);
    const widget = policiesOn(estado, 'widget');
    expect(widget.map((p) => p.name)).toEqual(['widget_final']);
    expect(widget[0].command).toBe('SELECT');
    expect(widget[0].using).toBe('true');
  });

  it('o detector de tabelas em transito acha as tabelas de RLS (o scan nao e vazio)', () => {
    const antigo = tabelasComPolicyPosterior('2020-01-01T00:00:00Z');
    for (const tabela of [
      'whatsapp_groups',
      'whatsapp_connections',
      'contacts',
      'messages',
    ]) {
      expect(antigo.has(`public.${tabela}`), `scan nao achou ${tabela}`).toBe(true);
    }
    // Snapshot no futuro: nada em transito, o guarda compara tudo.
    expect(tabelasComPolicyPosterior('2100-01-01T00:00:00Z').size).toBe(0);
  });

  it('uma migration que enfraquece o predicado muda o estado resolvido (prova do vermelho)', () => {
    // Se o resolvedor ignorasse a migration "ruim", enfraquecido e real
    // sairiam iguais — e o teste de policy nunca ficaria vermelho.
    const base = [
      {
        name: '0001.sql',
        sql: `CREATE POLICY "p" ON public.t FOR UPDATE TO authenticated USING (is_admin_or_supervisor(auth.uid()));`,
      },
    ];
    const enfraquecido = [
      ...base,
      {
        name: '0002.sql',
        sql: `DROP POLICY IF EXISTS "p" ON public.t;
              CREATE POLICY "p" ON public.t FOR UPDATE TO authenticated USING (true);`,
      },
    ];
    const real = policiesOn(resolvePolicyState(base), 't')[0];
    const pior = policiesOn(resolvePolicyState(enfraquecido), 't')[0];
    expect(real.using).toMatch(/is_admin_or_supervisor/);
    expect(pior.using).toBe('true');
    expect(pior.using).not.toBe(real.using);
  });
});

describe('Guarda: FOR ALL entra na validacao de cada comando (semantica do Postgres)', () => {
  const ADMIN_OU_SUPERVISOR = /is_admin_or_supervisor\(\s*auth\.uid\(\)\s*\)/;
  const COMANDOS: ComandoRls[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

  it('FOR ALL conta como cobertura dos quatro comandos', () => {
    const fixture = [
      {
        name: '0001.sql',
        sql: `CREATE POLICY "admins" ON public.t FOR ALL TO authenticated
              USING (is_admin_or_supervisor(auth.uid()))
              WITH CHECK (is_admin_or_supervisor(auth.uid()));`,
      },
    ];
    const policies = policiesOn(resolvePolicyState(fixture), 't');
    expect(policies).toHaveLength(1);
    for (const comando of COMANDOS) {
      expect(cobreComando(policies[0], comando)).toBe(true);
      expect(comandoProtegido(policies, comando, ADMIN_OU_SUPERVISOR), comando).toBe(true);
    }
  });

  it('reprova FOR ALL USING (true) mesmo com WITH CHECK de admin', () => {
    // Regressivo: a validacao antiga olhava so o WITH CHECK e aceitava esse
    // enfraquecimento — mas USING(true) ja abre SELECT, UPDATE e DELETE.
    const fixture = [
      {
        name: '0001.sql',
        sql: `CREATE POLICY "ruim" ON public.t FOR ALL TO authenticated
              USING (true) WITH CHECK (is_admin_or_supervisor(auth.uid()));`,
      },
    ];
    const policies = policiesOn(resolvePolicyState(fixture), 't');
    for (const comando of ['SELECT', 'UPDATE', 'DELETE'] as ComandoRls[]) {
      // FOR ALL conta como cobertura dos tres comandos filtrados pelo USING.
      expect(cobreComando(policies[0], comando), comando).toBe(true);
      expect(predicadoEfetivo(policies[0], comando), comando).toBe('true');
      expect(comandoProtegido(policies, comando, ADMIN_OU_SUPERVISOR), comando).toBe(false);
    }
    // O INSERT continua protegido pelo CHECK: a reprovacao vem do USING.
    expect(cobreComando(policies[0], 'INSERT')).toBe(true);
    expect(comandoProtegido(policies, 'INSERT', ADMIN_OU_SUPERVISOR)).toBe(true);
  });

  it('FOR ALL sem WITH CHECK usa o proprio USING como CHECK efetivo', () => {
    const fixture = [
      {
        name: '0001.sql',
        sql: `CREATE POLICY "admins" ON public.t FOR ALL TO authenticated
              USING (is_admin_or_supervisor(auth.uid()));`,
      },
    ];
    const policies = policiesOn(resolvePolicyState(fixture), 't');
    expect(policies[0].check).toBeNull();
    expect(predicadoEfetivo(policies[0], 'INSERT')).toMatch(ADMIN_OU_SUPERVISOR);
    expect(comandoProtegido(policies, 'INSERT', ADMIN_OU_SUPERVISOR)).toBe(true);
  });
});
