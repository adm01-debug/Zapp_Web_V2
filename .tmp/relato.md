## O que mudou e por quê
- `src/components/inbox/contact-details/WhatsAppStatusSection.tsx` (novo): seção "Status do WhatsApp" no painel de contato — aparece só quando o contato tem stories; miniaturas com anel token (`ring-whatsapp` para não visto, `ring-border` para visto); contador de não vistos; estados de carregando (ShimmerSkeleton, `aria-hidden`) e vazio (não renderiza). Sem selo de presença online.
- `src/components/inbox/contact-details/StoryViewer.tsx` (novo): visualizador em Dialog — barras de progresso por story, avanço automático a cada 5 s, setas esquerda/direita no próprio elemento (`onKeyDown`, sem listener global) e Esc pelo Radix; mídia carregada SOB DEMANDA por `useEvolutionApi().getMediaBase64` (caminho privado da V2 — a URL da Evolution nunca vai ao `<img>`); vídeo com `controls`/`playsInline` e legenda textual; com movimento reduzido a troca de story só muda opacidade (sem deslocamento) e as barras não animam.
- `src/components/inbox/contact-details/storyUtils.ts` (novo): `storyKeyOf`, `storyMediaKind`, `storyCaption` e `STORY_DURATION_MS` — extraídos para o StoryViewer exportar só componentes (regra `react-refresh/only-export-components`).
- `src/components/inbox/contact-details/sidebar/ContactSidebarSections.tsx`: 1 linha — encaixe da seção no painel de contato.
- `src/hooks/integrations/useWhatsAppStatus.ts`: passa a expor `instanceName` (instância resolvida), necessária ao carregamento privado da mídia. O hook não foi reescrito; só um campo aditivo.

## Prova
- vermelho antes: `git cat-file -e dia/2026-10-12:src/components/inbox/contact-details/WhatsAppStatusSection.tsx` → `fatal: path ... exists on disk, but not in 'dia/2026-10-12'` (o módulo e a seção não existem na base; o teste que os prova é vermelho antes).
- verde depois: `npx vitest run src/components/inbox/contact-details/__tests__/WhatsAppStatusSection.test.tsx` → `Test Files 1 passed (1); Tests 8 passed (8)`.
- regressão do hook tocado + visinhos do painel: `npx vitest run src/hooks/__tests__/useWhatsAppStatus.test.ts src/components/inbox/contact-details/__tests__/ContactHeaderSection.test.tsx src/components/inbox/contact-details/__tests__/ContactActionButtons.test.tsx` → `Test Files 3 passed (3); Tests 72 passed (72)`.
- tipos: `npx tsc -b --force` → saída vazia, exit 0 (zero erros).
- lint dos arquivos do diff: `npx eslint <arquivos>` → sem saída (zero ocorrências novas).

Os 8 testes renderizam os componentes REAIS (`WhatsAppStatusSection`/`StoryViewer`); só a fronteira de rede é mockada (`useWhatsAppStatus` e `getMediaBase64`). O que eles provam: (1) sem stories não renderiza a seção; (2) com stories renderiza miniaturas, a primeira com anel de não visto; (3) clicar abre o visualizador e `getMediaBase64` é chamado com `instanceName` + a mensagem (sob demanda); (4) seta direita/esquerda navega; (5) Esc fecha e a miniatura passa a "visto"; (6) avança sozinho após 5 s; (7) com movimento reduzido o story não carrega deslocamento (`initial` sem `x`); (8) com movimento normal o story entra deslizando (`initial.x = 24`).

## O que NÃO fiz e por quê
- Não toquei em banco, Edge Function ou migration: a mídia usa o caminho privado já existente (`getMediaBase64`); nada de URL da Evolution direto no `<img>`.
- Não adicionei presença online nem exportação: a V2 não tem essa informação e o Zapp não exporta.
- Nenhuma permissão/rota nova: a seção vive dentro do painel de contato já protegido.
