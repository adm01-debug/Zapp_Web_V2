# Análise sênior dos 4 itens em aberto — e as decisões

Data: 2026-09-27 · Analista: Hermes (execução) · Repo: `adm01-debug/Zapp_Web_V3`

> Método: cada afirmação abaixo tem medição. Onde eu tinha concluído algo antes e a medição
> mostrou outra coisa, está registrado como correção — inclusive contra mim.

---

## DECISÃO 1 — Volume de edge: `--apply` SIM, `--prune` NUNCA

### O que estava acontecendo (grave)

O commit `c2e3aeb54` (26/09) — *"remove getLogger duplicado que impedia **2 Edge Functions de
bootar**"* — **nunca chegou à produção**:

| Medição | Valor |
|---|---|
| Último deploy de edge **bem-sucedido** | **2026-09-15** |
| Tentativa de 26/09 | `cancelled` (nunca aplicou) |
| Gate de drift antes | `_shared: MISSING=0 STALE=3 ORPHAN=7` |

Os 3 arquivos `STALE` eram exatamente os do fix: `evolution-webhook-handlers.ts`,
`evolution-webhook-msg-handlers.ts`, `whatsapp-cloud-normalizer.ts`. **Duas funções rodaram
quebradas por dias**, e o sintoma só apareceu porque o check estava quebrado (chamava
`scripts/deploy-edge.sh --read-only` — caminho inexistente e flag inexistente; corrigido no #1595).

### Ação executada

`gh workflow run edge-deploy.yml --ref main` → `infra/edge-deploy/deploy-edge.sh --apply --restart`
(com hash pós-escrita validado pelo próprio script):

```
✅ _shared/evolution-webhook-handlers.ts     → 22c8f122c229
✅ _shared/evolution-webhook-msg-handlers.ts → 3cf6216c3063
✅ _shared/whatsapp-cloud-normalizer.ts      → 82af2db1cec3
gate re-executado:  STALE = 0   (era 3)      ORPHAN = 2
```

### Por que `--prune` está proibido

O gate reporta `ORPHAN` e a mensagem dele diz *"conferir registry antes de remover"*. Fui conferir:

| órfão | evidência | veredito |
|---|---|---|
| `zapp-google-calendar-sync` (função) | arquivada no repo com 0 chamadores, mas **ainda deployada**; **1 referência** no código do repo | **NÃO REMOVER** |
| `email-health` (função) | **nunca existiu no repo** (0 arquivos); **3 referências** no código do repo | **NÃO REMOVER** |
| `db-columns.ts` · `mode.ts` | **0 imports** no repo | mortos |
| `criticalPayloadSchemas.ts` | só em **comentários** (`contract-schemas.ts`); 0 imports | morto |
| `evolution-event-types.json` | 0 imports no código (o `.ts` homônimo é o usado e existe no repo) | morto |
| `README.md` · 2× `*.bak_s18` | documento e backups | descartáveis |

**`--prune` apagaria duas funções que o código do repo chama → quebraria produção.** O gate fica
vermelho em `ORPHAN=2` de propósito, e deve ficar: é registry, não drift. Registry completo em
`docs/edge/runbook-sync-functions-volume.md`.

---

## DECISÃO 2 — `types.ts` / catálogo: **NÃO MERGEAR** (e o motivo é maior do que parecia)

> ⚠️ Correção de rota: minha primeira leitura foi que o check de frescura comparava fontes
> incompatíveis por acidente. **Estava invertido.** O comentário do próprio gerador diz: *"o
> catálogo canônico é gerado do `types.ts` versionado, **nunca** via `--from-meta`"*. O check
> estava certo; o artefato é que estava contaminado.

### O que medi

| Fato | Medição |
|---|---|
| `types.ts` hoje declara | **só `public`** (linhas 15 e 9372) — 9.407 linhas |
| Catálogo commitado declara | `public,zapp,evo` — 4,9 MB |
| Origem da contaminação | job `catalog-regen` gerava com `--from-meta` (fonte proibida) → `schemas.public.Functions.has_role` **presente no catálogo da `main`** |
| `types.ts` regenerado (3 schemas) | **62.804 linhas** — geração OK |
| `tsc` do app com esses tipos | **388 erros em ~60 arquivos** |
| Catálogo canônico vs commitado | `evo` **idêntico**; `zapp` canônico **+14 funções/+1 tabela/+2 views**; `public` commitado **+5 objetos** (os externos) |

### A decisão

- **Corrigido e mergeado (#1595)**: o `catalog-regen` passou a usar a fonte canônica e ganhou
  **guarda** que recusa commitar catálogo sem algum schema pedido. Sem isso, um `regen` apaga
  centenas de milhares de linhas de contrato em silêncio (aconteceu comigo, e reverti).
- **Não mergeado**: regenerar `types.ts` e o catálogo. Com os tipos reais o app acusa **388 erros**
  (contatos, inbox, relatórios, admin, dashboard, business-logic): o app foi construído sobre a
  superfície estreita (`public`) e **nunca foi validado contra o schema real**. Isso é **projeto de
  código**, não commit de CI — e adotá-lo agora quebraria o gate de typecheck do repo.
- **Portanto**: o gate `Catalog fresh` **deve continuar vermelho** até esses erros serem
  corrigidos. Ele está medindo algo verdadeiro. Silenciar (allowlist) ou trocar por um catálogo
  lossy seria pior que o vermelho.

Caminho pronto para quando for a hora: `gh workflow run gen-types-zapp.yml -f branch=<branch> -f schemas=public,zapp,evo`
(o workflow commita num branch próprio; o passo de PR dele falha por permissão do repo — PR manual).

---

## DECISÃO 3 — Shadow migrations: **nada a fazer, já foi feito**

Minha recomendação anterior ("documentar em `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md`") era
**redundante**: o trabalho já existe e já foi executado.

| Artefato | Estado |
|---|---|
| `docs/ops/MIGRATIONS_CLEANUP_DECISIONS.md` | decisões **CP-2**: KEEP(75) · ARCHIVE(283) · DELETE(9) · órfãos BACKFILL(94)+TOMBSTONE(206) |
| `docs/ops/migrations-manifest.csv` | **668 linhas** — `bucket`/`action`/`risk`/`evidence` por migration |
| `docs/history/migrations-archive/` | **281 arquivos** já movidos |

Os **687 `DB_ONLY`** são tombstones e arquivadas **documentadas** — o registro fica no banco de
propósito (apagar a linha faria o Supabase tentar reaplicar a migration). Os **16 `NAME_MISMATCH`**
são anotações de auditoria no campo `name` (ex.: `(registro manual)`), que o gate compara
separadamente de `version`. **Decisão: não mexer.** Corrigi apenas o runbook, que rotulava tudo
como "🔴 Alto — impossível auditar".

---

## DECISÃO 4 — A-F7-001: **não é defeito, é `concurrency`**

> ⚠️ Correção de rota: eu havia tratado isso como falha de pipeline (6 confirmações). A medição
> por commit mostrou outra coisa.

| Push | Runs gerados |
|---|---|
| `2deb5c933` (meu #1595) | **0** |
| `92e506912` (meu #1594) | 3 |
| `abc07b44b` (outro agente, 7 min depois) | **22** |

**38 workflows do repo usam `concurrency` com `cancel-in-progress`** — em `db-guard.yml`, um push
novo cancela os runs do push anterior no mesmo ref. Dois merges em 17 segundos, como os meus,
fazem o segundo cancelar os runs do primeiro. É **comportamento projetado**.
**Decisão: não caçar defeito onde não há.** Contorno para evidência de um commit específico:
`gh workflow run <wf> --ref <branch>`.

---

## Placar final

| Item | Estado | Onde está a prova |
|---|---|---|
| 1. Edge drift | ✅ **corrigido** (STALE 3 → **0**; 2 funções quebradas em produção consertadas) | hash pós-escrita no log do deploy + gate re-executado |
| 2. Catálogo/tipos | ⛔ **bloqueado com causa medida** (388 erros de tsc) — gate segue vermelho por medição verdadeira | `tsc` no branch de teste; diff canônico × commitado |
| 3. Shadow migrations | ✅ **já tratado** — decisões CP-2 + manifest + 281 arquivos arquivados | `docs/ops/` + `docs/history/migrations-archive/` |
| 4. A-F7-001 | ✅ **explicado** (concurrency projetado) | 0 vs 22 runs; 38 workflows com `cancel-in-progress` |

## Higiene — pendência real

Ao inspecionar o helper do gateway MCP (`~/projetos/_arquivo_zapp/v3_mcp/mcp_call.py`) eu imprimi o
arquivo com `head` e a **URL do gateway (que embute o token)** apareceu no output da sessão.
**Recomendo rotacionar o token desse gateway** e substituir o valor embutido no helper por leitura
de um arquivo fora do repo. O valor não foi repetido em nenhum commit, PR ou arquivo versionado.
