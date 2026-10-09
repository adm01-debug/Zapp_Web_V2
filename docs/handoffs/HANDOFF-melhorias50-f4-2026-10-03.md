# HANDOFF — Frente "Melhorias 50" (Zapp_Web_V2) · 2026-10-03

Documento para o **próximo chat**. Escrito por quem executou E41 e E24 nesta data.
Tudo aqui foi **medido**; onde não foi, está dito explicitamente.

---

## 1. Onde isto vive

| | |
|---|---|
| Projeto / repo | `Zapp_Web_V2` = **ZAPP / Pronto Talk** (`adm01-debug/Zapp_Web_V2`) |
| Cópia de referência (só leitura) | `~/projetos/Zapp_Web_V2` — **nunca escrever** (a guarda bloqueia) |
| Bandeira de trabalho | `~/hermes-workspaces/Zapp_Web_V2/<slug>` (criado por `hermes-tarefa-iniciar`) |
| Banco canônico | Supabase **`tnnnlkbymytvtqngbbqh`** |
| Plano desta frente | `docs/audits/PLANO_MELHORIAS_50_ETAPAS_2026-09-20.md` |
| Dossiê irmão | `docs/audits/DOSSIE_EXECUCAO_PLANO_50_2026-09-20.md` |

Ciclo obrigatório: `hermes-tarefa-iniciar` → trabalhar → `hermes-tarefa-fechar` →
`hermes-tarefa-mergear --detach` → `hermes-tarefa-status` (até `FIM_MERGEAR`) → `hermes-tarefa-limpar`.

---

## 2. Estado do plano (medido em 03/10)

**Abertas: 15** (eram 26 no início do dia; 11 foram fechadas por outros chats).

Distribuição das 15: **E04** (1), **E07** (2), **E08** (1), **E15** (3), **E21** (2), **E24** (2),
**E29** (1), **E36** (1), **E37** (1), **E44** (1).

### ATENÇÃO — este plano tem fila concorrente

Não é um plano parado esperando executor. Em 03/10 havia **16 PRs abertos** de **5 agentes**
(hermes, codex, devin, claude, automation), e **11 itens fecharam em poucas horas**. E38 e E36 foram
fechadas **minutos antes** de o chat anterior abrir o workspace.

**Regra de ouro antes de pegar qualquer item:** medir se ele já foi feito **e** se há PR aberto
tocando os mesmos arquivos. Exemplo real: E37 parecia livre, mas o PR **#1780** estava reescrevendo
`src/components/inbox/tabs/FileThumb.tsx` e `fileDisplay.ts` — exatamente o que o E37 pediria.

```bash
gh pr list -R adm01-debug/Zapp_Web_V2 --state open --limit 20
git log origin/main --since='2026-10-02' --format='%h %ad %s' --date=format:'%d/%m %H:%M' -15
```

---

## 3. O que ESTA rodada entregou (mergeado e verificado)

| Etapa | PR | Merge SHA | Entrega |
|---|---|---|---|
| **E41** — mapa de cobertura | #1794 | `5e3b8281` | `docs/audits/MAPA_COBERTURA_TESTES_2026-10-03.md` |
| **E24** — replay das migrations | #1798 | `27ac8469` | `scripts/db-audit/replay-local.sh` + `docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md` |

### E41 — números medidos

- Suíte principal: **494 arquivos / 5946 testes** passando (+38 todo), exit 0.
- Contratos: **58 arquivos / 1015 testes**, exit 0.
- E2E: 27 specs.

**Trio crítico SEM teste** (critério: *decide autorização* — é o que faz o mapa não envelhecer):

1. `supabase/functions/_shared/cron-secret-auth.ts` — decide se cron pode invocar edge. **Reusado pelo E91.**
2. `supabase/functions/_shared/evolution-go-routes.ts` — rotas do Evolution/WhatsApp.
3. `supabase/functions/_shared/ai-audio-authz.ts` — autoriza recurso pago por minuto.

Os três têm **zero** arquivo de teste. O item E41 pedia **identificar** (feito); **escrever os testes é a
próxima peça natural** — auth é onde o repo tem menos cobertura e maior alavancagem (helper compartilhado
vale para todas as edges que o reusam).

### E24 — resultado medido

`bash scripts/db-audit/replay-local.sh` → sobe `public.ecr.aws/supabase/postgres:17.6.1.159` em container
próprio (nome `hermes-e24-replay`, porta 5499, removido no fim), aplica as migrations em ordem.

| | |
|---|---|
| Migrations hoje | **765** (o plano dizia 443) |
| Aplicadas | **695** |
| Falhas | **70** |

**As 70 NÃO são divergências do repositório** (classificação medida):

| Erro | Nº | Natureza |
|---|---|---|
| `storage.objects` / `storage.buckets` não existem | **35** | Lacuna do harness (schema `storage` é criado pelos *serviços* do Supabase) |
| `relation "public.X"` não existe | 7 | Cascata |
| `already member of publication` | 3 | Idempotência esperada |
| `schema "supabase_migrations"` não existe | 2 | Lacuna do harness |
| `cannot change return type of existing function` | **4** | **Candidatas reais** |
| `syntax error at or near "NOT"` | **3** | **Candidatas reais** |
| outros (cascata) | ~16 | Cascata |

---

## 4. PRÓXIMOS PASSOS (em ordem)

### Passo 1 — Melhorar o script e nomear as 7 candidatas ⭐ (comece aqui)

**Problema conhecido do script, descoberto no primeiro uso:** ele conta `ok/falha` **por arquivo**, mas
grava os **erros sem o nome do arquivo ao lado**. Consequência: dá para dizer *que tipos* de erro existem
e **não** dá para dizer *quais arquivos são*. A correlação erro→arquivo é exatamente o que o E24 precisa.

**O que fazer:** no loop de `scripts/db-audit/replay-local.sh`, capturar a saída do `psql` por arquivo
(ex.: `SAIDA=$(docker exec -i ... 2>&1)`; se falhar, gravar `arquivo<TAB>$(echo "$SAIDA" | grep ERROR | head -1)`
num `replay-erros.tsv`). Rodar, e as 7 candidatas ganham nome e causa.

**Resultado esperado:** `docs/audits/REPLAY_LOCAL_MIGRATIONS_2026-10-03.md` atualizado com os 7 arquivos
nominais, cada um classificado como **divergência real** ou **ordem/artefato do harness**.

### Passo 2 — Levar o replay a verde ponta a ponta

No script, antes do loop, criar o mínimo que falta:
`create schema if not exists storage;` + `storage.buckets`/`storage.objects` (colunas usadas pelas
migrations) + `supabase_migrations.schema_migrations` + o parâmetro que deu `permission denied to set
parameter "app.settings.trusted_domains"`.

Isso deve resolver **~37 das 70**. Ao final: ou **765/765**, ou um conjunto **pequeno e nomeado** de
exceções — que é o que o item do plano aceita ("divergências viram exceção documentada").

### Passo 3 — Escrever os 3 testes do trio crítico (E41, complemento)

Um arquivo de teste por helper, cobrindo o caminho de autorização:
`cron-secret-auth` (header ausente/errado/correto, segredo vazio, timing-safe, `CRON_SECRET` ausente),
`evolution-go-routes` (rota→handler, rota desconhecida, método errado, payload malformado),
`ai-audio-authz` (sem sessão, sessão de outro tenant, papel insuficiente, caminho feliz).

### Passo 4 — Itens da fila com dono claro

| Item | O que fazer | Dono |
|---|---|---|
| **E37** | srcSet/variantes CF em avatar/anexo do Inbox — **conferir antes** se o PR #1780 (ou sucessor) já aterrissou | outro chat, provavelmente |
| **E36** | fechado por #1783 mas a **caixa ficou desmarcada** no plano — só marcar com evidência | qualquer um |
| **E05/E34/E35/E38/E39** | já fechados por outros chats (E39: meta ≤800 **já cumprida**, ver §6) | — |
| **E15** | índices sem uso — bloqueado por `stats_reset=null`: sem 30 dias de estatística, dropar é proibido pelo critério da própria etapa | bloqueado |
| **E21** | evidência de PITR + teste de restore real | **Joaquim** |
| **E29** | rotacionar secrets sensíveis (>90d) | **Joaquim** (decisão de negócio) |
| **E44** | MCPs Cloudflare/Portainer | **Joaquim** |
| **E04** | podar remotos (62 hoje, 13 `hermes/*`) | **guarda proíbe**; causa é a concorrência de sessões |
| **E07/E08** | política de merge / `enforce_admins` | **guarda proíbe** (branch protection) |

---

## 5. ARMADILHAS QUE CUSTARAM TEMPO (leia antes de rodar qualquer coisa)

1. **`reuseExistingServer: !process.env.CI` no `playwright.config.ts`** — sem `CI=true`, o Playwright
   local **reusa o dev server de outro chat na 5173** e você acaba testando código alheio. Use servidor
   próprio (`CI=true`, porta 52xx única, `PLAYWRIGHT_BASE_URL`) e **mate o seu** no fim.
2. **Dev server zumbi.** Matei o processo pai e o filho sobreviveu, reocupando a porta e servindo um
   workspace **já apagado** → HTTP 404 e o login do Playwright estourando `locator.click`. **Mate pelo
   PID que realmente ocupa a porta:** `ss -ltnp | grep ':52xx'` → `kill -9 <pid>`.
3. **`.vite` sobrevive ao `hermes-tarefa-limpar`** e mantém a guarda vendo "tarefa aberta". **Confira o
   disco depois de limpar** (`ls -A <workspace>`).
4. **NUNCA rodar build/suíte pesada enquanto o `mergear` está em background** — OOM mata o merge.
   Uma suíte pesada e um subagente por vez.
5. **Ratchets:** `node scripts/ci/lint-ratchet.mjs` e `node scripts/ci/typecheck-ratchet.mjs` (estão em
   `scripts/ci/`, **não** em `scripts/`). Sem argumento, o lint-ratchet mede **arquivos em stage** — o
   número do repositório inteiro está em `scripts/ci/eslint-baseline.json`.
6. **`git add -A` pega config temporária.** Já subiu um `pw.5211.config.ts` para um PR. **Temporários vão
   em `.tmp/`** (que é ignorado), nunca na raiz.
7. **Corpo do PR** (via `~/.local/share/hermes-guard/PR-modelo.md`): exige `## Descrição` (com acento),
   `## Tipo de Mudança`, `## Checklist`, `## Achados fora do escopo`, `## Rollback` e **`## Banco de
   dados`** (obrigatória em TODO corpo, mesmo doc-only: usar `não se aplica` + `nenhuma mudança`), além
   da linha `Teste fora de produção: ...` fora de bloco. Faltando, o `fechar` **recusa**.
8. **`gh pr checks` com conclusão `None` NÃO é check ausente** — é check **ainda rodando**. O
   `🧪 Unit Tests` leva ~15 min e é o mais lento; `mergeState: BLOCKED` com ele `None` é espera, não
   defeito. **Nunca dispare `gh run rerun` por isso** — você cancela um pipeline a minutos de terminar.
9. **Comandos longos sofrem mangling do shell** (`unexpected EOF while looking for matching '"'`).
   Corpos/mensagens: `write_file` + `python3 - <<'PY'` ancorado, em pedaços.
10. **Antes de afirmar fato, imprima a linha real.** Erros meus nesta linha de trabalho, todos do mesmo
    tipo — **medir com o instrumento errado e reportar como fato**:
    - "309 resíduos E2E" → eram **24** (contei linhas em vez de vivas);
    - "guarda do C1 sem teste" → tinha **6 casos** (procurei nome de implementação em vez de comportamento);
    - "926 de dívida de lint" → era **612** (ratchet mede *staged*, não o repo);
    - "737 migrations quebradas" → eram **28** (banco de replay vazio, sem o bootstrap do Supabase).

---

## 6. Correções que ESTA rodada fez no entendimento do plano

- **E39 (dívida de lint):** o plano diz 1115 com meta ≤800. **Medido: 612.** A meta **já está cumprida**
  por trabalho de outros chats. **Não reabrir pensando que há 1115.**
- **E24:** o plano diz 443 migrations. **Hoje são 765.**
- **E38:** varredura estática limpa — `ReactDOM.render`, `findDOMNode`, `propTypes`, `UNSAFE_`,
  lifecycles legados, `createFactory`, `contextTypes`: **0**. O único `defaultProps` está num
  **componente de classe**, que o React 19 **continua suportando**. Fechado por outro chat (#1785).
- **E34:** a **justificativa técnica por escrito já existe** no `performance-budget.json`
  (`initial-js: 341`, com nota do +1KB de 01/10 para o gate de microfone do T17).
- **E37:** medido — `srcSet` existe **só no catálogo** (`catalogShared.tsx`, `CatalogProductCard.tsx`);
  avatar/anexo do **Inbox não usa variante CF**. Se for pegar, é trabalho real, não verificação.

---

## 7. Comandos prontos

```bash
export PATH="$HOME/.local/bin:$HOME/.local/opt/node/bin:$HOME/.bun/bin:$PATH"
export TMPDIR="$HOME/.cache/hermes-tmp"; mkdir -p "$TMPDIR"   # após cada hermes-tarefa-limpar

# abrir tarefa
hermes-tarefa-iniciar Zapp_Web_V2 <slug>            # imprime WORKSPACE/BRANCH/BASE
cd "$(ls -dt ~/hermes-workspaces/Zapp_Web_V2/<slug>-* | head -1)" && bun install

# gates
node scripts/ci/typecheck-ratchet.mjs
node scripts/ci/lint-ratchet.mjs
bunx vitest run <arquivo-de-teste>                  # uma suíte por vez

# replay das migrations (E24)
bash scripts/db-audit/replay-local.sh               # gera replay.log + replay-falhas.txt no CWD

# fechar
hermes-tarefa-fechar "<tipo>(<escopo>): <título pt-BR>" corpo-pr.md
hermes-tarefa-mergear --detach --esperar-min 120
hermes-tarefa-status                                 # até FIM_MERGEAR=... ou ERRO:
hermes-tarefa-limpar "<workspace>"
```

---

## 8. Estado dos workspaces

Nenhum workspace meu ficou aberto (E41 e E24 fechados e limpos, disco conferido).
Zero containers Docker meus rodando (`docker ps -a --filter name=hermes-e24-replay` = 0).
