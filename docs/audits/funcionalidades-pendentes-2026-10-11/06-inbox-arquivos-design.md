# Área 06 — Inbox / Chat / Arquivos e mídia / Volume / Talk Me / Inbox 360 / Layout / Skins / Design System / Tipografia

Varredura somente leitura em `adm01-debug/Zapp_Web_V2` (HEAD `99aa53f`, 11/10/2026). Repositório é clone raso (50 commits):
SHAs antigos citados nos status não são resolvíveis aqui — a verdade usada é o **código presente**.
Convenção: "concluído" = artefato encontrado no código/teste; "não verificável" = depende de navegador logado, produção,
banco vivo ou aceite humano que esta varredura não pode executar. Nada foi executado contra banco ou produção; o único
comando de produto rodado foi `node scripts/ui-audit/layout-guard.mjs` (leitura estática).

---

## 1. Fontes lidas

| Caminho | Tipo | Nº etapas/itens | Data | Vigente/substituído |
|---|---|---|---|---|
| docs/design/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md | plano | 50 + 4 "próximos passos" + D1–D4/D2a | 01/10 | vigente |
| docs/plans/PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_ZAPP_WEB_V2_50_ETAPAS.md | plano (Codex) | 50 | ~30/09 | substituído pelo de 01/10 (revisão explícita) |
| docs/design/evidence/arquivos-chat-2026-10/diagnostico.md, matriz-preservacao.md | evidência | etapas 01–05 | 01/10 | histórico (não atualizado) |
| docs/plans/PLANO_CARTAO_ARQUIVO_MOCKUP_REMETENTE_60_ETAPAS_2026-10-07.md | plano | 60 (S01–S60; R01–R11) | 07/10 | vigente |
| docs/plans/PLANO_MINIATURAS_E_FIGURINHAS_ARQUIVOS_2026-10-07.md | plano | M01–M07 + 6 verificações | 07/10 | vigente |
| docs/plans/PLANO_FILTRO_DATA_ARQUIVOS_8_ETAPAS_2026-10-07.md | plano | F01–F08 + F10 | 07/10 | vigente |
| docs/plans/PLANO_JANELA_ARQUIVO_MENOR_5_ETAPAS_2026-10-07.md | plano | V01–V02 (D01–D04) | 07/10 | vigente |
| docs/plans/PLANO_AUDIO_PLAY_NO_CARTAO_6_ETAPAS_2026-10-07.md | plano | A01–A06 | 07/10 | vigente |
| docs/plans/PLANO_ARQUIVOS_A06B_NOME_ACESSIVEL_DO_PLAY_2026-10-08.md | plano | 1 | 08/10 | vigente |
| docs/plans/PLANO_ARQUIVOS_A07_AREA_DE_TOQUE_DOS_BOTOES_2026-10-08.md | plano | 2 (A07a/b) | 08/10 | vigente |
| docs/plans/PLANO_REMOVER_COLUNAS_6_8_ARQUIVOS_4_ETAPAS_2026-10-07.md | plano | 4 | 07/10 | substituído (revertido) |
| docs/plans/PLANO_RESTAURAR_COLUNAS_6_8_ARQUIVOS_2026-10-08.md | plano/registro | 1 | 08/10 | vigente (executado) |
| docs/plans/PLANO_CONSISTENCIA_DESIGN_SISTEMA_2026-10-07.md | plano | Z01–Z03 | 07/10 | vigente |
| docs/plans/PLANO_CONTROLES_VOLUME_SIDEBAR_50_ETAPAS_2026-10-07.md | plano | 50 (S01–S50; Q01–Q10) | 07/10 | vigente |
| docs/plans/PLANO_VOLUME_MIDIA_50_ETAPAS_2026-09-27.md | plano + fechamento | 50 (E01–E50) | 27/09–01/10 | vigente (fechado 50/50 com ressalvas) |
| docs/plans/AUTOMACAO_ONDAS_DOS_PLANOS_2026-10-07.md | gatilhos de cartões | ~40 cartões | 07/10 | vigente |
| docs/plans/SEGUNDA_LEVA_CARTOES_2026-10-08.tsv | backlog (cartões SL) | 29 cartões da área conferidos | 08/10 | vigente |
| docs/plans/PENDENCIAS_DO_DONO_2026-10-08.md, PLANO_95_POR_CENTO_2026-10-08.md | pendências | — | 08/10 | vigente |
| docs/design/PLANO_TALK_ME_100_ETAPAS_2026-09-30.md | plano | 100 | 30/09 | vigente |
| docs/design/PLANO_REFINAMENTO_TALK_ME_50_ETAPAS_2026-09-30.md | plano | 50 | 30/09 | vigente |
| docs/design/RELATORIO_EXECUCAO_TALK_ME_2026-09-30.md, RELATORIO_REFINAMENTO_TALK_ME_50_ETAPAS_2026-10-01.md | relatório | 100/50 | 30/09–01/10 | histórico |
| docs/design/PLANO_INBOX_360_CONVERSA.md + INBOX_360_STATUS.md | plano + status | 58 (reescopo 08/09) | 07/09–08/10 | vigente (parcialmente superado: Orders→SalesView, History→Journey) |
| docs/design/PLANO_INBOX_FIDELIDADE_CARVAO.md + INBOX_FIDELIDADE_STATUS.md | plano + status | 58 | set/26 | vigente |
| docs/design/PLANO_PAINEL_DIREITO_TABBED.md + PAINEL_STATUS.md | plano + status | 20 | set/26 | substituído (#603/#610; SalesView/Journey 02/10) |
| docs/design/PLANO_COLUNA_HEADER.md | plano | 2 partes | set/26 | parte 1 vigente; parte 2 superada |
| docs/design/PLANO_CORRECAO_LAYOUT_30_ETAPAS.md | plano | 30 | set/26 | vigente |
| docs/reconciliation/LT-LAYOUT-02-layoutguard.md | nota de evidência | 1 | 06/10 | vigente |
| docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md + SKINS_OPERA_GX_STATUS.md | plano + status | 100 / CP0–CP11 | 23–24/09 | vigente |
| docs/design/DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md + PROMPT_FASES_2_12.md | status + prompt | CP0–CP12 / Fases 2–12 | 07/09–09/10 | vigente |
| docs/design/ZAPP_WEB_V2_DARKBLUE_PREMIUM_DESIGN_SYSTEM.md | spec/manual | sem etapas | 07/09 | referência (paleta parcialmente superada pela "carvão") |
| docs/design/MODULO_INBOX_CHAT_TEAMS.md (parte Inbox) | spec do módulo | 11 riscos | 08/10 | vigente |
| docs/design-system/glows.md | guia | 1 regra | — | vigente |
| docs/tipografia/PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md (+ REVISAO_, RELATORIO_PARIDADE_, EXCECOES.md) | plano + relatórios | 100 | 24/09–08/10 | vigente |
| docs/tipografia/PLANO_PARIDADE_TIPOGRAFICA_ZAPP_PROMO.md, PLANO_TIPOGRAFIA_PROMO_GIFTS_50.md | plano | 9 / 50 | 22/09 | substituídos |
| docs/reconciliation/reports/modules/{TALK_ME,TALKME_MEDIA_SKINS,SKINS,VOLUME,LAYOUT_TYPOGRAPHY}.md | reconciliação (baseline 2e7cf81, 03/10) | 150/300/100/50/130 | 03/10 | ponto de partida (código andou) |
| docs/reconciliation/tasks/P016,P017,P020,P021,P024,P025,P029,P031,P032,P042,P048,P049,P050,P060.json | ledger por etapa | — | 03/10 | ponto de partida |
| docs/reconciliation/reaudit/2026-10-03/reports/inbox/findings.json | reauditoria (R2-INB-001…064) | 64 achados | 03/10 | vigente |
| Código: src/components/inbox/** (tabs, chat, media-gallery), src/hooks/chat/**, src/features/talk-me/**, src/components/ui/Volume*, src/components/layout/**, src/components/settings/theme/**, src/styles/**, src/lib/{filesPeriod,forward-limits,fileSenderIdentity,pdfThumbnail,mediaVolume*}.ts, e2e/{files-tab,media-volume}.spec.ts, supabase/migrations/2026100{3}*.sql | código | — | HEAD | — |

---

## 2. Placar por plano

Critério: contagem por etapa do plano; a reconciliação de 03/10 foi atualizada com o código de hoje (ex.: SK01/SK02,
VOL-01/VOL-02, TM-02, tipografia E40/E64/E66/E72 agora corrigidos). "Concluído" inclui código+teste sem prova de
navegador quando o aceite era só de código; aceite humano/visual/produção vai para "não verificável" ou "bloqueado".

| Plano | Total | Concluído (código) | Parcial | Não iniciado | Bloqueado | Não verificável |
|---|---|---|---|---|---|---|
| Arquivos — redesign 50 etapas (01/10) | 50 | 44 | 4 (19, 39, 47, 49) | 1 (50) | 1 (01) | 0 (*42/39: apply em produção não verificado) |
| Arquivos — "Próximos passos" do mesmo plano | 4 | 1 (forward do chat) | 0 | 3 | 0 | 0 |
| Arquivos — plano Codex 50 | 50 | — substituído — | | | | |
| Cartão de arquivo = mockup (60) | 60 | 35 (25 deles são fundação **sem consumidor**) | 4 | 16 | 0 | 3 (+2 canceladas por decisão) |
| Miniaturas e figurinhas (M01–M07) | 7 | 6 | 0 | 1 (M07) | 0 | 0 (+6 verificações finais n/v) |
| Filtro por data (F01–F08, F10) | 9 | 7 | 0 | 1 (F10) | 0 | 1 (F08) |
| Janela de arquivo menor (V01–V02) | 2 | 1 | 0 | 0 | 0 | 1 |
| Play de áudio no cartão (A01–A06) | 6 | 6 | 0 | 0 | 0 | 0 |
| A06b nome acessível do play | 1 | 0 | 0 | 1 | 0 | 0 |
| A07 área de toque (A07a/b) | 2 | 1 | 0 | 0 | 0 | 1 |
| Remover colunas 6/8 (C01–C04) → Restaurar | 4 + 1 | 1 (restaurar) | — | — | — | (C01–C04 substituídos) |
| Consistência de design (Z01–Z03) | 3 | 0 | 1 | 2 | 0 | 0 |
| Controles de volume da sidebar (S01–S50) | 50 | 41 | 1 | 5 | 0 | 3 |
| Volume de mídia (E01–E50) | 50 | 47 | 1 (E49) | 0 | 1 (E18) | 1 (E48) |
| Talk Me 100 | 100 | 69 | 20 | 0 | 6 (5 aceite humano + 1 observação) | 4 (+1 substituída) |
| Talk Me refinamento 50 | 50 | 39 | 8 | 0 | 0 | 3 |
| Skins Opera GX 100 | 100 | 64 | 8 | 0 | 20 (QA logado/produção) | 6 (+2 n/a) |
| Inbox 360 (58, reescopo 08/09) | 58 | 42 | 1 | 0 | 1 | 0 (+14 fora de escopo/substituídas) |
| Inbox Fidelidade Carvão (58) | 58 | 52 | 4 | 1 | 1 | 0 |
| Painel direito com abas (20) | 20 | — substituído (#603/#610, SalesView/Journey) — | | | | |
| Coluna + Header (2 partes) | 2 | 1 | 0 | 0 | 0 | 0 (+1 superada) |
| Correção de layout (30) | 30 | 18 | 8 | 1 | 0 | 1 (+2 substituídas) |
| Auditoria de fontes (100) | 100 | 51 | 22 | 7 | 3 (decisão) | 13 (+4 n/a) |
| Paridade tipográfica (9) + Tipografia PG (50) | 59 | — substituídos — | | | | |
| Design System Promo Gifts (CP0–CP12 / Fases 2–12) | 13 | 8 | 1 (CP11) | 3 (CP2, CP3, CP6) | 0 | 1 (CP12) |
| Reauditoria Inbox R2-INB (03/10) | 64 | 62 (correção referenciada no código) | 0 | 1 (R2-INB-060) | 0 | 0 (+1 n/a: 061) |
| Segunda leva SL — recorte da área (29 cartões conferidos) | 29 | 5 | 5 | 10 | 5 | 4 |

---

## 3. Pendências detalhadas

### 3.1 Arquivos — redesign 50 etapas (01/10) e "Próximos passos"

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto no negócio | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| ARQ-01 | Diagnóstico ao vivo G1–G5 | BLOQUEADO | Confirmar ao vivo exclusão, nº de assinaturas de URL, encaminhar e copiar link | diagnostico.md:9-10 "BLOQUEADA — Supabase degradado… bloqueada pelo sandbox"; correções feitas só por código | Rodar no banco local ou registrar como superado | Baixo: os 4 bugs foram corrigidos sem prova observada | P3 | ambiente logado |
| ARQ-19 | Encaminhar **por item** (cartão, lista, tabela, detalhes) | PARCIAL / DIVERGENTE | Após a PR G, botão de cada item ligado ao serviço real | FileCard.tsx:112-120, FilesListView.tsx:116, FilesTableView.tsx:169, FileDetailPanel.tsx:82 — todos `disabled title="Disponível em breve"`; `onForward` chega ao FileCard (FilesContent.tsx:289) e é ignorado; só "Encaminhar N" da barra de seleção funciona (FilesTab.tsx:402) | Ligar cada botão a `openForward([item])` | Atendente vê "em breve" num recurso que já existe; precisa entrar no modo seleção para encaminhar 1 arquivo | P1 | nenhuma |
| ARQ-39 | Prova autenticada da cópia na Storage + leitura de mídia **recebida** | PARCIAL | Teste autenticado: copy permitido/negado e 4 prefixos de mídia recebida (`image/`,`video/`,`document/`,`audio/`) | Limites 10×10 e confirmação ≥20 em src/lib/forward-limits.ts:10-13; policy aditiva em supabase/migrations/20261003142707_whatsapp_media_recebida_select_via_messages.sql; nenhum teste com `storage.copy` em e2e/ ou tests/ | Teste autenticado no banco local; confirmar apply da policy em produção | Atendente não-supervisor pode não conseguir ver/encaminhar foto que o cliente mandou se a policy não estiver aplicada | P1 | lote diário de migrations (db-migrate) — produção não verificada |
| ARQ-47 | Checklist de teclado executado e gravado | PARCIAL | Fluxo "localizar → selecionar 2 → detalhes → fechar" só por teclado, gravado em evidence/ | e2e/files-tab.spec.ts:307 (prévia por teclado) e :339 (ARIA); evidence/ só tem diagnostico.md e matriz-preservacao.md | Executar e registrar | Acessibilidade de teclado não comprovada | P3 | — |
| ARQ-49 | E2E logado da aba Arquivos no CI | PARCIAL | Spec no `e2e-logado.yml` com contato E2E seedado | e2e/files-tab.spec.ts:113-120 `test.skip(!CONJUNTO_LOCAL)` — só roda com banco local; fixture de produção (migration 20261003182707) não é usada | Decidir: prova local obrigatória no portão (`zapp-verify`) ou job dedicado | Regressão na aba pode passar no CI sem alarme | P2 | e2e-logado da main cancela 96,8% (PENDENCIAS_DO_DONO_2026-10-08.md:31) |
| ARQ-50 | Homologação visual + relatório final | NAO_INICIADO | `RELATORIO_REDESIGN_ARQUIVOS_CHAT_PANEL_2026-10.md` com prints 4 combinações × 3 modos × 4/6/8 col, claro/escuro | Arquivo inexistente (`ls docs/design`) | Produzir no banco local | Dono não tem prova visual do redesign | P2 | — |
| ARQ-NP2 | Unificar seletor "Layout" de Contatos e Arquivos | NAO_INICIADO | Um componente só | src/components/contacts/ContactViewSwitcher.tsx separado de FilesLayoutPopover.tsx | Unificar | Dois padrões de "Layout" no produto | P3 | — |
| ARQ-NP3 | Política D2 ("só dentro do ZAPP") nas bolhas do chat | NAO_INICIADO | Chat sem abrir URL assinada em nova aba | src/components/inbox/MediaPreview.tsx:78-80 `window.open(resolvedUrl,'_blank')` | Aplicar a mesma política | Link assinado sai do sistema pelo chat, anulando a política da aba Arquivos | P2 | decisão D2 já tomada |
| ARQ-NP4 | Encaminhar para **grupos** | NAO_INICIADO | Caminho de envio para `whatsapp_groups` | useChatPanelHandlers.ts:254 falha "ainda não é suportado"; ForwardMessageDialog.tsx:47 `targets='all'` por padrão e ChatDialogs.tsx:72 não passa `targets` → aba Grupos aparece no chat | Criar transporte ou esconder a aba Grupos no chat | Operador escolhe grupo e só recebe erro | P2 | RPC `enqueue_outbound_message` só aceita contato |

\* Etapa 42 (files_total sem apagadas) e a policy da 39 existem como migration (20261003162707, 20261003142707); aplicação em produção não verificada nesta varredura.

### 3.2 Cartão de arquivo igual ao mockup (60 etapas)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| R01–R03 (S01–S27) | Autor, foto e data curta do arquivo | PARCIAL (código órfão) | Resolver "Você"/atendente/contato com foto, em lote | src/lib/fileSenderIdentity.ts:81, src/hooks/chat/useMediaSenderProfiles.ts:95, src/components/inbox/tabs/SenderAvatar.tsx, fileDisplay.ts:89 `formatCardDate` — **nenhum importado fora de testes** | Consumir nos renderers (onda 2) | Pedido do dono (foto de quem enviou) invisível apesar de pronto | P1 | R04 |
| R04 (S29–S32, S35, S36, S38) | Layout do cartão | NAO_INICIADO | Linhas nome / tipo·tamanho / data curta / remetente com foto; ações olho·baixar·encaminhar·⋮ | FileCard.tsx:88 meta numa só linha (`formatMeta`); :89-95 bolinha com inicial ("V" para qualquer atendente, :92); :104-121 olho, encaminhar desabilitado, ⋮ | Implementar R04 | Cartão não bate com o mockup aprovado | P1 | gatilho R04 depende de R11/A01/M02 (feitos) |
| R05 (S41, S43) | Play e duração do áudio **dentro da miniatura** | NAO_INICIADO | Círculo azul + onda + duração `0:15` | FileThumb.tsx:179-186 só ícone `AudioLines`; duração só enquanto toca (AudioPlayButton.tsx:218-226) | Implementar | Áudios indistinguíveis por duração | P2 | R04, M04 |
| R05 (S42, S46) | Tocar sem abrir; testes | PARCIAL | Play na miniatura | Play existe na linha de ações (AudioPlayButton) | Mover/duplicar para miniatura + testes | — | P3 | R04 |
| R06 (S47, S48) | Lista e Tabela com foto de quem enviou | PARCIAL | Foto + nome; coluna "Enviado por" | FilesListView.tsx:104 texto `meta · sender`; FilesTableView.tsx:114/161 coluna "Remetente" só texto ("Atendente"/contato) | SenderAvatar + nome real do atendente | Não se sabe qual atendente enviou | P2 | R04 |
| R07 (S49, S51, S52) | Painel de detalhes do mockup | PARCIAL / NAO_INICIADO | "Enviado por" com foto; **Baixar conforme `useDownloadPermission`** (D06 aprovada); Encaminhar habilitado | FileDetailPanel.tsx:72 "Enviado por Atendente"; :79-81 Baixar **sempre** bloqueado; FileActionsMenu.tsx:36-39 idem; :82 Encaminhar desabilitado; `useDownloadPermission` só em ImagePreview/MediaPreview | Respeitar permissão, habilitar encaminhar, foto | Quem tem permissão de download baixa pelo chat mas não pela aba Arquivos | P1 | D06 aprovada 07/10 |
| R08 (S55, S56) | Subtítulo, funil e filtro por remetente | NAO_INICIADO | "Todos os arquivos…" + painel com período e remetente | FilesTab.tsx:325-349 sem subtítulo; FilesToolbar sem filtro de remetente | Implementar | Conversa com vários atendentes sem filtro por quem enviou | P3 | gatilho depende de **C04 (revertido)** — pode nunca disparar (AUTOMACAO_ONDAS:41) |
| R09 (S57) | E2E `e2e/arquivos-cartao.spec.ts` | NAO_INICIADO | Spec novo | inexistente | Criar | — | P3 | R04–R08 |
| R10 (S60) | Documentação | NAO_INICIADO | docs/design | inexistente | Escrever | — | P3 | R04–R08 |

### 3.3 Miniaturas/figurinhas, filtro de data, janela, play, A06b/A07

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| M07 | Documentação da aba Arquivos | NAO_INICIADO | doc em docs/design | nenhum doc da aba | Escrever | Baixo | P3 | — |
| F10 | Documentação do filtro de data | NAO_INICIADO | doc | só citação em MODULO_INBOX_CHAT_TEAMS.md:422 | Escrever | Baixo | P3 | — |
| A06b | Nome acessível do play com nome do arquivo | NAO_INICIADO | `aria-label` "Tocar áudio audio-a1.wav" | AudioPlayButton.tsx:212 `'Pausar áudio' : 'Tocar áudio'`; :234 `"Progresso do áudio"` genéricos | Incluir nome + teste | Leitor de tela não distingue vários áudios | P2 | — |
| F08 / V02 / A07b / M-verif. | Verificações visuais do Claude | não verificável | Pré-visualização local | sem registro em docs | Executar | — | P3 | — |

### 3.4 Consistência de design (Z01–Z03)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| Z01 | Fonte única do cálculo de período | NAO_INICIADO | `filesPeriod.ts` vira adaptador de `journey/periodRange.ts` | src/lib/filesPeriod.ts:1 não importa periodRange; src/lib/journey/periodRange.ts:25-27 "a unificação fica para depois" | Unificar | Arquivos e Journey podem divergir no mesmo período | P3 | — |
| Z02 | Ícones de categoria nas abas Tarefas/Notas/CRM 360° | NAO_INICIADO | Reusar `CATEGORY_META` | `CATEGORY_META` só em src/lib/journey/model.ts | Aplicar | Inconsistência visual | P3 | — |
| Z03 | Dicas uniformes + legenda do ponto azul nos 6 controles | PARCIAL | "Nome: estado — ação" e legenda | Só volume: VolumeTriggerButton.tsx:30-35; cadeado/sino só "Ativar/Desativar…" (ScreenProtectionToggle.tsx:39-41, PushNotificationToggle.tsx:21-23); tema "Modo claro" (Sidebar.tsx:258); ponto azul do sino/cadeado (= ligado) sem legenda | Uniformizar 4 controles | Ponto azul significa coisas diferentes sem explicação | P3 | — |

### 3.5 Controles de volume da sidebar (S01–S50) e Volume de mídia (E01–E50)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| S05–S08 / SL-074 / E45 | Prova de som real (`audio.volume` em 5 players) | NAO_INICIADO | Semear áudio/vídeo sintético e medir | e2e/media-volume.spec.ts:159 `test.fixme`; contrato estático tests/contracts/media-volume-surfaces.contract.test.ts | Fazer no banco local (dono recusou fixture em produção) | Não há prova de que o slider muda o som ouvido | P2 | banco local com mídia |
| S46 / Q05 | E2E `quick-controls-volume.spec.ts` (B1–B5) | PARCIAL | Spec novo cobrindo toque, roda, dicas | só e2e/media-volume.spec.ts (clique abre painel, persistência) | Cobrir toque (B2), roda (B5), dicas (B3) | Regressão de usabilidade pode voltar | P3 | — |
| S50 / Q07 | Documentação | NAO_INICIADO | docs/design | inexistente | Escrever | Baixo | P3 | — |
| E18 / SL-020 | Contraste ≥4,5:1 do player/slider | BLOQUEADO | Tokens com contraste AA | Ajuste #1435 revertido por #1458 a pedido do dono (manter azul) | Decisão de design | Slider com trilha 1,30–2,88:1 pouco visível p/ baixa visão | P2 | dono |
| E49 | Prova audiovisual pós-deploy | PARCIAL | Ouvir áudio/vídeo em conversa real | Só UI/persistência no E2E | Ver S05–S08 | — | P3 | idem |

Notas: Q01–Q04, Q06, Q08, Q10 implementados (useVolumeRocker.ts:108-198; VolumeSliderPopoverContent.tsx `role="dialog"`, −/+ 44 px; mediaVolumeStore.ts chave por usuário + evento `storage`; SoundVolumeControl.tsx:24-28 gravação agrupada 400 ms; IncomingCallAlert.tsx:37 `RING_GAIN_CAP = 0.2` documentado — pergunta B10 ao dono segue aberta, padrão "manter"). VOL-01 e VOL-02 da reconciliação foram corrigidos (mediaVolumeElement.ts:144-210; RecordingPlayer.tsx:98-115).

### 3.6 Talk Me (100 + refinamento 50)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| TM 025/046/074/037 | Ler histórico **antes** de aceitar | PARCIAL | Ler mensagem completa e mensagens anteriores sem assumir | "Ler mensagem completa" mostra só a última + contagem (src/features/talk-me/TalkMeView.tsx:613-631); cartões `line-clamp-2` (:143, :220) | Mensagens anteriores com regra de autorização | Atendente decide pegar o atendimento com contexto parcial | P2 | regra de RLS para prévia |
| TM 085 / ref. 044 | E2E específico do Talk Me | NAO_INICIADO | Fluxo fila→claim→chat | nenhum `e2e/*talk-me*` (só testes de componente/hook) | Criar no banco local | Fluxo de aceite sem proteção ponta a ponta | P2 | — |
| TM 002/030/090/096/099 | Homologação humana, piloto, ampliação | BLOQUEADO | Aceite nominal e piloto controlado | sem artefato | Dono decidir/homologar | Recurso ligado por flag (`inbox.talk-me`, RealtimeInboxView.tsx:104) sem aceite formal | P2 | dono |
| TM 097 | Janela de observação e métricas | BLOQUEADO | Série operacional | auditoria mínima de claim existe | Definir janela | — | P3 | operação |
| TM 018/049/088 | p95 de leitura/claim, desempenho | PARCIAL | Orçamento p95 | amostra 33 itens/2,3 ms, 500 sintéticos | Medir | — | P3 | — |
| TM 035/068/098/100, Ref. 004/005/009/035/041/044/049/050 | Economia em aba oculta, preservar rascunho, ensaio de reversão, rastreabilidade, revisão autenticada online | PARCIAL | conforme plano | relatórios históricos; buildId sem revisão autenticada | Evidências | Baixo | P3 | QA logado |

Corrigido desde 03/10: TM-02 (resultado incerto do claim e CTA offline) — TalkMeView.tsx:634-655, useTalkMeQueue.ts:410.

### 3.7 Skins Opera GX (100)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| CP8 (8, 57, 61, 76–79) | Fidelidade visual das 19 skins (prints, vars, claro, raio, mobile) | BLOQUEADO | Playwright logado | SKINS_OPERA_GX_STATUS.md CP8 "BLOQUEADO — login QA"; nenhum e2e de skins (só theme-alto-contraste.spec.ts) | Rodar no banco local (seção 0) | 19 skins sem prova de que pintam as telas principais | P2 | antes: credencial QA; hoje: banco local |
| CP9 (80–90) | 14 checks funcionais (salvar, original, sync entre abas, reduced-motion, foco Diversity, Aparência) | BLOQUEADO | E2E | só testes unitários (601) | Rodar | Regressão de tema sem E2E | P2 | idem |
| 99/100 | Deploy e verificação em produção | BLOQUEADO | READY + assert em produção | sem prova | Executar | — | P3 | — |
| 6/30/51/54/75/83/91/96 | QA parcial, grep de azul fixo, roving por setas, gates | PARCIAL | conforme plano | PresetCard.tsx:22-24 setas; gates históricos | Testes de foco/E2E | Baixo | P3 | — |

Corrigido desde 03/10: SK01 (autosave sob quota — useThemePreset.ts:40-55) e SK02 (JSON null — presets.ts:642-650).

### 3.8 Inbox 360, Fidelidade Carvão, Coluna/Header

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| 360-51 / Fid-52 / SL-208 | Prints das 8 abas e medidas Playwright | BLOQUEADO | inbox-11-*.png, fid-*.png | INBOX_360_STATUS.md CP8 "NÃO DEMONSTRADO"; substituto: ConversationTabs.cp8.test.tsx (15 testes) | Capturar no banco local | Sem prova visual | P3 | login QA → banco local |
| 360-54 / Fid-53 / SL-077 | 18/22 checks funcionais por clique | PARCIAL | E2E | verificados "por leitura de código" | E2E | — | P2 | idem |
| Fid-54/55 | Mobile 390 e light com print | PARCIAL | screenshot | só revisão de código | Capturar | — | P3 | idem |
| 360-resíduo / SL-207 | Composer nas outras abas | BLOQUEADO | Referência mostra composer em todas as abas | ConversationTabContent.tsx:67 (chat `hidden` fora da aba Chat) | Decisão de produto | Atendente precisa voltar à aba Chat para responder | P3 | dono |
| 360-resíduo | Segmento/porte/CNPJ/última visualização/ligações no CRM 360° | BLOQUEADO | Campos da referência | omitidos (sem dado) | Fonte de dados | Ficha comercial incompleta | P3 | dados |
| Fid-45 / SL-200 | Card de produto dentro da mensagem | NAO_INICIADO | Componente de produto no balão | nenhum ProductCard em src/components/inbox | Implementar | Vendedor não vê produto enviado como cartão | P3 | catálogo |
| Fid-13 / SL-199 | Presença "Online" por contato na lista | NAO_INICIADO | Ponto online | sem fonte; header agora neutro (ChatPanelHeader.tsx:137) | Fonte de presença (Evolution GO) | — | P3 | Evolution GO |
| Coluna-2 / Videochamada | Botão Vídeo | NAO_INICIADO | Videochamada | ContactActionButtons.tsx:113 flag `video_call=false`; :143-149 toast "Em breve" | Decidir/implementar | — | P3 | provedor |

### 3.9 Correção de layout (30) e tipografia (100)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| L17 | Sidebar `h-full` | NAO_INICIADO | trocar `h-screen` | Sidebar.tsx:99 `h-screen supports-[height:100dvh]:h-[100dvh]` | Ajustar | Baixo (sem corte medido) | P3 | — |
| L27 | layout-guard verde | PARCIAL | 0 violações | `node scripts/ui-audit/layout-guard.mjs` → 1 violação: TasksModule.tsx `flex flex-col h-full gap-4` | Corrigir | Possível faixa morta em Tarefas | P3 | — |
| SL-174 / L-CI | Guard de layout no CI (trava do shell) | NAO_INICIADO | Passo no CI | ci.yml só roda `medir-tipografia` (ci.yml:175) | Adicionar | Regressão de layout passa no CI | P3 | — |
| L6/L7/L9/L11/L20/L25/L30 | Views sem w-full, scroll/padding duplo (TalkX/Multiplix), header sticky, guard de outline, fechamento visual | PARCIAL | conforme plano | ViewContainer existe; padding duplo e fechamento visual pendentes | Medir/ajustar | Baixo | P3 | — |
| T48–T51 | Literais em components.css → tokens | NAO_INICIADO | 11/9/12/16px → tokens | src/styles/components.css:263, 267, 350, 370, 386, 400 | Trocar | Baixo | P3 | — |
| T35 | Medição renderizada antes/depois | NAO_INICIADO | script por ocorrência | medidor é estático | Criar | — | P3 | — |
| T90 | Trava para `text-[Npx]` < 12px | NAO_INICIADO | regra no guard | 101 usos de `text-[9px]` em .tsx; sem trava | Adicionar | Legibilidade | P3 | E37 |
| T100 | Regra de tipografia no CLAUDE.md | NAO_INICIADO | "tamanho e família só por token" | ausente no CLAUDE.md | Escrever | Agentes reintroduzem literais | P3 | — |
| T33/T34/T39/T2/T3/T88/T89 etc. (22) | 13/15px, 9px, baseline 24/09, guard de família/peso | PARCIAL | conforme plano | 7px/8px zerados; 9px persiste; baseline-2026-09-24.json ausente | — | Baixo | P3 | — |
| T43/T44/T76 | Tokens fluidos e piso de 11px | BLOQUEADO | decisão | 4 de 8 tokens fluidos em uso | Decisão | — | P3 | dono |

Corrigido desde 03/10: T40 (7px), T64 (useScreenProtection.ts:128 usa `var(--font-sans)`), T66 (docs/tipografia/EXCECOES.md criado 08/10), T72 (`--density-text-size` consumido), L28 (width-regression mede 1920×1080).

### 3.10 Design System Promo Gifts (CP0–CP12 / PROMPT_FASES_2_12)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| CP2 / Fase 2 | AppHeader global (seção atual, busca ⌘K, pílula do usuário) | NAO_INICIADO (DIVERGENTE do status) | header sticky h-14 | nenhum AppHeader/HeaderSectionAnchor/GlobalSearchTrigger/HeaderUserPill em src (grep); só RoleBadge/ProfileMenuContent existem | Implementar ou cancelar | Sem cabeçalho global de navegação/busca | P3 | dono |
| CP3 / SL-171 | BreadcrumbBar + "Teletransporte" | NAO_INICIADO | barra sticky com voltar | inexistente | idem | — | P3 | — |
| CP6 / SL-172 | StarBackground | NAO_INICIADO | fundo decorativo | inexistente (reconciliação Skins aceitou ausência) | Decidir cancelar | Cosmético | P3 | — |
| CP11 | QA de fidelidade completo | PARCIAL | responsivo, a11y, console | só 1440×900 local | QA | — | P3 | — |

Presentes no código: Fases 4/5/7/8/10 (SidebarNavGroup `zapp-sidebar-groups`, SidebarNavItem `before:` 3 px, useNavShortcuts em AppShell.tsx:70, button `active:scale-[0.97]`, ContactCard `card-lift`, view-transition em animations.css:174).

### 3.11 Reauditoria Inbox R2-INB (64 achados, 03/10) — funcionalidades que viraram "retirada honesta"

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| R2-INB-060 | Detalhes do arquivo após trocar de item | NAO_INICIADO (não corrigido) | Reset do erro de imagem por item | FileDetailPanel.tsx:26 `useState(false)` sem reset; FilesTab.tsx:448 e :456 sem `key` por item | `key={item.id}` | Ao clicar em outro arquivo a prévia aparece quebrada | P2 | — |
| R2-INB-021 | **Favoritar/Fixar mensagem, Responder depois, Reportar**, "Adicionar tag" no header, /note e /tag | NAO_INICIADO (funcionalidade) | Itens existiam sem handler; foram removidos | MessageHoverToolbar.tsx:160-166; ChatPanelHeader.tsx:186; slashCommandsData.ts:22; nenhuma tabela/hook de mensagem fixada/favorita | Backend + UI se o negócio quiser | Atendente não consegue fixar/favoritar mensagem nem marcar para responder depois | P2 | decisão de produto |
| R2-INB-003 | Mensagens interativas (botões/listas) | NAO_INICIADO (transporte) | Envio real | useChatPanelHandlers.ts:419-422 lança `ENVIO_INTERATIVO_INDISPONIVEL`; :424-426 clique em botão só toast | Transporte pela Evolution GO | Construtor visível que não envia | P2 | Evolution GO |

Sem pendência: os demais 61 têm correção referenciada no código (amostra conferida: 001, 002, 004, 014, 029, 030, 033, 044, 049); 061 (LeadRiskScorePanel) foi removido.

### 3.12 Segunda leva (cartões SL do recorte Inbox/Design System/Acessibilidade)

| ID | Funcionalidade | Estado | Planejado | Existe hoje | Falta | Impacto | Prior. | Dependência |
|---|---|---|---|---|---|---|---|---|
| SL-070 | Fila offline (IndexedDB) e throttle com dedupe entre abas | NAO_INICIADO | envio resiliente offline | nenhum IndexedDB em src | Implementar | Mensagem digitada sem rede pode se perder | P2 | — |
| SL-071 | Remover derivação por `messages.length` (status "Resolvidas") | NAO_INICIADO | usar `contacts.conversation_status` | StatusChips.tsx:41 `messages.length === 0` | Corrigir | Contador "Resolvidas" diverge do status real | P2 | — |
| SL-197 | Tentativas por mensagem (`message_attempts`) | NAO_INICIADO | tabela + lista | sem tabela; messageSendTimeline.ts:29 cita como futuro | DDL + UI | Sem diagnóstico de reenvio | P3 | migration |
| SL-198 | Timeline de envio por mensagem | PARCIAL (órfão) | painel no balão | MessageSendHistorySheet.tsx:100 + messageSendTimeline.ts sem consumidor | Montar no menu do balão | Atendente não vê por que a mensagem falhou | P3 | — |
| SL-201 | Recursos exclusivos da GO (mute/pin de chat, carrossel, link, enquetes, comunidades, newsletter) | NAO_INICIADO | actions | nada no front | Implementar | Funções do WhatsApp indisponíveis | P3 | Evolution GO |
| SL-206 | Presets de filtros e deep link `?contact=`/`?message=` na Inbox | NAO_INICIADO / PARCIAL | salvar filtros; link direto | `useSavedFilters` só exportado em src/hooks/chat/index.ts:17 (sem uso); deep link só no Catálogo | Ligar | Não dá para compartilhar link de conversa | P3 | — |
| SL-171/172/174 | ver 3.9/3.10 | — | — | — | — | — | — | — |
| SL-173/177/207/208/020 | ver 3.7/3.9/3.8/3.5 | BLOQUEADO | — | — | — | — | — | — |
| SL-017 | Banner honesto da janela de bloqueio da Meta | não verificado (fronteira multi-conexão) | — | não localizado em src/components/inbox | — | — | P2 | — |

---

## 4. Divergências doc × código

1. **Plano de Arquivos diz "50 etapas pendentes"** (PLANO_REDESIGN_ARQUIVOS_CHAT_PANEL_50_ETAPAS_2026-10-01.md:5) — o código tem 44 etapas implementadas (FilesTab.tsx, FilesToolbar/LayoutPopover/ColumnSelector/Content/ListView/TableView/SelectionBar, useFiles*.ts, useForwardMedia.ts).
2. **diagnostico.md marca etapa 02 como BLOQUEADA** (linha 10) — o próprio plano registra a medição de 03/10 (seção 3, 959/1282/1474 px).
3. **Comentário do FileCard** "Encaminhar (desabilitado até a Fase 7)" (FileCard.tsx:99-100) — a Fase 7 está pronta (useForwardMedia.ts, FilesTab.tsx:308-316), mas o botão por item segue desabilitado.
4. **G15 "nunca 'Você' sem prova"** — FileCard.tsx:92 mostra a inicial **"V"** para todo `senderLabel === 'Atendente'`.
5. **Etapa 49 pede E2E no `e2e-logado.yml`** — e2e/files-tab.spec.ts:113-120 é local-only e se auto-pula no CI.
6. **Mockup D06 aprovado: Baixar segue `useDownloadPermission`** — aba Arquivos bloqueia sempre (FileDetailPanel.tsx:79-81, FileActionsMenu.tsx:36-39), enquanto o chat libera por perfil (ImagePreview.tsx/MediaPreview.tsx:43-48).
7. **Política D2 "arquivo só dentro do ZAPP"** — o chat abre a URL assinada em nova aba (MediaPreview.tsx:78-80).
8. **Plano de 01/10 etapa 14 removeu o subtítulo; mockup D08 (07/10) manda recolocá-lo** — planos em conflito; código segue a etapa 14.
9. **Planos de 07/10 com "Estado de execução: _A preencher_"** (filtro de data, play de áudio, janela menor, miniaturas, volume sidebar, remover colunas) — todos executados no código (filesPeriod.ts, AudioPlayButton.tsx, MediaPreviewDialog.tsx:91, pdfThumbnail.ts, useVolumeRocker.ts) ou revertidos (colunas).
10. **DESIGN_SYSTEM_PROMO_GIFTS_STATUS.md marca CP2/CP3/CP6 como `[~]` "implementação existe"** — AppHeader, BreadcrumbBar/Teletransporte e StarBackground **não existem** em src.
11. **INBOX_FIDELIDADE_STATUS.md diz que chips de tom da IA e severidade de objeção "não foram implementados"** — existem (AISuggestions.tsx:18-21; ObjectionDetector.tsx:45-55).
12. **Reconciliação de 03/10 (base histórica) ficou desatualizada em**: SK01/SK02 (corrigidos), VOL-01/VOL-02 (corrigidos), TM-02 (corrigido), tipografia E40/E64/E66/E72 e layout L28 (corrigidos), P025-32/35/38/42 (encaminhar fora do filtro e invalidação de contagem — corrigidos em FilesTab.tsx:280-288 e useFilesActions.ts:59-62).
13. **Cartões SL de 08/10 desatualizados**: SL-076 (banner WhatsApp — corrigido em EvolutionDisconnectBanner.tsx:80-93), SL-080 (pausa 429 — SuggestionList.tsx:62), SL-083 (G1–G5 — corrigidos, resta só ARQ-19), SL-178 (EXCECOES.md existe).
14. **glows.md "Jamais reintroduza `shadow-[0_0_Xpx…]`"** — 5 arquivos ainda usam (TalkMeView.tsx, ui/sidebar/sidebar-menu.tsx, ContactTypeTabs.tsx, AIStatsWidget.tsx, TalkXCampaignWizard.tsx).
15. **Coluna/Header parte 2 pede 4 botões 40×40 (Ligar, Vídeo, Transferir, ⋮)** — ChatPanelHeader.tsx hoje só tem "⋮" (:163); Ligar foi para o painel do contato.

---

## 5. Achados fora dos planos

- **Componentes órfãos (sem nenhum import fora de testes)** em src/components/inbox: SwipeableListItem.tsx, MessageContextActions.tsx, MessageContextMenu.tsx, SpeedSelector.tsx (velocidade de áudio), AIToolsPopover.tsx, SentimentIndicator.tsx, TemplatesWithVariables.tsx, LinkPreview.tsx, contact-details/ExternalContact360Panel.tsx, contact-details/ContactIntelligencePanel.tsx, chat/ChatHeader.tsx (só reexportado por chat/index.ts:1, que ninguém importa), chat/ChatHeaderToolbar.tsx, chat/ChatAssignedBar.tsx, chat/MessageSendHistorySheet.tsx, tabs/SenderAvatar.tsx, tabs/journey/JourneyStatsHero.tsx; hooks `useSavedFilters` (só barrel), `useMediaSenderProfiles`, lib `fileSenderIdentity.ts`. Vários são recursos visíveis meio-feitos (velocidade de áudio, swipe no celular, histórico de envio, autor do arquivo).
- **ChatHeader.tsx:152 (órfão)** e **ContactActionButtons.tsx:143-149** (atrás de flag `video_call`) — "Videochamada: Em breve".
- **Caminho de banco externo morto**: `USE_EXTERNAL_DB = false` (src/hooks/inbox/useRealtimeInbox.ts:20).
- **Selo de canal legado com cores literais** (instagram/messenger/telegram…) em VirtualizedRealtimeList.tsx:54-61/362 — contra a regra permanente "sem selo de canal/origem".
- **Contador "Resolvidas" por `messages.length === 0`** (StatusChips.tsx:41) em vez de `contacts.conversation_status`.
- **Cor literal** `text-[#53bdeb]` nos ticks (chat/messageUtils.tsx:52).
- **E2E logado da `main` não conclui** (122/126 runs cancelados, PENDENCIAS_DO_DONO_2026-10-08.md:31) — as provas E2E de volume (media-volume.spec.ts) não estão rodando de fato.
- **Encadeamento de gatilhos quebrado**: R08 (e J15) dependem de C04, cartão revertido em 08/10 (AUTOMACAO_ONDAS_DOS_PLANOS_2026-10-07.md:41/53).
- **Grupos no diálogo de encaminhar do chat**: aba visível, envio sempre falha (useChatPanelHandlers.ts:254).
- **Detalhes de vídeo/áudio no painel** mostram só ícone Play (FileDetailPanel.tsx:55-56), sem o primeiro quadro que o grid já mostra.
- **layout-guard fora do CI** e com 1 violação ativa (TasksModule.tsx).

---

## 6. Top 10 da área

1. **Encaminhar arquivo individual está "Disponível em breve"** no cartão, lista, tabela e detalhes, embora o envio real já funcione via seleção (FileCard.tsx:112-120).
2. **Foto/nome de quem enviou cada arquivo (pedido do dono, mockup R04–R07)**: fundação pronta e órfã; cartão ainda mostra "V"/"Atendente".
3. **Download na aba Arquivos ignora a permissão do perfil** (sempre bloqueado) — inconsistente com o chat e contra a decisão D06.
4. **Encaminhar para grupo aparece no chat e sempre falha** (sem transporte para `whatsapp_groups`).
5. **Fixar/favoritar mensagem, "responder depois", reportar e tag no header não existem** (retirados por não terem backend).
6. **Mensagens interativas (botões/listas) sem transporte** — construtor existe, envio recusado.
7. **Mídia recebida para atendente não-supervisor**: policy de leitura e prova autenticada do encaminhamento sem verificação em produção (ARQ-39).
8. **Talk Me sem histórico antes do aceite, sem E2E e sem homologação/piloto** do dono.
9. **Política "arquivo só dentro do ZAPP" furada pelo chat** (`window.open` da URL assinada em MediaPreview.tsx:78-80).
10. **Detalhes do arquivo exibem prévia quebrada ao trocar de item** (R2-INB-060, correção de uma linha), seguido de: QA visual/funcional de Skins e Inbox ainda bloqueado e prova de som real do volume inexistente.
