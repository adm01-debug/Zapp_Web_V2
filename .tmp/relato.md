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
  TalkXTemplateEditor.painelMenor.test.tsx (o menu ⋮ lê papel/dono); `containerDe` usa `.cursor-pointer` em vez de
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
