Especialista: senior (area-sql-banco)

## O que mudou e por quê
- `supabase/migrations/20261014010805_absent_agents_use_presence.sql`: 1 token no `-- Rollback:` — `search_path to 'public', 'pg_temp'` voltou a `to 'public'`. Conferi o corpo anterior real token a token contra `20260829040000` e era a única divergência (a recusa afirmava search_path idêntico; não era). Rollback agora idêntico ao corpo real.
- `scripts/db-audit/absent-agents-presence.test.sh`: cobre os 3 pontos sem reescrever a função — instala o trigger anti-hijack REAL aplicando os arquivos do repo em ordem (`20260924203300` + `20260929790000`, versão vigente), chama a função como service_role, prova governança do parâmetro (omitido/explícito) e aplica TODAS as linhas do Rollback com ACL nos 4 papéis + critério antigo por comportamento.

## Prova
- Verde (2 execuções seguidas, Postgres 17 descartável): `bash scripts/db-audit/absent-agents-presence.test.sh` → `PASS_COUNT=39`, `FAIL_COUNT=0`, `TODOS OS BLOCOS PASSARAM`.
- Vermelho ponto 2 (sem instalar o trigger): `[FALHOU] Trigger vivo: nao-admin nao desvia contato alheio` — sem o trigger o UPDATE passa no vácuo.
- Vermelho ponto 1 (extração só-1ª-linha + ACL à deriva): `[FALHOU] Rollback: service_role executa: esperado 't', obtido 'f'` — só a extração total repara.
- Vermelho ponto 3 (corpo antigo, sem a migration): `GREEN: retorno esperado 4 (b2=2, b7=1, b6=1), obtido '9'` — o defeito do cartão.

## Pontos da recusa
- Ponto 1: resolvido — `test.sh` aplica todas as linhas do Rollback (`sed -n 's/^--   //p'`, sem `head -n1`) e afirma default 30 + `authenticated=t, service_role=t, anon=f, PUBLIC=f` + comportamento antigo (sem arg retorna 9, b3 perde a carteira, b4=9).
- Ponto 2: resolvido sem reescrever a função — trigger real instalado; não-admin em UPDATE direto é barrado (`Trigger vivo`), admin e service_role sob a função passam (4 realocados cada). O cenário não-admin direto na função continua barrado no guard antes de qualquer UPDATE (mantido).
- Ponto 3: resolvido sem mexer no chamador nem reverter o default — o cartão exige default 2 e proíbe `src/**`; o hook passa 30 explícito hoje (`useAgentReassignment.ts:12-14`, conferido), logo sua via não muda até o cartão de front. Prova ponta a ponta: omitido retorna 4 (= default 2); explícito 30 retorna 5 (b6 vira fresco e herda q2).

## O que NÃO fiz e por quê
- Não alterei o default do hook front (`ARQUIVOS QUE PODE TOCAR` só permite migrations/ci/db-audit; é de outro cartão, já divulgado no cabeçalho da migration).
- Não reescrevi `reassign_absent_agents` (a recusa mandou só testar o ponto 2; o corpo segue o da rodada 1).
- Não criei `.test.sh` novo nem editei workflow/CI: estendi o harness do assunto e o registro no inventário já estava feito.

## Arquivos (`git diff --name-only dia/2026-10-13...HEAD`, colado)
.tmp/relato.md
scripts/ci/check-test-inventory.mjs
scripts/db-audit/absent-agents-presence.test.sh
supabase/migrations/20261014010805_absent_agents_use_presence.sql

## Verificação
- `bash scripts/db-audit/absent-agents-presence.test.sh` → 39 PASS / 0 FALHOU (2x seguidas, container efêmero; nada de produção citado em código, teste ou relato).
- Passada de efeito colateral: triggers da tabela (`update_contacts_updated_at` só nas linhas movidas; hijack morde/libera certo); tudo-ou-nada na mesma transação; mesma negação p/ não-admin; nenhum GRANT/REVOKE novo na migration; NULL/negativo → 22023; prova por comportamento com papel real.
