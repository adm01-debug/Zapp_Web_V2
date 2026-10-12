/**
 * contact-consents — contrato do consentimento LGPD (contact_consents + RPCs).
 *
 * Prova, no commit, o que o cartão exige do banco:
 *  1. a trilha `public.contact_consents` nasce append-only: RLS ligada, SELECT só por
 *     visibilidade do contato e NENHUMA policy de escrita (escrita só pelas RPCs);
 *  2. as RPCs `grant_contact_consent`/`revoke_contact_consent` são SECURITY DEFINER com
 *     `search_path` fixo, checam papel/visibilidade e negam o default PUBLIC/anon;
 *  3. revogar marketing no WhatsApp REUSA a supressão existente do Talk X (não reimplementa);
 *  4. a migration traz rollback executável;
 *  5. o schema TypeScript expõe a tabela e as funções.
 *
 * A prova de comportamento (RLS como authenticated/anon, supressão, histórico) roda em
 * supabase/tests/contact_consents_lgpd.sql contra o Postgres local da tarefa.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const RAIZ = join(__dirname, '..', '..');
const MIG = join(RAIZ, 'supabase', 'migrations', '20261012143300_contact_consents_lgpd.sql');
const TIPOS = join(RAIZ, 'src', 'integrations', 'supabase', 'types.ts');

const sql = existsSync(MIG) ? readFileSync(MIG, 'utf8') : '';
const tipos = existsSync(TIPOS) ? readFileSync(TIPOS, 'utf8') : '';

describe('contact_consents — trilha append-only com RLS', () => {
  it('cria a tabela e liga RLS imediatamente', () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.contact_consents/i);
    expect(sql).toMatch(/ALTER TABLE public\.contact_consents ENABLE ROW LEVEL SECURITY/i);
  });

  it('não tem policy de escrita (só as RPCs escrevem)', () => {
    expect(sql).not.toMatch(/ON public\.contact_consents\s+FOR (INSERT|UPDATE|DELETE)/i);
    expect(sql).not.toMatch(/FOR (INSERT|UPDATE|DELETE) ON public\.contact_consents/i);
  });

  it('a policy de leitura usa a visibilidade do contato, nunca USING (true)', () => {
    expect(sql).toMatch(/CREATE POLICY "contact_consents_select_visible"/);
    expect(sql).toMatch(/USING \(public\.is_contact_visible_to_user\(contact_id, auth\.uid\(\)\)\)/);
    expect(sql).not.toMatch(/USING \(true\)/i);
  });

  it('salvaguarda: nenhuma linha com GRANT de DML a anon', () => {
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.contact_consents FROM PUBLIC, anon, authenticated, service_role/);
    expect(sql).toMatch(/GRANT SELECT ON TABLE public\.contact_consents TO authenticated, service_role/);
  });

  it('a view de estado atual é security_invoker (herda a RLS da base)', () => {
    expect(sql).toMatch(/CREATE OR REPLACE VIEW public\.contact_consents_current/);
    expect(sql).toMatch(/security_invoker = true/i);
  });
});

describe('contact_consents — RPCs de concessão/revogação', () => {
  it('as duas RPCs existem, são SECURITY DEFINER e fixam search_path', () => {
    for (const nome of ['grant_contact_consent', 'revoke_contact_consent']) {
      expect(sql).toContain(`FUNCTION public.${nome}(`);
      expect(sql).toContain(`FUNCTION public.${nome}(`);
    }
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public, pg_temp/);
  });

  it('nega o default PUBLIC/anon e libera só authenticated/service_role', () => {
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.grant_contact_consent\(uuid, text, text, text\)\s+FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.grant_contact_consent\(uuid, text, text, text\)\s+TO authenticated, service_role/);
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.revoke_contact_consent\(uuid, text, text\)\s+FROM PUBLIC, anon/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.revoke_contact_consent\(uuid, text, text\)\s+TO authenticated, service_role/);
  });

  it('exige autenticação e autoriza pelo contato (can_edit_contact)', () => {
    expect(sql).toMatch(/auth\.uid\(\) IS NULL/);
    expect(sql).toMatch(/public\.can_edit_contact\(v_contact\.assigned_to, v_contact\.queue_id\)/);
    expect(sql).toMatch(/consent_forbidden/);
  });

  it('revogar marketing no WhatsApp REUSA a supressão existente do Talk X', () => {
    expect(sql).toMatch(/public\.talkx_suppress_contact\(/);
    expect(sql).toMatch(/p_reason_code\s*=>\s*'lgpd'::public\.talkx_blacklist_reason/);
    // não reimplementa a regra de supressão (não insere direto na blacklist)
    expect(sql).not.toMatch(/INSERT INTO public\.talkx_blacklist/i);
  });

  it('registra auditoria sem dado pessoal no details', () => {
    expect(sql).toMatch(/INSERT INTO public\.audit_logs/);
    expect(sql).toMatch(/jsonb_build_object\('finalidade', p_finalidade, 'canal', p_canal/);
  });
});

describe('contact_consents — rollback e tipos', () => {
  it('a migration traz rollback executável nas primeiras linhas', () => {
    const cabeca = sql.split('\n').slice(0, 25).join('\n');
    expect(cabeca).toMatch(/^-- Rollback:/m);
    expect(cabeca).toMatch(/^--\s+drop (view|function|table)/m);
  });

  it('o schema TypeScript expõe a tabela e as funções', () => {
    expect(tipos).toContain('contact_consents');
    expect(tipos).toContain('contact_consents_current');
    expect(tipos).toContain('grant_contact_consent');
    expect(tipos).toContain('revoke_contact_consent');
  });
});
