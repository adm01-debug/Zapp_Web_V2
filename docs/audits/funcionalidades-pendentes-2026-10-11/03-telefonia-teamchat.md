# Área 03 — Telefonia/Ligações (VoIP, ligações WhatsApp, MeowCaller, ElevenLabs/voz) + Team Chat

Varredura **só leitura** em `adm01-debug/Zapp_Web_V2` @ `99aa53f` (main, 2026-10-11). Tudo o que está marcado
CONCLUÍDO/PARCIAL foi conferido no código (arquivo:linha). Produção (banco, secrets, deploy) **não** foi
consultada: o que depende dela está como BLOQUEADO ou NÃO VERIFICÁVEL.

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Situação |
|---|---|---|---|---|
| `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` | plano + ledger vivo | 100 (T01–T100) + D1–D8 | 29/09, atualizado até 08/10 | **VIGENTE** (74 caixas `[x]`) |
| `docs/plans/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md` | cópia do mesmo plano | 100 | snapshot de ~29/09 (PR #1193), commitado em 08/10 (#1908) | **DESATUALIZADA** — diz "PLANEJADO — nada executado"; só T01–T05, T07–T09, T14, T18 marcados |
| `docs/design/PLANO_MELHORIAS_TELEFONIA_100_ETAPAS.md` | plano v1.0 | 100 (12 fases, CP0–CP12) | 26/09 | SUBSTITUÍDO (fases 0–2 feitas; resto absorvido em T01–T100) |
| `docs/design/TELEFONIA_STATUS.md` | ledger do v1.0 | CP0–CP2 + logs | 26/09–08/10 | SUBSTITUÍDO (linha final "superado por", `:659-665`) |
| `docs/design/AUDITORIA_TELEFONIA_ESTADO_REAL_2026-09-29.md` | auditoria | 27 DONE · 16 PARCIAL · 57 AUSENTE | 29/09 | histórico (origem do plano vivo) |
| `docs/audits/ZAPP_WEB_V2_TELEFONIA_AUDITORIA_E_60_MELHORIAS.md` | auditoria/spec | 60 (TEL-001–TEL-060) | ref. 26/09, commitado 08/10 | histórico (base do v1.0); 8 itens sem dono no plano vivo |
| `docs/design/ANALISE_LIGACOES_WHATSAPP_2026-10-07.md` | análise/recomendação | 3 caminhos (A Meta, B meowcaller, B' Wavoip, C manter) | 07/10 | VIGENTE (recomenda A em produção) |
| `docs/plans/PLANO_LIGACOES_WHATSAPP_MEOWCALLER_100_ETAPAS_2026-10-07.md` | plano | 100 (E001–E100) + gates G0–G4 | 07/10 | VIGENTE, **0/100 iniciado** (`:253`) |
| `docs/telefonia/CAPACIDADES.md` | status/spec | matriz por canal | 26/09 (retoques 03/10) | vigente, parcialmente desatualizado |
| `docs/CAPACIDADES.md` | spec | tabelas VoIP/WhatsApp/D8 | 02/10 (T31) | vigente |
| `docs/telefonia/CONTRATO.md` | spec de domínio | 7 seções | 26/09 | vigente |
| `docs/telefonia/HOMOLOGACAO.md` | roteiro de homologação | 9 cenários | 05–09/10 | vigente; tabela de recibos **vazia** (`:69+`) |
| `docs/design/telefonia-baseline-2026-09-29/` | snapshot | `pos-fase-0.json` | 29/09 | `final.json` ausente |
| `docs/audits/AUDITORIA_A11Y_MOBILE_TELEFONIA_EMAIL_MULTIPLIX_TALKX_2026-10-07.md` | auditoria a11y | 10 achados (2 de Telefonia) | 07/10 | vigente (A11Y-01 já corrigido) |
| `docs/reconciliation/reports/modules/TELEFONIA_IA_DASHBOARD.md` | reconciliação | T01–T100 (+IA/Dashboard) | 03/10 (baseline 2e7cf81) | ponto de partida; 3 regressões já corrigidas no código |
| `docs/reconciliation/RECONCILIATION_WAVE_TELEFONIA_2026-10-03.md` | ponteiro | — | 03/10 | substituído pelo relatório final |
| `docs/plans/PLANO_SEGUNDA_LEVA_CARTOES_2026-10-08.md` + `SEGUNDA_LEVA_CARTOES_2026-10-08.tsv` | cartões | 253 (23 Telefonia, 6 Team Chat, 6 voz) | 08/10 | vigente |
| `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv/.md` | inventário | ~45 linhas da área | 07/10 | ponto de partida |
| `docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md` (Bloco 13, IA-121–IA-130) | plano | 10 (voz/TTS/STT/comandos) | 29/09 | vigente (fronteira com a área IA) |
| `docs/audits/PLANO_TEAM_CHAT_V3_PARITY_100_ETAPAS_2026-09-27.md` | plano | 100 (checklist apagado) | 27/09 | SUBSTITUÍDO ("concluído" falso, `:3-9`) |
| `docs/audits/AUDITORIA_TEAM_CHAT_V3_PARITY_2026-09-28.md` | auditoria | 21 DONE · 38 PARCIAL · 41 AUSENTE | 28/09 | histórico |
| `docs/audits/PLANO_TEAM_CHAT_REMEDIACAO_100_ETAPAS_2026-09-28.md` | plano | 100 (0 marcadas) | 28/09 | SUBSTITUÍDO |
| `PLANO_TEAM_CHAT_CONCLUSAO_100_ETAPAS_2026-09-29.md` | plano | 100 | 29/09 | SUBSTITUÍDO; só na branch `claude/confident-babbage-ivgmmn` — **não lido** (fora de main) |
| `docs/audits/AUDITORIA_TEAM_CHAT_ESTADO_REAL_2026-09-29.md` | auditoria | 7 DONE · 16 PARC · 3 REGR · 74 AUS | 29/09 13:30Z | origem do plano F |
| `docs/audits/PLANO_TEAM_CHAT_FINALIZACAO_100_ETAPAS_2026-09-29.md` (**F**) | plano | 100 (F01–F100), 0 marcadas | 29/09 14:00Z (PR #1171) | **candidato a vigente** (ver §2) |
| `docs/team-chat/AUDITORIA_TEAM_CHAT_2026-09-29.md` | auditoria | 11 DONE · 33 PARC · 56 AUS + R1–R10 | 29/09 | origem do plano TC |
| `docs/team-chat/PLANO_IMPLEMENTACAO_TEAM_CHAT_100.md` (**TC**) | plano | 100 (TC-01–TC-100), 0 marcadas | 29/09 14:02Z (PR #1174) | candidato concorrente (ver §2) |
| `docs/design/MODULO_INBOX_CHAT_TEAMS.md` (§2.3, §3, §6) | spec descritiva | — | 07/10 | vigente, com divergências (§4) |
| `docs/reconciliation/reports/team-chat/CODE_DATABASE_TRUTH_TEAM_CHAT.md` | reconciliação | 15 achados TC-001–TC-015 | 03/10 | ponto de partida (6 corrigidos depois) |
| `docs/reconciliation/evidence/team_chat_plan_authority_conflicts.json` | evidência | 7 conflitos F×TC | 03/10 | `PRODUCT_DECISION_REQUIRED` |
| `docs/reconciliation/evidence/team_chat_f_tc_crosswalk.json` | evidência | 100 mapeamentos TC→F | 03/10 | usado para o placar TC |
| `docs/audits/AUDITORIA_A11Y_MOBILE_CHAT_INBOX_TEAMS_2026-10-07.md` | auditoria a11y | 10 achados (1 de Teams) | 07/10 | vigente |
| **Código Telefonia:** `src/components/calls/*` (29 arq.), `src/lib/calls/*`, `src/lib/calls/adapters/*`, `src/hooks/calls/*`, `src/hooks/sip/useSipConnection.ts`, `src/hooks/communication/{useSipClient,useCalls,useIncomingCallListener,useCallEngineSink}.ts`, `src/providers/CallSessionProvider.tsx`, `src/App.tsx`, `src/components/layout/AppShell.tsx`, `supabase/functions/{get-sip-password,sync-call-records,get-call-recording,_shared/evolution-webhook-handlers.ts}`, migrations `20260926800000`, `20261002531230`, `20261004172554`, `e2e/telefonia.spec.ts`, `playwright.config.ts`, `.github/workflows/{ci,e2e-logado}.yml`, `tests/contracts/telefonia-*.contract.test.ts` | código | — | até 09/10 | — |
| **Código voz:** `supabase/functions/elevenlabs-*` (9), `voice-agent`, `voice-copilot-action`, `src/hooks/voice/*`, `src/components/layout/VoiceActionBridge.tsx` | código | — | até 09/10 | fronteira IA |
| **Código Team Chat:** `src/components/team-chat/*` (22 arq.), `src/hooks/team-chat/*` (17), `src/hooks/chat/useTeamChat*.ts`, 63 migrations `*team_chat*` + `20261004185228`, `20261006213734`, `20261006214011`, `20261009170000`, `20261003272707`; `scripts/db-audit/team-*.test.sh` (5), `scripts/ci/eslint-baseline.json` | código | — | até 09/10 | — |

---

## 2. Placar por plano

Critério: CONCLUÍDO só com artefato no código/migration; DIVERGENTE feito-mas-não-marcado entra em "concluído" e é
listado na §4. Etapas cujo código existe mas que **não funcionam por falta de secret/infra** contam como concluídas
(o aceite do plano é de código) e aparecem como linha "OP-" na §3.

| Plano | Total | Concluído (verif. no código) | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---|---|---|---|---|---|
| Telefonia — finalização T01–T100 (vivo) | 100 | **78** (74 marcadas + 4 divergentes: T79, T87, T90, T91) | 7 | 8 | 6 | 1 |
| Telefonia — v1.0 (26/09, substituído) | 100 | 27 (auditoria 29/09); restante migrado para T01–T100 | — | — | — | — |
| Ligações WhatsApp `meowcaller` E001–E100 | 100 | 0 | 6 (base pré-existente) | 4 | 90 (gates G0/G1 + dono/infra) | 0 |
| Cartões 2ª leva — Telefonia (SL-002…SL-251) | 23 | 8 | 5 | 8 | 1 | 1 |
| Team Chat — **F** F01–F100 (ledger escolhido, ver abaixo) | 100 | 22 | 32 | 41 | 3 | 2 |
| Team Chat — **TC** TC-01–TC-100 (via crosswalk TC→F) | 100 | 19 (+1 DIVERGENTE: TC-13) | 37 | 36 | 6 | 1 |
| Team Chat — Remediação 28/09 / Paridade V3 27/09 | 100 / 100 | substituídos (V3: 21 DONE em 28/09) | — | — | — | — |
| Cartões 2ª leva — Team Chat (SL-016/043/072/081/082/084) | 6 | 1 | 4 | 1 | 0 | 0 |
| IA Bloco 13 — Voz/TTS/STT/comandos (IA-121–130) | 10 | 0 | 5 | 1 | 0 | 4 |

**Autoridade no Team Chat (pedido explícito):** nenhum dos dois planos está vigente de fato — F (14:00:41Z, PR #1171)
se declara "único ledger vivo"; TC (14:02:35Z, PR #1174, 114 s depois) substitui só os planos E/V3/Remediação e
**não cita F** (`team_chat_plan_authority_conflicts.json` = `PRODUCT_DECISION_REQUIRED`, 7 conflitos). O inventário
de 07/10 rotula F como "OBSOLETA, sucedida por TC", **mas** todo o trabalho executado de 04/10 a 09/10 usa a
numeração F (migration `20261006213734_team_chat_f10_…`, cartões SL-016/043/081/082 = F53-F63/F83-F88/F49-F52/F64-F75)
e os comentários "TC-00x" no código referem-se aos **achados** TC-001…TC-015 do relatório de reconciliação, não às
etapas do plano TC. Ambos seguem com 0/100 caixas marcadas. **Recomendação:** ratificar **F** como ledger (é o que o
trabalho real segue) e registrar TC como linhagem; resolver antes os contratos conflitantes TC-13×F10 (F10 venceu no
banco) e TC-37×F43 (a RPC devolve `jsonb {action,emoji}`, nenhum dos dois). O placar TC acima é derivado do F pelo crosswalk.

---

## 3. Pendências detalhadas

### 3.1 Telefonia — plano vivo T01–T100 (+ itens operacionais)

| ID | Funcionalidade | Estado | Planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| OP-01 (T15/T96) | Linha VoIP em produção | BLOQUEADO | `get-sip-password` entrega servidor/usuário/senha e o agente registra a linha | Função pronta (`supabase/functions/get-sip-password/index.ts:51-57` devolve 503 `SIP_NOT_CONFIGURED` sem `SIP_PASSWORD`); plano registra 401/503 no boot da tela e "conta de QA sem telefone configurado" (plano `:145`, `:595-596`); em produção, nenhuma das 22 ligações registradas em produção foi atendida; a última tentativa VoIP foi em 26/09 e falhou, sem nenhuma ligação depois (leitura em 12/10). Se `SIP_PASSWORD` foi configurado depois disso não foi conferido no painel | Conferir o segredo no painel; se faltar, configurar `SIP_PASSWORD` (e `SIP_SERVER/USER/WS_PORT` se mudar) e confirmar com uma ligação real | Não há prova de que alguém consiga ligar ou receber por VoIP pelo sistema hoje | P0 até a conferência | Joaquim (secret/produção) |
| T11 | Persistência real da chamada SIP | BLOQUEADO | 1 chamada real gera linha com `provider_call_id` e `end_reason` no mesmo id | Código: `src/lib/calls/persistence.ts` (`upsert_my_call`), testes; **0 linhas de chamada desde 30/09** (plano `:65`) | Uma ligação real e o recibo citado | Sem prova de que o histórico grava certo | P1 | OP-01 + agente ao telefone |
| OP-02 (T72/T73) | Gravação e duração oficial (Bitrix24) | BLOQUEADO | `sync-call-records` a cada 5 min (N8N) + `get-call-recording` | Edges existem (`supabase/functions/sync-call-records/`, `get-call-recording/`; `config.toml:73-78`); front pronto (`src/hooks/calls/useCallRecording.ts:13` flag ligada); **sem agendamento** (nenhum cron/N8N no repo — grep vazio; nenhum job no `pg_cron` de produção em 12/10); falta de `BITRIX_WEBHOOK_URL` segundo `docs/CAPACIDADES.md` (segredo não conferido no painel) | Configurar secret e agendamento | Nenhuma das 22 ligações em produção tem gravação (`recording_url` vazio em 12/10); botão "Ouvir" não aparece | P1 | Joaquim (secret + N8N) |
| T06 | Screenshot "antes" + erros de console | PARCIAL | `00-before.png` + `consoleErrors` | Só `qa/tel/06/07/08-after.png` (git) | "Antes" é inviável (tela já mudou); registrar como obsoleto | Nenhum | P3 | — |
| T75 | Motion sob reduced-motion | PARCIAL | KPI fade 150 ms, troca de painel 120 ms, `whileTap 0.98`, tudo sob `useReducedMotion` | `CallResultCell.tsx:29` usa `motion-safe:animate-pulse`; `ActiveCallPanel.tsx:59` `AnimatePresence`; `CallDialog.tsx:232` `whileTap scale 0.9`; **nenhum `useReducedMotion` em `src/components/calls`** | Aplicar regras de motion e reduced-motion | Desconforto para quem desativa animações | P3 | — |
| T76/T84 | Acessibilidade (axe 0 serious/critical) | PARCIAL | axe real na tela ociosa e com chamada ativa; teclado/aria | `src/components/calls/__tests__/TelefoniaView.a11y.test.tsx` (axe em jsdom, 3 estados); `CallHistoryTabs.tsx:22-33` corrigiu `aria-controls` (A11Y-01) | axe em navegador real; contraste medido; alvos 44 px (A11Y-09) | Risco de inacessibilidade para leitores de tela/mobile | P2 | — |
| T77 | Responsivo (<1280 Sheet, 390 px) | NAO_INICIADO | Painel vira `Sheet`, `CallRowMobile`, KPIs 2 col | Nada (`grep Sheet|CallRowMobile src/components/calls` vazio) | Implementar layouts | Telefonia ruim em notebook pequeno/celular | P2 | SL-106 |
| T78 | Contraste WCAG 3 temas | NAO_INICIADO | `telefonia-baseline-2026-09-29/contraste.md` | Pasta só tem `pos-fase-0.json` | Medir e registrar | Textos possivelmente ilegíveis (A11Y-02 aponta `text-foreground-secondary`) | P3 | SL-238 |
| T80/T88 | Fechamentos das fases 8 e 9 | NAO_INICIADO | gates + screenshots + axe; PR de testes | — | Fechar as fases | Nenhum direto | P3 | T75–T87 |
| T81–T83 | Scripts de QA `measure/colors/func` | NAO_INICIADO | Medições de layout, cor e 20 checks funcionais | Scripts eram "fora do repo" (`/workspace/qa/tel/`); no repo só PNGs | Escrever/rodar (ou trocar por testes no repo) | Sem verificação automática de regressão visual/funcional | P3 | SL-240 |
| T85 | Cobertura do motor SIP | PARCIAL | 486/480/603, reconexão, DTMF; `calls-access.test.ts` sem `todo`; `lib/calls` 100 % branches | Muitos testes (CallEngine, useSipClient, useSipConnection); `calls-access.test.ts:259` e `:263` ainda `it.todo` (escopo `all` e espera/transferência) | Remover os 2 `todo` e medir cobertura | Menos rede contra regressão | P3 | SL-111 |
| T86 | E2E Telefonia no CI | PARCIAL | `e2e/telefonia.spec.ts` verde nos 3 navegadores, ligado no `e2e-logado.yml` | Spec existe (mockada, 8 testes, `e2e/telefonia.spec.ts:190-371`), projeto `chromium-telefonia` em `playwright.config.ts:107-108`; **não está** na lista de projetos de `ci.yml:417` nem de `e2e-logado.yml:130` | Incluir no CI | Regressão do discador passa sem aviso | P2 | SL-107 |
| T92 | CAPACIDADES/CONTRATO revisados | PARCIAL | Documentos batem com o código final | `docs/telefonia/CAPACIDADES.md:22` ainda diz SIP "hardcoded em `useSipClient.ts:15-17`" (T15 removeu) | Revisar contra o código | Documento engana quem dá suporte | P3 | — |
| T93 | Snapshot final do banco | BLOQUEADO | `final.json` + diff contra `pos-fase-0.json` | Ausente | Rodar `telefonia-snapshot.mjs` com `DESTINO_URL` | Nenhum direto | P3 | Produção proibida a agente |
| T94/T95 | Deploy das Edges e verificação em produção | BLOQUEADO | Deploy aprovado + `curl` com 5 campos; Vercel READY | Desde #1901 o deploy de Edges é automático no push da main; não verificado o estado em produção | Confirmar versões e `curl` | Correções podem não estar no ar | P1 | Joaquim |
| T96/T97 | Homologação de áudio (9 cenários) + 0 presas em `ringing` | BLOQUEADO | 9 linhas reais com ids | `docs/telefonia/HOMOLOGACAO.md` com tabela vazia (`:69-77`); cenário 8 cita linha `wpp2` que não existe (`CAPACIDADES.md:26`) | Executar com agente real | Módulo nunca foi homologado ("só aqui é pronto") | P0 | OP-01, OP-02, Joaquim |
| T89 | Gates completos + bundle do chunk `calls` | NAO_VERIFICAVEL | 8 saídas exit 0 | Não rodado nesta varredura | Rodar e registrar | — | P3 | SL-249 |
| T99 | Seção "Telefonia" no CLAUDE.md | NAO_INICIADO | Provedor SIP, secret, RPCs, `notes`×`agent_notes`, merge≠deploy | `CLAUDE.md` sem seção Telefonia | Escrever | Agentes repetem erros de contrato | P3 | SL-244 |
| SL-018 | Espera, transferência, conferência | NAO_INICIADO | Lacuna herdada (fora das 100 etapas) | `calls-access.test.ts:263` `it.todo` | Decidir se entra no produto | Atendente não consegue transferir ligação | P2 | Decisão do dono + provedor |
| SL-246/ACH-2 | Escolha de saída de áudio / alto-falante | NAO_INICIADO | `setSinkId` | Inexistente (`CallDialog.tsx:249` comentário) | Implementar onde suportado | Não dá para trocar fone/alto-falante | P3 | — |
| TEL-047/048/049/050/051/058 | Itens da auditoria de 60 sem etapa no plano vivo | NAO_INICIADO | Contexto de empresa na chamada; retorno vinculado a tarefa; histórico igual no contato e na Telefonia; exportação; credencial SIP por usuário; diagnóstico correlacionado | Histórico por contato usa leitura própria (`src/hooks/chat/journey/useJourneyCalls.ts:115`, `useCalls.ts:75-89`); ramal único (D1); exportação conflita com "nenhuma informação sai do sistema" | Decidir/planejar | Dados de ligação inconsistentes entre telas; um ramal compartilhado por todos | P2–P3 | D1, regra de não-exportação |

### 3.2 Ligações pelo WhatsApp — plano `meowcaller` E001–E100 (+ caminho oficial)

| ID | Funcionalidade | Estado | Planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| WA-00 | Fazer/atender ligação WhatsApp **com áudio** no sistema | NAO_INICIADO | Pedido do dono (análise `:3`) | Só eventos: `WhatsAppCallAdapter.dial` → `NotSupportedError` (`src/lib/calls/WhatsAppCallAdapter.ts:63-69`), "Ignorar" (`:56`); `CallSessionProvider.tsx:405` disca sempre `channel:'voip'`; pedido `whatsapp` do inbox não é interceptado (`:433-443`) | Escolher caminho e executar | Cliente que liga pelo WhatsApp só é atendido no celular; não dá para ligar pelo WhatsApp | P0 | Decisão do dono |
| WA-A | Caminho A — Meta Calling API (recomendado) | NAO_INICIADO | Recomendação da análise (`:41`): número na Cloud API, limite ≥ 2.000, tarifa BRL | **Não existe plano** para o caminho recomendado; nenhum código de Cloud API | Dono confirmar no Business Manager (limite, migração do número, tarifa) e escrever plano | Caminho seguro (sem risco de banimento) parado | P0 | Dono (Business Manager) |
| E001–E003, E006, E009 | Governança: número reserva, aceite de risco, parecer jurídico, onde roda a Evolution GO, papéis | BLOQUEADO | Decisões escritas do dono | Nada | Decisões | Sem elas nada do plano anda (G0) | P0 | Joaquim |
| E004, E005, E007, E008 | ADR do motor, contrato `WhatsAppCallEngine`/`MediaTransport`, métricas, registro de riscos | NAO_INICIADO | Documentos/interfaces executáveis já | `docs/adr/` sem ADR de chamadas; nenhuma interface (`grep MediaTransport|WhatsAppCallEngine` vazio) | Escrever | Arquitetura trocável não existe | P2 | — |
| E010–E022 | Laboratório (F1): fork da Evolution GO com PR #141, 30 chamadas de teste, gate G1 | BLOQUEADO | Lab isolado em número reserva | Nada (`grep meowcaller` vazio) | Executar após G0 | Sem prova de viabilidade | P1 | G0 + infra (só o dono tem acesso à VPS) |
| E023–E044 | Motor/infra e gateway seguro `wa-call-gateway` (ticket, 1 consumidor, contrapressão, auditoria) | BLOQUEADO | Fork, imagem, gateway com JWT+ticket | Nada | — | — | P1 | G1 |
| E045–E050, E053–E054 | Política por conexão `whatsapp_call_policy`, `call_recordings`, Edge `whatsapp-call`, checagem de número, chamadas fantasma | BLOQUEADO | Migrations + Edge | Nada (sem tabela/Edge) | — | — | P1 | G1 |
| E051/E052 | Webhook CALL completo + mapa de motivos | PARCIAL | `offer/accept/terminate` idempotente; mapa → `end_reason` | T25/T26 feitos: `_shared/evolution-webhook-handlers.ts` + migration `20261002531230` (direção) + `20261004172554` (fecha overload) | Completar motivos de término e reenvio | — | P2 | G1 |
| E055–E066 | Ponte de áudio no navegador (AudioWorklet, jitter buffer, reamostragem) | BLOQUEADO | PCM16 por WebSocket | Nada | — | — | P1 | G1 |
| E067–E070, E074, E078 | Seleção de canal no provider, adapter com motor, mapa de estados, "atendida em outro aparelho", conflito entre canais | BLOQUEADO | — | Máquina de estados VoIP existe (`src/lib/calls/session.ts`); canal ignorado | — | — | P1 | G1 |
| E071, E073, E075, E076 | Alerta com Atender/Recusar, menu por capacidade, persistência com canal, histórico mostra canal | PARCIAL | — | `IncomingCallAlert` com selo de canal e "Ignorar"; `useCallChannels` (`canDial:false`); `upsert_my_call` aceita canal; `CallChannelBadge` no histórico | Ligar ao motor real | — | P2 | G1 |
| E077, E079–E096 | Barra ativa, mobile, docs, conformidade (guarda de saída, limite diário, aquecimento, pausa, kill-switch 3 níveis, gravação com consentimento, LGPD), testes (soak, caos, matriz) | BLOQUEADO | — | Nada | — | Risco de banimento e LGPD se pular | P1 | G1/G2/G3 |
| E097–E100 | Piloto 14 dias e decisão sobre o número principal | BLOQUEADO | Piloto em número reserva; G4 | Nada | — | — | P1 | Dono (G4) |

### 3.3 Voz / ElevenLabs (fronteira com a área IA — dono principal: IA)

| ID | Funcionalidade | Estado | Planejado | O que existe hoje | O que falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| IA-127 / SL-008 (B4) | Lista fechada de vozes/modelos TTS | NAO_INICIADO | Só vozes autorizadas geram áudio | `supabase/functions/_shared/schemas.ts:169` aceita `voice_id` livre (máx. 100) | Allowlist + revogação | Qualquer voz (inclusive clonada) pode ser usada | P1 | — |
| IA-127 / SL-007 (B3) | Criar voz exige papel e auditoria | CONCLUÍDO | — | `elevenlabs-voice-design/index.ts:76-85` (`is_admin_or_supervisor` + `audit_logs`) | — | — | — | — |
| IA-123 | Transcrição revisável (original + correção) | NAO_INICIADO | Versão original preservada | Nenhuma tabela/coluna de correção (grep vazio) | Modelo de dados + UI | Correção humana apaga o original | P2 | — |
| IA-125/126 | Reprodução/streaming e confirmação de áudio enviado | PARCIAL | Estados separados gerado/prévia/enviado | Testes novos `VoiceChangerPicker.preview-send.test.tsx`, `playTtsAudio.ts` alterado (#1900) | Fechar aceite do bloco | — | P2 | — |
| IA-129/SL-015 (L4) | Comandos de voz autenticados e por papel | PARCIAL | Sessão + permissão + confirmação | `voice-copilot-action/index.ts:100-133` checa visibilidade e papel para atribuir | Confirmação contextual de efeitos | — | P2 | — |
| IA-130 | Comandos realmente executados | PARCIAL | Mudança observável, não só toast | `src/components/layout/VoiceActionBridge.tsx` + `src/hooks/voice/voiceActionPlan.ts` (navega) | Buscar/filtrar/ordenar ligados ao estado | — | P3 | — |
| IA-121/122/124/128 | Contrato STT, limites de arquivo, transcrição automática sem duplicar, diálogos/STS/efeitos | NAO_VERIFICAVEL | — | Não auditado em profundidade nesta área | — | — | P2 | Área IA |
| SL-013 (B6) | Toda chamada paga no ledger | CONCLUÍDO (verif. superficial) | — | `logAiUsage`/uso presente nas 9 `elevenlabs-*` e `voice-agent` | — | — | — | — |

### 3.4 Team Chat — plano F (F01–F100), com equivalência TC e achados da reconciliação

| ID (F / TC / achado) | Funcionalidade | Estado | Planejado | O que existe hoje | O que falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| F06 / TC-12 / R1 | Anexos: ler e apagar os próprios arquivos (storage) | NAO_INICIADO | Policies SELECT/DELETE por `current_profile_id()` | `20260927270012_team_chat_e21_storage_select_policy.sql:3` compara pasta com `auth.uid()` (pasta real é `profiles.id`, `uploadTeamMedia.ts:33-35`); nenhuma migration posterior toca o bucket | Recriar policies | Remetente não apaga o próprio anexo; leitura depende só do vínculo pela mensagem | P1 | trilha de banco |
| F09 / TC-18 / R5 | Vocabulário único de auditoria de departamento | PARCIAL | 8 verbos, código fora de `details` | `20261006213734:70-76` só **acrescentou** `whatsapp_updated` aos 12 verbos antigos; `create_department_invite` grava o código em `details` (`20260928520000:6`) | Unificar vocabulário | Trilha de auditoria confusa | P3 | — |
| F12 / R9 | Autorização por `is_admin_or_supervisor` | PARCIAL | Nada lê `profiles.role` | Membros/F10 migrados (`20261004185228`, `20261006213734`); `create_department_invite` ainda usa `profiles.role` (`20261003272707:342`) | Migrar o restante | Admin por `user_roles` pode ser negado | P2 | — |
| F13, F14, F20, F36, F48 | Trava de reserva por holder; snapshots pós-bloco | NAO_INICIADO / PARCIAL | `register-migration --holder`; `team-chat-snapshot.mjs` | DDL dos blocos aplicado (63 migrations `team_chat`); sem `--holder`, sem script de snapshot (`ls scripts/db-audit`) | Snapshot e trava (F13 pode estar obsoleto com o fluxo local de 04/10) | Nenhum direto | P3 | — |
| F15–F17 / TC-17, TC-28 | Convites: código 8 chars, uso único, `already_member`, e-mail | NAO_INICIADO | Nova assinatura e CHECKs | RPC antiga (12 chars base64, `20260928520000:6`); `accept` sem `already_member` (grep 0); front gera código próprio e grava na tabela **legada** `department_invites` (`useDepartmentManagement.ts:141`) | Reescrever RPCs + front | Código reutilizável/inconsistente | P2 | F62 |
| F18, F32 / TC-009 / A7c | Recibos e reações com `conversation_id` forçado | PARCIAL | Trigger força cid; rejeita recibo do próprio | Trigger só preenche NULL (`20260929440000:6-12`); reações sem trigger | Trigger de força | Agregações erradas | P3 | — |
| F21, F22, F23 / TC-09, TC-10 | Contrato RLS amplo no CI, fixtures E2E, gates locais | PARCIAL / NAO_INICIADO | `team-chat-rls.sql` com 3 papéis; `e2e/fixtures/team-chat.ts`; `team-chat-local-gates.sh` | 5 contratos SQL no `db-guard.yml:376,806,831,839,848`; `rls-contract.test.ts` ainda `it.todo`; sem fixtures nem script | RLS por papel real e fixtures | RLS não provada de ponta a ponta | P1 | — |
| F24, F25 / TC-08, TC-98 | Decisões registradas e seção "Team Chat" no CLAUDE.md | NAO_INICIADO | §10 preenchida; CLAUDE.md | §10 "(preencher)" nos dois planos; CLAUDE.md sem seção | Escrever | Agentes repetem o drift de setembro | P2 | ratificação F×TC |
| F29 / TC-002 | Conversa direta sem duplicar | PARCIAL (regressão) | Par ordenado + `ON CONFLICT` | `find_or_create_direct_conversation` insere sem par (`20261003272707:607-610`); corrida possível | Restaurar par/UPSERT | Duas conversas diretas com a mesma pessoa | P2 | — |
| F35 | Fechar escrita em `department_invites` | NAO_INICIADO | REVOKE + SELECT só admin | Só TRUNCATE/anon revogados (`20260928450000:20`, `460000:20`) | Revogar após migrar front | Agente pode listar/criar códigos | P2 | F62 |
| F38–F42 / TC-15, TC-32–35 / A7a/b | Índice keyset, página por cursor, leitura em lote, view de leitura, busca com trecho | PARCIAL / NAO_INICIADO | Índice `(cid,created_at,id)`, view `team_message_read_state`, `snippet` | RPCs existem (e38–e40) mas: índice ausente (grep vazio), sem desempate por id e sem piso em `p_limit` (`20260930280000:77-78`), view inexistente, busca sem `snippet` | Completar | Lentidão/pulos de mensagem quando adotar RPC | P3 | — |
| F43 / TC-37 | Contrato de reação | PARCIAL (conflito) | `boolean` (F) / `{reacted}` (TC) | RPC devolve `jsonb {action,emoji}` (`20260930260000:63-73`); front nem usa a RPC | Decidir contrato | — | P3 | decisão |
| F46 / TC-38 / TC-004 | Sair/remover membro com promoção de dono | PARCIAL (quebrado) | Último owner + promoção | RPCs usam coluna inexistente `tcm.role` (`20261003272707:1017,1035,1313`); front faz DELETE direto (`useTeamChatMutations.ts:168,190`) | Corrigir RPC e migrar front | Grupo pode ficar sem dono | P2 | — |
| F47 / TC-40, TC-41, TC-72 | `set_profile_department`, `request_department_access`, `notify_team_mentions` | NAO_INICIADO | 3 RPCs | Nenhuma existe (grep 0 em migrations) | Criar | Sem menção com notificação, sem pedido de acesso | P2 | — |
| F49–F52 / TC-45, TC-46, TC-55 / SL-081 | README de canais, tipos derivados, fábrica de queryKeys | NAO_INICIADO / PARCIAL | `README.md`, `queryKeys.ts` | Ausentes; `teamChatTypes.ts` manual | Escrever | Manutenção difícil | P3 | — |
| F53–F55, F59, F60 / TC-47–49, TC-53, TC-54 / SL-016 | Camada de dados sobre as RPCs novas | NAO_INICIADO / PARCIAL | `get_team_inbox`, `get_team_messages_page`, `mark_team_conversation_read`, reações por realtime, ticks por view | **Nenhuma** RPC nova é chamada no front; `useTeamConversations.ts:17-37` = 3 consultas + RPCs deprecated; `useTeamMessages.ts:19-29` lê 200 msgs direto e grava recibos direto (`:80-89`, inclusive com aba oculta); `useTeamMessageReactions.ts:52,89-92` direto | Migrar hooks | Tick "lido" nunca aparece (nada grava `team_messages.status='read'`); risco de lentidão | P1 | — |
| F58 / TC-52 | Mutações | PARCIAL | sonner, RPCs de pref/leave/transfer | Mute por membership feito (`useTeamChatPanel.ts:97-102`); `use-toast` ainda em `useTeamChatMutations.ts`; rename por UPDATE direto | Terminar | — | P3 | — |
| F61 | Rascunho com colar imagem | PARCIAL | Teste de `handlePaste` | `useTeamChatDraft.test.tsx` sem caso de paste (grep) | Teste | — | P3 | — |
| F62, F77, F76, F78–F81 / TC-69–TC-74 / TC-005 | Gestão de departamento (membros, convites, WhatsApp, auditoria, "Entrar via código", admin abre canal) | NAO_INICIADO / PARCIAL | Tudo por RPC segura; "Entrar via código"; admin acessa qualquer canal | **Inacessível**: `TeamChatView.tsx:33-38` não passa `canManageDepartments` (botão em `TeamConversationList.tsx:191`); salvar WhatsApp grava na tabela inexistente `department_whatsapp_configs` com `@ts-expect-error` (`useDepartmentManagement.ts:243-246`); auditoria inserida direto com `user.id` (`:144,165,189,213,248`); membros por UPDATE em `profiles` (`:185,209`); leitura do modo por `get_department_whatsapp_mode` (`20261009170000`) ok; bloqueio de canal sem saída (`TeamChatPanel.tsx:27,77-95` só "Solicite um convite") | Ligar UI à RPC `get/set_department_whatsapp_config` (F10 já no banco), convites, entrada por código, override de admin | Ninguém administra canais de departamento; agente bloqueado não tem como entrar | P1 | F15–F17, F47 |
| F64, F65 / TC-57, TC-58 | Painel e item de mensagem | PARCIAL / NAO_INICIADO | Composição, ErrorBoundary, tokens `chat-sent/received`, "Mensagem apagada" | Composição feita (`TeamChatPanel.tsx:13,146`, 185 linhas); sem ErrorBoundary; `TeamMessageItem.tsx:124,166` `bg-white/10`; sem tokens de chat nem "Mensagem apagada" | Terminar | Cor fixa quebra temas | P3 | — |
| F66 / TC-59 | Cabeçalho: fixar, arquivar, renomear, sair, transferir, estatísticas | NAO_INICIADO | 6 ações persistentes | `TeamChatHeader.tsx:266-272` Fixar/Arquivar `disabled`; `:150-156` "Performance (em breve)"; Panel não passa `onToggleStats/onTransfer/onRenameGroup/onLeaveGroup` (`TeamChatPanel.tsx:101-105`) | Ligar | Usuário não consegue organizar nem sair de grupos | P1 | — |
| F67 / TC-60 | Tokens e contraste do módulo | NAO_INICIADO | Zerar `bg-black/bg-card/bg-background`; apagar CSS próprio | 12 ocorrências em 8 arquivos (grep); `src/styles/team-chat-tokens.css` existe | Trocar tokens + medir | Contraste ruim em temas | P3 | — |
| F69 / TC-62 | Busca no servidor | PARCIAL | `search_team_messages`, achar fora das 50 primeiras | Busca local com debounce 400 ms só no que já carregou (`useTeamChatPanel.ts:222-224`) | Usar RPC | Mensagem antiga não é encontrada | P2 | F42 |
| F70 / TC-63 | Lista de conversas | NAO_INICIADO | debounce, `aria-setsize`, ⌘F, chip "Arquivadas", skeleton | Nada disso (grep); `role="listbox"` vazio inválido (`TeamConversationList.tsx:123`, A11Y-03) | Implementar | Sem arquivadas; falha de a11y | P3 | — |
| F71, F72, F75 / TC-64, TC-65, TC-67 | Gestão de grupo, transferência de departamento, estatísticas | NAO_INICIADO | Diálogos ligados | `GroupManagementDialog.tsx`, `TransferConversationDialog.tsx`, `ParticipantStatsGraph.tsx`, `TeamPerformancePanel.tsx` **sem importador**; `useTeamChatPanel.ts:59,90-93` cria estado/mutações sem UI | Ligar | Funções prontas invisíveis | P2 | — |
| F73 / TC-66 | Presença real | NAO_INICIADO | `useAgentPresenceMap` | "Online/Offline" vem de `is_active` (conta ativa) — `TeamMemberProfileHeader.tsx:74,81-82`, `TeamMemberDetails.tsx:77`; `useTeamPresence.ts` órfão | Usar presença real | Mostra "Online" para quem está desligado | P2 | — |
| F74 | Voz do TTS persiste | NAO_INICIADO | Panel usa `handleVoiceChange` | `handleVoiceChange` persiste (`useTeamChatPanel.ts:121-135`) mas o Panel passa `s.tts.setVoiceId` (`TeamChatPanel.tsx:104`) | Trocar o callback | Preferência de voz se perde no reload | P3 | — |
| F83 / TC-76 / SL-043 | Badge "Teams" na barra lateral | PARCIAL | Contador com módulo fechado | `useTeamUnreadTotal.ts:19` + teste, **sem consumidor**; `Sidebar.tsx:146-149` só inbox/tarefas | Ligar | Mensagem interna passa despercebida | P1 | — |
| F85 / TC-78 | "Digitando…" | PARCIAL | Indicador em lista/cabeçalho | `useTeamTyping.ts:13` + teste, **sem consumidor** | Ligar em `TeamChatInputArea` | — | P3 | — |
| F86 / TC-79 | Menções com notificação | PARCIAL | Autocomplete de membros + `notify_team_mentions` | `TeamChatInputArea.tsx:10,136` usa o `MentionAutocomplete` do inbox; RPC de notificação inexistente | RPC + lista de membros | Mencionado não é avisado | P2 | F47 |
| F87 / TC-68, TC-80 | Push → abre conversa / `?cid=` na URL | BLOQUEADO / NAO_INICIADO | `notificationclick` + `cid` | Sem leitura de `cid` em `TeamChatView.tsx`; push desligado por decisão (cartões, `PLANO_SEGUNDA_LEVA_CARTOES:7`) | `cid` na URL pode ser feito já | Link para conversa não existe | P3 | decisão (push) |
| F88 / TC-81 | Realtime robusto | PARCIAL | `removeChannel` + log de `CHANNEL_ERROR` + refetch on reconnect | `removeChannel` em 6 pontos; nenhum `CHANNEL_ERROR` (grep) | Completar | Conversa "congela" sem aviso | P3 | — |
| F89–F91, F93 / TC-83–85, TC-87 / SL-084 | Testes do módulo | PARCIAL | Hooks, RTL, 0 tautologias, baseline ESLint limpa | 0 `expect(true).toBe(true)` (grep); **32 `it.todo`** (30 com títulos corrompidos em `team-chat-exhaustive-audit.test.ts:37+`, 1 em `team-chat-comprehensive`, 1 em `rls-contract.test.ts`); 5 entradas `team-chat` no `eslint-baseline.json` | Converter/apagar todos e testes RTL de lista/cabeçalho | Cobertura aparente maior que a real | P3 | — |
| F92 / TC-86 | Faxina de órfãos | NAO_INICIADO | Apagar arquivos sem uso | `src/i18n/team-chat.ts`, `TeamChatA11y.tsx`, `team-chat-tokens.css`, `scripts/team-chat-db-validate.mjs` existem | Apagar ou ligar | — | P3 | — |
| F94 / TC-88 | E2E Team Chat | NAO_INICIADO | `e2e/team-chat.spec.ts` | Não existe | Escrever | Sem rede para o módulo | P2 | F22 |
| F96 / TC-90 | Remover RPCs deprecated | NAO_INICIADO | DROP `get_team_conversation_previews/unread_counts` | Front ainda as usa (`useTeamConversations.ts:36-37`) | Migrar antes | — | P3 | F53 |
| F95, F99 / TC-91, TC-93–96 | Medição em produção e teste com 2 usuários reais | BLOQUEADO | `pg_stat_statements` 1 semana; checklist funcional | Nada | Executar | Módulo nunca validado com uso real | P1 | Joaquim/produção |
| F98, F100 / TC-97, TC-99, TC-100 | Paridade final e encerramento | NAO_INICIADO | Diff final, checklist, CLAUDE.md | Nada | — | — | P3 | todo o resto |
| F01, F97 | Congelar sessão paralela; reservas pendentes | NAO_VERIFICAVEL | — | Histórico/produção | — | — | P3 | — |
| SL-016 / B8 | DM sem consentimento do alvo | NAO_INICIADO | Regra de consentimento | Nenhuma migration altera (`INVENTARIO`) | Decidir regra | Qualquer um abre DM com qualquer colega | P3 | decisão |
| A2 | Quem pode inscrever terceiros em grupo | PARCIAL | Só admin/supervisor inscreve outro perfil | `20261004185228:20` exige `member_role='member'` mas qualquer membro inscreve qualquer perfil | Restringir | Membro adiciona pessoas sem controle | P2 | — |

---

## 4. Divergências doc × código

1. **Cópia órfã do plano de Telefonia:** `docs/plans/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md:3` diz "PLANEJADO — nada executado" e `:6` "217 testes, 0 consumidores", com T10–T13, T15–T17, T19–T74 abertas; o ledger vivo `docs/design/…:3` e o código (`src/providers/CallSessionProvider.tsx`, `src/hooks/calls/*`, `src/components/calls/*`) mostram as fases 0–7 entregues.
2. **T79 marcado aberto, aceite cumprido:** `scripts/ci/eslint-baseline.json` não tem nenhuma entrada de `src/components/calls|src/hooks/sip|useSip` (grep 0).
3. **T87 marcado aberto, entregue:** `docs/telefonia/HOMOLOGACAO.md` existe com roteiro e 9 cenários (`:56-77`).
4. **T90 marcado aberto, entregue:** `VoIPPanel.tsx` foi apagado (#1911); `grep VoIPPanel src` só em testes.
5. **T91 marcado aberto, entregue:** `useCalls` só expõe `addCallNotes`/`getContactCalls` (`src/hooks/communication/useCalls.ts:32-43,91-94`); `useCallHistory` não existe mais.
6. **Resíduo ACH-3 desatualizado:** plano `:588-589` e `TELEFONIA_STATUS.md:653` dizem "nenhum teste renderiza AppProviders/App"; existe `src/providers/__tests__/AppProviders.test.tsx` (SL-108, #1911).
7. **Resíduo ACH-1 desatualizado:** plano `:591-592` "split-brain não verificado"; `VoIPPanel` sumiu e `ActiveCallBar.tsx:63,71` usa `accept`/`hangup` do provider; o único `makeCall` cru está dentro do provider (`CallSessionProvider.tsx:411`).
8. **Contagem do encerramento:** plano `:558` "73 das 100 marcadas"; o arquivo tem 74 `[x]` (T98 marcado depois).
9. **CAPACIDADES desatualizado:** `docs/telefonia/CAPACIDADES.md:22` "SIP hardcoded em `useSipClient.ts:15-17`"; T15 levou os defaults para a Edge (`supabase/functions/get-sip-password/index.ts:13`; `grep bitrixphone src` = 0).
10. **Homologação cita linha inexistente:** `HOMOLOGACAO.md:19,60` exige linha WhatsApp `wpp2`; `CAPACIDADES.md:26` "Não existe linha `wpp2`".
11. **Reconciliação de 03/10 superada pelo código (3 "ACTIVE_REGRESSION"):** filtros `all`/período (`TELEFONIA_IA_DASHBOARD.md:35`) corrigidos em `src/hooks/calls/useMyCalls.ts:35-41,57-60`; gravação binária tratada como JSON (`:41`) corrigida em `src/hooks/calls/useCallRecording.ts:16-24,75-87`; casamento ambíguo do Bitrix (`:47`) corrigido em `supabase/functions/sync-call-records/index.ts:18-22,46-77`.
12. **MODULO_INBOX_CHAT_TEAMS.md §2.3 promete o que a tela não tem:** diz que o painel expõe "renomear; adicionar/remover membro; sair; apagar conversa; transferir (`TransferConversationDialog`); estatísticas (`TeamPerformancePanel`)" e que a lista abre a gestão de departamento "quando `canManageDepartments`"; no código esses componentes não têm importador, o cabeçalho não recebe os callbacks (`TeamChatPanel.tsx:101-105`) e `TeamChatView.tsx:33-38` nunca passa `canManageDepartments`.
13. **Inventário 07/10 diz "RPCs do Team chat (C″) IMPLEMENTADA F37-F46":** `leave_team_group`/`remove_team_member` referenciam `tcm.role`, coluna que não existe (`20261003272707:1017,1035,1313`; o catálogo só tem `member_role`) — e o próprio comentário de `20261004185228:217` adia a correção (TC-004).
14. **Inventário 07/10 rotula o plano F como "OBSOLETA, sucedido por TC":** o trabalho posterior segue a numeração F (`20261006213734_team_chat_f10_…`; cartões SL-016/043/081/082 citam F-IDs); nenhum dos dois planos tem caixa marcada.
15. **Rótulo "Online/Offline" no Team Chat:** a UI apresenta presença, mas o dado é `profiles.is_active` (conta ativa), `TeamMemberProfileHeader.tsx:81-82`.
16. **Ticks de leitura no Team Chat:** o tipo prevê `read` (`src/hooks/team-chat/teamMessageStatus.ts:1`), mas nenhuma migration grava `team_messages.status='read'` (nem `mark_team_conversation_read`, `20260929280000:6`), e o front grava recibos direto — o tick "lido" nunca aparece.
17. **TC-13 (plano TC) × banco:** TC-13 manda abrir `get_department_whatsapp_credentials` a `authenticated`; o banco seguiu F10 (nova `get_department_whatsapp_config`, credenciais seguem só `service_role`, `20261006213734`) — TC-13 não deve ser executado como escrito.

---

## 5. Achados fora dos planos

| Achado | Evidência | Observação |
|---|---|---|
| Botão "Performance (em breve)" desabilitado | `src/components/team-chat/TeamChatHeader.tsx:150-156` | Cartão de inventário (Chat interno, P2): implementar ou remover |
| Itens "Fixar conversa" e "Arquivar" desabilitados | `TeamChatHeader.tsx:266-272` | RPC `set_team_member_pref` existe no banco, sem uso |
| 4 componentes prontos sem importador | `GroupManagementDialog.tsx`, `TransferConversationDialog.tsx`, `ParticipantStatsGraph.tsx`, `TeamPerformancePanel.tsx` | Código morto até ligar |
| Estado/mutações sem UI | `useTeamChatPanel.ts:59,90-93` (`showGroupManagement`, rename/remove/leave/delete) | Nada renderiza |
| Hooks prontos sem consumidor | `useTeamUnreadTotal.ts`, `useTeamTyping.ts`, `useTeamPresence.ts` | Badge/digitando/presença |
| Gravação de WhatsApp de departamento em tabela inexistente | `useDepartmentManagement.ts:243-246` (`@ts-expect-error`), `scripts/db-audit/known-violations.json` | Única violação conhecida do usage-guard |
| Canal de departamento bloqueado sem saída | `TeamChatPanel.tsx:88-92` ("Solicite um convite ao administrador") | Não há "Entrar via código" nem pedido de acesso |
| Validador legado com contratos errados | `scripts/team-chat-db-validate.mjs` (consulta `team_members`, `department_invites.token`) | Pode reportar sucesso falso |
| 30 `it.todo` com títulos corrompidos | `team-chat-exhaustive-audit.test.ts:37,57,61,65,70…` ("mey messages", "imagesmages") | Contam como suíte sem testar |
| E2E de Telefonia fora do CI | `playwright.config.ts:107-108` vs `ci.yml:417`, `e2e-logado.yml:130` | Spec só roda manualmente |
| Flag de gravação ligada sem fonte | `useCallRecording.ts:13` `SERVICO_DE_GRAVACAO_ATIVO = true` | Correto por desenho, mas nunca exercitado |
| `sync-call-records` sem agendador no repo | `supabase/config.toml:73-74` (`verify_jwt=false`); nenhum cron/N8N | Depende de infra externa |
| Ramal único compartilhado | D1, `docs/CAPACIDADES.md`; 403 → `line_in_use_other_user` | Dois agentes disputam a mesma linha |
| Canal WhatsApp invisível para agente comum | D8, `src/lib/calls/capabilities.ts:21,48` ("Disponível para supervisores") | Decisão do dono; agente não vê a linha |
| Webhook ElevenLabs só grava auditoria | `supabase/functions/elevenlabs-webhook/index.ts:1-20` | Nenhum consumidor dos eventos (pós-conversa) |
| `useCalls.getContactCalls` lê `calls` direto, sem a tradução de resultado da Telefonia | `src/hooks/communication/useCalls.ts:75-89` | Risco de histórico diferente entre contato e Telefonia (TEL-049) |
| Não planejado em nenhum plano | — | URA/menu de voz, discador automático, transcrição/resumo de ligação, ramal por agente, vídeo/threads no Team Chat (só "responder"), comandos "/" e fila offline no Team Chat (listados como follow-up fora de escopo) |

---

## 6. Top 10 da área

1. **Ligações pelo WhatsApp com áudio dentro do sistema não existem**: o caminho recomendado (Meta Calling API) não tem plano e o plano `meowcaller` está 0/100, parado no gate G0 (número reserva, aceite de risco, parecer jurídico — decisões do dono).
2. **VoIP sem prova de funcionamento em produção**: `get-sip-password` responde 503 quando falta `SIP_PASSWORD` (segredo não conferido no painel); nenhuma das 22 ligações registradas em produção foi atendida; última tentativa VoIP em 26/09, com falha; a homologação de 9 cenários (T96) nunca rodou.
3. **Gestão de departamento do Team Chat inacessível e quebrada**: a permissão nunca é passada, salvar WhatsApp grava em tabela inexistente, convites na tabela legada; quem está fora do departamento fica bloqueado sem "Entrar via código".
4. **Team Chat ainda no contrato antigo**: nenhuma das RPCs novas é usada; o tick "lido" nunca aparece; a busca só acha mensagens já carregadas.
5. **Gravação e duração oficial das ligações sem fonte**: nenhuma das 22 ligações em produção tem gravação e não há job agendado (12/10); a falta de `BITRIX_WEBHOOK_URL` vem dos docs e não foi conferida no painel.
6. **Ações de conversa do Team Chat mortas**: Fixar/Arquivar desabilitados, Performance "em breve", renomear/sair/transferir/estatísticas sem tela (componentes órfãos).
7. **Avisos internos fracos**: falta badge "Teams" na barra lateral, "digitando…" e menção com notificação; a presença "Online" é falsa.
8. **Riscos de banco no Team Chat**: apagar o próprio anexo não funciona (policy por `auth.uid`), RPCs de sair/remover usam coluna inexistente, conversa direta pode duplicar, qualquer membro inscreve terceiros.
9. **Governança**: planos F e TC conflitantes, nenhum ratificado e ambos com 0/100 marcados; falta seção "Team Chat"/"Telefonia" no CLAUDE.md; cópia órfã do plano de Telefonia em `docs/plans/`.
10. **Qualidade da Telefonia (T75–T88)**: E2E fora do CI, layout <1280 px e celular sem `Sheet`/`CallRowMobile`, contraste não medido, espera/transferência/conferência fora do escopo.
