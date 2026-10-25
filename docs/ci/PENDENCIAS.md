# Pendências — PR #2218

Data: 2026-10-25

---

## Checks que terminaram em falha/neutral (NÃO são required checks)

### copilot-pull-request-reviewer — failure
- **Check:** `copilot-pull-request-reviewer`
- **Status:** `completed` / `failure`
- **Run:** https://github.com/adm01-debug/Zapp_Web_V2/actions/runs/40144572181/job/121023066126
- **Motivo:** O Copilot reviewer do GitHub encontrou anotações no diff (2 annotations). Este check **não** faz parte dos 6 required checks da `main` e **não bloqueia** o merge.
- **Ação necessária:** nenhuma para o PR; revisão opcional pelo Joaquim se quiser ver as sugestões do Copilot.

### Vercel Agent Review — neutral
- **Check:** `Vercel Agent Review`
- **Status:** `neutral` / "Review skipped"
- **Motivo:** "Skipped because of insufficient Credit." — requer crédito Vercel para o serviço de revisão automática.
- **É required check?** Não — não faz parte dos 6 checks obrigatórios da `main`.
- **Ação necessária:** adicionar crédito Vercel em Settings → Billing (ação manual do Joaquim).

---

## Itens fora do escopo desta sessão (não bloqueantes para merge)

1. **E2E specs ainda não adaptados para banco local** (`e2e/catalog.spec.ts`, `e2e/fixtures/talkx-demo.ts`, `e2e/fixtures/mapa-mocks.ts`) — documentado em CLAUDE.md seção 0, regra 5. Não bloqueiam o CI atual.

2. **`supabase-sync.yml` desarmado** — `LEGACY_IMPORT_UNLOCK` secret inexistente; todo dispatch falha fechado. Documentado em CLAUDE.md. Não é required check.

3. **`VITE_ZAPP_LOCAL_SUPABASE_*` não configuradas no Vercel** — o app em dev aponta para produção sem essas variáveis. Documentado em CLAUDE.md seção 4.

---

## Nenhum item pendente que bloqueie merge do PR #2218

Todos os 4 problemas de CI identificados foram corrigidos em `709fccbbd`. Aguardando conclusão dos 6 checks obrigatórios.
