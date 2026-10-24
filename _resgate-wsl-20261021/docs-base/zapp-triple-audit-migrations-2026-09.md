# Auditoria tríplice local↔GitHub↔banco — Zapp Web V2/V3 (25/09/2026)

Caso completo por trás das técnicas resumidas no SKILL.md principal. Dois projetos
(Zapp_Web_V3 e zapp-web-v2-main), auditados na mesma sessão após dois PRs de
reconciliação de drift de migrations já terem sido mergeados/abertos.

## Contexto

- Zapp_Web_V3: banco Supabase self-hosted (AtomicaBR), acesso via MCP custom
  (`mcp_call.py` + `gateway_url.txt`, token no path da URL).
- zapp-web-v2-main: banco Supabase cloud, acesso via `supabase` CLI já logado
  localmente (`supabase migration list --linked`).
- Squash de histórico documentado em `docs/history/migrations-archive/README.md`
  do V3: baseline oficial = versão `20260817000000`; tudo antes foi arquivado.
  Comparar migrations sem aplicar esse baseline gera ~280 falsos positivos.

## Resultado da comparação repo↔banco

- **V3**: 165 arquivos no repo, 852 versões no banco (esperado pelo squash).
  Filtrando por baseline: 160 vs 174. Zero migrations do repo ausentes do banco.
  14 versões no banco sem arquivo individual = exatamente as 14 já cobertas por
  uma migration de reconciliação agregada (mesmo padrão de uma reconciliação
  anterior do próprio projeto, `20260819155921_reconcile_repo_db_backfill.sql`).
  Confirmação independente: workflow "Migration Smoke Test" (rebuild do zero de
  todas as migrations) passou `success` no commit exato do merge.
- **V2**: `supabase migration list --linked` retornou 485 migrations, **100%**
  com `local == remote` — zero divergência em qualquer direção. Melhor resultado
  possível; nenhuma ação necessária.

## Falso positivo investigado a fundo (V2)

Workflow "DB Migrate (production)" falhou num `workflow_dispatch` manual, log
citando "conteúdo SQL divergente" pra migration `20260925140000`. Antes de
reportar como bug: extraída a mensagem completa do preflight — o step que
falhou era "Provar paridade integral quando a versão já existe", ou seja, alguém
tentou REAPLICAR uma migration já registrada e o preflight bloqueou de propósito
(anti-reaplicação). Confirmação definitiva: extraído o statement real do arquivo
local via `node scripts/db-audit/register-migration.mjs <arquivo>` (modo
dry-run, sem `--apply`) e o statement real do ledger via
`supabase db dump --linked --data-only -s supabase_migrations`; SHA256 dos dois
**idênticos** (`7f40db41a31f90393a5a9ba249b62746aeaafb802e96b632c4f38970dd80351d`).
Veredicto: comportamento correto do gate de segurança, não um bug.

## Diagnóstico de credencial externa via pg_net (V3)

Log do frontend mostrava 401 recorrente e permanente numa instância WhatsApp
(Evolution API). Sequência de investigação:
1. Achar a tabela de credenciais real (não a tabela "óbvia" —
   `instance_registry` não tinha a key; a fonte real era
   `evolution_instance_credentials`, com `vault_secret_id` apontando pro Vault).
2. Confirmar `health_status: unhealthy` já registrado pelo próprio sistema,
   timestamp coerente com o horário dos erros no log.
3. Testar a key real contra o servidor Evolution sem nunca expor o valor:
   `SELECT net.http_get(url := api_url || '/instance/connectionState/' || nome,
   headers := jsonb_build_object('apikey', api_key)) FROM tabela WHERE ...`,
   aguardar alguns segundos, ler só
   `SELECT status_code FROM net._http_response WHERE id = <request_id>`.
   Resultado: 401 real, confirmando credencial revogada no servidor externo,
   não corrupção no banco nem bug no código do frontend.
4. Apagar a linha de teste em `net._http_response` ao final (confirmar com o
   usuário antes do DELETE, mesmo sendo só log interno do pg_net).

## CI "consertado" que revelou migração maior incompleta (V3, PR #1566)

O gate bloqueante de TypeScript do PR falhava com **566 erros** em ~60 arquivos
de teste nunca tocados pelo PR. Investigação:
1. Reproduzir o EXATO comando do CI localmente no branch do PR (não no repositório
   errado — confundir `main` local com o branch do PR gera diagnóstico invertido).
2. `bun install --ignore-scripts` (sem frozen) local mostrou o mesmo bump de
   `vitest@4.1.10 → 5.0.1` que o CI aplicava silenciosamente a cada run (o log
   do CI mostrava "Saved lockfile" — sinal de que o lockfile estava sendo
   reescrito no próprio job).
3. Causa raiz real: `package.json` do `main` já pedia `vitest: "^5.0.0"` e
   `@sentry/react: "10.75.0"`, mas `bun.lock` commitado estava travado em versões
   antigas havia 6+ dias (package.json mudou 21/09, bun.lock não mudava desde
   15/09). Por isso os workflows evitavam `--frozen-lockfile` de propósito —
   comentário antigo no YAML citava "registro privado inacessível" como motivo,
   mas isso estava desatualizado; o motivo real e atual era esse drift silencioso.
4. Corrigir o lockfile pra bater com package.json destravou o vitest 5 de
   verdade → 586 erros de tipo em arquivos de teste escritos pra API do vitest 4
   (migração de major version pendente e incompleta, não um simples ajuste de
   lockfile). Decisão: reverter tudo (nada commitado/empurrado), documentar como
   card urgente para decisão do usuário (reverter o bump ou migrar os ~60 testes).

## delegate_task indisponível nesta sessão

`mcp__delegate_task` falhou com "Cannot resolve delegation provider 'deepseek':
No usable credentials" ao tentar despachar 5 subagentes de auditoria em
paralelo. Providers disponíveis pro caminho de delegação eram outros
(openrouter/nous/zai/kimi-coding/minimax) mas a escolha é config.yaml, não
parâmetro por chamada. Fallback aplicado com sucesso: executar as mesmas 5
frentes de auditoria sequencialmente, mantendo o mesmo rigor de evidência por
domínio (comando real + output real).
