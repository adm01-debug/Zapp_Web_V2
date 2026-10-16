Especialista: senior (area-sql-banco)

## Pontos da recusa
- Ponto 1: a entrega anterior quebrava o ESPELHO DO CI no empilhamento: `docs/DB-INVENTORY.md cobre o catálogo do banco, sem mentir` acusava que `catalog_rate_limit_hits` virou citado pelo novo teste, mas seguia como `roadmap` e sem consumidor. Corrigi `docs/DB-INVENTORY.md`: a linha de `catalog_rate_limit_hits` agora é `parcial` e lista `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh`, que é o único consumidor real detectado pela guarda. Prova vermelha antes: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> falhou com `"catalog_rate_limit_hits" está como "roadmap", mas o repositório diz "parcial"` e `não lista nenhum consumidor`. Prova verde depois: o mesmo comando -> `tests 15`, `pass 15`, `fail 0`.

## O que veio do trabalho anterior
- `supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql`: mantém a assinatura da RPC `catalog_rate_limit_hit(uuid,text,integer,integer)`, mas a janela e a cota passam a sair da política confiável compilada, não dos argumentos livres; ação desconhecida cai no balde `global`; ACL da assinatura exata é reafirmada; o rollback executável também ficou declarado no cabeçalho, além do bloco extraído pelo teste.
- `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh`: executa PostgreSQL descartável com as migrations reais, papel `authenticated`, ataques de `p_window_ms` 0/negativo/1ms/enorme e `p_limit` arbitrário; extrai e executa o rollback da própria migration e reaplica a migration para provar idempotência.
- `.github/workflows/db-guard.yml`: registra o novo `.test.sh` no DB Guard offline, sem alterar comandos existentes.

## Prova do comportamento de banco
- vermelho sem a correção SQL: `TMPDIR="$PWD/.tmp" CATALOG_RATE_LIMIT_SEM_FIX=1 scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh` -> `RC=1` e `[FAIL] B.1 o limite vem da politica confiavel (120/min em list_products), nao do argumento: esperado '120', obtido '1'`.
- verde com a correção SQL: `TMPDIR="$PWD/.tmp" scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh` -> `RC=0` e `PASS: R2-DB-010 — a cota do catalogo vem de politica confiavel na funcao; janela e limite arbitrarios por RPC direta nao apagam hits nem liberam a requisicao; o rollback devolve o estado anterior e reaplicar e idempotente sem criar tabela/RLS/indice novo.`
- guarda do inventário depois do refazer: `node --test scripts/ci/db-inventory-doc.unit.mjs` -> `tests 15`, `pass 15`, `fail 0`.
- inventário de testes: `node scripts/ci/check-test-inventory.mjs` -> não acusa `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh`; o comando ainda falha por 3 órfãos preexistentes fora deste diff (`department-invite-contract-audit-vocabulary.test.sh`, `talkx-conversion-defaults.test.sh`, `team-chat-media-contract.test.sh`).
- verificação rápida: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (18s)` com `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`.
- reprodução pedida do full: `zapp-verify full .` foi executado. Após a correção do inventário, db_guard/tipos/lint/migrations ficaram OK e a falha remanescente foi fora deste diff: `src/components/auth/__tests__/PasswordStrengthMeter.corrida.test.tsx` (`Senha comprometida!` ainda presente). Não alterei auth/front fora do escopo.

## Arquivos do diff
- `.github/workflows/db-guard.yml`
- `docs/DB-INVENTORY.md`
- `scripts/db-audit/catalog-rate-limit-policy-pinned.test.sh`
- `supabase/migrations/20261007000311_catalogo_rate_limit_politica_confiavel.sql`

## O que NÃO fiz e por quê
- Não alterei `schema-catalog.json`, `schema-manifest.json`, manifestos de schema nem guardas do CI para “fazer passar”. A única mudança em CI foi registrar o `.test.sh` novo no workflow que já roda scripts `db-audit`, como exigido pelo inventário de testes; a regra do inventário não foi afrouxada.
- Não toquei no teste de auth que falhou no `zapp-verify full .`, porque é defeito fora dos arquivos e do motivo desta recusa.
