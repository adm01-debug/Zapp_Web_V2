Especialista: senior (area-sql-banco + area-auth-seguranca)

Ponto 1 — reproduzir a recusa antes de corrigir
- O que conferi: trouxe os commits da entrega anterior (19396ef0b e c1bcdb2d3; origem c68425913) e rodei o verificador do inventário que o `zapp-verify full .` usa.
- Prova vermelha antes da correção: `node --test scripts/ci/db-inventory-doc.unit.mjs` falhou com 14/15 passando e o erro medido foi:
  - `"sicoob_contact_mapping" está como "roadmap", mas o repositório diz "parcial"`
  - `"sicoob_contact_mapping" não lista nenhum consumidor (o repositório cita em 1 arquivo(s))`
- Observação: a primeira chamada direta de `zapp-verify full .` excedeu o limite da ferramenta em 420s antes de devolver o resumo; depois da correção rodei o full em background até concluir.

Ponto 2 — corrigir o drift do espelho `docs/DB-INVENTORY.md`
- O que mudei: em `docs/DB-INVENTORY.md`, atualizei somente a linha de `sicoob_contact_mapping` de `roadmap | —` para `parcial | scripts/db-audit/inbox-contact-authorization.test.sh`.
- Por que esse foi o equivalente medido: no estado atual da branch-base, `conversation_tasks`, `message_reactions` e `team_message_reactions` já estavam cobertos como `ativo`; o drift real criado pela prova SQL nova era o arquivo `scripts/db-audit/inbox-contact-authorization.test.sh` passar a citar `sicoob_contact_mapping`.
- Prova verde: `node --test scripts/ci/db-inventory-doc.unit.mjs` passou com 15/15 testes, 0 falhas.

Ponto 3 — manter a prova SQL real e não afrouxar guarda
- O que mantive: não alterei `scripts/ci/db-inventory-doc.unit.mjs`; o ajuste foi só no documento espelho que a guarda valida.
- Prova verde da segurança do cartão original: `bash scripts/db-audit/inbox-contact-authorization.test.sh` passou com todos os casos RED/GREEN listados, incluindo personificação de reação bloqueada, task com contato fora do alcance bloqueada, anon sem privilégios nas 17 tabelas, authenticated mantendo CRUD necessário e reenvio idempotente das 3 migrations.

Ponto 4 — verificação final
- `zapp-verify full .` concluiu verde: `OK db_guard`, `OK tipos 16s`, `OK lint 172s`, `OK migrations`, aviso esperado de `banco_local` sem conjunto, e `OK testes 948s`.
- O diff ficou abaixo do limite e alinhado ao título: 5 arquivos, 322 inserções e 1 remoção, 26.288 caracteres.
- Procurei o identificador do projeto de produção no diff (busca pelo identificador do banco real no diff): não houve saída.

Arquivos alterados (`git diff --name-only dia/2026-10-11...HEAD`)
- docs/DB-INVENTORY.md
- scripts/db-audit/inbox-contact-authorization.test.sh
- supabase/migrations/20261009060347_sec_rls_message_reactions_author_binding.sql
- supabase/migrations/20261009060408_sec_rls_revoke_anon_contatos_mensagens.sql
- supabase/migrations/20261009060425_sec_rls_conversation_tasks_insert_visibility.sql

Comandos de verificação executados
- Vermelho antes da correção: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> 14/15, falha em `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` com os 2 erros de `sicoob_contact_mapping`.
- Verde depois da correção: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> 15/15, 0 falhas.
- Segurança SQL: `bash scripts/db-audit/inbox-contact-authorization.test.sh` -> `Inbox contact authorization PostgreSQL 17 behavioral contract: PASS`.
- Full: `zapp-verify full .` -> `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `OK testes`.
