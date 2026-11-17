# Dossiê PR #2229

**Título:** test(inbox): corrige InboxEmptyChat.cta divergente após reescrita no PR #1986  
**Branch:** `claude/fix-unit-tests-ui-divergent-261024-1527`  
**Head SHA:** `e2740fa06ae1a3c428f206f5beb96b6db46f5ac8`  
**Base SHA:** `b1fe88215b4861121c912140d7968581e26e9111`  
**Criado em:** 2026-10-24  
**Draft:** Não  

---

## Veredito

**JÁ_MERGEADA**

Mergeada em 2026-10-30T00:56:23Z via squash. SHA merge: `3a5b27947710447a549dcf76cf2cf1bbd5d235a7`.

## Análise com evidência de diff (lido em 2026-10-30)

**Conteúdo já em main:** PR API retorna `additions:0, deletions:0, changed_files:0` após merge — confirmação de que o conteúdo entrou na main via squash.

**O que a PR fazia:**
- `src/components/inbox/__tests__/InboxEmptyChat.cta.test.tsx`: reescrita para refletir o componente atual (PR #1986 tornou `InboxEmptyChat` stateless sem props)
- Removidos testes de botão "Nova conversa", contadores e data-testids que não existem mais
- Adicionados testes da UI atual: `conversation-empty-state`, "Selecione uma conversa", shortcuts

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **N/A** — já mergeada |
| 2 | Traz regressão? | **NÃO** — apenas arquivo de teste atualizado |
| 3 | Já está em main? | **SIM** — mergeada via squash em 2026-10-30T00:56:23Z |
| 4 | Regra de negócio correta? | **SIM** — atualiza testes para o componente vigente |

## Resultado

Mergeada com sucesso antes desta sessão.
