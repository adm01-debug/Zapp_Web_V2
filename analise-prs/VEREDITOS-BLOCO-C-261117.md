# Veredito do bloco C — 17/11/2026

O bloco C era o último sem veredito: **873 versões distintas** de arquivo que a `main` tem no
mesmo caminho, mas em versão sem todas as linhas da branch.

## Por que contar linha ausente não decide nada

A lista bruta é liderada por `supabase/schema-manifest.json` com 1.929 linhas ausentes e por
`scripts/ci/eslint-baseline.json` com 1.064. Nenhum dos dois é funcionalidade: são artefatos
gerados, e a `main` tem a versão regerada depois. Ordenar por tamanho põe o ruído no topo e
esconde a melhoria de 3 linhas que importa.

## As cinco provas, e quanto cada uma eliminou

| Prova | Pergunta | Restam |
|---|---|---|
| — | versões distintas no bloco C | **873** |
| 1 | é código de produção? (fora teste, fora artefato gerado/baseline/snapshot) | **610** |
| 2 | a linha ausente muda **comportamento**? (chamada, condicional, atribuição, handler de evento, SQL — e não comentário, import, tipo ou classe de CSS) | **531** |
| 3 | qual o **sentido** da diferença? Se a `main` tem mais comportamento que a branch não tem, ela evoluiu depois | **127** |
| 4 | a linha existe em **outro arquivo** da `main`? (a `main` extraiu para módulo próprio) | **124** |
| 5 | quem tocou o arquivo por **último**? `main` depois = ela viu a versão anterior e substituiu | **18** |

A prova 3 é a que mais corta, e é a mais importante: `src/components/talkx/TalkXSegments.tsx`
apareceu em 6 branches com até 140 linhas de comportamento "faltando", e
`supabase/functions/evolution-api/index.ts` em 7. Em todos, a `main` tem **mais** comportamento
que a branch não tem: são versões anteriores de arquivo que a `main` reescreveu, não trabalho
perdido.

A prova 4 nasceu de dois falsos positivos reais: `src/lib/mediaVolumeStore.ts` (+15 linhas de
comportamento) e `src/components/admin/MediaMigrationTool.tsx` (+30) pareciam ter trabalho
perdido — e a `main` tinha **extraído** aquelas funções para `src/lib/authenticatedUserId.ts` e
`src/services/mediaMigration.service.ts`. É o análogo, no nível de linha, da prova "mesmo blob
em outro caminho" do gate.

**Validação do método:** entre os 18 que sobraram estão as **duas branches desta sessão**
(`copilot-tick.ts` com 8 linhas, `kit/states.tsx` com 6) — que são, de fato, trabalho ainda não
incorporado à `main`. O filtro acerta nos casos cuja resposta se conhece.

A fila completa está em `analise-prs/recuperacao-261117-fila-bloco-c.tsv`.

## Os 16 (18 menos as duas desta sessão), um a um

### Melhoria real que a `main` não tem — 4

| Arquivo | O que a branch tem | Como está na `main` |
|---|---|---|
| `src/components/inbox/quick-replies/QuickReplyCardList.tsx` | `pendingDelete` + `AlertDialog` — **confirma antes de excluir** a resposta rápida | a `main` **exclui direto**: nenhuma menção a `AlertDialog`, `pendingDelete` ou confirmação. Um clique acidental apaga o modelo |
| `src/components/ui/visually-hidden.tsx` | `timerRef` + `clearTimeout` no desmonte | a `main` tem `setTimeout(() => setAnnouncement(message), 100)` em `:37` **sem limpeza** — o timer sobrevive ao desmonte e tenta mudar estado de componente que saiu |
| `src/components/ui/table.tsx` | `scope = "col"` por padrão na célula de cabeçalho | a `main` **não tem `scope` nenhum** — o leitor de tela perde a associação entre célula e coluna |
| `src/hooks/ui/useCustomShortcuts.ts` | mostra `⌘` no Mac em vez de `Ctrl` | a `main` **não detecta plataforma**: anuncia `Ctrl` para quem usa Mac |

As três primeiras são **defeito na `main`**, não só ausência de melhoria. Entram por PR própria.

### Obsoletos, com prova — 12

| Arquivo | Por quê |
|---|---|
| `20261031100000_copilot_fases13_15_tabelas.sql` | acrescenta `DROP POLICY IF EXISTS` antes dos `CREATE`. A migration **já está aplicada** e é imutável pelo fluxo de `banco.md`; e o job "Replay local das migrations" da `main` passa como está — a idempotência extra não resolve problema existente |
| `src/components/team-chat/useTeamChatPanel.ts` | a `main` trata o evento em tempo real em `:96` (`event.type === 'delete'`), com outra forma |
| `src/components/inbox/VoiceChangerPicker.tsx` | a `main` tem `onSendAudioBlob` (`:68`, `:72`, `:324`). O que a branch tem a mais é o caminho `onSendAudio` com upload para o bucket `voice-changer-tmp` e URL assinada — a `main` manda o blob direto, **sem gravar arquivo temporário**. Simplificação deliberada, menos superfície |
| `supabase/functions/_shared/effect-reconcile.ts` | é compat **pré-DDL**: o próprio código diz `42703 = manually_resolved_at ainda não existe (pré-DDL da 20261111160000)`. A migration está aplicada, a coluna existe: caminho morto. Mesma família do `isSchemaNotReadyError` recusado na #3194 |
| `src/hooks/business/useWarRoomData.ts` | a `main` usa os RPCs `warroom_agent_today`/`warroom_queue_stats`, com teste próprio |
| `src/hooks/integrations/useTalkXServiceStatus.ts` | a branch devolve `crm: 'ok'` **fixo no código**. A `main` deixou `crm` de fora de propósito e diz por quê no cabeçalho do hook: não há sinal de disponibilidade do CRM. Recuperar seria afirmar "CRM operacional" sem medir |
| `src/components/calls/Keypad.tsx` | usa `useMotionSeguro`, já adjudicado na #3199: a `main` cumpre o requisito com `useReducedMotion` direto, com dois testes de aceite |
| `src/components/gamification/MiniGameDialogs.tsx` | muda a assinatura de `onComplete` para `(score, xp)`; a `main` tem outra divisão de XP. Diferença de regra de pontuação sem defeito associado |
| `src/components/ui/tabs.tsx`, `src/components/ui/label.tsx` | ajuste de classe de CSS (`truncate min-w-0`, `leading-snug`) de uma frente de texto longo que a `main` resolveu de outra forma |
| `src/styles/utilities.css` | comentário sobre `viewport-fit=cover` |
| `src/hooks/integrations/useTalkXTemplatesConversion.ts` | 1 linha, sem comportamento novo |

## O que foi verificado de verdade

- a cadeia inteira (gate + contenção de linha) foi **remedida contra a `main` atual**, depois dos
  merges desta sessão: 192 branches, `PARCIAL 2.942`, `NOVO 736`, `CONTIDO 201`,
  `PARCIAL-REMOÇÃO 7`
- o índice da prova 4 cobriu **8.448 arquivos e 774.839 linhas distintas** da `main`
- cada um dos 16 foi conferido na `main` por símbolo e por arquivo:linha, e o resultado está
  nomeado acima
- **NÃO VERIFICADO:** os **404 pares** que a prova 3 classificou como "a `main` evoluiu depois"
  não foram abertos um a um. A prova é que a `main` contém mais comportamento ausente na branch
  do que o contrário, e que a `main` tocou o arquivo depois; não li as 404 versões por dentro.
  Quem quiser auditar tem a cadeia em `scripts/recuperacao-branches/` e os quatro scripts de
  prova registrados nesta PR.
- nenhuma branch foi fechada, apagada ou alterada por esta PR.
