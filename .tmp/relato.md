Especialista: worker (telas)

[refazer 1] TL-158 — tabela unificada de destinatários. Resolvo abaixo os 3 pontos
da recusa, na mesma ordem e numeração.

## Ponto 1 — Ritmo de Entrega volta a receber o filtro de status
O que mudei (`src/components/talkx/TalkXLiveMonitor.tsx`, linha 129):
`useTalkXMonitor(campaignId)` → `useTalkXMonitor(campaignId, statusFilter)`.
Era a única mudança de comportamento fora do escopo: a entrega anterior tinha
tirado o filtro do gráfico "Ritmo de Entrega" sem pedido do cartão e sem relato.
A consulta da Saúde (linha 141) continua sem filtro, como antes do cartão.
No comentário X148 logo abaixo (linhas 131-136), a frase "A consulta acima recebe
o filtro de status da aba de destinatários" volta a ser verdadeira com a reversão;
fiz um ajuste a mais no MESMO comentário: removido o parêntese "(mesmo motivo
pelo qual o gráfico de ritmo também não deve receber esse filtro)", herdado do
TL-157, que passaria a afirmar o contrário do código (o gráfico recebe o filtro,
só a Saúde não). Sem esse ajuste o comentário continuaria falso — foi o que a
recusa mandou corrigir ("fazer o comentário X148 voltar a ser verdadeiro").
Teste que prova (`src/components/talkx/__tests__/TalkXLiveMonitor.entregas.test.tsx`
› "o gráfico Ritmo de Entrega recebe o filtro de status da aba (X148)"): renderiza
o monitor real, troca o filtro para "Falha" no combobox "Filtrar por estado" e
afirma que `useTalkXMonitor` (caminho real de import da tela) foi chamado com
`('camp-1', 'failed')` — e que a chamada da Saúde segue sem filtro.
Vermelho sem a correção: `Tests 1 failed | 5 skipped (6)` (o filtro nunca chega
ao hook). Verde com ela: `Test Files 1 passed (1); Tests 6 passed (6)`.

## Ponto 2 — JSDoc de `segment_name` reflete a origem real
O que mudei (`src/components/talkx/tracking/TalkXRecipientsTable.tsx`, linha 74):
"vem da leitura paginada (X144); hoje fica "—"" → "preenchido pela tela via join
`segments:segment_id(name)` ("—" quando ausente)". As duas telas já preenchem o
campo por esse join (`TalkXLiveMonitor.tsx` linha 83/90 e
`TalkXCampaignRunning.tsx` linha 288/294). Só comentário, sem comportamento;
sem teste novo (nenhum ramo de produção muda).

## Ponto 3 — Relato
Este arquivo (`.tmp/relato.md`) está listado entre os tocados (ver lista abaixo).
A tabela NÃO usa `useTalkXRecipientsPage`: o título pedia a tabela "sobre" esse
hook, mas ele é a leitura paginada por cursor da etapa X144, que mora em
`src/hooks/**` — fora da área deste cartão (telas) — e ainda não existe; por isso
a tabela é apresentacional (recebe as linhas já lidas pela consulta de cada tela,
cabeçalho do arquivo, linhas 28-29) e o filtro/busca rodam na tela, como o próprio
cabeçalho já documenta (linhas 20-22). A asserção "Mostrando 1 de 2" do
`segmentoPico.test.tsx` virou "Mostrando 1 a 1 de 1 destinatários" porque o rodapé
antigo da tela 11 contava `filtrados de lidos` (`Mostrando ${filtered.length} de
${recips?.length}`) e o rodapé novo da tabela unificada conta o recorte filtrado
(`TalkXPagination` sobre `filtered`), não o total lido.

## Arquivos tocados (`git diff --name-only 2656ebc64...HEAD`, só estes 4)
- src/components/talkx/TalkXLiveMonitor.tsx (pontos 1: filtro do Ritmo + X148)
- src/components/talkx/tracking/TalkXRecipientsTable.tsx (ponto 2: JSDoc)
- src/components/talkx/__tests__/TalkXLiveMonitor.entregas.test.tsx (ponto 1: prova)
- .tmp/relato.md (ponto 3: este relato)

## Verificações (comandos rodados agora, resultado real)
- `npx vitest run` nos 4 arquivos do cartão (RecipientsTable, CampaignRunning
  destinatarios, LiveMonitor entregas, CampaignRunning segmentoPico):
  `Test Files 4 passed (4); Tests 28 passed (28)`.
- `npx tsc --noEmit`: sem saída (exit 0).
- `npx eslint` nos 3 arquivos de código/teste: sem saída (exit 0).
- `zapp-verify . --rapido`: `VERIFY: VERDE SEM BANCO (15s)` (sem migration no cartão).
- `git diff --stat`: 3 arquivos de código/teste + relato, todos deste cartão;
  nenhum chamador de `useTalkXMonitor` além deste monitor (rg confere).
