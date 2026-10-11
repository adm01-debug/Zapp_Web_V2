Especialista: workersql

## O que mudou e por quê
- supabase/migrations/20261011154935_manual_priority.sql (nova, aditiva): cria as colunas
  manual_priority / manual_priority_by / manual_priority_at em contacts (nullable, com CHECK
  contacts_manual_priority_canonical usando o helper canonico public.ai_is_canonical_priority);
  a RPC public.set_manual_priority(uuid, text) — UNICO caminho de escrita, SECURITY DEFINER com
  SET search_path = pg_catalog, public, sob o MESMO predicado do modulo Contatos
  (public.can_edit_contact); e a funcao pura public.effective_priority(public.contacts) =
  coalesce(manual_priority, ai_priority). Cabecalho com Rollback executavel.
- scripts/db-audit/manual-priority.test.mjs (novo): prova em PostgreSQL 17 descartavel
  aplicando as MIGRATIONS REAIS (can_edit_contact nas duas assinaturas, helpers de plataforma
  extraidos da ultima definicao em supabase/migrations, e o arquivo real da migration) e rodando
  como as roles reais (authenticated, anon). Coberto pelo glob ja existente
  `node --test scripts/db-audit/*.test.mjs` do .github/workflows/db-guard.yml — por isso .test.mjs
  e nao .test.sh novo (que exigiria passo proprio no workflow, que eu nao edito).
- src/integrations/supabase/types.ts (gerado): contacts Row/Insert/Update ganham os 3 campos
  manuais; Functions ganha set_manual_priority. (effective_priority nao entra em Functions: recebe
  o rowtype public.contacts, nao e chamavel via PostgREST — usado no SQL, nao em .rpc().)

## Prova
- vermelho antes: `mv <migration> .tmp/ && node --test scripts/db-audit/manual-priority.test.mjs`
  → `AssertionError: nenhuma migration casa /^\d{14}_manual_priority\.sql$/ em supabase/migrations`
  (a feature nao existe sem a migration; o teste falha).
- verde depois: `node --test scripts/db-audit/manual-priority.test.mjs`
  → `ℹ tests 15 | ℹ pass 15 | ℹ fail 0`
  Cobre: estrutura/constraint validada/funcoes; SECURITY DEFINER + search_path fixo + anon sem
  EXECUTE; sem sessao -> 42501; anon -> 42501; fora do alcance -> 42501 e nada muda; atribuido ->
  grava prioridade, autor, instante e audit_logs; membro da fila -> OK; admin -> OK; valor fora do
  vocabulario -> 22023 e nada muda; contato excluido -> 42501; limpar com NULL zera e audita;
  IA reescrevendo ai_priority NAO altera a manual (effective = manual); matriz do coalesce;
  RLS herdada (usuario sem vinculo le 0 linhas); e o Rollback do cabecalho roda e desfaz
  exatamente os objetos criados.
- migration aplicada no banco LOCAL com a cadeia real:
  `hermes-db-migrar supabase/migrations/20261011154935_manual_priority.sql`
  → `APLICADA no banco LOCAL 'v2-2610111244170a' (producao nao foi tocada).`
- db:guard: `npm run db:guard` → `OK: nenhuma violacao nova.` / `arquivos validos em supabase/migrations: 817`
  / `DESTINO_URL ausente - estrutura local validada; comparacao com ledger pulada.`

## Efeitos colaterais conferidos (passada obrigatoria)
- Nenhum GRANT/papel existente foi alterado: so REVOKE/GRANT sobre os objetos NOVOS. anon fica sem EXECUTE.
- O UPDATE da RPC nao dispara os gatilhos de contacts que exigem coluna: trg_contacts_fsm_transition
  (WHEN conversation_status mudou), trg_prevent_contact_queue_hijack / _assignee_hijack (WHEN queue_id /
  assigned_to mudou) e trg_audit_contact_address_change (AFTER UPDATE OF endereco) nao disparam; so
  update_contacts_updated_at (a linha de fato mudou, que e o esperado). Nenhuma escrita em massa/backfill.
- Escrita atomica: um unico UPDATE + um INSERT de auditoria no mesmo corpo; falha = nenhuma das duas.
- Sem oraculo de enumeracao: contato inexistente, excluido ou sem permissao devolvem o MESMO 42501.
- Nenhuma coluna editavel por UPDATE direto do cliente: set_manual_priority e a unica via de escrita.
- ledger: a aplicacao local por hermes-db-migrar registra a versao; a comparacao com
  supabase_migrations.schema_migrations no destino e do integrador (local nao tem DESTINO_URL).

## O que NAO fiz e por quê
- Nao criei a tela/hook de "prioridade manual": o cartao e de banco; a UI consome
  set_manual_priority / effective_priority depois (contrato entregue aqui).
- Nao mexi nas Edge Functions de analise de IA: elas escrevem so ai_priority; as colunas manuais
  sao novas e nenhuma consulta existente as referencia (nao ha quebra de contrato).
