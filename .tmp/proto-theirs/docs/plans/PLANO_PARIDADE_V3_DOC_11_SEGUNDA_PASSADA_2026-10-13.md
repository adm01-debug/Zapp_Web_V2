# Plano de paridade V3 → V2 — doc 11 (inbox/components raiz M–Z), segunda passada

Data: 13/10/2026. Pedido do Joaquim: auditar `docs/estado/11-features-inbox-components-raiz-m-z.md` da V3 e achar o que existe lá e não existe (ou é pior) na V2.

## 1. Como foi feito
- O doc 11 já fora auditado em 12/10 (cartões PE/PD/PK). Esta é a **segunda passada**: 4 leitores em paralelo, somente leitura, comparando o código real da V3 (o documento é de agosto, defasado) com a V2 por comportamento, e reportando só o que não tem cartão. Relatórios versionados em `docs/audits/`: `AUDITORIA_PARIDADE_V3_DOC_11_2026-10-13_PARTE1_indicadores_paineis.md`, `AUDITORIA_PARIDADE_V3_DOC_11_2026-10-13_PARTE2_ia_voz.md`, `AUDITORIA_PARIDADE_V3_DOC_11_2026-10-13_PARTE3_templates_tabs_lista.md`, `AUDITORIA_PARIDADE_V3_DOC_11_2026-10-13_PARTE4_upload_inventario_testes.md`.
- Eu conferi no código da `dia` os achados P1 antes de criar cartão: webhook lendo `result.text` (a Edge responde `transcription`), `RealtimeCollaboration` sem tratar erro, `useAmbientColor` só em inglês, `getPublicUrl('audio-memes')` no Voice Changer, favicon de qualquer domínio, `atendente` fixo e `protocolo` aleatório, listener de Enter/Tab do slash. O banco real não foi consultado: os cartões de banco mandam provar no banco LOCAL.
- Inventário: 186 arquivos M–Z da V3 (141 de código, 45 de teste), nenhum P0 novo. A V2 é melhor que a V3 em upload, StickerPicker, busca global, lista virtualizada, Edges de voz (autenticação, limite, ledger), A1/A2/A5/A8/A12/A14 do doc.
- Decisões tomadas sem perguntar: `{protocolo}` falso sai das variáveis; `voice-changer` NÃO é removida (tem chamador), é endurecida; transferência do painel usa a RPC `transfer_conversation` quando existir.

## 2. Cartões (série DK; ids)
| Código | Cartão |
|---|---|
| DK-00 | t_0fc9edad |
| DK-01 | t_26f07b15 |
| DK-02 | t_66ca47a5 |
| DK-03 | t_a335d7a1 |
| DK-04 | t_6c5eb46e |
| DK-05 | t_1f12d992 |
| DK-06 | t_00a8e944 |
| DK-07 | t_4e5a8d05 |
| DK-08 | t_1c2e589e |
| DK-09 | t_0c84b4f3 |
| DK-10 | t_ecedc332 |
| DK-11 | t_bb9499d4 |
| DK-12 | t_156cb1ae |
| DK-13 | t_90d387e2 |
| DK-14 | t_82c8198d |
| DK-15 | t_e7690753 |
| DK-16 | t_29118e78 |
| DK-17 | t_71579b7c |
| DK-18 | t_820368b9 |
| DK-19 | t_2d920fd6 |
| DK-20 | t_6049669e |
| DK-21 | t_2de824d2 |
| DK-22 | t_f228beec |
| DK-23 | t_ed64c452 |
| DK-24 | t_6fdb9a0d |
| DK-25 | t_42f6cfbb |

P1: DK-01..13. P2: DK-14..30 (DK-26..30 adicionados no mesmo dia; DK-29/30 = áudio no sussurro, aprovado pelo Joaquim). DK-00 grava este plano e os relatórios no repositório.

## 3. Ajustes em cartões existentes (comentários postados)
t_12c4e41d (Enter/Tab do slash), t_9ccb93b3 (trava de segurança da prévia de link), t_f73eb99b/SL2 (sem prazo de resolução no tooltip), t_af3e8b39/RT2 (conferir integração), t_7db72a5f/SE1 (usar o mapeador de sentimento), t_4d6e43dc/PK-26 (desenho dos magic bytes).

## 4. Fora de escopo / não portar
Tags, exportar/importar, SLA de Resolução, VirusTotal (DE5), código morto da V3, áudio no sussurro (só se o dono quiser). Posição na fila (A4): subsistema dormente já tratado pelos cartões de fila; sem produtor novo.

## 5. Validação no fim
Relato com `Especialista: X` e linha de resultado dos testes; `zapp-verify . --rapido` verde; DK-04, DK-08 e DK-23 com prova no banco local com papéis reais; integração conferida na `dia`; refazer para o que o revisor recusar.

## 6. Não consegui verificar
Banco real (policies de `whisper_messages` e `storage.objects`, `ai_sentiment`, tamanho de `messages`), runtime e leitor de tela, e entregas `done` ainda não integradas (PE-55, PE-56, PE-59, PE-60, PE-62, WH1, RT2, AX1).
