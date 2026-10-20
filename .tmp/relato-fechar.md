- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 108s;OK lint 4s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (13/10 06:19, gerados por máquina: valem mais que números escritos à mão)
```
 .tmp/relato.md                                     | 29 ++++---
 src/components/inbox/AISuggestions.tsx             |  3 +-
 src/components/inbox/AudioMessagePlayer.tsx        |  2 +-
 src/components/inbox/CRMAutoSync.tsx               |  5 +-
 src/components/inbox/ConversationSummary.tsx       |  2 +-
 src/components/inbox/KeyboardShortcutsHelp.tsx     |  3 +-
 src/components/inbox/MessageContextActions.tsx     |  3 +-
 src/components/inbox/MessageReactions.tsx          |  3 +-
 src/components/inbox/VoiceChanger.tsx              |  3 +-
 src/components/inbox/VoiceChangerPicker.tsx        |  6 +-
 .../inbox/__tests__/AISuggestions.aria.test.tsx    | 40 ++++++++++
 .../AudioMessagePlayer.a11y-buttons.test.tsx       | 91 ++++++++++++++++++++++
 .../inbox/__tests__/CRMAutoSync.aria.test.tsx      | 51 ++++++++++++
 .../__tests__/ConversationSummary.aria.test.tsx    | 69 ++++++++++++++++
 .../__tests__/KeyboardShortcutsHelp.aria.test.tsx  | 28 +++++++
 .../__tests__/MessageContextActions.aria.test.tsx  | 49 ++++++++++++
 .../inbox/__tests__/MessageReactions.aria.test.tsx | 43 ++++++++++
 .../inbox/__tests__/VoiceChanger.aria.test.tsx     | 54 +++++++++++++
 .../__tests__/VoiceChangerPicker.aria.test.tsx     | 44 +++++++++++
 19 files changed, 505 insertions(+), 23 deletions(-)
```
- Testes alterados neste cartão (9 arquivo[s]) rodados AGORA no seu commit: Test Files 9 passed (9);Tests 13 passed (13)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: integrar — sem risco detectado

Especialista: Íris (area-front-componentes)

## O que mudou e por quê
O cartão pede nome acessível nos botões só de ícone do inbox (13 no total) e alvo de toque de 44 px no celular. Dos 13, dois já tinham rótulo no HEAD e não foram tocados: FileUploader.tsx:86/176 (`aria-label="Fazer upload de arquivo"`) e MessageTemplates.tsx:81 (`aria-label="Fechar formulário"`). Os outros 11 ganharam `aria-label` em pt-BR (dinâmico onde o estado muda) e o par de classes de toque `[@media(pointer:coarse)]:min-w-[44px] [@media(pointer:coarse)]:min-h-[44px]` (mesmo padrão já usado em Sidebar/settings; não altera o desktop, só ponteiro grosso):
- AudioMessagePlayer.tsx:115 — play/pause/erro: "Reproduzir áudio" / "Pausar áudio" / "Reproduzir áudio novamente" / "Carregando áudio".
- CRMAutoSync.tsx:141 — "Contato não encontrado no CRM" (desabilitado); :159 — `aria-label={tooltipText}` ("Sincronizar com CRM externo" / "Sincronizando..." / "Sincronizado ...").
- ConversationSummary.tsx:169 — "Dispensar aviso de áudio bloqueado".
- KeyboardShortcutsHelp.tsx:33 — "Atalhos de teclado".
- MessageContextActions.tsx:142 — "Mais ações da mensagem".
- MessageReactions.tsx:253 — "Mais reações".
- VoiceChanger.tsx:212 — "Ouvir prévia da voz" / "Parar prévia da voz".
- VoiceChangerPicker.tsx:278/292 — "Gravar áudio" / "Parar gravação".
- AISuggestions.tsx:203 — "Fechar sugestões".

Um teste por componente (mesmo os que já tinham rótulo não precisaram de teste novo): 9 arquivos novos em `src/components/inbox/__tests__/*.aria.test.tsx` + `AudioMessagePlayer.a11y-buttons.test.tsx`. Cada um renderiza o componente REAL e afirma `getByRole('button', { name })`; nenhum mock devolve o rótulo.

## Prova
- vermelho antes: `npx vitest run src/components/inbox/__tests__/AudioMessagePlayer.a11y-buttons.test.tsx` (com o `aria-label` removido do AudioMessagePlayer) → `Unable to find an accessible element with the role "button" and name "Reproduzir áudio"` (4 de 4 falharam).
- verde depois: `npx vitest run <9 arquivos novos + 5 pré-existentes dos componentes tocados>` → `Test Files 14 passed (14); Tests 34 passed (34)`.

## O que NÃO fiz e por quê
- Não toquei FileUploader.tsx nem MessageTemplates.tsx: já tinham `aria-label` no HEAD; mexer seria diff fora do pedido.
- Não mudei lógica, hooks nem dados: só atributo acessível e classe de toque sob `pointer:coarse`.
