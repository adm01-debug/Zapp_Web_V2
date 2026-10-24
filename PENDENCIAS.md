# Pendências de CI — Bloqueios Técnicos

**Atualizado em:** 2026-10-24  
**Branch:** `claude_05/brave-mccarthy-zvzky4`

---

## 1. E2E Logado — `e2e-logado.yml`

**Status:** BLOQUEIO TÉCNICO — secrets ausentes  
**Check afetado:** `🎭 E2E Tests (Playwright)` (execução logada contra produção)

**Causa exata:**  
O workflow `e2e-logado.yml` roda testes Playwright com login real contra o banco de produção (`tnnnlkbymytvtqngbbqh`). Ele exige os secrets de ambiente:
- `E2E_SUPABASE_URL` — URL do projeto Supabase de produção
- `E2E_SUPABASE_PASSWORD` — senha do usuário de teste E2E

Esses secrets são configuração de infraestrutura; não há código a corrigir nesta sessão. O workflow em si está correto.

**Ação necessária (Joaquim):**  
Confirmar que os secrets `E2E_SUPABASE_URL` e `E2E_SUPABASE_PASSWORD` estão configurados no environment `Production` do repositório GitHub. Se o workflow falhar por credencial inválida (não por ausência do secret), verificar o usuário de teste E2E no banco de produção.

**Nota:** Este bloqueio preexiste a esta sessão. O `e2e-logado.yml` não é um required check de PR (roda só em push na main), então não bloqueia merge.

---

## 2. types-sync — `types-sync.yml`

**Status:** BLOQUEIO TÉCNICO — banco de produção fora de sincronia com `types.ts`  
**Check afetado:** `types-sync` (não é required check de PR)

**Causa exata:**  
O `types-sync.yml` regenera `src/integrations/supabase/types.ts` a partir do schema do banco de produção e abre PR se houver divergência. Quando o banco tem mudanças DDL recentes que ainda não foram refletidas no `types.ts` commitado, o workflow abre ou atualiza a PR `automation/types-sync`.

Esta é uma questão de sincronização contínua do banco com o repositório, não um bug de código. O workflow em si está correto.

**Ação necessária:**  
Verificar se existe PR `automation/types-sync` aberta. Se sim, mergear após conferir que os tipos gerados estão corretos. Se não, disparar `workflow_dispatch` do `types-sync.yml` para verificar estado atual.

---

*Pendências registradas pela sessão de correção de CI em 2026-10-24.*
