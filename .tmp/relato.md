Especialista: workersql
Perfil: semisenior (refazer 1 do t_388bfa1e) — skill de área: area-sql-banco

## O que mudou e por quê

Refazer 1 da recusa do revisor (GRANT a mais ao service_role). Diff desta rodada: 2 arquivos, 9 inserções, 3 remoções.

- `supabase/migrations/20261014011104_contact_audit_log.sql`: `GRANT SELECT, INSERT ... TO service_role` virou `GRANT SELECT ... TO service_role` (linha do GRANT) + comentário alinhado ("backoffice SÓ lê; quem escreve é o trigger SECURITY DEFINER, que roda como o dono"). Sem INSERT direto, o service_role não forja linha na trilha.
- `scripts/db-audit/contacts-soft-delete-and-status.test.sh`: expectativa do ACL ajustada para `false|true|false|false|false` (rótulo diz SELECT=true, INSERT=false) + asserção nova `service_role NAO escreve direto na trilha` (INSERT como service_role tem de falhar com `permission denied for table contact_audit_log`).
- Teste do trigger mantido gravando com DML em `contacts` (INSERT/UPDATE/DELETE como superuser + UPDATE como authenticated com claims no teste de AUTOR): nenhuma escrita direta na trilha foi convertida em prova do trigger.

## Prova (vermelho → verde, código real em PostgreSQL 17 descartável)

Comando: `bash scripts/db-audit/contacts-soft-delete-and-status.test.sh` (aplica o ARQUIVO REAL da migration; Docker, imagem postgres:17-alpine).

- vermelho A (teste novo + migration ANTIGA): `EXIT=1`, 78 `[PASS]` e depois `[FAIL] auditoria: anon sem nada; service_role so le (SELECT=true, INSERT=false, sem UPDATE/DELETE): esperado 'false|true|false|false|false', obtido 'false|true|true|false|false'` — o teste acusa o INSERT a mais.
- vermelho B (teste novo + migration ANTIGA, asserção nova): `EXIT=1`, 98 `[PASS]` e depois `[FAIL] auditoria: service_role NAO escreve direto na trilha (so o trigger escreve) deveria falhar` — sem a correção o INSERT como service_role PASSA (a linha forjada é gravada: o defeito da recusa).
- verde (teste novo + migration CORRIGIDA): `EXIT=0`, 108 `[PASS]`, 0 `[FAIL]`, linha final `Contacts F1 (soft-delete, Sicoob, status, grants) PostgreSQL 17 behavioral contract: PASS`. Inclui o bloco de idempotência (reaplicação) e o BLOCO C (Rollback do cabeçalho rodando de verdade) — o rollback continua válido com o GRANT reduzido.
- `zapp-verify . --rapido`: ver seção Verificação abaixo (rodando em fundo no fechamento; resultado colado antes de completar).

## Pontos do revisor

- Ponto 1: resolvido — `supabase/migrations/20261014011104_contact_audit_log.sql` (bloco de GRANTs): `GRANT SELECT ON TABLE public.contact_audit_log TO service_role;` (era `SELECT, INSERT`). Prova: vermelho A + verde acima.
- Ponto 2: resolvido — `scripts/db-audit/contacts-soft-delete-and-status.test.sh` (bloco GREEN da trilha): expectativa `false|true|false|false|false` com rótulo `service_role so le`; asserção nova `expect_failure 'auditoria: service_role NAO escreve direto na trilha (so o trigger escreve)'` com `permission denied for table contact_audit_log`; cobertura do trigger por DML em `contacts` mantida (teste de AUTOR com claims de authenticated + INSERT/UPDATE/DELETE da trilha). Prova: vermelho A, vermelho B + verde acima.
- Ponto 3: resolvido — comentário da migration alinhado (`-- service_role: backoffice SO le (SELECT); sem INSERT/UPDATE/DELETE -- nem ele forja linha: quem escreve e o trigger SECURITY DEFINER, que roda como o dono.`); este relato documenta vermelho A/B + verde com as linhas reais de saída.

## O que NÃO fiz e por quê

- Não mexi em `src/integrations/supabase/types.ts` (forma da tabela inalterada), nem em RLS/policies/funções/trigger/rollback da migration: fora dos 3 pontos da recusa.
- Não converti o DML do teste do trigger para `SET ROLE service_role` em `contacts`: o harness só dá SELECT ao service_role nessa tabela e produção não depende disso — o ponto 2 pedia para MANTER a cobertura por DML em contacts, e ela está intacta.

## Arquivos (`git diff --name-only HEAD`)

- scripts/db-audit/contacts-soft-delete-and-status.test.sh
- supabase/migrations/20261014011104_contact_audit_log.sql

## Verificação

- `zapp-verify . --rapido` → `OK db_guard / OK tipos / OK lint / OK migrations` + `VERIFY: VERDE SEM BANCO (15s)` / `VERIFY_EXIT=0`. Sem nome de conjunto o verify pula o `banco_local` (mesmo regime da entrega anterior); a prova de banco deste cartão é a suíte acima, que aplica o ARQUIVO REAL da migration em PostgreSQL 17 descartável.
