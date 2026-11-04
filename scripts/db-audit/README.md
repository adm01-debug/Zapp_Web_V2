# `scripts/db-audit/`

Ferramental de auditoria do banco. Nasceu da auditoria de migracao de 27/08/2026
(`docs/audits/AUDITORIA_MIGRACAO_DB_2026-08-27.md`), que teve que ser refeita do zero
porque os scripts da primeira rodada viviam em `/home/claude/` e morreram no reset do
container. Etapa 98 do plano: publicar aqui para nao perder de novo.

## O que tem

| Arquivo | Precisa de banco? | O que faz |
|---|---|---|
| `supabase-usage-guard.mjs` | nao | Valida `.from()` / `.rpc()` do cliente principal contra `supabase/schema-catalog.json` |
| `known-violations.json` | nao | Baseline (ratchet) das violacoes ja conhecidas |
| `database-identity.json` / `.mjs` | nao | Prova o projeto Supabase por fingerprint, DB, schema e major sem imprimir segredo |
| `catalog.sql` | sim | Regenera `supabase/schema-catalog.json` (relacoes, colunas e assinaturas/overloads de funcoes) |
| `check-catalog-fresh.mjs` | nao | Compara por conjuntos o catalogo commitado com uma geracao fresca |
| `check-mcp-exec-acl.sql` | sim | Falha se as funcoes MCP sairem do contrato `postgres` + `service_role` |
| `check-secdef-public-execute.sql` | sim | Falha se qualquer funcao SECURITY DEFINER de `public` tiver EXECUTE para PUBLIC ou `anon` |
| `check-secdef-public-execute.test.sh` | Docker local | Prova que a guarda bloqueia o estado da T26, passa depois de `20261004172554` e nao e vacua |
| `check-migration-drift.mjs` | parcial | Valida migrations locais e compara versao, nome e evidencia com `schema_migrations` |
| `check-migration-drift.test.mjs` | nao | Simula duplicata, vazio, conteudo alterado e drift do ledger com `psql` fake |
| `check-reconcile-ledger-drift.test.sh` | Docker local | Prova replay limpo, colisao historica, fail-closed e idempotencia da reconciliacao de 29/08 |
| `migration-evidence.json` | nao | Excecoes exatas para stubs, replay divergente e legados sem SQL/hash no ledger |
| `manifest.sql` | sim | Manifesto deterministico: views, tipos/enums, defaults, constraints, indices, RLS, policies, triggers, funcoes e grants (relacao/coluna/rotina/tipo/default/schema) |
| `check-manifest-fresh.mjs` | nao | Compara `supabase/schema-manifest.json` com o banco oficial, provando identidade |
| `diff.mjs` | nao | Diffa dois manifestos v2, inclusive entre bancos distintos |
| `catalog-manifest.test.sh` | Docker local | Executa os dois SQLs no PostgreSQL 17, desloca OIDs e simula mutacoes estruturais |
| `gen-types.sh` | sim | Gera `types.ts` pela CLI pinada e normaliza o EOF de forma deterministica |
| `gen-types.test.sh` | Shell local | Simula a CLI e prova que o gerador preserva linhas internas e deixa exatamente uma quebra de linha no EOF |
| `supabase-snapshot-stats.test.sh` | Docker local | Extrai por AST o filtro real de `top_queries`, verifica 48 entradas no PostgreSQL 17 e prova que a fronteira antiga reprova 24 |
| `gmail-cas-postgrest.test.sh` | Docker + Deno locais | Executa 7 casos de cursor e 1 de reset Gmail por HTTP real no PostgREST descartavel, com migrations reais e respostas Gmail sinteticas |
| `talkx-engine-provider.test.sh` | Docker + Deno locais | Executa os 8 casos X034 do motor real contra PostgreSQL/PostgREST e o Evolution falso versionado |

## Uso

```sh
# guard de acoplamento (roda no CI, offline)
bun run db:guard

# drift de migrations
DESTINO_URL='postgres://...' node scripts/db-audit/check-migration-drift.mjs

# testes offline do guard de migrations (nao acessam banco real)
node --test scripts/db-audit/check-migration-drift.test.mjs

# integracao descartavel do catalogo/manifesto (nao acessa banco oficial)
bash scripts/db-audit/catalog-manifest.test.sh

# integracao descartavel da reconciliacao do ledger (nao acessa banco oficial)
bash scripts/db-audit/check-reconcile-ledger-drift.test.sh

# contrato real do filtro de consultas do snapshot (nao acessa banco oficial)
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/supabase-snapshot-stats.test.sh

# integracoes HTTP isoladas; no DB Guard, ambas usam SKIP_DOCKER_SHIM=1
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/gmail-cas-postgrest.test.sh
bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/talkx-engine-provider.test.sh

# comparar dois bancos estruturalmente
psql "$ORIGEM_URL"  -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql > /tmp/src.json
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql > /tmp/dst.json
node scripts/db-audit/diff.mjs /tmp/src.json /tmp/dst.json

# gerar artefatos frescos no job trusted (DESTINO_URL fica somente no ambiente)
umask 077
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/catalog.sql \
  > /tmp/schema-catalog.fresh.json
psql "$DESTINO_URL" -X -v ON_ERROR_STOP=1 -At -f scripts/db-audit/manifest.sql \
  > /tmp/schema-manifest.fresh.json

# validar sem copiar automaticamente artefato de banco errado
node scripts/db-audit/check-catalog-fresh.mjs /tmp/schema-catalog.fresh.json
node scripts/db-audit/check-manifest-fresh.mjs /tmp/schema-manifest.fresh.json

# apos revisar um drift (exit 1), atualizar os snapshots versionados
cp /tmp/schema-catalog.fresh.json supabase/schema-catalog.json
cp /tmp/schema-manifest.fresh.json supabase/schema-manifest.json
```

Os comparadores usam `0` para identidade + estrutura em sincronia, `1` para drift
estrutural revisavel e `2` para JSON invalido ou identidade nao comprovada. Um job
de sincronizacao pode propor snapshot apos `1`, mas **nunca** deve copiar arquivos
apos `2`. URLs, project-ref em claro, usuario e senha nao aparecem nas mensagens.

O contrato `supabase-snapshot-stats.test.sh` precisa de Python 3 (biblioteca padrao)
e Docker; no DB Guard usa o PostgreSQL 17 descartavel pelo `docker-shim`. Ele nao
importa o snapshot nem recebe credenciais de producao: extrai o literal SQL de
`get_db_stats` por AST. As 48 strings cobrem seis verbos em seis formas e mais
12 utilitarios/ausencias. A mesma matriz deve passar no filtro atual e reprovar
24 casos em uma copia temporaria com a fronteira antiga. O modo `--emit-sql`
permite inspecionar a extracao e as duas matrizes sem Docker; essa geracao sozinha
nao valida a semantica PostgreSQL. `SNAPSHOT_STATS_TEST_POSTGRES_IMAGE` permite
escolher a imagem descartavel; no CI ela usa a imagem PostgreSQL 17 pinada do job.

### Integracoes HTTP Gmail e Talk X

Os harnesses HTTP precisam de Docker Engine em host Linux, Deno e Python 3
(biblioteca padrao). O acesso direto do host a essa bridge interna nao e um
contrato de Docker Desktop. O DB Guard fornece as imagens PostgreSQL 17/PostgREST 14.5 pinadas e o Deno 2.9.5 ja
adotados pelo repositorio. `SKIP_DOCKER_SHIM=1` e obrigatorio nesse job: rede,
logs, readiness e PostgREST dependem de containers reais, nao do shim SQL.

Cada execucao cria uma rede interna e seus proprios containers, sem publicar
portas no host. `postgrest-internal-url.py` cruza os dois CIDs, labels, NetworkID,
membros e enderecos dos metadados Docker antes de aceitar o IPv4 privado do
PostgREST na porta 3000. Rede adicional, recurso alheio ou binding de porta
reprova antes do HTTP. O diagnostico mostra apenas Running/ExitCode/Error/Ports;
logs limitados do PostgREST sao lidos se ele encerrou antes da readiness.

Antes das migrations, PostgreSQL inicia com `cron.launch_active_jobs=off`,
confirmado por `SHOW`, e o host oficial e resolvido para loopback. JWTs, usuarios
e provedores sao sinteticos; Deno recebe `--allow-net=127.0.0.1,<IP-validado>:3000`:
o IP proprio para PostgREST e loopback para os proxies/provedores dos testes.
Curl ignora proxies do ambiente com `--noproxy '*'`. O bootstrap pode baixar
imagens e dependencias pinadas; nenhuma credencial oficial e recebida.

Gmail executa `gmail-cursor-cas-db.test.ts` (7) e `gmail-history-cas-db.test.ts`
(1) em chamadas separadas. Aplica nove estagios de migrations reais, extrai os
blocos Gmail de arquivos multidominio e verifica campos, RLS e FK RESTRICT.
Um usuario/profile sintetico permite que os testes criem suas proprias contas.
Depois de cada arquivo, contas residuais reprovam o harness: o DELETE no finally
original nao verifica o status HTTP. A fixture nao e um replay completo.

X034 aplica 18 migrations reais, incluindo o DDL N-102a de send_weekdays e
respect_dnd, e preserva os oito testes e o Evolution falso versionado (sabor v2).
As sete campanhas sinteticas usam respect_dnd=false: estes cenarios exercitam
lease/entrega sem depender da hora ou do dia; o default real do schema continua
true. Nao embaralhar ou paralelizar os testes desse arquivo.
`assert-deno-junit.py` exige as contagens reais 7/1/8 e zero falhas/ignorados;
exit zero com apenas o placeholder ignorado nao e sucesso. Cleanup usa IDs
criados pela execucao, erros de limpeza reprovam e INT/TERM saem como 130/143.
`edge-http-harness.unit.mjs` verifica esse controle com Bash real e executaveis
locais simulados; somente o DB Guard comprova as 16 integracoes reais.

### Rollout inicial de `schema-manifest.json`

O primeiro snapshot **nao pode ser fabricado offline**. O rollout e deliberadamente
feito em duas fases:

1. integrar o tooling/checkers e o fluxo trusted; a ausencia do snapshot retorna
   `1` somente depois de o candidato fresco e o `DESTINO_URL` provarem a identidade;
2. disparar `types-sync` no SHA integrado, revisar o PR gerado com o
   `supabase/schema-manifest.json` vindo do banco oficial e so entao fazer merge.

Durante esse bootstrap, `db-live-guard` sinaliza o snapshot ausente como drift. Ele
so volta a ficar verde depois do PR da fase 2; `exit 2` bloqueia o bootstrap e
impede que qualquer artefato seja copiado.

Sem `DESTINO_URL`, o guard de migrations ainda valida nomes, versoes unicas,
conteudo e o manifesto de evidencias; apenas a comparacao com o ledger e pulada.
Um arquivo somente de comentarios so e aceito quando uma entrada exata em
`migration-evidence.json` fixa versao, filename, SHA-256, `ledger_name`, tipo e
justificativa. Nos testes, `MIGRATIONS_DIR`, `MIGRATION_EVIDENCE_PATH` e `PSQL_BIN`
injetam fixtures e um executavel fake sem usar shell. Essas variaveis nao sao
necessarias no uso normal.

Migrations executaveis revisadas cujo ledger antigo preserva apenas nome/versao usam
`ledger-only/name-and-file-pinned`. Essa categoria fixa o arquivo local, nome/versao e
a ausencia de SQL/hash no ledger, mas nunca declara que os bytes locais sao o SQL
historico nem transforma metadados textuais em prova. O
guard reporta esse total separadamente; o DB Live Guard prova o estado estrutural
atual comparando o manifesto integral do banco canonico com o snapshot versionado.

## Por que o guard e offline

Porque assim ele roda em PR de fork, sem secret, e nao vira aquele check que fica
amarelo pra sempre porque a credencial expirou. O preco e que
`supabase/schema-catalog.json` e `supabase/schema-manifest.json` precisam ser
regenerados quando o schema muda. O workflow offline `db-guard.yml` valida o
ferramental sem receber segredo; o workflow confiavel `db-live-guard.yml` compara
os snapshots com o banco oficial e publica a geracao fresca como artifact de curta
retencao para revisao/rebuild.

## Armadilhas conhecidas

- **Este repo tem tres clientes Supabase.** `src/integrations/supabase/client.ts` (principal),
  `externalClient.ts` (CRM externo) e `clientesClient.ts` (base de clientes). Edge functions
  ainda criam `extClient` para PROMOGIFTS. Tratar todos como um so gera falso positivo:
  na primeira passada da auditoria, 13 de 17 "tabelas inexistentes" eram so chamadas em
  outro banco.
- **`storage.from('bucket')` casa com o mesmo regex de `.from('tabela')`.** O guard filtra
  pelo receptor; qualquer analise ad-hoc precisa fazer o mesmo.
- **`.from('x' as any)` silencia o TypeScript.** Ha 18 desses no repo. O type-check nao
  pega, so o guard pega.
- **`CREATE INDEX CONCURRENTLY` nao roda pelo gateway MCP** (erro 25001, wrapper
  transacional). Para tabela grande, use `psql` direto.
- **`supabase_apply_migration` esta bugado no self-hosted** (referencia coluna
  `executed_at` inexistente). Ver `docs/MIGRATIONS.md`.
