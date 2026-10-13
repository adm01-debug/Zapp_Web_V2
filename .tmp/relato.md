Especialista: Edgar (area-edge-api)

## Conclusão
CONCLUÍ: o guarda noturno do dia está vermelho no SHA `96dd72dc5` e o culpado é UM teste de front, `RuleValueInput.test.tsx`, que falha de forma determinística. O outro arquivo acusado pelo noturno (`FilesTab.period.integration.test.tsx`) passa quando rodado sozinho — ele só estoura o timeout de 15s sob a carga da suíte inteira.

## Onde está o guarda noturno
`~/arquitetura-v2/integrador/noturno.sh` ("Turno da noite", 02:00). Não é de edge: roda `zapp-verify full` na ponta da branch do dia, numa worktree desacoplada, e grava o resultado em `~/arquitetura-v2/integrador/noturno.json`. O sensor lê esse arquivo e alerta `teste_vermelho_no_dia`. Não existe guarda noturno específico da minha área (edge); o único passo da área que roda ali é o `db_guard` (que deu OK).

## Estado medido desta noite
- `~/arquitetura-v2/integrador/noturno.json`: `{"estado":"vermelho","rc":1,"branch":"dia/2026-10-13","sha":"96dd72dc5","segundos":2367,"quando":"2026-10-13T04:11:49-03:00"}`.
- `~/arquitetura-v2/integrador/noturno.log`: `OK db_guard`, `OK tipos`, `OK lint`, `OK migrations`, `AVISO banco_local`, `FALHOU testes 1543s` → `VERIFY: VERMELHO em testes (2367s)`.
- Detalhe em `~/.local/state/zapp-verify/bb4df1254046/testes.log`: `Test Files 2 failed | 1313 passed (1315)`, `Tests 2 failed | 11900 passed | 25 expected fail | 14 todo (11941)`.

## O teste que falhou (a resposta do cartão)
Arquivo: `src/components/talkx/__tests__/RuleValueInput.test.tsx`
Nome: `"em breve": Lead score e Risco de churn ficam desabilitados no catálogo`
Linha que quebra: **207** (o `it` começa na 205).
O que ele afirma (linhas 209–222): depois de clicar em "Novo segmento", os indicadores "Lead score" e "Risco de churn" continuam VISÍVEIS com o nome do campo, marcados "em breve", com `disabled` e `draggable=false`, e clicar neles não adiciona condição nenhuma (não aparece o campo "Valor da condição").
Erro: `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`. A linha 207 é `fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }))` e esse botão não existe no DOM. O dump do noturno mostra o editor de um segmento já aberto (placeholders "Nome do segmento…" e "Adicione uma descrição…", botões "Cancelar" e "Criar" desabilitado) — o render do teste chega num estado que já está em modo edição.

Segundo arquivo acusado, medido como NÃO determinístico:
Arquivo: `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx`
Nome: `caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito`
Linha: **314**.
O que ele afirma (a partir da 315): quando cada página traz um item mais NOVO que o "De", o limite de data nunca é cruzado e a varredura só para no teto `MAX_PAGES_TO_LOAD_ALL`, sem skeleton infinito, mantendo visível o item dentro do período.
Erro no noturno: `Error: Test timed out in 15000ms` na linha 314.

## Prova (comandos rodados agora, no SHA 96dd72dc5)
- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx` → `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)` (o que falha é exatamente o teste acima, determinístico).
- `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx` → `Test Files 1 passed (1); Tests 9 passed | 1 todo (10)` (passa isolado: o vermelho dele era só o timeout sob carga da suíte completa).

## Escopo
- Diff do cartão: só `.tmp/relato.md` (o produto é este diagnóstico). Nenhum arquivo de teste ou de produção foi alterado.
- Os dois testes são de front (talkx e inbox), fora da minha área (edge). Não corrigi nada; o dono natural é worker (telas) / worker (testes).
