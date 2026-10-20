Especialista: semisenior (docs de paridade; sem skill de área — cartão de documentação)

Refazer 1 do t_294ad89c: mantive os 4 arquivos da entrega anterior byte a byte e somei
só o que a recusa pediu — nota de split no plano (P1) e 4 atestados com linha exata
conferida na dia/2026-10-14 (P2–P5). Patch 78.356 chars (< 90k), 4 arquivos, sem
código de produção tocado. PARTE3 vai idêntica à entrega anterior.

Ponto 1 (incluir a PARTE4) → RESOLVIDO DE OUTRO JEITO (recusa pedia o errado):
não incluí. Decisão do coordenador de 14/10 (posterior à recusa) divide de propósito —
este cartão = plano + PARTES 1–3, PARTE4 = t_6587228b — e a PARTE4 já está integrada
na dia (`docs/audits/...PARTE4_INVENTARIO.md`, blob 3d4cd1ed, commit 80236dd719).
Incluir aqui duplicaria o filho e estouraria o teto de 90k. O plano agora registra o
split ("3 arquivos neste cartão; a PARTE4 vai em cartão próprio, t_6587228b").
Teste: `P1-plano-cita-split-t_6587228b` FALHA na entrega anterior, PASS agora;
`P1-parte4-na-dia` + `P1-parte4-fora-deste-cartao` PASS.

Ponto 2 (2 edges sem log de texto) → PARTE2 §5: tts-stream só loga tamanho/voz
(`:50`) e status (`:99`,`:105`,`:115`), `grep -i transcript` vazio; agent-token só
`agentId`/status (`:29`,`:40`,`:73`,`:80`,`:84`); contraste: voice-agent:104 ainda
loga (virou ação do P1). Teste `P2-atestado-no-relato` FALHA antes, PASS agora.

Ponto 3 (recover persiste no bucket; front assina URL; sem base64) → PARTE2 §5:
`persistBase64Media` (`:279-280`, URL permanente `:384`, bucket `:117`); front só
`supabase.storage` assina URL curta (`useResolvedStorageUrl.ts:85`), `grep -i base64`
vazio. Teste `P3-atestado-no-relato` FALHA antes, PASS agora.

Ponto 4 (4 cartões copiloto + "ver na conversa") → PARTE2 §5, com o estado VERDADEIRO:
`search_tasks` (`:155`, t_b6eb108a APROVADO), `search_catalog_products` (`:204`,
t_6dec2fc6, anon key `:11`,`:215`,`:218`), `search_files_in_conversation` (`:401`,
t_b8b573c3 APROVADO); `search_emails` (t_9ae66b75) recusado e AUSENTE na dia; front
não invoca a edge (só comentário em `postgrestFilters.ts:16`); "ver na conversa" =
`scrollToMessage` (`ChatMessagesArea.tsx:304-309`). Não escrevi "4 cartões ligam
front→edge" porque é falso — atestado falso seria defeito novo. Teste
`P4-atestado-no-relato` FALHA antes, PASS agora.

Ponto 5 (stories vazio em GO) → PARTE1 §5: `evolution-api/index.ts:914`, `isGoFlavor`
→ `goHistoryNotSupported('find-status-messages')`. Teste `P5-atestado-no-relato`
FALHA antes (citava :914 como não-verificado), PASS agora.

Arquivos (4, todos novos na dia):
docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE1_MENSAGENS_PRESENCA.md
docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE2_VOZ_SIP_MIDIA.md
docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE3_REACOES_TEAMCHAT.md
docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md

Prova:
- `bash .tmp/verifica_atestados.sh /tmp/doc07-base` (entrega anterior): PASS=14 FALHA=5, RC=1
- `bash .tmp/verifica_atestados.sh $WS`: PASS=19 FALHA=0, RC=0
- `wc -m ENTREGA.patch` = 78356 (< 90000); `grep -c "^+" ENTREGA.patch` = 396
- Entrega em patch (sem git nesta sessão — clone/worktree bloqueados pela guarda):
  `ENTREGA.patch` aplica arquivos novos em docs/audits + docs/plans
- Limite da sessão: não rodei `zapp-verify --rapido` (exige checkout completo; este
  workspace tem só os 4 docs + patch). Nenhum código de produção foi tocado.
