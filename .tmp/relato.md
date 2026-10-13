Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261013005351_email_templates_author_immutable.sql (NOVA): gatilho BEFORE UPDATE + funcao `public.guard_email_templates_author_mutability()` que rejeita (ERRCODE 42501, mensagem `email_templates_author_immutable`) troca de `created_by` quando `auth.role() = 'authenticated'`. Fecha o furo do cartao: a policy `email_templates_update_owner_or_staff_shared` repete USING em WITH CHECK, entao o staff passava na linha COMPARTILHADA de outro e podia reatribuir a autoria no mesmo UPDATE (o dono anterior perdia o modelo).
- scripts/db-audit/email-templates-rls.test.sh: estendido com BLOCO C (o defeito REPRODUZIDO antes do hardening e provado fechado depois, rodando como o papel real) e BLOCO D (rollback do hardening extraido do proprio arquivo + reaplicar = idempotente). O arquivo ja estava registrado no db-guard pelo cartao-avo (commit de0635599); nao toquei no workflow.

## Prova
- vermelho antes: `bash scripts/db-audit/email-templates-rls.test.sh` com a migration de hardening trocada por um stub sem gatilho ->
  `[FAIL] C1 staff nao reatribui a autoria da linha de outro (guardado): deveria falhar, mas passou` (RC=1).
- verde depois: mesmo comando ->
  `[PASS] C1 staff nao reatribui a autoria da linha de outro (guardado)`
  `[PASS] C2 autoria preservada apos a tentativa`
  `[PASS] C3/C4 dono segue editando e excluindo o proprio modelo`
  `[PASS] C5 staff ainda edita o corpo da linha compartilhada (nao regrediu)`
  `[PASS] C6 a edicao do staff preservou a autoria do dono`
  `[PASS] C7 service_role segue livre para back-office`
  `[PASS] D1..D5 rollback remove gatilho+funcao sem derrubar a tabela; reaplicar e idempotente`
  `== TODOS OS PASSOS PASSARAM ==` (RC=0).
- banco LOCAL do cartao: `hermes-db-migrar supabase/migrations/20261013005351_email_templates_author_immutable.sql` ->
  `APLICADA no banco LOCAL 'v2-26101221510dae' (produção não foi tocada)`. (A migration ET1 do cartao-avo teve de ser aplicada antes no banco local por `zapp-db-local psql`, porque o replay le as migrations no inicio do run e a ET1 nasceu depois — registrado.)

## Por que gatilho e nao WITH CHECK
WITH CHECK nao enxerga o OLD: nenhuma expressao de policy consegue proibir trocar `created_by` mantendo a linha compartilhada valida. O gatilho e a unica barreira desse caminho e espelha o precedente do repositorio `20260929590000_multiplix_mutability_guard.sql` (guarda so para `authenticated`; service_role/back-office livre — C7 prova).

## Passada de efeito colateral
1. Gatilhos: a tabela tem `set_email_templates_updated_at` (regrava updated_at) — inalterado; o gatilho novo e BEFORE UPDATE e so pode RAISE, nao escreve. Zero UPDATE de dado nesta migration (sem backfill).
2. Tudo ou nada: roda em uma transacao (BEGIN/COMMIT do hermes-db-migrar).
3. Sem oraculo: a guarda nao consulta existencia de nada; o erro 42501 e igual para qualquer linha.
4. Permissao so a pedida: nenhum GRANT/REVOKE de objeto existente; apenas `REVOKE ALL ... FROM PUBLIC, anon, authenticated` da funcao NOVA (deny by default) e nenhuma policy/papel mudou.
5. Entrada invalida: a troca de autoria tem teste de erro (C1); nulo nao se aplica (coluna criada pela ET1).
6. Teste robusto: por comportamento com papel real (authenticated/service_role), sem deparse.

## O que NAO fiz e por que
- Nao editei a migration ET1 (regra: correcao = migration nova).
- Nao mexi em src/ nem em supabase/functions/ — front V3 nao usa a tabela no V2; os types gerados ja cobrem as colunas.
- Nao alterei .github/workflows/db-guard.yml (test.sh ja registrado pelo cartao-avo).
