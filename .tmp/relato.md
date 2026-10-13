Especialista: worker

## O que mudou e por quê
Versionei na `dia` os relatórios da auditoria de paridade V3->V2 do doc 26 (hooks raiz S-Z) que couberam no limite de diff do portão (<90000 caracteres adicionados), copiados SEM alterar uma linha do conteúdo técnico:
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE3_TEAMCHAT_TEMA_VOZ_SEGURANCA.md (de `achados_3.md`)
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_26_2026-10-13_PARTE5_FLUXOS_BANCO.md (de `achados_5_fluxos_banco.md`)
- docs/plans/PLANO_PARIDADE_V3_DOC_26_2026-10-13.md (de `PLANO_PARIDADE_V3_DOC_26_2026-10-13.md`)
Origem: `~/hermes-workspaces/.assets/paridade-hooks26/`. Não toquei em código, migrations nem em índice de docs.

Por que não os 6: o conjunto completo tem 149820 caracteres adicionados e o `hermes-tarefa-fechar` recusa acima de 90000 ("o revisor recusa por regra acima de 90000"), como já ocorreu nos cartões irmãos (`t_d3d3f389` versionou 5 de 6, `t_87779b15` versionou 4 de 6). Então mantive aqui as 3 peças acima (78526 caracteres adicionados, abaixo do teto) e criei o cartão filho `t_7e0dcbc6` para versionar as PARTE1, PARTE2 e PARTE4 (69758 caracteres adicionados somados), a partir das mesmas fontes em `.assets`. Cópia de trabalho das 3 restantes ficou em `.tmp/` (ignorado pelo git) para não sujar o status da branch.

## Prova
- Integridade byte a byte origem x destino (`md5sum`), todas idênticas: `51cf07bf1a87362c72b98d0d92ced304` (PARTE3 = achados_3.md), `b3172d45701f76e7aafd4dbaf7ee0814` (PARTE5 = achados_5_fluxos_banco.md), `612f9c2d2783edf994450f0de254fe53` (plano).
- Sem segredo nem dado pessoal: busca (`search_files`, regex de JWT `eyJ...`, `sk-`, `ghp_`, hex/hash longo, telefone `+55`/`(DD)9...`, `service_role_key`/`anon_key`/`Bearer`) nos 6 arquivos-fonte -> 0 ocorrências; os casamentos de "token"/"chave"/"secret" são texto conceitual (ex.: `x-cron-secret`, chave de cache) e o único e-mail é o exemplo `a@x.com`. O identificador do banco real NÃO aparece.
- Verificação: `zapp-verify . --rapido` -> `VERIFY: VERDE SEM BANCO (232s)` (dependencias OK, db_guard OK, tipos OK, lint OK, migrations OK).
- `git diff --stat` conferido contra os arquivos listados: só os 3 arquivos acima (+ o relato).

## O que NÃO fiz e por quê
- Nenhum teste novo: o cartão só versiona documentos Markdown; não há comportamento de código nem tela tocada para cobrir; o critério de pronto é verificação verde + arquivos versionados + ausência de segredo, os três comprovados.
- PARTE1, PARTE2 e PARTE4 vão no cartão filho `t_b16d2b1a` (mesma área), não por falha, mas porque o portão recusa o diff somado dos 6.
