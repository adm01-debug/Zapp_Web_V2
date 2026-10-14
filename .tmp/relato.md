Especialista: workersql

## Diff real (git diff --stat dia/2026-10-13...HEAD → 3 files changed, 567 insertions(+), 21 deletions(-); 1 arquivo de teste)
- `.tmp/relato.md` (este relato)
- `supabase/migrations/20261013235906_quick_replies_uso_e_global.sql` (novo, migration)
- `supabase/tests/quick_replies_uso_e_global.sql` (novo, teste)
- Nenhum `.ts`/`.tsx` tocado.

RESULTADO: `EXIT_VERDE=0` — `PASS 32  FALHOU 0` (prova de banco por papel real) e `VERIFY: VERDE SEM BANCO`.

## O que mudou e por quê
- Diff do cartão: 3 arquivos — 1 migration (`supabase/migrations/20261013235906_quick_replies_uso_e_global.sql`, novo), 1 arquivo de teste (`supabase/tests/quick_replies_uso_e_global.sql`, novo) e `.tmp/relato.md`. Nenhum `.ts`/`.tsx` tocado.
- `supabase/migrations/20261013235906_quick_replies_uso_e_global.sql` (novo) — corrige dois defeitos vivos de `public.message_templates` (PH-10, paridade V3→V2 do doc 06-features-inbox-hooks):
  (a) nova RPC `public.increment_quick_reply_use(p_id uuid)`, SECURITY DEFINER, soma atômica (`use_count = coalesce(use_count,0)+1`) e só toca linhas VISÍVEIS ao chamador (`user_id = auth.uid() or is_global = true`, mesma regra do SELECT). Resolve o contador de resposta GLOBAL de outro usuário: o `update ... use_count = use_count + 1` do hook alcançava 0 linhas sem erro. `revoke all` de public/anon e `grant execute` só a authenticated; erro 42501 se não autenticado, 22023 se id nulo, retorna false para id inexistente/não visível.
  (b) policies de INSERT e UPDATE de `message_templates` passam a exigir admin/supervisor para `is_global = true` via `public.is_admin_or_supervisor(auth.uid())`, mantendo `user_id = auth.uid()`; a policy de UPDATE recebeu WITH CHECK com a mesma regra. NENHUM dado é migrado; respostas globais existentes ficam como estão.
- gatilho `zz_message_templates_preserve_updated_at` + função `public.message_templates_preserve_updated_at()` — quando a única coluna que muda é `use_count`, restaura `old.updated_at`, para contar uso não reescrever o "atualizado em". Roda depois do carimbo (ordem alfabética 'u' < 'z'). Edição de verdade (titulo/conteudo/atalho/categoria/is_global) continua carimbando.
- Efeito colateral (aviso do juiz): o UPDATE da RPC dispara o gatilho BEFORE UPDATE `update_message_templates_updated_at`, que regrava `updated_at`. PROCEDE e é o efeito tratado de propósito: o gatilho novo preserva `old.updated_at` quando só `use_count` muda. Provado com linha antes/depois: `PASS [B11 contar uso preserva updated_at (antes = depois)] -> igual` e `PASS [B11b editar de verdade carimba updated_at (antes <> depois)] -> diferente`.
- `supabase/tests/quick_replies_uso_e_global.sql` (novo) — prova por PAPEL REAL (authenticated/anon/service_role, via `SET LOCAL ROLE` + `request.jwt.claims`), em Postgres 17 descartável que aplica as migrations REAIS por `\i` (mesmo padrão de `user_roles_troca_de_papel_autorizacao_e_auditoria.sql`), tudo em uma transação que termina em `ROLLBACK`.

## zapp-verify . --rapido (critério 2)
- `zapp-verify . --rapido` → `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `AVISO banco_local NÃO VERIFICADO: sem nome de conjunto`, `VERIFY: VERDE SEM BANCO`. O diff deste cartão é SÓ SQL (`supabase/migrations/**.sql` + `supabase/tests/**.sql`) — nenhum `.ts`/`.tsx` — então o passo `tipos` não depende desta entrega. Em tentativas anteriores o passo `tipos` morreu por OOM (`tsc saiu 137`) com a máquina saturada (load 50–70, ~40/47 GiB usados); com a carga menor ele passou.

## Prova
- vermelho antes (migration NÃO aplicada, `-v sem_guarda=1`): `EXIT_VERMELHO=3`; `ERROR: PH-10 FALHOU [B1 agente conta uso da GLOBAL de outro (retorno true)]: esperado true, obtido ERRO 42883 function public.increment_quick_reply_use(unknown) does not exist`.
- verde depois (nesta retentativa, 13/10, com `postgres:17-alpine` descartável, `-v mig_dir=/repo/supabase/migrations`): `EXIT_VERDE=0`; últimas linhas `PASS [B11 contar uso preserva updated_at (antes = depois)] -> igual`, `PASS [B11b editar de verdade carimba updated_at (antes <> depois)] -> diferente`, `PASS [B12 id nulo recusado] -> ERRO 22023 invalid_quick_reply_id`, `PASS [B13 id inexistente retorna false] -> false`, `PH-10: provas por papel concluidas`, `ROLLBACK`.
- rollback executável: aplico a migration e rodo as linhas de `-- Rollback (SQL executável, na ordem)` → `EXIT_ROLLBACK=0`; depois: `depois RPC=false`, `depois funcao_trg=false`, `depois gatilho_zz=false`, `depois policies=Users can create their own templates,Users can update their own templates` (de volta ao estado anterior, só dono).

## Pontos do juiz
1. Números do relato x diff: confere — `git diff --stat dia/2026-10-13...HEAD` dá 3 arquivos alterados, sendo 1 de teste (listados acima). Os números batem.
2. Gatilho `update_message_templates_updated_at` regravando `updated_at`: PROCEDE e é o efeito tratado de propósito. A migration cria o gatilho `zz_message_templates_preserve_updated_at` (BEFORE UPDATE, que roda depois do carimbo — ordem alfabética 'u' < 'z') que restaura `old.updated_at` quando a única coluna que muda é `use_count`; edição de verdade continua carimbando. Provado com uma linha antes/depois: `PASS [B11 contar uso preserva updated_at (antes = depois)] -> igual` e `PASS [B11b editar de verdade carimba updated_at (antes <> depois)] -> diferente`. Não desligo o gatilho de carimbo (ele é do sistema e auditoria) nem anulo a coluna por GUC; preservo o valor de forma cirúrgica e provada.

## O que NÃO fiz e por quê
- Não mudei nenhum GRANT/ACL existente além dos explícitos da função nova; sem DROP/TRUNCATE/DELETE de dado.
- Não toquei o hook/tela (`src/hooks/chat/useQuickReplies.ts`): trocar o `update` pela RPC é parte da tela/hook, outra área. Registrado para o handoff.
- Não criei `scripts/db-audit/*.test.sh`: a prova é a suíte `.sql` em `supabase/tests/`, que não entra no inventário de `.test.sh`.
