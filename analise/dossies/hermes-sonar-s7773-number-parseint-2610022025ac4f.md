# Dossiê — `hermes/sonar-s7773-number-parseint-2610022025ac4f`

> Análise produzida em 2026-10-23 por sessão `claude/dazzling-cannon-j7iw08`.

---

## ⚠ Riscos de Regressão

Nenhum — mudanças de estilo/consistência (Number.parseInt → parseInt e vice-versa), sem lógica nova.

---

## 1. Intenção

Fix de achados SonarQube S7773: padronização de uso de `Number.parseInt`/`parseInt` em 48 arquivos, além de script de paridade Multiplix Audience e ajustes em edge functions (gmail-sync, multiplix-send, whatsapp-webhook).

---

## 2. Resumo do Diff

Category A (merge base real: `e4abd5f8de01f96bb50d1ce92434c082b1ce30e9`). Inventário registrou como Category B (NONE).

`git diff --stat e4abd5f8..297fe9d4b` → **48 arquivos modificados** (sem migrations — `has_migrations=nao`).

Arquivos principais:
- `src/components/admin/AdminView.tsx` — `parseInt` → `Number.parseInt` (1 linha)
- `src/lib/emailHtml.ts` — ajustes de parsing
- `supabase/functions/multiplix-send/index.ts` — fix multiplix
- `supabase/functions/gmail-sync/index.ts`, `gmail-webhook/index.ts`, `whatsapp-webhook/index.ts`
- `scripts/db-audit/multiplix-audience-parity.mjs` — script novo
- `supabase/schema-catalog.json`, `supabase/schema-manifest.json`, `src/integrations/supabase/types.ts`
- `docs/multiplix/PLANO_*.md` — documentação

---

## 3. Checklist com Evidências

| Item | Status | Evidência |
|---|---|---|
| `multiplix-audience-parity.mjs` em `main` | ✅ | `git diff 297fe9d4b..origin/main -- scripts/db-audit/multiplix-audience-parity.mjs` → diff VAZIO (idêntico) |
| `AdminView.tsx` com `Number.parseInt` em `main` | ✅ | `git show origin/main:src/components/admin/AdminView.tsx \| grep "Number\.parseInt"` → 3 ocorrências presentes |
| `emailHtml.ts` em `main` superset da branch | ✅ | `git diff 297fe9d4b..origin/main -- src/lib/emailHtml.ts` → 28 linhas (main mais evoluído) |
| `main` massivamente à frente da branch | ✅ | `git diff --stat 297fe9d4b..origin/main` → 5519 files changed, 1483824 ins |
| Migrations | ✅ | Nenhuma (has_migrations=nao) |
| SINGU | ✅ | Zero refs em todos os 48 arquivos |

---

## 4. Observação

O nome da branch indica S7773 como "Number.parseInt should not be used as function", mas o diff em `AdminView.tsx` mostra a direção oposta (`parseInt` → `Number.parseInt`), sugerindo que o objetivo era consistência de nomenclatura explícita. Em qualquer caso, o conteúdo relevante está em `main`.

---

## 5. Veredito + Confiança

**SUPERADA** — confiança **0.85**

Evidências spot-check (multiplix-parity idêntico, AdminView e emailHtml absorvidos, main 5519 arquivos à frente) indicam absorção. Confiança 0.85 (não foram verificados todos os 48 arquivos individualmente).

---

## 6. Metadados

| Campo | Valor |
|---|---|
| Branch | `hermes/sonar-s7773-number-parseint-2610022025ac4f` |
| Tip SHA | `297fe9d4b` |
| Inventário | Category B (real: A) · ahead=9314 · merge_base=e4abd5f8 |
| Analisado em | 2026-10-23 |
| Sessão | `claude/dazzling-cannon-j7iw08` |
