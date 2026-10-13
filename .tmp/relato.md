Especialista: Edgar (area-edge-api)

## Resposta direta (o que o cartão pede)

O guarda noturno existe e NÃO é específico de edge: é `~/arquitetura-v2/integrador/noturno.sh` ("Turno da noite", 02:00), que roda `zapp-verify full` na ponta da branch do dia numa worktree desacoplada e grava o resultado em `~/arquitetura-v2/integrador/noturno.json`. Na noite de 13/10 ele ficou `vermelho` (rc=1) para `dia/2026-10-13 @ 96dd72dc5`, e o único passo vermelho foi `testes`. Dois testes falharam — os dois de front, nenhum de edge.

TESTE 1 (vermelho determinístico, reproduzido agora no SHA 96dd72dc5):
- arquivo: `src/components/talkx/__tests__/RuleValueInput.test.tsx`
- nome: `"em breve": Lead score e Risco de churn ficam desabilitados no catálogo`
- linha que quebra: 207 (o `it` começa na 205)
- o que afirma (linhas 209–222): depois de clicar em "Novo segmento", os indicadores "Lead score" e "Risco de churn" continuam VISÍVEIS com o nome do campo, marcados "em breve", `disabled` e não arrastáveis (`draggable=false`), e clicar neles não adiciona condição (não aparece "Valor da condição").
- erro: `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"` — a linha 207 faz `fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }))` e esse botão não existe no DOM. O dump mostra o editor de um segmento já aberto (placeholders "Nome do segmento…"/"Adicione uma descrição…", botões "Cancelar" e "Criar" desabilitado) — ou seja, o teste chega ao render num estado que já está em modo edição.
- reprodução: `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Tests 1 failed | 4 passed (5)`, e o único que falha é este.

TESTE 2 (vermelho só sob carga do suite, NÃO determinístico):
- arquivo: `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx`
- nome: `caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito`
- linha: 314 (o `it` em si)
- o que afirma (linhas 315–...): quando cada página traz um item mais NOVO que o "De", o limite de data nunca é cruzado e a varredura de páginas só para no teto `MAX_PAGES_TO_LOAD_ALL`; o item dentro do período continua visível e não há skeleton infinito.
- erro no noturno: `Error: Test timed out in 15000ms` na linha 314.
- reprodução: rodando os dois arquivos juntos, o FilesTab PASSOU (`1 failed | 1 passed`); só caiu no `zapp-verify full` (suíte inteira, 1541s). É timeout por carga, não vermelho determinístico.

## O que rodei
- `npx vitest run <os 2 arquivos>` → `Test Files 1 failed | 1 passed (2); Tests 1 failed | 13 passed | 1 todo (15)` — RuleValueInput fail, FilesTab pass.
- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)`.
- li `~/arquitetura-v2/integrador/noturno.json` (`estado=vermelho, rc=1, branch=dia/2026-10-13, sha=96dd72dc5`) e o log `~/arquitetura-v2/integrador/noturno.log` → `VERIFY: VERMELHO em testes (2367s)`.

## O que NÃO fiz e por quê
- Não alterei teste nem código: o cartão é de reprodução/diagnóstico, não de correção. Nenhum arquivo do repositório foi tocado (diff vazio).
- Não rodei `zapp-verify full` de novo: já dura ~40 min e a evidência completa está no `noturno.log` desta mesma noite; reproduzi só os dois arquivos suspeitos citados nele.
- Os dois testes falhos são de front (talkx e inbox), fora da minha área (edge). Corrigi nada; aponto o dono: worker (telas) / worker (testes).
