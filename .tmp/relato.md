Especialista: workertestes

## O que mudou e por quê
11 arquivos de teste NOVOS em `src/components/inbox/__tests__/` (zero linha de produção) para os componentes que o cartão lista como "sem teste na V2", cada um exercitando comportamento real do componente:
- `SentimentIndicator.regras.test.tsx` — faixas de `getSentimentFromScore` (70/45/25), rótulo+percentual, modo compacto, emoji crítico pulsante, `SentimentBar`.
- `MessagePreview.formatacao.test.tsx` — conteúdo vazio não renderiza; atalho de emoji vira emoji; crase vira `<code>`; underscore vira `<em>`; URL vira link `noopener noreferrer`; `useHasFormattableContent`.
- `LinkPreview.tipos-seguranca.test.tsx` — esquema não-http (ftp) não vira `<img>` mesmo com extensão .png; `javascript:` não vira preview; imagem vira `<img>` com o nome no alt; YouTube vira card com a miniatura do id; compacto mostra o domínio sem `www`; `showRemove` dispara `onRemove`.
- `KeyboardShortcutsHelp.filtro.test.tsx` — a lista só traz seleção + busca global + próxima/anterior conversa e esconde chat/actions, montando o popover de verdade.
- `TemplatesWithVariables.busca.test.tsx` — busca por título esconde o que não bate; `replaceVariables` substitui `{{nome}}`; `VariableHighlighter` marca a variável.
- `BulkActionsToolbar.acoes.test.tsx` — some sem seleção; singular/plural do contador; cada botão dispara o seu callback; `isLoading` desabilita.
- `AdvancedMessageMenu.opcoes.test.tsx` — lista as 4 opções; envia enquete com payload real e devolve `onPollSent`; recusa enquete com menos de 2 opções; envia cartão de contato; botão da figurinha bloqueado sem URL.
- `ForwardMessageDialog.limites.test.tsx` — bloqueio sem seleção; contador; aba Grupos escondida em `targets="contacts"`; bloqueio acima de 10 destinos; progresso X/Y; falha parcial com retry; confirmação a partir de 20 envios (2×10); não-encaminháveis com motivo.
- `RealtimeTranscription.conexao.test.tsx` — pede o token à Edge Function e conecta o scribe; para no erro da função (mesmo com token na resposta); com conectado mostra "Ouvindo..." e "Parar STT" e desconecta.
- `UniversityHelp.selecao.test.tsx` — bloqueia Gerar sem seleção; contador e rótulo singular/plural; Ctrl+Enter gera com seleção e não gera sem; erro + "Tentar novamente"; filtros trocam o modo.
- `VoiceChanger.conversao.test.tsx` — chama `elevenlabs-sts` com o id da voz; prévia + entrega o Blob ao confirmar; falha da Edge Function vira toast de erro sem liberar a prévia.

## Prova
- vermelho antes (produção mutada, uma mutação por arquivo): `npx vitest run <11 arquivos>` → `Test Files 5 failed (5); Tests 5 failed | 20 passed (25)` na faixa de 5 arquivos e, na primeira faixa, `6 failed (6)`. Cada mutação derruba exatamente o teste que a cobre:
  - faixas do sentimento (70→80), mapa de emoji (`:fire:`), ordem isSafeUrl (aceitar ftp), filtro do painel de atalhos, filtro de busca dos templates, `selectedCount===0` da toolbar;
  - validação da enquete (`<2`→`<1`), botão Encaminhar sem seleção, erro da Edge Function do STT, Ctrl+Enter sem seleção, erro de resposta da conversão de voz.
- verde depois (3 rodadas, com a produção restaurada): `npx vitest run <11 arquivos>` → `Test Files 11 passed (11); Tests 53 passed (53)` nas 3 execuções.
- verificação do cartão: `zapp-verify . --rapido` (rodado pelo `hermes-tarefa-fechar`).

## O que NÃO fiz e por quê
- `MessageTemplates`, `AgentReassignmentPanel`, `BulkActionsToolbar` (já existia `ContactTypeFilter.grupos.test.tsx` para o `contactTypeFilter`), `FileUploader.attachClip` e a telemetria de reação já têm teste na branch: `MessageTemplates.a11y-buttons.test.tsx`, `AgentReassignmentPanel.rotulos-botao.test.tsx`, `ContactTypeFilter.grupos.test.tsx`, `FileUploader.n-039/r2-inb-011/sl202-refs.test.tsx` e a família `useMessageReactions*`/`useReactionMutations*`. Por isso não criei teste duplicado.
- Não trouxe a faixa do cartão pai `t_b806ae2a`: os testes dele (13 arquivos) e os meus não se cruzam e não são pré-requisito destes. Trazer a faixa inteira somaria ~1800 linhas ao diff e o próprio pai registrou que o `hermes-tarefa-fechar` recusa diff > 90k por embutir outro cartão; os meus testes passam sozinhos sem ela.
- Nenhum defeito de produção encontrado nos componentes cobertos; nenhuma linha de produção alterada (só mutações temporárias, todas restauradas com `git restore`).
