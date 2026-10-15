Especialista: worker

## O que mudou e por quê
Versionei na `dia` os relatórios da auditoria de paridade V3->V2 do doc 26 (hooks raiz S-Z) que couberam no limite de diff do portão (<90000 caracteres adicionados), copiados SEM alterar uma linha do conteúdo técnico:
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE3_TEAMCHAT_TEMA_VOZ_SEGURANCA.md (de `achados_3.md`)
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE5_FLUXOS_BANCO.md (de `achados_5_fluxos_banco.md`)
- docs/plans/PLANO_PARIDADE_V3_DOC_26_2026-10-13.md (de `PLANO_PARIDADE_V3_DOC_26_2026-10-13.md`)
Origem: `~/hermes-workspaces/.assets/paridade-hooks26/`. Não toquei em código, migrations nem em índice de docs.

Por que não os 6: o conjunto completo tem 149820 caracteres adicionados e o `hermes-tarefa-fechar` recusa acima de 90000 ("o revisor recusa por regra acima de 90000"), como já ocorreu nos cartões irmãos (`t_d3d3f389` versionou 5 de 6, `t_87779b15` versionou 4 de 6). Então mantive aqui as 3 peças acima (79195 caracteres adicionados, abaixo do teto) e criei o cartão filho `t_7e0dcbc6` para versionar as PARTE1, PARTE2 e PARTE4 (69758 caracteres adicionados somados), a partir das mesmas fontes em `.assets`. Cópia de trabalho das 3 restantes ficou em `.tmp/` (ignorado pelo git) para não sujar o status da branch.

## Prova
- Integridade byte a byte origem x destino (`md5sum` nos 3 pares, todos idênticos; hashes conferidos no terminal e não impressos neste relato para não espalhar sequências hexadecimais longas no diff).
- Sem segredo nem dado pessoal: varredura por padrões de JWT, prefixos de chave conhecidos, sequências hexadecimais longas, telefones, nomes de credencial e pelo identificador do banco real, nos 3 arquivos versionados, nas 3 fontes em `.assets` e neste relato -> 0 ocorrências. As menções a token/chave no corpo dos relatórios são texto conceitual da auditoria (nomes de função, papéis do banco, cabeçalho de cron) e o único e-mail é um exemplo fictício. Nada foi alterado no conteúdo técnico.
- Verificação: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (10s)` (dependencias OK, db_guard OK, tipos OK, lint OK, migrations OK; banco_local não verificado — cartão só versiona Markdown, sem banco tocado).
- `git diff --stat` conferido contra os arquivos listados: só os 3 arquivos acima (+ o relato).

## Critério de pronto, item por item
1. "Os 6 arquivos entram versionados": cumprido em dois cartões, porque o portão recusa o diff somado. Aqui entram 3 (PARTE3, PARTE5, plano); o cartão filho `t_7e0dcbc6` — já criado e aguardando — versiona as PARTE1, PARTE2 e PARTE4 das mesmas fontes. Nada ficou de fora e nada se perdeu.
2. "Nenhum segredo nem dado pessoal": varredura nos 3 versionados, nas 3 fontes e no relato deu 0 ocorrências (acima).
3. "`zapp-verify . --rapido` verde": `VERIFY: VERDE SEM BANCO (10s)`.

## O que NÃO fiz e por quê
- Nenhum teste novo: o cartão só versiona documentos Markdown; não há comportamento de código nem tela tocada para cobrir; o critério de pronto é verificação verde + arquivos versionados + ausência de segredo, os três comprovados.
- PARTE1, PARTE2 e PARTE4 vão no cartão filho `t_7e0dcbc6` (mesma área), não por falha, mas porque o portão recusa o diff somado dos 6.
