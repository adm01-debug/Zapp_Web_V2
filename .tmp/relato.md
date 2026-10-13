Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/inbox/contact-details/SlaTimelineSection.tsx` (novo): a seção "Linha do tempo de SLA" do painel do contato. Lista os marcos REAIS (abertura da conversa, 1ª resposta, resolução e transferências) montados pelo hook `useContactSlaTimeline`/lib `slaTimeline` que já existiam e não tinham tela; cada marco recebe selo de situação (No prazo / Em risco / Estourado) e linha de apoio com duração consumida contra o prazo; traz filtro de período (24h/7d/30d/Tudo) e de tipo de marco (é filtro de cliente, não refaz leitura), aviso de leitura parcial, e os estados carregando / erro / vazio separados. A linha vertical entre marcos é o `DrawLine` do kit; com `prefers-reduced-motion` o traço nasce pronto e nenhum item se desloca. Motivo: o cartão pede o histórico de SLA visível no atendimento.
- `src/components/inbox/ContactDetails.tsx`: monta a seção depois das três do sidebar. Só montagem.
- `src/components/inbox/contact-details/sidebar/sidebarSections.ts`: registra `sla-timeline` entre as seções conhecidas, para o estado aberto/recolhido persistir como o das outras seções (as três antigas continuam sendo as que nascem abertas).
- `src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx` (novo): a prova de tela.

## Prova
- vermelho antes: com `SIDEBAR_SECTIONS` ainda sem o valor novo, `npx vitest run src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx -t "persiste no acordeão"` → `AssertionError: expected [ 'professional', 'personal', 'singu' ] to include 'sla-timeline'` (1 failed | 6 skipped). O componente e o teste são arquivos novos: na base `dia/2026-10-12` não existe `SlaTimelineSection.tsx`.
- verde depois: `npx vitest run src/components/inbox/contact-details` → `Test Files 20 passed (20); Tests 218 passed (218)`.
- `npx tsc --noEmit` → exit 0.
- `npx eslint <os quatro arquivos>` → exit 0; pre-commit: `Lint ratchet (staged): novas=0`.

## O que NÃO fiz e por quê
- Não toquei em `src/hooks/sla/useContactSlaTimeline.ts` nem em `src/lib/slaTimeline.ts` (não estão nos arquivos que o cartão deixa tocar): o hook devolve só `milestones/incomplete/limitsReady/loading` e **não devolve o erro** da leitura. Para a falha de leitura não aparecer como "sem marcos", a seção lê o status da consulta no cache do React Query pela chave pública do hook (`contactSlaTimelineKey`, por prefixo) e mostra estado de erro próprio — está coberto por teste. O caminho mais limpo é o hook passar a expor `isError`; fica registrado para o dono de `src/hooks/**`.
- A seção nasce recolhida: `DEFAULT_OPEN_SECTIONS` não muda, para não alterar o painel de quem já usa.
- Nada de banco, Edge Function ou dependência nova; nenhum identificador de produção e nenhum segredo em teste ou relato.
