Especialista: senior (area-edge-api)

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
Erro: `TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"`. A linha 207 é `fireEvent.click(await screen.findByRole('button', { name: 'Novo segmento' }))` e esse botão não existe no DOM. O dump mostra o editor de um segmento já aberto (placeholders "Nome do segmento…" e "Adicione uma descrição…", botões "Cancelar" e "Criar" desabilitado) — o render do teste chega num estado que já está em modo edição.

Segundo arquivo acusado, medido como NÃO determinístico:
Arquivo: `src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx`
Nome: `caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito`
Linha: **314**.
O que ele afirma (a partir da 315): quando cada página traz um item mais NOVO que o "De", o limite de data nunca é cruzado e a varredura só para no teto `MAX_PAGES_TO_LOAD_ALL`, sem skeleton infinito, mantendo visível o item dentro do período.
Erro no noturno: `Error: Test timed out in 15000ms` na linha 314.

## Prova (comandos rodados agora, neste refazer)
Workspace gravável: `/home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/reproduzir-guarda-noturno-sha-96dd72dc5-261013044482af` — `git rev-parse HEAD` → `36dcf0e6666abc502b475a21f55a8beae3e0dab8` (filho direto de `96dd72dc5f`; o único arquivo que ele muda é este relato, então a árvore testada é a do SHA do cartão).

- `npx vitest run src/components/talkx/__tests__/RuleValueInput.test.tsx > /tmp/repro-rulevalue.log 2>&1; echo rc=$?` → `rc=1` e `Test Files 1 failed (1); Tests 1 failed | 4 passed (5)` (o que falha é exatamente o teste acima, determinístico).
- `npx vitest run src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx > /tmp/repro-filestab.log 2>&1; echo rc=$?` → `rc=0` e `Test Files 1 passed (1); Tests 9 passed | 1 todo (10)` (passa isolado: o vermelho dele era só o timeout sob carga da suíte completa).

## Log bruto da reprodução (RuleValueInput, rc=1)
Saída literal do comando acima (só removi os códigos de cor ANSI; o trecho do dump do DOM foi cortado no meio, sem reescrever nada):
```
RUN  v4.1.11 /home/joaquim_ataides/hermes-workspaces/Zapp_Web_V2/reproduzir-guarda-noturno-sha-96dd72dc5-261013044482af

 ❯ src/components/talkx/__tests__/RuleValueInput.test.tsx (5 tests | 1 failed) 6173ms
     × "em breve": Lead score e Risco de churn ficam desabilitados no catálogo 5023ms

────── Failed Tests 1 ──────

 FAIL  src/components/talkx/__tests__/RuleValueInput.test.tsx > TalkXSegments · campo de valor por tipo (X106) > "em breve": Lead score e Risco de churn ficam desabilitados no catálogo
TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"

Ignored nodes: comments, script, style
<body
  style=""
>
  <div>
    <div
      class="w-full min-w-0 space-y-4"
    >
      <nav
        aria-label="Trilha de navegação"
        class="flex items-center gap-1.5 text-2xs text-muted-foreground px-0.5"
      >
        <span>
          Talk X
        </span>
        <span
          class="text-border"
        >
          ›
        </span>
        <span>
          Campanhas
        </span>
        <span
          class="text-border"
        >
          ›
        </span>
        <span
          class="text-foreground font-medium"
        >
          Segmentos
        </span>
      </nav>
[...corte: dump do DOM omitido no meio, sem reescrever nada...]
              <input
                aria-invalid="false"
                class="flex w-full rounded-xl ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 md:text-sm border-input focus-visible:outline-none focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:shadow-glow-primary-sm text-lg font-bold border-0 bg-transparent p-0 h-auto focus-visible:ring-0 text-foreground placeholder:text-muted-foreground/50"
                placeholder="Nome do segmento…"
                value=""
              />
              <input
                aria-invalid="false"
                class="flex w-full rounded-xl ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground disabled:cursor-not-allowed disabled:opacity-50 transition-all duration-200 md:text-sm border-input focus-visible:outline-none focus-visible:border-primary focus-visible:ring-primary/20 focus-visible:shadow-glow-primary-sm text-[13px] border-0 bg-transparent p-0 h-auto mt-0.5 focus-visible:ring-0 text-foreground-secondary placeholder:text-muted-foreground/40"
                placeholder="Adicione uma descrição para este segmento…"
                value=""
              />
[...corte: dump do DOM omitido no meio, sem reescrever nada...]
              <button
                class="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-input/40 text-foreground font-medium hover:bg-muted/50 transition-colors shrink-0 h-9 text-[13px] px-3.5"
                type="button"
              >
                Cancelar
              </button>
              <button
                class="inline-flex items-center gap-2 rounded-lg bg-primary text-white font-semibold hover:bg-primary/90 transition-colors shrink-0 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 h-9 px-4 text-[13px]"
                disabled=""
                type="button"
              >
                <svg
                 ...
 ❯ waitForWrapper node_modules/@testing-library/dom/dist/wait-for.js:163:27
 ❯ node_modules/@testing-library/dom/dist/query-helpers.js:86:33
 ❯ src/components/talkx/__tests__/RuleValueInput.test.tsx:207:34
    205|   it('"em breve": Lead score e Risco de churn ficam desabilitados no c…
    206|     renderView();
    207|     fireEvent.click(await screen.findByRole('button', { name: 'Novo se…
       |                                  ^
    208|
    209|     // Os dois indicadores que ninguém calcula seguem VISÍVEIS com o n…

────────────[1/1]──────────


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
   Start at  22:07:27
   Duration  8.67s (transform 812ms, setup 223ms, import 1.44s, tests 6.17s, environment 688ms)
```

## Trecho do testes.log com o timeout do FilesTab
Nota honesta: o `testes.log` original da noite (`bb4df1254046`) foi sobrescrito pela rodada verde de 14/10 (hoje ele tem mtime 2026-10-14 07:03 e `Test Files 1346 passed | 3 skipped (1349)`). O trecho abaixo é literal de outra suíte completa do MESMO dia 13/10 (`~/.local/state/zapp-verify/48b7e929f129/testes.log`, mtime 2026-10-13 04:31), que registra as MESMAS duas falhas (`Test Files 2 failed | 1313 passed (1315)` / `Tests 2 failed | 11900 passed | 25 expected fail | 14 todo (11941)`):
```
 FAIL  src/components/talkx/__tests__/RuleValueInput.test.tsx > TalkXSegments · campo de valor por tipo (X106) > "em breve": Lead score e Risco de churn ficam desabilitados no catálogo
TestingLibraryElementError: Unable to find role="button" and name "Novo segmento"
[...dump do DOM...]
    205|   it('"em breve": Lead score e Risco de churn ficam desabilitados no c…
    206|     renderView();
    207|     fireEvent.click(await screen.findByRole('button', { name: 'Novo se…
       |                                  ^
    208|
    209|     // Os dois indicadores que ninguém calcula seguem VISÍVEIS com o n…

────────────[1/2]──────────

 FAIL  src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx > FilesTab (adversarial) — mais de 60 arquivos > caminho do "De": a varredura que nunca cruza o inicio para no TETO, sem skeleton infinito
Error: Test timed out in 15000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/components/inbox/tabs/__tests__/FilesTab.period.integration.test.tsx:314:3
    312|   });
    313|
    314|   it('caminho do "De": a varredura que nunca cruza o inicio para no TE…
       |   ^
    315|     // Cada pagina traz um item mais NOVO que o "De" (5 dias atras): o…
    316|     // entao o unico freio possivel e o teto. O item esta DENTRO do pe…

────────────[2/2]──────────
```

## Cópia de referência inalterada
- `git status --porcelain` na cópia de referência (`~/projetos/Zapp_Web_V2`): nenhuma modificação em arquivo rastreado (`git diff --stat` vazio; o `grep -v '^??'` retorna vazio). Só existem 4 arquivos `??` (untracked) pré-existentes de 11/10 (`docs/audits/AUDITORIA_PARIDADE_V3_CHAT_UI_PARTE*_2026-10-11.md`, mtime 2026-10-11 13:52–13:55), que não são meus — nunca escrevi na referência.

## Escopo
- Diff do cartão: só `.tmp/relato.md` (o produto é este diagnóstico). Nenhum arquivo de teste ou de produção foi alterado.
- Os dois testes são de front (talkx e inbox), fora da minha área (edge). Não corrigi nada; o dono natural é worker (telas) / worker (testes).

## Pontos do revisor ([refazer 1])
- Ponto 1: log bruto colado acima em bloco de código (erro `TestingLibraryElementError`, stack na linha 207, DOM cortado mas literal + trecho do `testes.log` com `Test timed out in 15000ms`), com a ressalva honesta sobre o log da noite ter sido sobrescrito e a fonte substituta do mesmo dia.
- Ponto 2: `echo rc=$?` nas duas reproduções — RuleValueInput `rc=1`, FilesTab `rc=0` (o `rc=1` do `noturno.json` já estava no relato).
- Ponto 3: caminho do workspace gravável + `git rev-parse HEAD` acima.
- Ponto 4: evidência da referência inalterada acima (diff vazio em rastreados; só untracked pré-existente de 11/10).
