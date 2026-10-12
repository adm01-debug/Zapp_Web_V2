Especialista: worker (sql) (area-sql-banco)

## O que este cartão pediu e como resolvi o motivo (conflito)
Cartão [retomar]: a entrega anterior (`v2/sec-y25-01-insert-alvo-2610090601f8e4`, commit `b7f32d7ee`) foi aprovada mas CONFLITAVA com a ponta de `dia/2026-10-12`. Trouxe os commits por `git cherry-pick b7f32d7ee` para o workspace novo (cuja base JÁ é a ponta atual `dia/2026-10-12`).

Conflito único: `.github/workflows/db-guard.yml`, porque os DOIS lados acrescentaram passos no fim do job. Resolvi PRESERVANDO os dois lados: os passos da ponta (N-002 trava de escalada em profiles, N-136 runbook de recriação) e o passo desta entrega (SEC-Y25-01). Nada foi perdido nem sobrescrito. Os outros dois arquivos (a migration e o teste) entraram sem conflito.

## Confirmei no código ATUAL que o defeito ainda existe
Antes de mexer, `git grep` na ponta atual (`15929a99c`, antes do cherry-pick): não há nenhuma migration `sec_y25_01` na base, e as policies de INSERT correntes ainda validam SÓ o autor, nunca o alvo — exatamente o defeito do achado SEC-RLS_TAREFAS_EMAIL_LIGACOES-01:
- `deal_activities`: "Authenticated can insert deal activities" em `20260317222442_f3acf46c-...:125` (checa só `performed_by`, não o `deal_id`).
- `calls`: "Users can insert calls" em `20260317222534_cc94813a-...:94` (checa só `agent_id`, não o `contact_id`); o alvo também muda por UPDATE em `upsert_my_call` (`20260926800000_calls_telefonia_v2.sql`).
- `conversation_tasks`: `tasks_insert_own` em `20260928140000_tasks_unify_reminders_kanban.sql:139` (checa só `created_by`).
Como o defeito segue vivo, a entrega de código é necessária (não é caso de "já corrigido, fechar sem commit").

## O que a correção faz (migration trazida)
`supabase/migrations/20261009090603_sec_y25_01_insert_alvo.sql` (nome com data futura em relação à última da dia, `20261009000118`):
- `deal_activities`: só aceita `deal_id` de negócio do próprio agente (`sales_deals.assigned_to` = perfil do chamador) ou admin/supervisor.
- `calls` e `conversation_tasks`: exigem `contact_id` visível ao chamador por `is_contact_visible_to_user` (o mesmo predicado de `contact_notes`), com contato nulo ainda permitido (número desconhecido / tarefa pessoal).
- `calls` ganha gatilho BEFORE UPDATE que barra a troca de `contact_id` para contato fora do alcance (fecha o caminho do `ON CONFLICT DO UPDATE` da RPC `upsert_my_call`); o caminho de sistema (`postgres`/`service_role`) é preservado.
- Cabeçalho com ROLLBACK documentado e executável (formato do repo).
Também entrou `scripts/db-audit/sec-y25-01-insert-alvo.test.sh` e o passo correspondente em `.github/workflows/db-guard.yml`.

## Prova
- vermelho antes: bloco A do teste roda as policies correntes e o ataque PASSA — `[PASS] A1 agente B grava atividade na trilha do negócio do agente A`, idem A2/A3 (calls e conversation_tasks).
- verde depois: com a migration aplicada, os mesmos ataques falham e os fluxos legítimos seguem — `[PASS] B1..B3` (negados), `B5..B11` (legítimos passam), `B12` anon negado pelo RLS, `B13` service_role liberado, `B16/B17` (upsert/UPDATE do alvo negados), `B18..B21` (troca para contato próprio, status, caminho de sistema passam).
- rollback do cabeçalho extraído do próprio arquivo e executado (bloco C): após o rollback o ataque volta a passar (`C1`) e reaplicar a correção volta a barrar (`C2`, idempotente).
- conjunto: `bash scripts/db-audit/sec-y25-01-insert-alvo.test.sh` → `[OK] SEC-Y25-01: INSERT de deal_activities, calls e conversation_tasks amarrado ao alvo` (exit 0).
- verificação: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (93s)`.

## Ressalva ao aviso automático "SEM DDL/migration" do fechar
Não procede. O cartão termina com a linha de regras permanentes ("sem DDL/Edge/dependência nova salvo se o pedido original exigia"), e o PEDIDO ORIGINAL deste cartão é exatamente uma migration de banco: "Uma migration nova (com ROLLBACK documentado conforme o padrão do repo)" que corrige as policies de INSERT. A migration está no escopo declarado em ARQUIVOS QUE PODE TOCAR ("uma migration nova em supabase/migrations/"). Repito o MESMO comando de fechar sem alterar o diff.

## O que NÃO fiz e por quê
- Não apliquei nada em produção (regra permanente: migration só no repositório).
- Não editei as migrations antigas das policies (correção = migration nova).
- Não mexi em `schema-manifest.json`: nenhuma coluna/tipo mudou (só policy e função/trigger), então o manifesto não é afetado; o portão de migrations da verificação ficou verde.
