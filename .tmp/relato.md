Especialista: worker

## O que mudou e por quê
- `docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md` (novo): cópia integral de `~/hermes-workspaces/.assets/paridade-07/`; a única edição (linhas 9-13) trocou o glob `..._SEGUNDA_PASSADA_*` pelos 4 nomes finais dos relatórios, como o cartão pede. Nenhum conteúdo técnico foi alterado.
- `docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE1_MENSAGENS_PRESENCA.md` (novo): relatório 1 (leitura de mensagens, status do WhatsApp, presença, identidade de contato), cópia de `achados_1_mensagens_presenca.md`.
- `..._PARTE2_VOZ_SIP_MIDIA.md` (novo): relatório 2 (voz, SIP, cache de mídia, métricas), de `achados_2_voz_sip_midia.md`.
- `..._PARTE3_REACOES_TEAMCHAT.md` (novo): relatório 3 (reações e Team Chat), de `achados_3_reacoes_teamchat.md`.
- `..._PARTE4_INVENTARIO.md`: NÃO entrou neste cartão. O diff somado dos 5 arquivos deu 106.912 caracteres adicionados e o `hermes-tarefa-fechar` recusa acima de 90000 ("divida a entrega"). Para não violar o limite, a PARTE4 (28.849 caracteres) foi para o cartão-filho `t_6587228b`, com o mesmo conteúdo e o nome final — o plano já aponta para ele, e as 4 partes ficam completas quando o filho entrar. O pai deste cartão não pediu arquivo por arquivo; o critério 1 (os 5 arquivos versionados) é cumprido pelo conjunto t_43560f34 + t_6587228b na mesma `dia`.

## Prova
- `diff -q` dos 3 relatórios versionados contra os fontes em `.assets/paridade-07/` → sem saída (idênticos byte a byte).
- `grep -n "SEGUNDA_PASSADA_\*" docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md` → exit 1 (nenhuma referência à glob antiga); `grep -n "AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE"` → linhas 10-13 com os 4 nomes finais.
- Anti-segredo nos arquivos: `grep -nEi '(bearer |sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|api[_-]?key|secret|senha|password|\([0-9]{2}\)[0-9]{4,5}-[0-9]{4}|\+55[0-9]{10,})'` → 1 único casamento, e é descrição de código (`apikey` + `Bearer supabaseKey` (anon) em `playTtsAudio.ts:145-154`), não valor real. Busca por e-mail/CPF/11 dígitos → nenhum dado de cliente; os números longos são timestamps de migration (ex.: `20260924225551`).
- `git diff --numstat dia/2026-10-13...HEAD` → 5 entradas (plano + 3 partes + relato), 75k caracteres adicionados (abaixo do limite de 90k). O commit `409964b28d` tira a PARTE4 da árvore deste ramo.
- `git log --oneline` → `679a55480d docs(paridade): guarda plano doc 07 2a passada e 4 relatorios`, `a68cb190d6` (relato), `409964b28d` (tira a PARTE4).
- `zapp-verify . --rapido` → VERDE (sem arquivo de código tocado; só `.md`).

## O que NÃO fiz e por quê
- Não alterei conteúdo técnico de relatório nem de plano; só a linha de referências do plano.
- Não toquei em código, em `.assets/` nem em nenhum arquivo de outro assunto.
- Sem teste de software: os produtos são documentos. A verificação é identidade de conteúdo (`diff -q`) e coerência das referências (`grep`); a suíte do projeto roda no `zapp-verify`.
