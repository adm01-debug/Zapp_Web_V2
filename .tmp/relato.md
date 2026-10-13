Especialista: worker

## O que mudou e por quê
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_PARTE1_FLUXOS.md — arquivo novo, cópia verbatim de `achados_1_fluxos.md` da 2ª passada do doc 13 (components/ui). Os 4 relatórios e o plano estavam soltos em `~/hermes-workspaces/.assets/paridade-ui2/` e fora do repositório somem; o cartão manda versioná-los.
- docs/audits/AUDITORIA_PARIDADE_V3_DOC_13_2026-10-13_PARTE2_PRIMITIVOS.md — arquivo novo, cópia verbatim de `achados_2_primitivos.md`.
- docs/plans/PLANO_PARIDADE_V3_DOC_13_SEGUNDA_PASSADA_2026-10-13.md — arquivo novo, cópia verbatim do plano homônimo, agora em `docs/plans/`.
- Conteúdo técnico NÃO alterado: o sha256 de cada destino é idêntico ao da origem (tabela em Prova). Nenhum arquivo de código tocado — só documentos, como o cartão manda ("Não toque em código").

## Prova
- conteúdo inalterado (origem = destino, `sha256sum` par a par):
  e7d73488c8f87d63a96e343fe2dd9b210a7c066ebee9bca9c21860c2b823a4ae  achados_1_fluxos.md = docs/audits/..._PARTE1_FLUXOS.md
  faa341dc635886b982f284660c831524a7c9bd480067095c2016adda5962d858  achados_2_primitivos.md = docs/audits/..._PARTE2_PRIMITIVOS.md
  cba8f267270f890c3b4b3e228f073b28f17f181151faabda9d0cd7fbeede1b1b  PLANO_PARIDADE_V3_DOC_13_SEGUNDA_PASSADA_2026-10-13.md = docs/plans/PLANO_PARIDADE_V3_DOC_13_SEGUNDA_PASSADA_2026-10-13.md
- segredo/dado pessoal: grep nos arquivos gravados por JWT (`eyJ…`), `sk-…`, `Bearer …`, `sbp_…`, `SUPABASE_SERVICE_ROLE_KEY=` → NENHUM; por CPF/e-mail → NENHUM; por telefone → NENHUM nos 3 arquivos deste commit (o único exemplo é sintético de teste, `"11999990000"` → `"+55 11 99999-0000"`, e está no arquivo da PARTE 3, que foi para o cartão irmão t_5d53ca14).
- verificação do cartão: `zapp-verify . --rapido` → `OK dependencias`, `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, linha final `VERIFY: VERDE SEM BANCO (181s)`. Banco não é exigido aqui: o cartão é só de documentos.
- árvore limpa ao fechar: `git status --short` vazio antes do fechar.

## Critério de pronto (cartão)
1. Os 5 arquivos entram versionados: 3 entram neste commit (PARTE 1, PARTE 2 e o plano) e os 2 restantes no cartão filho **t_5d53ca14**, porque o próprio `hermes-tarefa-fechar` recusa diff acima de 90000 caracteres adicionados e mandou "dividir a entrega" (nada se perde: a origem em `~/hermes-workspaces/.assets/paridade-ui2/` continua lá). Não é parcial: é a divisão exigida pelo portão.
2. Nenhum segredo nem dado pessoal: provado por grep acima.
3. `zapp-verify . --rapido` verde: provado acima.

## Por que este cartão entrega 3 dos 5 arquivos (não é entrega parcial por preguiça)
O `hermes-tarefa-fechar` recusou a entrega com os 5 arquivos juntos: `ERRO: o diff tem 139361 caracteres ADICIONADOS e o revisor recusa por regra acima de 90000 (não dá para revisar tudo) ... ou divida a entrega`. O limite é do próprio portão, não contornável. Dividi pelo tamanho, como ele manda: PARTE 1 (225 linhas) + PARTE 2 (312 linhas) + o plano (45 linhas) cabem; PARTE 3 (242 linhas) e PARTE 4 (61 linhas) foram para o cartão irmão **t_5d53ca14** (`docs(paridade): grava a 2a passada do doc 13 (partes 3 e 4) em docs/audits`, perfil worker, filho deste cartão), que já nasce com o mapa de origem→destino e a exigência de sha256 igual. O conteúdo-fonte continua intacto em `~/hermes-workspaces/.assets/paridade-ui2/`, então nada se perde: o irmão só copia.

## Notas de execução (para o integrador)
- `.tmp/relato.md` já estava versionado no repositório (trazido de volta pelo commit `0ca0e1c4df`, apesar do `chore(git)` que tira `.tmp/` do versionamento) e o fechar exige árvore limpa; como a guarda bloqueia `git restore`, o relato entra neste mesmo commit.
- O histórico intermediário (5 arquivos num commit, depois 2 removidos) foi achatado com `git reset --soft dia/2026-10-13` e re-commitado: o branch tem 1 commit com o diff final. O disco encheu no meio da tarefa (`No space left on device`) e o SSH para o WSL caiu 2 vezes; as duas coisas se resolveram sozinhas e não sobrou estado sujo (conferido em `git status`).

## O que NÃO fiz e por quê
- Não integrei UI-01..UI-10 nem toquei em `docs/estado/13-components-ui.md`: fora do escopo deste cartão (ele só pede versionar os relatórios e o plano).
- Não alterei o conteúdo técnico dos relatórios, inclusive o exemplo sintético de telefone da PARTE 3 (o cartão proíbe alterar o texto).
