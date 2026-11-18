# Runbook: segredos do nível repo para os environments (W11, W12, W62, W63)

**Criado em:** 2026-10-15 · **Quem executa:** Joaquim (dono do repo) · **Repo:** `adm01-debug/Zapp_Web_V2`
**Plano:** `docs/audits/PLANO_GITHUB_ACTIONS_100_ETAPAS_2026-10-14.md`, etapas W11, W12, W62 e W63

Nenhum agente consegue fazer esta migração. A API do GitHub não devolve o valor de um secret, só o nome,
então mover um secret é sempre: pegar o valor na fonte, gravar no environment e apagar a cópia do repo.
A parte que dava para preparar já está pronta. Os workflows declaram o environment certo, e
`scripts/ci/secrets-environments.unit.mjs` falha se algum consumidor perder essa declaração.

---

## 1. Por que dá para migrar um secret de cada vez sem quebrar nada

Um job com `environment: X` lê `secrets.NOME` **do environment X** quando ele existe lá. Quando não existe,
lê do **nível repo**. Daí saem três consequências:

1. **Hoje** todos os consumidores já declaram o environment e todos os environments estão vazios, então
   tudo continua lendo do repo. Esse é o estado atual, verde.
2. **Criar no environment** passa a valer no próximo run desse job. A cópia do repo continua lá como
   rede de segurança.
3. **Apagar do repo** só restringe quem enxerga o valor. Faça isso **só depois** de um run verde lendo do
   environment e depois que **todos** os environments consumidores tiverem o secret. Apagar do repo
   afeta todos os consumidores de uma vez.

Os workflows checam secret vazio e falham fechado (`::error::DESTINO_URL ausente.`,
`::error::CRON_SECRET ausente.`, `::error::SUPABASE_ACCESS_TOKEN ausente.`), então um erro de ordem
aparece como run vermelho, não como comportamento silencioso.

### Estado medido em 15/10/2026, pela API e só leitura

| Environment | Proteções | Branch policy | Secrets (nomes) | Consumidores |
|---|---|---|---|---|
| `perimetro-leitura` | só branch policy (sem revisor, sem wait timer) | `protected_branches` (`main`) | `SETTINGS_GUARD_TOKEN` (criado 15/10 11:13 UTC por uma sessão de agente; **valor e escopo desconhecidos**, ver W11) | `settings-guard.yml` › `guard` |
| `banco-leitura` | só branch policy | `protected_branches` | — | `db-live-guard.yml` › `live-contract`, `types-sync.yml` › `sync` |
| `producao-edge-functions` | só branch policy | `protected_branches` | — | `deploy-functions.yml` › `deploy`, `crm-sync-worker.yml` › `drain` |
| `producao-ddl` | **revisor obrigatório** `adm01-debug` + branch policy | `protected_branches` | — | `db-migrate.yml` › `apply` (GA13) |
| `db-ledger-evidence` | **revisor obrigatório** `adm01-debug` + branch policy | `protected_branches` | — | `targeted-ledger-evidence.yml` › `export-encrypted-evidence` |
| `legacy-import-destrutivo` | revisor obrigatório + branch policy | `protected_branches` | — | nenhum desde 15/10 (`supabase-sync.yml` removido). **Não** recebe `DESTINO_URL` |

**Nível repo (14):** `CRON_SECRET`, `DESTINO_URL`, `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`,
`EXTERNAL_SUPABASE_SERVICE_ROLE_KEY`, `EXTERNAL_SUPABASE_URL`, `PREVIEW_EGRESS_PROXY_URL`,
`PREVIEW_EGRESS_SHARED_SECRET`, `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY`, `PROMOGIFTS_SUPABASE_URL`,
`SUPABASE_ACCESS_TOKEN`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`.

Os jobs agendados ou disparados por push (`settings-guard`, `db-live-guard`, `types-sync`, `deploy-functions`
no push) usam environments **sem** revisor e sem wait timer, então nenhum fica em `Waiting`. `producao-ddl` e
`db-ledger-evidence` têm revisor, mas os dois workflows são só `workflow_dispatch` e já pausavam para
aprovação antes desta migração. Nada muda neles.

**Fica no repo de propósito, fora deste runbook:** `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD` e
`SUPABASE_SERVICE_ROLE_KEY` (`e2e-logado.yml`), mais `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`
(`ci.yml`, valores públicos de build).

### Antes de começar

```bash
gh auth status                                   # logado como adm01-debug
R=adm01-debug/Zapp_Web_V2
# Conferir que nenhum environment-alvo ganhou revisor ou wait timer desde a medição acima:
for e in perimetro-leitura banco-leitura producao-edge-functions producao-ddl db-ledger-evidence; do
  gh api "repos/$R/environments/$e" --jq '"\(.name): " + ([.protection_rules[].type] | join(","))'
done
# Esperado: perimetro-leitura, banco-leitura e producao-edge-functions só com "branch_policy".
```

Se `banco-leitura`, `perimetro-leitura` ou `producao-edge-functions` aparecer com `required_reviewers` ou
`wait_timer`, **pare**. Os runs agendados passariam a ficar em `Waiting`, e isso precisa ser decidido
antes da migração.

**Como digitar valores com segurança.** Nunca passe o valor como argumento (`--body valor`), porque ele
fica no histórico do shell e no `ps`. O padrão deste runbook é ler o valor sem eco e mandá-lo por stdin:

```bash
read -rs V && printf '%s' "$V" | gh secret set NOME --env AMBIENTE --repo "$R"; unset V
```

`gh secret set` sem `--body` lê o valor do stdin. Se rodar sem pipe, ele pergunta de forma interativa e
não ecoa o valor.

**Guarde cada valor num cofre de senhas até a migração inteira terminar.** Sem o valor, o único jeito
de reverter é rotacionar.

---

## 2. W11 + W12: token de leitura administrativa do `settings-guard`

**Por quê:** o `GITHUB_TOKEN` de workflow recebe 403 em branch protection, actions permissions e nos campos
de merge do repo. O guard marca esses campos como "NÃO VERIFICÁVEL". Com um PAT de leitura administrativa
ele passa a lê-los de verdade.

**O que já está pronto (W12):** `settings-guard.yml` roda em `environment: perimetro-leitura` e passa
`ADMIN_READ_TOKEN: ${{ secrets.SETTINGS_GUARD_TOKEN || github.token }}`. O script
(`scripts/ci/github-settings-guard.mjs`) usa esse token **só para leitura**. Issue e PATCH de restauração
continuam com o `GITHUB_TOKEN` e comentam como `github-actions[bot]`. Três casos estão cobertos:

- **Sem o secret:** o comportamento é o de antes do W12, com campos "NÃO VERIFICÁVEL", job verde e
  `::warning::`.
- **PAT recusado com 401** (vencido ou revogado): aparece um `::warning::` pedindo rotação, o resto do run
  segue com o `GITHUB_TOKEN` e o guard não cai.
- **Em todos os casos** o log diz a fonte: `Leitura administrativa: SETTINGS_GUARD_TOKEN (...)` ou
  `GITHUB_TOKEN (...)`. O valor do token nunca é impresso.

### Passo a passo (W11)

1. **Criar o PAT fine-grained.** GitHub → Settings (da conta) → Developer settings → Personal access
   tokens → **Fine-grained tokens** → *Generate new token*:
   - **Token name:** `zapp-settings-guard-leitura`
   - **Expiration:** 90 dias (anote a data; o GitHub manda e-mail antes de vencer)
   - **Resource owner:** `adm01-debug`
   - **Repository access:** *Only select repositories* → `Zapp_Web_V2`
   - **Repository permissions:** `Administration: Read-only` (o `Metadata: Read-only` entra sozinho).
     **Nada mais.** Sem `Contents`, sem nenhum *write*.
2. **Gravar no environment.** Isto sobrescreve o `SETTINGS_GUARD_TOKEN` que já existe lá. Ele foi criado
   por uma sessão de agente em 15/10, e ninguém sabe que token é nem qual escopo tem; um agente só poderia
   ter gravado um token que ele próprio possuía, provavelmente mais amplo que o necessário. Substitua:
   ```bash
   read -rs V && printf '%s' "$V" | gh secret set SETTINGS_GUARD_TOKEN --env perimetro-leitura --repo "$R"; unset V
   ```
3. **Verificar:**
   ```bash
   gh workflow run settings-guard.yml --ref main --repo "$R"
   sleep 15; RUN=$(gh run list --workflow settings-guard.yml --repo "$R" --limit 1 --json databaseId --jq '.[0].databaseId')
   gh run watch "$RUN" --repo "$R"; gh run view "$RUN" --repo "$R" --log | grep -E 'Leitura administrativa|NAO VERIFICAVEL|PARCIALMENTE|divergencia'
   ```
   Esperado: `Leitura administrativa: SETTINGS_GUARD_TOKEN (environment perimetro-leitura)` e **nenhum**
   `NAO VERIFICAVEL`. Se ainda aparecer:
   - `environments: NAO VERIFICAVEL`: edite o PAT e acrescente `Actions: Read-only`.
   - `merge/repo: PARCIALMENTE VERIFICAVEL`: a API não entrega esses campos a esse escopo de leitura.
     Registre como limite medido; **não** dê permissão de escrita ao PAT para resolver.
   - `SETTINGS_GUARD_TOKEN recusado (401)`: o token foi colado errado ou já venceu. Repita o passo 2.
4. **Não existe cópia no repo para apagar.** `SETTINGS_GUARD_TOKEN` nunca existiu no nível repo, e assim
   deve continuar.

**Rotação (a cada 90 dias):** gere um PAT novo com o mesmo escopo, repita os passos 2 e 3 e depois revogue
o antigo em Developer settings → Fine-grained tokens. **Reverter:**
`gh secret delete SETTINGS_GUARD_TOKEN --env perimetro-leitura --repo "$R"`. O guard volta sozinho ao
`GITHUB_TOKEN`, que é o comportamento de antes do W12.

---

## 3. W62: segredos de deploy → `producao-edge-functions`

**Consumidores:** `deploy-functions.yml` › `deploy` (os 8) e `crm-sync-worker.yml` › `drain` (só
`CRON_SECRET`). Os dois já declaram `environment: producao-edge-functions`. Nenhum outro job lê esses
secrets; o teste de contrato garante isso.

| Secret | Origem → destino | Onde pegar o valor | Validação local antes de gravar |
|---|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | repo → `producao-edge-functions` | Não dá para ler de volta. Supabase → Account → Access Tokens → **gerar um novo** (a migração vira rotação) | `read -rs T; SUPABASE_ACCESS_TOKEN="$T" supabase projects list \| grep tnnnlkbymytvtqngbbqh; unset T` |
| `CRON_SECRET` | repo → `producao-edge-functions` | Igual ao `gmail_cron_secret` do vault (são 3 cópias idênticas, ver `cron-secret-rotation.md`): SQL Editor do dashboard, `select decrypted_secret from vault.decrypted_secrets where name = 'gmail_cron_secret';` | health do CRM, abaixo |
| `PROMOGIFTS_SUPABASE_URL` | repo → `producao-edge-functions` | host do projeto do catálogo (`https://<ref>.supabase.co`) | junto com a chave, abaixo |
| `PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY` | repo → `producao-edge-functions` | dashboard do projeto do catálogo → Settings → API → `service_role` | `products?select=id&limit=1` → 200 |
| `EXTERNAL_SUPABASE_URL` | repo → `producao-edge-functions` | `https://pgxfvjmuubtbowutlide.supabase.co/` (o workflow exige exatamente este) | junto com a chave |
| `EXTERNAL_SUPABASE_SERVICE_ROLE_KEY` | repo → `producao-edge-functions` | dashboard do CRM `pgxfvjmuubtbowutlide` → Settings → API → `service_role` (JWT com `ref` e `role` conferidos pelo workflow) | `rpc/get_contact_360_by_phone` → 200 |
| `PREVIEW_EGRESS_PROXY_URL` | repo → `producao-edge-functions` | configuração do proxy na VPS (`preview-egress-proxy.md`) | HTTPS, sem porta, termina em `/v1/fetch` |
| `PREVIEW_EGRESS_SHARED_SECRET` | repo → `producao-edge-functions` | mesmo lugar (HMAC do proxy) | ≥ 32 caracteres |

Validações locais que mandam a chave por arquivo de cabeçalho, não por `argv`:

```bash
H=$(mktemp); chmod 600 "$H"
# CRON_SECRET: o crm-integration compara o header com a cópia da edge; 200 = valor igual ao da edge
read -rs C; printf 'x-cron-secret: %s\n' "$C" > "$H"; unset C
curl -s -o /dev/null -w '%{http_code}\n' -H @"$H" -H 'Content-Type: application/json' \
  --data '{"action":"health"}' https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/crm-integration
# PROMOGIFTS / EXTERNAL: mesma ideia, com apikey + Authorization. Rode duas vezes: com URL+chave do
# catálogo e a linha "catálogo"; depois com URL+chave do CRM e a linha "CRM". Esperado: 200.
read -r U; read -rs K; printf 'apikey: %s\nAuthorization: Bearer %s\n' "$K" "$K" > "$H"; unset K
curl -s -o /dev/null -w '%{http_code}\n' -H @"$H" "$U/rest/v1/products?select=id&limit=1"          # catálogo
curl -s -o /dev/null -w '%{http_code}\n' -H @"$H" -H 'Content-Type: application/json' \
  --data '{"p_phone":"00000000"}' "$U/rest/v1/rpc/get_contact_360_by_phone"                       # CRM
shred -u "$H" 2>/dev/null || rm -f "$H"
```

### Ordem segura

1. **Criar os 8 no environment.** Valide cada valor antes; a cópia do repo continua lá.
   ```bash
   for N in SUPABASE_ACCESS_TOKEN CRON_SECRET PROMOGIFTS_SUPABASE_URL PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY \
            EXTERNAL_SUPABASE_URL EXTERNAL_SUPABASE_SERVICE_ROLE_KEY PREVIEW_EGRESS_PROXY_URL PREVIEW_EGRESS_SHARED_SECRET; do
     echo "Valor de $N:"; read -rs V && printf '%s' "$V" | gh secret set "$N" --env producao-edge-functions --repo "$R"; unset V
   done
   gh secret list --env producao-edge-functions --repo "$R"     # os 8 nomes
   ```
2. **Verificar o deploy em ensaio.** Isto prova que o `SUPABASE_ACCESS_TOKEN` do environment funciona e
   não publica nada:
   ```bash
   gh workflow run deploy-functions.yml --ref main --repo "$R" -f dry_run=true
   ```
   Esperado: run verde, e o passo "Decidir se os secrets das edges precisam ser reescritos" **sem**
   `Nao foi possivel ler os secrets do projeto`.
3. **Verificar os preflights.** Opcional: as validações locais acima já cobrem esses valores. Para provar o
   caminho do workflow, rode deploys com escopo, sem `rotate_secrets`. O CLI pula a função cujo bundle já
   bate com o publicado:
   ```bash
   for F in crm-integration promogifts-catalog fetch-link-preview; do
     gh workflow run deploy-functions.yml --ref main --repo "$R" -f function_name="$F"
   done
   ```
   **Nunca use `-f rotate_secrets=true` durante a migração.** Só com ele (ou com nome ausente na edge) o
   deploy reescreve os secrets das edges a partir do Actions. Sem ele, um valor errado no environment
   derruba no máximo o preflight (deploy abortado antes de publicar), nunca a edge em produção.
4. **Verificar o worker.** Opcional, e processa 1 item real da outbox do CRM. Prova o `CRON_SECRET` lido do
   environment:
   ```bash
   gh workflow run crm-sync-worker.yml --ref main --repo "$R" -f batch_size=1
   ```
5. **Apagar do repo.** Só depois dos passos 2 a 4 verdes:
   ```bash
   for N in SUPABASE_ACCESS_TOKEN CRON_SECRET PROMOGIFTS_SUPABASE_URL PROMOGIFTS_SUPABASE_SERVICE_ROLE_KEY \
            EXTERNAL_SUPABASE_URL EXTERNAL_SUPABASE_SERVICE_ROLE_KEY PREVIEW_EGRESS_PROXY_URL PREVIEW_EGRESS_SHARED_SECRET; do
     gh secret delete "$N" --repo "$R"
   done
   ```
6. **Conferir de novo.** Repita o passo 2 (o ensaio precisa continuar verde). `gh secret list --repo "$R"`
   não lista mais nenhum dos 8.
7. **Se o token do Supabase foi gerado novo no passo 1,** revogue o antigo em Supabase → Account → Access
   Tokens.

**Reverter:**
- Antes do passo 5: `gh secret delete NOME --env producao-edge-functions --repo "$R"`. O job volta a ler
  a cópia do repo.
- Depois do passo 5: recrie no repo com o valor do cofre,
  `read -rs V && printf '%s' "$V" | gh secret set NOME --repo "$R"; unset V`, e então corrija ou apague a
  cópia do environment.

---

## 4. W63: `DESTINO_URL` → os environments de cada consumidor

`DESTINO_URL` é a connection string de **escrita** do banco de produção. O valor é o mesmo em todos os
environments por enquanto. O ganho é o raio de impacto: cada environment só é acessível ao job que o
declara. A W64 (role `ci_readonly` + `DESTINO_URL_RO` em `banco-leitura`) é decisão separada.

| Consumidor (job) | Environment | Revisor | Como verificar |
|---|---|---|---|
| `db-live-guard.yml` › `live-contract` | `banco-leitura` | não | `gh workflow run db-live-guard.yml --ref main --repo "$R"` (só leitura) |
| `db-migrate.yml` › `preflight` | `banco-leitura` | não | GA13: só leitura (ledger + dry-run + runtime); sem revisor/wait, o dry-run conclui sem `Waiting` |
| `types-sync.yml` › `sync` | `banco-leitura` | não | coberto pelo mesmo environment; o próximo agendado (segunda, 05:49 UTC) confirma |
| `db-migrate.yml` › `apply` | `producao-ddl` | **sim** | o dry-run (`apply=false`) do próximo lote; ele pausa para sua aprovação |
| `targeted-ledger-evidence.yml` › `export-encrypted-evidence` | `db-ledger-evidence` | **sim** | dispatch com uma version qualquer e chave descartável (abaixo) |

**Onde pegar o valor:** Supabase → projeto `tnnnlkbymytvtqngbbqh` → Connect → URI do pooler. O dashboard
**não** mostra a senha atual. Sem ela no cofre, a migração vira rotação: siga a seção `DESTINO_URL` de
`secret-rotation.md` e grave o valor novo direto nos três environments abaixo, não no repo.

### Ordem segura

1. **Criar nos três environments com o mesmo valor:**
   ```bash
   read -rs V
   for E in banco-leitura producao-ddl db-ledger-evidence; do printf '%s' "$V" | gh secret set DESTINO_URL --env "$E" --repo "$R"; done
   unset V
   for E in banco-leitura producao-ddl db-ledger-evidence; do gh secret list --env "$E" --repo "$R"; done
   ```
2. **Verificar `banco-leitura`:** `gh workflow run db-live-guard.yml --ref main --repo "$R"`. Esperado:
   nenhum erro de credencial (`DESTINO_URL ausente`, `password authentication failed`). Uma falha de drift
   é outra coisa e não tem relação com a migração (ver o "Rollback" de `secret-rotation.md`).
3. **Verificar `db-ledger-evidence`.** Dispara e pausa para sua aprovação:
   ```bash
   D=$(mktemp -d); openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out "$D/k.pem" 2>/dev/null
   PUB=$(openssl pkey -in "$D/k.pem" -pubout | base64 -w0)
   # 20260926120600 está aplicada em produção desde 26/09 (CLAUDE.md, "Decisões de 2026-09-26")
   gh workflow run targeted-ledger-evidence.yml --ref main --repo "$R" -f versions=20260926120600 -f public_key_base64="$PUB"
   rm -rf "$D"      # a chave privada não é necessária: só importa o run verde
   ```
4. **Verificar `producao-ddl`:** use o dry-run (`apply=false`) do próximo lote diário, que já faz parte do
   fluxo da seção 0 do `CLAUDE.md`. Não aprove nenhum `apply=true` só para testar a migração.
5. **Apagar do repo,** só com os passos 2 a 4 verdes, porque isso afeta os 4 consumidores de uma vez:
   ```bash
   gh secret delete DESTINO_URL --repo "$R"
   ```
6. **Conferir de novo:** repita o passo 2. `gh secret list --repo "$R"` não lista `DESTINO_URL`.

**Reverter:** igual à W62. Antes do passo 5, apague a cópia do environment. Depois, recrie no repo com o
valor do cofre.

---

## 5. Depois da migração

- `gh secret list --repo "$R"` deve mostrar só: `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`,
  `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_URL`.
- As rotações futuras de `DESTINO_URL`, `CRON_SECRET`, `SUPABASE_ACCESS_TOKEN` e dos secrets de terceiros
  passam a ser feitas com `gh secret set NOME --env AMBIENTE` (ou em Settings → Environments → AMBIENTE →
  Environment secrets), e não mais em "Settings → Secrets → Actions" como dizem `secret-rotation.md` e
  `cron-secret-rotation.md`.
- Consumidor novo de qualquer um destes secrets precisa declarar o environment. Senão
  `scripts/ci/secrets-environments.unit.mjs` reprova o PR, e é exatamente para isso que ele existe.
- Atualize a linha "Secrets (escopos)" da tabela "Perímetro do GitHub" no `CLAUDE.md` com o estado final.
