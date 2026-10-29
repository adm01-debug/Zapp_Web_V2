# Pendências de CI — bloqueios que exigem ação humana

> Gerado em 2026-10-29 pela sessão de correção de CI (`claude/keen-galileo-dxai3p`).
> Cada item indica o workflow, o erro exato e o que o Joaquim precisa fazer.

---

## 1. `types-sync` — erro de TypeScript: coluna `is_pinned` ausente no banco

**Workflow:** `.github/workflows/types-sync.yml`
**Job:** Gate 1 — TypeCheck de `types.ts` regenerado
**Erro medido** (run 40869806795, job `typecheck-ratchet`):

```
src/services/contact.service.ts(166,9): error TS2322:
  Type '{ contact_id: string; author_id: string; content: string;
         category: string; due_date: null; is_pinned: true; }'
  is not assignable to type '...'
  Object literal may only specify known properties, and 'is_pinned'
  does not exist in type 'ContactNoteInsert'.

src/services/contact.service.ts(193,6): error TS2322:
  Type '{ content: string; is_done: boolean; is_pinned: boolean;
         due_date: string | null }'
  is not assignable to parameter of type 'ContactNoteUpdate'.
  Object literal may only specify known properties, and 'is_pinned'
  does not exist in type '...'.
```

**Causa raiz:** A coluna `is_pinned` foi removida do banco de produção
(`contact_notes`) mas ainda é referenciada em
`src/services/contact.service.ts` linhas 166–175 (método `addNote`) e
linha 193 (método `updateNote`). O novo `types.ts` gerado com o padrão
`RejectExcessProperties` torna `is_pinned: never` quando a coluna não
existe, provocando 2 erros de TS.

**O que precisa ser decidido:**
Escolher UMA das duas opções:
- **Opção A — Recriar a coluna no banco** (`ALTER TABLE contact_notes ADD COLUMN is_pinned BOOLEAN NOT NULL DEFAULT false`) e criar a migration correspondente. O código continua funcionando sem alteração.
- **Opção B — Remover as referências no código** (remover `is_pinned` de `addNote` e `updateNote` em `contact.service.ts`; verificar se a UI usa o campo e adaptar).

Sem essa decisão, o `types-sync` continuará falhando no Gate 1 toda semana.

---

## 2. `e2e-logado` — timeout na edge function `auth-login`

**Workflow:** `.github/workflows/e2e-logado.yml`
**Job:** `e2e-logado` (Playwright, chromium-authenticated)
**Erro medido** (run 40942681205):

```
Error: page.goto: net::ERR_ABORTED
  → POST https://tnnnlkbymytvtqngbbqh.supabase.co/functions/v1/auth-login
  → 504 Gateway Timeout (após 3 tentativas)
```

**Causa raiz:** A edge function `auth-login` não respondeu em tempo hábil
durante o run de CI — timeout de infraestrutura (Supabase Functions / cold
start sob carga). Não há código errado; é instabilidade pontual de infra.

**O que pode ser feito:**
- Monitorar: se o erro se repetir em mais de 2 runs consecutivos, investigar
  se houve mudança recente em `supabase/functions/auth-login/`.
- Verificar no dashboard Supabase se há erros persistentes em `auth-login`:
  https://supabase.com/dashboard/project/tnnnlkbymytvtqngbbqh/functions
- Se houver degradação real: verificar cold start / timeout configuration
  do Supabase Functions para essa função.

**Ação imediata necessária:** nenhuma (falha pontual de infra). Reavaliar
se reaparecer.

---

*Atualizado em 2026-10-29. Remover item ao concluir a ação correspondente.*
