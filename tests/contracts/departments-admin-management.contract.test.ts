import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Database } from '../../src/integrations/supabase/types';

// Contrato de regressao da gestao de departamentos pelo admin (cartao departments-admin-gestao).
// A prova de COMPORTAMENTO (RLS por papel real, RPC, recusa, auditoria, rollback) vive em
// scripts/db-audit/departments-admin-management.test.sh, no Postgres descartavel. Aqui guarda-se
// a FORMA que o revisor e o tipo gerado dependem: se alguem reescrever a migration sem o REVOKE,
// sem o portao is_admin ou sem as RPCs, ou regenerar types.ts sem elas, esta suite falha.

const root = process.cwd();
const migrationPath = resolve(root, 'supabase/migrations/20261011191021_departments_admin.sql');
const dbauditPath = resolve(root, 'scripts/db-audit/departments-admin-management.test.sh');
const migration = readFileSync(migrationPath, 'utf8');
const typesSource = readFileSync(resolve(root, 'src/integrations/supabase/types.ts'), 'utf8');
// SQL ativo (fora dos comentarios, inclusive o bloco -- Rollback).
const activeSql = migration
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

// Contrato de TIPO sobre o gerado: nao compila se as RPCs nao existirem em Database.public.Functions.
type Functions = Database['public']['Functions'];
type DeleteDepartment = Functions['delete_department'];
type OverviewRow = Functions['departments_overview']['Returns'][number];

describe('contrato de gestao de departamentos pelo admin', () => {
  it('move a escrita de departments para is_admin() e fecha o DELETE direto', () => {
    expect(migration).toContain('USING (public.is_admin(auth.uid()))');
    expect(activeSql).toContain('REVOKE DELETE ON public.departments FROM authenticated;');
    expect(activeSql).not.toMatch(/GRANT\s+DELETE\s+ON\s+public\.departments/i);
  });

  it('define as RPCs com guarda de papel, search_path fixo e EXECUTE revogado do publico', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.delete_department(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.departments_overview()');
    expect(migration).toContain('IF NOT public.is_admin(v_uid) THEN');
    expect(migration).toContain('SET search_path = pg_catalog, public');
    expect(migration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.delete_department(uuid, uuid) FROM PUBLIC, anon;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.delete_department(uuid, uuid) TO authenticated;',
    );
  });

  it('recusa sem destino com contagens, apaga e audita numa transacao', () => {
    expect(migration).toContain("'department_in_use'");
    expect(migration).toContain('DELETE FROM public.departments WHERE id = p_department_id;');
    expect(migration).toContain("'delete_department'");
    expect(migration).toContain('INSERT INTO public.audit_logs');
  });

  it('expoe as RPCs nos types gerados com a assinatura esperada', () => {
    const args: DeleteDepartment['Args'] = { p_department_id: '00000000-0000-0000-0000-000000000000' };
    const argsMove: DeleteDepartment['Args'] = {
      p_department_id: '00000000-0000-0000-0000-000000000000',
      p_move_to: '00000000-0000-0000-0000-000000000001',
    };
    const row: OverviewRow = {
      conversation_count: 0,
      department_id: '00000000-0000-0000-0000-000000000000',
      is_active: true,
      member_count: 0,
      name: 'departamento',
      queue_count: 0,
    };
    expect(args.p_department_id).toBeTruthy();
    expect(argsMove.p_move_to).toBeTruthy();
    expect(row.member_count).toBe(0);

    expect(typesSource).toMatch(/delete_department:\s*\{/);
    expect(typesSource).toMatch(/departments_overview:\s*\{/);
  });

  it('mantem o teste executavel registrado no db-guard', () => {
    const workflow = readFileSync(resolve(root, '.github/workflows/db-guard.yml'), 'utf8');
    expect(existsSync(dbauditPath)).toBe(true);
    expect(workflow).toContain('scripts/db-audit/departments-admin-management.test.sh');
  });
});
