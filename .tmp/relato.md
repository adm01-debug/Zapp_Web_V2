Especialista: Íris (area-front-componentes)

CONCLUÍ: o histórico de SLA do contato está visível no atendimento, na seção "Linha do tempo de SLA" do painel do contato, com a prova rodada abaixo.

## O que mudou e por quê
- `src/components/inbox/contact-details/SlaTimelineSection.tsx` (novo): a seção "Linha do tempo de SLA" do painel do contato. Lista os marcos REAIS (abertura da conversa, 1ª resposta, resolução e transferências) montados pelo hook `useContactSlaTimeline`/lib `slaTimeline` que já existiam e não tinham tela; cada marco recebe selo de situação (No prazo / Em risco / Estourado) e linha de apoio com a duração consumida contra o prazo; traz filtro de período (24h/7d/30d/Tudo) e de tipo de marco (filtro de cliente, não refaz leitura), aviso de leitura parcial, e os estados carregando / erro / vazio separados. A linha vertical entre marcos é o `DrawLine` do kit; com `prefers-reduced-motion` o traço nasce pronto e nenhum item se desloca. Motivo: o cartão pede o histórico de SLA visível no atendimento.
- `src/components/inbox/ContactDetails.tsx`: monta a seção depois das três do sidebar. Só montagem.
- `src/components/inbox/contact-details/sidebar/sidebarSections.ts`: registra `sla-timeline` entre as seções conhecidas, para o estado aberto/recolhido persistir como o das outras seções.
- `src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx` (novo): a prova de tela.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/contact-details/__tests__/SlaTimelineSection.test.tsx -t "persiste no acordeão"` com `SIDEBAR_SECTIONS` ainda sem o valor novo → `AssertionError: expected [ 'professional', 'personal', 'singu' ] to include 'sla-timeline'`; resultado `1 failed | 6 skipped`. Na base `dia/2026-10-12` não existe `SlaTimelineSection.tsx`.
- verde depois: `npx vitest run src/components/inbox/contact-details` → `Test Files 20 passed (20); Tests 218 passed (218)`.
- `npx tsc --noEmit` → exit 0, saída vazia.
- `npx eslint` nos quatro arquivos → exit 0, saída vazia.
- pre-commit: `Lint ratchet (staged, 4 arquivo(s)): baseline=0, atual=0, mantidas=0, removidas=0, novas=0` → `OK: nenhuma nova divida de lint foi introduzida.`

## Como tratei falha de leitura e ausência de dado
- `useContactSlaTimeline` (fora dos arquivos que o cartão deixa tocar) devolve `milestones/incomplete/limitsReady/loading` e não o erro. Para uma falha de leitura não ser exibida como "sem marcos", a seção lê o status da consulta no cache do React Query pela chave pública do hook (`contactSlaTimelineKey`, por prefixo) e mostra estado de erro próprio (`sidebar-empty-sla-timeline-erro`), com teste que monta a tela real. Sem essa leitura, erro e vazio seriam o mesmo estado.
- Prazo de SLA não carregado (`!limitsReady`) também tem estado de erro próprio (`sidebar-empty-sla-timeline-sem-prazo`), com teste.
- A seção nasce recolhida: `DEFAULT_OPEN_SECTIONS` não muda, para não alterar o painel de quem já usa; ela registra o próprio estado como as outras.
- Nada de banco, Edge Function ou dependência nova; nenhum identificador de produção e nenhum segredo em teste ou relato.
