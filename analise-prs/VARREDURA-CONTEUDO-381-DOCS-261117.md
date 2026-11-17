# Varredura do conteúdo dos 381 documentos de análise — 17/11/2026

O `FECHAMENTO-DE-CONTAS-261117.md` fechou os 381 documentos de análise das branches **por
referência a arquivo**, e declarou em aberto: "NÃO VERIFICADO: o conteúdo dos 381 documentos".
Este documento fecha isso. A lacuna era real e tinha uma classe própria: **regra de negócio ou
pendência descrita em prosa, sem citar arquivo** — invisível para a varredura por referência.

## Método e cobertura

Os 381 caminhos foram mapeados para uma branch que os contém (381 de 381) e extraídos: **510.494
bytes**, 370 `.md`, 9 `.json`, 2 `.txt`. Doze leitores em paralelo leram **os 381 inteiros**
(`docs_lidos = docs_na_lista` em todos os 12 lotes), extraindo **só o que o próprio documento
declara como não feito** — pendência, "falta", TODO, "próximo passo", gap declarado. Cada
candidato foi então verificado contra a `main` por um agente dedicado, com ordem de ler a linha
antes de concluir e de responder "ausente" em caso de dúvida.

| | |
|---|---|
| candidatos extraídos | **87** |
| já na `main`, com `arquivo:linha` | **58** |
| **ausentes da `main`** | **21** |
| não é funcionalidade (processo, CI, métrica) | **8** |

Os 21 ausentes se dividem assim, e a soma fecha: **1** trabalho parcial de verdade, **11** de
regra 8 (DDL, cron, env), **6** endurecimento de edge function e **3** que não se sustentaram na
conferência que fiz depois. 1 + 11 + 6 + 3 = 21.

## O achado: quatro módulos de LGPD e transparência prontos e ligados a nada

`src/hooks/copilot/useDataMasking.ts:40` é um hook **completo e testado** (CV-114) que mascara
CPF, CNPJ, e-mail, telefone, cartão e CEP, preservando separadores. **Consumidores: nenhum.**
`git grep -ln useDataMasking origin/main -- src` devolve o próprio arquivo, dois testes
(`src/__tests__/useDataMasking.test.ts`, `src/hooks/copilot/__tests__/useDataMasking.test.ts`) e o
re-export em `src/hooks/copilot/index.ts:88`. Nada o chama.

O mesmo vale para outros três:

| Módulo | O que faz | Consumidores |
|---|---|---|
| `src/hooks/copilot/useDataMasking.ts:40` | mascara CPF/CNPJ/e-mail/telefone/cartão/CEP | **0** |
| `src/hooks/copilot/useLgpdFilter.ts:20` | filtro LGPD | **0** |
| `src/hooks/copilot/usePIIDetector.ts:41` | detecta dado pessoal | **0** |
| `src/components/copilot/TransparencyLabel.tsx:22` | selo "gerado por IA" | **0** |

Enquanto isso, o front manda texto de conversa para a IA em pelo menos doze pontos, nenhum deles
mascarando nada: `src/components/admin/SupervisorCopilot.tsx:89` e
`src/hooks/inbox/useObjectionDetector.ts:90,164` (`ai-proxy`),
`src/components/inbox/AISuggestions.tsx:102` (`ai-suggest-reply`),
`src/components/inbox/ConversationSummary.tsx:91` (`ai-conversation-summary`),
`src/components/inbox/chat/AIEnhanceButton.tsx:62` e `AIRewriteButton.tsx:50`
(`ai-enhance-message`), `src/components/inbox/AIConversationAssistant.tsx:107`
(`ai-conversation-analysis`), `src/components/ai/AutoTicketClassifier.tsx:146`,
`ChurnPredictionDashboard.tsx:126`, `src/components/inbox/AudioMessagePlayer.tsx:71`.

**É trabalho parcial de outro agente, não obsoleto:** a peça foi construída, testada e nunca
ligada. O dossiê `PR-2026` declarava esses guardrails como obrigatórios; os nomes que ele cita
(`useSensitiveDataMasker`, `usePromptInjectionGuard`, `AITransparencyBadge`) não existem, mas os
equivalentes acima existem — a implementação mudou de nome e parou antes da integração.

**Por que não liguei:** ligar muda o que a IA recebe. Mascarar CPF antes de enviar protege o dado
em trânsito e pode piorar a sugestão quando o número é o assunto da conversa; e o escopo do hook,
pelo próprio cabeçalho ("mascaramento no rascunho"), é a caixa de resposta do atendente, não um
filtro de saída geral. Isso é trade-off de negócio e de LGPD — decisão sua, não minha.

## Regra 8: precisa de você (DDL, cron, env) — 11 itens em 10 linhas

| # | Pendência | Onde | Efeito se continuar assim |
|---|---|---|---|
| 1 | bucket `multiplix-voice` sem nenhuma policy de RLS e sem restrição de MIME | storage | arquivo arbitrário gravado pela service key e entregue por signed URL como se fosse áudio de voz |
| 2 | `notify_due_tasks` sem `FOR UPDATE SKIP LOCKED` | função do banco | duas execuções sobrepostas mandam a mesma notificação de tarefa duas vezes |
| 3 | `trigger_pending_multiplix_dispatches` engole erro por item, sem log | função do banco | disparo que falha para em silêncio; ninguém sabe que a campanha não saiu |
| 4 | URL do `talkx-storage-purge` derivada por regexp de `talkx_scheduler_url`, sem fallback nem alerta | cron | se o segredo mudar de formato, a purga de mídia para sem avisar |
| 5 | falta trigger de auditoria em `messages`, `campaigns`, `whatsapp_connections`, `profiles`, `notifications`, `copilot_sessions` | banco | alteração ou exclusão nessas tabelas não deixa rastro de quem fez |
| 6 | retenção LGPD parcial: falta coluna de retenção em 188 tabelas públicas | banco | conversa, notificação, campanha e log de IA guardados sem prazo |
| 7 | policies da migration do copiloto não idempotentes | migration | banco novo a partir das migrations quebra com `policy already exists` |
| 8 | `talkx-scheduler`: migration + funções cron do fix de arranque paradas aguardando aprovação (**dois** dos 21, o mesmo assunto em dois documentos: dossiês PR-2514 e PR-2245) | cron | painel do motor lê o histórico do `pg_cron` sem janela nem índice (~1,6 s por abertura) e o tick segue sem trava de sobreposição |
| 9 | anon key do Supabase fixa em `src/integrations/supabase/client.ts:17` | env do Vercel | rotacionar a chave exige PR e deploy do front, em vez de trocar variável no painel |
| 10 | índice duplicado `idx_dept_invites_code` (criado em `20260927400000_accept_department_invite_rpc.sql:6`, duplica a constraint `department_invites_code_key`) | banco | 8–16 kB e escrita extra; impacto praticamente nulo |

A chave anon é `VITE_*`, isto é, pública por construção — não há segredo vazado aqui; o problema é
operacional, não de exposição.

## Endurecimento de edge function: posso fazer sem você

| # | Pendência | Escopo real conferido |
|---|---|---|
| 1 | `fetch` sem `AbortSignal.timeout` na ação `set-webhook` | **1** chamada (`supabase/functions/evolution-api/index.ts:1206`), não as 7 que o documento alegava: as linhas 517/562/613/757/830/885/1065 não existem, três das quatro chamadas do arquivo já têm timeout (`:318`, `:665`, `:1477`) e o resto passa pelo `proxy()`, que aborta em `_shared/evolution-api-proxy.ts:204-207` |
| 2 | `gmail-cron-sync` reimplementa a comparação de segredo em vez de usar `timingSafeStringEqual` | `supabase/functions/gmail-cron-sync/index.ts:60-73`; o helper existe em `_shared/cron-secret-auth.ts:38` e já é usado por outras edges. Comportamento hoje é equivalente — é risco de manutenção |
| 3 | Gmail API sem timeout | `_shared/gmail-helpers.ts:250` (`gmailFetch`, cobre a maioria) + `gmail-cron-sync/index.ts:32`, `gmail-webhook/index.ts:157` (até 100 páginas), `gmail-sync/index.ts:186` |
| 4 | ElevenLabs sem timeout | `elevenlabs-tts/index.ts:52`, `elevenlabs-sts/index.ts:112`, `elevenlabs-dialogue/index.ts:80` |
| 5 | Bitrix e Resend sem timeout | `sync-call-records/index.ts:170` (N8N a cada 5 min), `searchbox-budget-alert` |
| 6 | `Deno.env.get('VAR')!` em vez de `requireEnv` em 8 edges | `webhook-diagnostic`, `copilot-live`, `bitrix-api`, `multiplix-send`, `talkx-send`, `talkx-link`, `gmail-sync`, `promogifts-catalog` |

O padrão de timeout já existe na `main` (`_shared/evolution-media.ts:170`,
`_shared/evolution-helpers.ts:380`, `ai-transcribe-audio/index.ts:632`), então são diffs pequenos.
Não os fiz nesta sessão para não misturar seis assuntos numa PR só.

## Os 3 que não se sustentaram, e por quê

- **`cachedConversations` sem guarda** (dossiê PR-2195): `useOfflineCache` recebe
  `conversations: ConversationWithMessages[]` (`src/hooks/system/useOfflineCache.ts:62`) — tipo
  obrigatório, não opcional — e devolve `cachedData || conversations`
  (`:106`). O `tsc --noEmit -p tsconfig.app.json` passa limpo na `main`, logo nenhum chamador
  passa `undefined`. O `?? []` da branch defende um caso que o tipo proíbe. Confirma o veredito já
  publicado em `vereditos-96-caminhos/lote-2.md`.
- **mock global de `clientHeight` no `src/test/setup.ts`**: de fato não está lá, mas a suíte passa
  porque 18 arquivos de teste definem o mock localmente. Perde-se centralização, não comportamento.
- **teste em Postgres temporário para as 3 migrations de RLS** (dossiê PR-2551): é teste que falta,
  não funcionalidade perdida; as policies estão aplicadas.

## O que isto muda no fechamento

A linha "NÃO VERIFICADO: o conteúdo dos 381 documentos" do `FECHAMENTO-DE-CONTAS-261117.md` deixa
de valer: os 381 foram lidos por inteiro. O saldo é **um trabalho parcial real** (os quatro módulos
de LGPD e transparência), **onze pendências de banco/infra que são suas por regra**, **seis
endurecimentos de edge** e **três alarmes falsos**. Nenhum deles muda a contagem dos 4.997
arquivos nem os vereditos dos 96 caminhos, que são sobre versões de arquivo, não sobre prosa.
