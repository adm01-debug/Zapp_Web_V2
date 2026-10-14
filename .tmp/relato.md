Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- Retomada por cherry-pick da branch v2/tl-122-talkx-editor-vazio-2610101050afc4 sobre a ponta de dia/2026-10-13.
  Os 3 commits do pai (15f352259d, e8a5976e23, 30d9ef2e2) NÃO estavam na ponta de dia: a unificação das ações de
  template (menu ⋮, duplicar que abre a cópia, testar, excluir) e a janela de teste compartilhada estavam só na branch.
- src/components/talkx/TalkXTemplateTestDialog.tsx: `hasOverride` passa a decidir pela PRESENÇA da prop
  (`typeof contentOverride === 'string'`), não pelo texto ter caracteres — o editor sempre passa `contentOverride`
  (`eContent`), então editor vazio testa vazio ("Template vazio") em vez de cair no conteúdo salvo do template.
- src/components/talkx/TalkXTemplateActionsMenu.tsx, TalkXTemplateStatusControl.tsx e
  src/hooks/integrations/useTalkXTemplateActions.ts: componentes/hook novos da unificação, trazidos pelo cherry-pick.
- src/components/talkx/TalkXTemplateEditor.tsx e TalkXTemplates.tsx: conflito com a ponta resolvido PRESERVANDO o que
  já entrou no dia — `isError/error/onRetry` (X091 query boundary), `onOpenMonitor` (X091 widget "Em andamento"),
  painel largo/gaveta (X193) e os KPIs da biblioteca (X086) — junto do `onOpenCopy` do cabeçalho e do controle de
  status por papel. Imports órfãos removidos (Dialog/Send/CheckCircle/XCircle no editor; TalkXConfirmDialog/
  PRESETS_DO_PRODUTO/deleteTemplate na lista, cuja exclusão agora é do menu ⋮).
- Testes ajustados à ponta (o pai foi escrito antes dessas mudanças do dia): provider de react-query em
  TalkXTemplateActions.test.tsx; mock de `useUserRole`/`useAuth` em TalkXTemplateKpis.test.tsx e
  TalkXTemplateEditor.painelMenor.test.tsx (o menu ⋮ lê papel/dono); mock de `@/integrations/supabase/client` e de
  `useTalkX` em TalkXTemplateActions.test.tsx (sem eles o cliente real do Supabase abria WebSocket de realtime e o
  arquivo saía com exceção fora dos casos); `containerDe` usa `.cursor-pointer` em vez de
  `[role="button"]` (a ponta tirou o role do cartão/linha por nested-interactive, TL-175D); a asserção de status
  passou a exigir que o `<Select>` de status (`id=talkx-template-status`) sumiu, sem travar a contagem de combobox
  (a ponta ganhou o combo do período, X086).

## Prova
- vermelho antes: `npx vitest run src/components/talkx/__tests__/TalkXTemplateActions.test.tsx` com a versão
  pré-fix do diálogo (`hasOverride = typeof contentOverride === 'string' && contentOverride.length > 0`) →
  `× contentOverride="" recusa com "Template vazio" e não chama o envio` / `Test Files 1 failed (1) | Tests 1 failed | 14 passed (15)`
- verde depois: `npx vitest run src/components/talkx/__tests__/TalkXTemplateActions.test.tsx` →
  `Test Files 1 passed (1) | Tests 15 passed (15)`
- lote das telas/hooks de template (13 arquivos, inclui editor race/states/painelMenor, templates gallery/states/
  duplicarAtalho, KPIs e hooks useTalkXTemplates/useWhatsAppTemplates) →
  `Test Files 13 passed (13) | Tests 105 passed | 2 expected fail (107)`

FAIXA DO PAI: commits 15f352259d, e8a5976e23 e 30d9ef2e2 da branch v2/tl-122-talkx-editor-vazio-2610101050afc4
(TL-122) — não são deste cartão; foram trazidos por `git cherry-pick -n`. Os conflitos (editor, lista e o próprio
teste) foram resolvidos mantendo a ponta de dia onde ela já tinha mudado o comportamento (X086/X091/X193 e TL-175D)
e o pai onde ele é a entrega (menu ⋮, controle de status por papel, janela de teste com override).

## O que NÃO fiz e por quê
- Não toquei em arquivo fora de src/components/talkx/** e src/hooks/integrations/.
- Não devolvi o `role="button"` ao cartão/linha do template: a ponta removeu de propósito (nested-interactive,
  TL-175D) e foi o teste do pai que estava desatualizado — adaptei o teste, não o markup.

## Arquivos que o diff desta branch muda
- .tmp/relato.md
- src/components/talkx/TalkXTemplateActionsMenu.tsx (novo — menu ⋮)
- src/components/talkx/TalkXTemplateEditor.tsx
- src/components/talkx/TalkXTemplateStatusControl.tsx (novo — status por papel)
- src/components/talkx/TalkXTemplateTestDialog.tsx (novo — janela de teste compartilhada; o override pela presença)
- src/components/talkx/TalkXTemplates.tsx
- src/components/talkx/__tests__/TalkXTemplateActions.test.tsx (novo — prova X090 + a correção do editor vazio)
- src/components/talkx/__tests__/TalkXTemplateEditor.painelMenor.test.tsx (mock de papel/dono)
- src/components/talkx/__tests__/TalkXTemplateEditor.race.test.tsx (mock de papel/dono — veio do pai)
- src/components/talkx/__tests__/TalkXTemplateKpis.test.tsx (mock de papel/dono)
- src/components/talkx/__tests__/TalkXTemplates.duplicarAtalho.test.tsx (veio do pai: duplicar abre a cópia)
- src/components/talkx/__tests__/TalkXTemplates.gallery.test.tsx (veio do pai: gatilho do menu no cartão)
- src/components/talkx/__tests__/TalkXTemplates.states.test.tsx (veio do pai)
- src/components/talkx/__tests__/TalkXView.templates.test.tsx (veio do pai)
- src/components/talkx/__tests__/useCampaignEditor.test.tsx (veio do pai)
- src/hooks/integrations/__tests__/useTalkXTemplates.test.ts (veio do pai)
- src/hooks/integrations/__tests__/useTalkXTemplates.testSendError.test.ts (novo — veio do pai)
- src/hooks/integrations/useTalkXTemplateActions.ts (novo — duplicar/testar/excluir num só lugar)
- src/hooks/integrations/useTalkXTemplates.ts (veio do pai: testTemplate/erro de envio)

## Sobre os arquivos fora da lista antiga do cartão
O cartão (rodada anterior) listava só 2 arquivos (a janela de teste e o seu teste), porque supunha que o resto da
entrega TL-122 já estivesse na ponta de dia. Não está: `TalkXTemplateActionsMenu.tsx`,
`TalkXTemplateStatusControl.tsx`, `TalkXTemplateTestDialog.tsx` e `useTalkXTemplateActions.ts` não existiam no
`dia/2026-10-13`, e o editor/lista seguiam com a versão inline. Por isso a retomada por rebase precisou trazer os
16 arquivos da branch do pai (os 3 commits acima) — sem isso não existe a janela de teste a corrigir. As duas
adições minhas fora do pai são os mocks (papel/dono, supabase/useTalkX) e o provider nos testes que a ponta ganhou
depois (X086/X091).
