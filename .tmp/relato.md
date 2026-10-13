Especialista: worker (geral)

## O que mudou e por quê
- `docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md`: copiado de `.assets/paridade-07/` inteiro; a única edição (linha 9) trocou o glob `..._SEGUNDA_PASSADA_*` pelos 4 nomes finais dos relatórios. Sem isso o plano apontava para arquivos que não existem com esse nome — o cartão pede que ele aponte para os nomes finais.
- `docs/audits/AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE1_MENSAGENS_PRESENCA.md`: relatório 1 (leitura de mensagens, status do WhatsApp, presença, identidade de contato) copiado byte a byte de `achados_1_mensagens_presenca.md`.
- `..._PARTE2_VOZ_SIP_MIDIA.md`: relatório 2 (voz, SIP, cache de mídia, métricas), de `achados_2_voz_sip_midia.md`, sem alteração.
- `..._PARTE3_REACOES_TEAMCHAT.md`: relatório 3 (reações e Team Chat), de `achados_3_reacoes_teamchat.md`, sem alteração.
- `..._PARTE4_INVENTARIO.md`: relatório 4 (inventário de tabelas, RPCs, exports, utils e arquivos fora do documento), de `achados_4_inventario.md`, sem alteração.

## Prova
- `diff -q` dos 4 relatórios do workspace contra os fontes em `.assets/paridade-07/` → sem saída (arquivos idênticos, byte a byte).
- `grep -n "SEGUNDA_PASSADA_\*" docs/plans/PLANO_PARIDADE_V3_DOC_07_SEGUNDA_PASSADA_2026-10-13.md` → exit 1 (nenhuma referência à glob antiga sobrou); `grep -n "AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_PARTE"` → as 4 linhas 10-13 com os nomes finais.
- Nomes finais conferidos contra os nomes pedidos no cartão (PARTE1_MENSAGENS_PRESENCA, PARTE2_VOZ_SIP_MIDIA, PARTE3_REACOES_TEAMCHAT, PARTE4_INVENTARIO) com prefixo `AUDITORIA_PARIDADE_V3_DOC_07_2026-10-13_`.
- Busca anti-segredo nos 5 arquivos: `grep -nEi '(bearer |sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}|api[_-]?key|secret|senha|password|\([0-9]{2}\)[0-9]{4,5}-[0-9]{4}|\+55[0-9]{10,})'` → só um casamento, e é descrição de código (`apikey` + `Bearer supabaseKey` (anon) em `playTtsAudio.ts:145-154`), não valor real. Busca por e-mail/CPF/11 dígitos → nenhum dado de cliente; os números longos são timestamps de migration (ex.: `20260924225551`). Nenhum telefone, token ou chave real.
- Os 5 arquivos entraram como `create` no commit — confirma que ainda não existiam na branch (o PH-00 não os havia gravado).
- `git log --oneline -1` → `679a55480d docs(paridade): guarda plano doc 07 2a passada e 4 relatorios`; `git show --stat HEAD` → 5 files changed, 597 insertions(+).

## O que NÃO fiz e por quê
- Não alterei o conteúdo técnico de nenhum relatório nem do plano: o cartão manda copiar; editei só a linha 9 do plano (referência aos nomes finais).
- Não toquei em `.assets/` nem em nenhum arquivo fora do workspace; origem preservada.
- Sem teste de software: os produtos são documentos, não código executável — a verificação é identidade de conteúdo (diff -q) e coerência das referências (grep).
