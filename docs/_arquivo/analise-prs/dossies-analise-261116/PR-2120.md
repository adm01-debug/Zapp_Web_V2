# Dossiê PR #2120

**Título:** fix(inbox): fecha a semântica de tablist das 8 abas da conversa (etapa 15)
**Branch:** (mergeada — branch deletada)
**Head SHA:** (mergeado em squash)
**Base SHA:** (anterior à main@c4c7139e)
**Criado em:** 2026-10
**Draft:** Não

---

## Veredito

**JÁ_MERGEADA**

Mergeada em 2026-10-27T22:21:53Z via squash. SHA merge: `6da1949a100093ccdf858bd5156d5e3b130bccb8`.

## Análise com evidência de diff (lido nesta sessão)

**Arquivos alterados:** 4 (1 novo + 3 existentes)

### Diff lido — trechos-chave

**`src/components/inbox/chat/ConversationTabContent.tsx`:**
```diff
+  // Prop 'tab' adicionada ao componente Panel
+  role="tabpanel"
+  id="conversation-panel-${tab}"
+  aria-labelledby="conversation-tab-${tab}"
+  tabIndex={0}
```
Wrapper do chat também recebe `role="tabpanel"` com atributos correspondentes.

**`src/components/inbox/chat/ConversationTabs.tsx`:**
```diff
+ import { useRef, KeyboardEvent } from 'react';
- import { Bell } from 'lucide-react';
+ // Roving tabindex: moverFoco(ArrowRight/Left/Home/End)
+ const abaRefs = useRef<...>({});
+ // Cada botão: ref, id, aria-controls (ativo), tabIndex (0 se ativo, -1 caso contrário)
+ onKeyDown={moverFoco}
```
Reordenação do `ConversationTab` union type; função `moverFoco` implementa navegação por teclado padrão ARIA tablist.

**`src/components/inbox/chat/__tests__/ConversationTabs.navegacao.test.tsx`** (NOVO — 93 linhas):
- Testa roving tabindex (somente aba ativa com `tabIndex=0`)
- Testa `aria-controls` apenas na aba ativa
- Testa ArrowRight/Left, Home/End
- Testa que teclas neutras não movem foco

**`src/hooks/inbox/useInboxUIState.ts`:**
```diff
- VALID_TABS = ['chat', 'files', 'ia', 'crm', 'orders', ...]
+ VALID_TABS = ['chat', 'files', 'ia', 'crm', 'orders', 'history', 'tasks', 'notes']
```
Ordem das abas reordenada para refletir a UI final.

## Perguntas de validação

| # | Pergunta | Resposta |
|---|---|---|
| 1 | PR ainda válida? | **N/A** — já mergeada |
| 2 | Traz regressão? | **NÃO** — adiciona semântica ARIA sem remover funcionalidade; roving tabindex é padrão WCAG 2.1 |
| 3 | Já está em main? | **SIM** — `6da1949a`; main atual `c4c7139e` é descendente |
| 4 | Regra de negócio correta? | **SIM** — implementa especificação ARIA tablist (WAI-ARIA 1.1); `aria-controls` só na aba ativa é o comportamento correto |

## Resultado

Mergeada com sucesso. Etapa 15 do plano de abas concluída.
