Especialista: senior (area-front-componentes)
## O que mudou e por quê
- `src/components/inbox/contact-details/sidebar/sidebarSections.ts`: `customFields` entra em `SIDEBAR_SECTIONS` e `DEFAULT_OPEN_SECTIONS` — a seção já era um `AccordionItem` dentro do `Accordion` controlado do `ContactDetails`, mas a chave não era conhecida/persistida (filtro `KNOWN` descartava), então ela nunca abria por padrão nem mantinha o estado entre reloads.
- `src/components/inbox/contact-details/CustomFieldsSection.tsx`: loading virou shimmer (`role="status"`, `motion-safe:animate-pulse`, sem `animate-spin`); `Loader2` removido (import e 3 usos); botões mostram `Salvando…`/`Removendo…` em vez de spinner; subtítulo com `data-testid="custom-fields-subtitle"`.
- Testes: 4 novos em `CustomFieldsSection.test.tsx` (pontos 1–4) + 1 novo e 1 expectativa atualizada em `sidebarSections.test.ts`.

## Prova
- vermelho antes (fontes em 8973786de8, testes novos mantidos): `bun run vitest run src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx src/components/inbox/contact-details/sidebar/__tests__/sidebarSections.test.ts` → `Tests 5 failed | 18 passed (23)` (falham exatamente: default antigo, round-trip customFields, seção abre por padrão, shimmer sem spin, testid próprio)
- verde depois: mesmo comando → `Test Files 2 passed (2); Tests 23 passed (23)`
- regressão vizinha: `bun run vitest run src/components/inbox/__tests__/ContactDetails.quickActions.test.tsx src/components/inbox/contact-details/sidebar/__tests__/` → `Test Files 12 passed (12); Tests 84 passed (84)`
- `bunx eslint` nos 4 arquivos → exit 0

## Pontos do revisor
- Ponto 1: `customFields` registrado como chave conhecida e default-aberta em `sidebarSections.ts`; a seção (já `AccordionItem value="customFields"` dentro do `Accordion` controlado por `accordionValue` no `ContactDetails`) agora abre por padrão e persiste. Prova: `refazer-1 ponto 1` (componente com a fiação do ContactDetails) + `chave customFields sobrevive ao round-trip do storage`.
- Ponto 2: shimmer interno com `motion-safe:animate-pulse`, nenhum `animate-spin` na seção (`Loader2` removido). Prova: `refazer-1 ponto 2`.
- Ponto 3: subtítulo agora `custom-fields-subtitle`; nenhum `sidebar-section-subtitle` na seção. Prova: `refazer-1 ponto 3`.
- Ponto 4: confirmação de exclusão continua nos primitivos `AlertDialog` do Design System (sem overlay próprio). Prova: `refazer-1 ponto 4` (Cancelar fecha sem apagar; Remover confirmado só apaga após resposta do servidor — teste pré-existente).

## O que NÃO fiz e por quê
- Não rebaseei para a `dia/2026-10-14` (o `ContactDetails.tsx` foi refatorado lá): traria ~100 linhas alheias ao diff; a integração resolve o conflito. O encaixe (AccordionItem + chave persistida) vale nas duas versões.
- Não alterei `useContactCustomFields.ts`, `ContactService` nem o `updateField` direto no `supabase`: fora dos 4 pontos da recusa.
- Teste existente ajustado 1x: `sidebarSections.test.ts` (`default (todas abertas)` agora inclui `customFields`) — exigido pelo ponto 1 da recusa, citado aqui.

## Arquivos (`git diff --name-only 8973786de8..HEAD`)
- src/components/inbox/contact-details/CustomFieldsSection.tsx
- src/components/inbox/contact-details/__tests__/CustomFieldsSection.test.tsx
- src/components/inbox/contact-details/sidebar/__tests__/sidebarSections.test.ts
- src/components/inbox/contact-details/sidebar/sidebarSections.ts

## Fechamento
- `hermes-tarefa-fechar` está congelado para agentes nesta máquina (modo V1 suspenso, sem `MODO_V2`); por isso não houve `FATOS MEDIDOS PELO FECHAR`. Trabalho committado na branch do cartão (`91bfe311ce`) e entregue via conclusão do cartão com este relato.
