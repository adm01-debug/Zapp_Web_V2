# PENDENCIAS.md — Workflows com falha não corrigível via código

_Atualizado em 2026-10-30 por sessão de correção de CI._

---

## 1. DB Live Guard — deriva transitória (aguardando deploy-functions)

**Run com falha:** [41066127274](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41066127274) — 2026-10-30T13:47:10Z  
**Head SHA:** `fb57b4a5cd071bf86a384d10f143360bd18feb61`

**O que falhou:** Todos os 7 passos do "Contrato DB vivo".

**Causa:** Deploy-functions estava parado (deno.lock quebrado → corrigido em PR #2394). O types-sync rodou e atualizou types.ts em PR #2357. Mas deploy-functions ainda falha (ver item 2 abaixo) — edge functions podem estar com artefatos desatualizados em produção.

**O que o Joaquim precisa fazer:**
1. Aguardar o merge do PR de correção do deploy-functions desta sessão
2. Após o merge (deploy automático das edges), disparar `workflow_dispatch` em `.github/workflows/db-live-guard.yml`
3. Se ainda falhar, examinar o Job Summary para identificar qual passo específico tem drift real
4. Se o passo "Verificar frescor do types.ts" ainda falhar: disparar `workflow_dispatch` do `types-sync.yml`

---

## 2. deploy-functions — `nodeModulesDir` incompatível com step W99

**Run com falha:** [41144029184](https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/41144029184) — SHA `3f18bbe7`, 2026-10-30T23:25Z  
**Workflow:** `.github/workflows/deploy-functions.yml`

**Erro:** `deno check` falha ao resolver `@types/node` (dependência transitiva de `@types/ws@8.18.1` via `/// <reference types="node" />`).

**Causa raiz:** O step W99 (`deno install --config supabase/functions/deno.json`) foi escrito para `nodeModulesDir: "auto"` — esse modo cria um `node_modules/` local com todas as dependências transitivas, incluindo `@types/node`. O PR #2399 mudou para `"none"`, fazendo com que `deno install` não crie `node_modules/` e `@types/node` fique irresolvível.

**Fix:** `supabase/functions/deno.json` — `nodeModulesDir: "none"` → `"auto"`. PR desta sessão (`fix/deploy-functions-deno-auto-2026-10-30`). Após o merge, o push em `supabase/functions/deno.json` dispara `deploy-functions.yml` automaticamente — confirmar `conclusion: success` no run gerado.

---

## 3. Running Copilot Code Review — falha de firewall interno do Copilot (não corrigível via código)

**Runs confirmados com falha:** múltiplos em 2026-10-30.  
**Workflow:** Dinâmico do GitHub Copilot (sem arquivo no repo).

**O que falhou:** Step "Processing Request (Linux)" falha com erro de firewall bloqueando URLs externas.

**Por que não foi corrigido:** Workflow dinâmico do GitHub Copilot — não tem código no repositório para corrigir. Não é required check — não bloqueia merge.

**O que o Joaquim precisa fazer:**
1. Verificar em GitHub Settings → Copilot → Code Review quais URLs estão sendo bloqueadas
2. Ou aguardar correção do próprio GitHub (pode ser indisponibilidade temporária)

---

_Nota: Este arquivo deve ser removido ou atualizado quando os itens acima forem resolvidos._
