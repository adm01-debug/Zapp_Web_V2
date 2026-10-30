# Dossiê PR #2112

**Título:** chore(inbox): remove órfão ConversationMemorySection + desbloqueia gates da main
**Branch:** (mergeada — branch deletada)
**Head SHA:** (mergeado em squash)
**Base SHA:** (anterior à main@c4c7139e)
**Criado em:** 2026-10
**Draft:** Não

---

## Veredito

**JÁ_MERGEADA**

Mergeada em 2026-10-27T22:34:17Z via squash. SHA merge: `908f371f8ec6aacd93f8e0cee0451ef8caf5f1ec`.

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 5 arquivos de código + docs

### Diff lido — trechos-chave

**Removidos (arquivos órfãos sem referenciadores):**
```
- src/components/inbox/contact-details/ConversationMemorySection.tsx   (133 linhas)
- src/components/inbox/contact-details/__tests__/ConversationMemorySection.test.tsx (133 linhas)
- src/hooks/crm/useConversationMemory.ts                               (114 linhas)
```

**Atualizados:**
- `src/components/inbox/contact-details/StoryViewer.tsx` — adiciona `useMediaElementVolume` ao `<video>` (satisfaz contrato de superfície de volume)
- `src/hooks/team-chat/useTeamReadState.ts` — remove variável sombra `hasOwnMessages` (conflito de escopo)
- `tests/contracts/media-volume-surfaces.contract.test.ts` — re-adiciona entry `['status/stories', 'src/components/inbox/contact-details/StoryViewer.tsx']` (quebrada pela PR anterior que adicionou o hook)
- `docs/DB-INVENTORY.md` — remove referências dos três arquivos deletados

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **N/A** — já mergeada |
| 2 | Traz regressão? | **NÃO** — remove código sem referenciadores; contrato de volume re-adicionado corretamente no mesmo PR |
| 3 | Já está em main? | **SIM** — `908f371f`; main atual `c4c7139e` é descendente |
| 4 | Regra de negócio correta? | **SIM** — limpeza de código morto; `useMediaElementVolume` em `<video>` era obrigação do contrato |

## Resultado

Mergeada com sucesso. Desbloqueia gates da main ao remover referências quebradas ao `ConversationMemorySection`.
