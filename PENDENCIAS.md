# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-31 por sessão `fix/ci-workflows`._

---

## 1. DB Live Guard — falhas em contrato vivo (investigação pendente)

**Último run com falha:** [41162077590](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41162077590)  
**Head SHA:** vários (pós-merge de `main`)

**O que falha:**
- Step "Consolidar veredito do contrato vivo" — artifact `13027601857` contém evidências
- Compara o estado do banco de produção com artefatos do repositório (types.ts, schema-catalog.json,
  schema-manifest.json)

**Falhas identificadas no run 41162077590 (3 contratos reais, não deriva transitória):**
1. **migrations/ledger** — diferença entre migrations no disco (`supabase/migrations/`) e entradas no ledger do banco
2. **ACL/mcp_exec** — contrato de permissão `mcp_exec` não satisfeito
3. **configuração runtime** — `runtime-config` com divergência detectada

**Por que não foi corrigido:** DB Live Guard conecta ao banco de produção e exige análise
das evidências no artifact `db-live-evidence-{run_id}-1` para diagnosticar cada divergência.
Requer acesso ao banco de produção para comparação e possível migration corretiva. Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar manualmente o DB Live Guard via `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
2. Se falhar, os logs do artifact `db-live-evidence-{run_id}-1` mostrarão qual passo tem diferença real
3. Se o passo "Verificar frescor do types.ts" falhar: disparar `workflow_dispatch` do `types-sync.yml` **na branch `main`**
4. Se o passo "Comparar migrations com schema_migrations" falhar: verificar se há migration
   no disco (em `supabase/migrations/`) sem entrada no ledger

---

## 2. Running Copilot Code Review — limite de cota do plano (HTTP 402)

**Runs com falha confirmados (exemplos):**
- [41167331596](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41167331596) — 2026-10-31T04:08Z
- [41166869775](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41166869775) — 2026-10-31T04:02Z
- múltiplos anteriores no mesmo dia

**Workflow:** Dinâmico do GitHub Copilot — **não tem arquivo no repositório**.

**O que falha:** Step "Processing Request (Linux)" termina com `errorType: 'quota'`, HTTP 402,
"You've reached your additional usage limit for your plan". A mensagem de firewall que aparece
no log é secundária — a causa real é esgotamento de cota de uso do Copilot Code Review.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — sem código no repositório.
A falha está no limite de cota do plano do Copilot (HTTP 402). Este
workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Billing and plans → Copilot usage limits
2. Aguardar reset de ciclo de faturamento ou fazer upgrade do plano
3. Configurar allowlist de firewall do Copilot **não resolve** este erro — a causa é HTTP 402 quota, não HTTP 403 firewall

---

## 3. Deploy Edge Functions — fix de @types/node tentado (PR #2407) mas ainda falha

**Comportamento esperado:** `deploy-functions.yml` só executa quando o push na `main` altera
código implantável em `supabase/functions/` ou `supabase/config.toml`. Quando o push toca
apenas arquivos de frontend, documentação ou configuração de CI, o workflow não é disparado
(condição `paths:` no trigger).

**Run com falha após o fix:** Run `41162076060` executou no SHA `004e74a8c5` (pós-merge da
PR #2407, que adicionou a instalação npm de `@types/node` em `deploy-functions.yml`),
e **ainda falhou** com `Could not find "@types/node"` no step `deno check`. O fix da PR #2407
não foi suficiente para resolver o erro.

**Por que não foi corrigido:** O mecanismo pelo qual `deno check` falha mesmo após a instalação
npm de `@types/node` requer investigação adicional — provavelmente o path do `node_modules`
gerado não é o que o `deno check` procura. Este workflow **não é um required check** — não bloqueia merges na `main`.

**O que o Joaquim precisa fazer:**
1. Disparar `workflow_dispatch` do `deploy-functions.yml` **na branch `main`** com
   **`dry_run: true`** (ensaio: roda tudo até o deploy exclusive, sem publicar nada e sem
   reescrever secrets) para diagnosticar o erro `@types/node` sem risco de side-effects
2. Se falhar, investigar por que a instalação npm de `@types/node` não resolve o `Could not find "@types/node"` do `deno check`; verificar o path do `node_modules` gerado versus o caminho que o Deno resolve
3. **Não** disparar sem `dry_run: true` — o deploy sem ensaio reescreve secrets e publica
   as funções imediatamente no ambiente de produção

---

---

## 4. E2E Tests (Playwright) — falha WCAG de contraste no webkit-email-navy (pré-existente)

**Run com falha:** [41350571743](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41350571743) — job `🎭 E2E Tests (Playwright)` ID `124987818391`  
**HEAD SHA:** `1252bb5a41123ba4d49efd84d0f91604bff6c87c` (main)  
**Este workflow É um required check** — bloqueia merge.

**Erro exato (step "🧪 Run Playwright E2E (PR sem autenticação)", linha 513):**
```
[webkit-email-navy] › e2e/email-navy-visual.spec.ts:482:1
  › alto contraste e movimento reduzido mantêm o workspace acessível

    expect(violations).toEqual([]);

  Violation: color-contrast
  - Element .min-h-[72px].border-border/50 text (#181818 sobre #000000): contraste 1.18, mínimo 4.5:1
  - Element span[title="02/10/2026, 11:24:00"]: contraste 1.18 (10px, normal)
  - Element .line-clamp-2.leading-snug: contraste 1.18 (12px, normal)

  130 passed, 1 failed
  error: script "test:e2e" exited with code 1
```

**Causa raiz:** O inbox usa `bg-black` como fundo (documentado em "Lição de UI (2026-09-25)" no CLAUDE.md — token `--inbox-panel-bg`). Sob tema alto-contraste claro (`prefers-color-scheme: light, prefers-contrast: more`), o background vira `#000000` mas o texto permanece `#181818`, contraste 1.18:1 (WCAG AA exige 4.5:1 para texto normal < 18pt). O spec `email-navy-visual.spec.ts` detecta isso corretamente.

**Por que não foi corrigido:** Requer mudança visual: rever o valor de `--inbox-panel-bg` no tema alto-contraste ou adicionar regra CSS `prefers-contrast: more`. Está fora do escopo desta sessão (correção de CI de infra).

**O que o Joaquim precisa fazer:**
1. Abrir `src/styles/tokens.css` e ajustar `--inbox-panel-bg` para um fundo com contraste ≥ 4.5:1 quando `prefers-contrast: more` estiver ativo (ex.: `#1a1a1a` → `#0a0a0a` não resolve — precisa de fundo claro ou texto mais claro no modo alto-contraste)
2. Validar com `npx playwright test e2e/email-navy-visual.spec.ts --project=webkit-email-navy` localmente

---

_Nota: Este arquivo deve ser atualizado quando os itens acima forem resolvidos._
