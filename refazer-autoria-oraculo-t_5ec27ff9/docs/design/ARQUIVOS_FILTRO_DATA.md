# Aba Arquivos — filtro por data (painel da conversa)

> **Escopo documentado:** o filtro por **data** da aba **Arquivos** do painel da conversa, do
> botão até o recorte da lista — `src/lib/filesPeriod.ts`, o seletor compartilhado
> `src/components/inbox/ai-tools/PeriodFilterSelector.tsx`, `src/components/inbox/tabs/Files*`
> (`FilesTab.tsx`, `FilesToolbar.tsx`, `FilesContent.tsx`, `filesSort.ts`),
> `src/hooks/chat/useFilesViewState.ts` e os dados que a aba consome
> (`src/hooks/chat/useContactMedia.ts`, `src/hooks/chat/useContactMediaCounts.ts`).
> **Base do código:** árvore local `dia/2026-10-09` (agentes não acessam produção — regra R1).
> As etapas F01–F06 do plano entraram na linha do dia de uma vez, no commit `8080a2f75`
> (`fix(arquivos): conta figurinhas nas contagens do periodo`, 11 arquivos).
> **Plano de origem:** `docs/plans/PLANO_FILTRO_DATA_ARQUIVOS_8_ETAPAS_2026-10-07.md`
> (decisões D01–D05 na §2; fora de escopo na §4). Este documento descreve o que está no código —
> não é status de execução.
> **Regras permanentes que valem aqui:** nenhuma informação sai do sistema (este documento não
> cria exportar/baixar/copiar tudo/imprimir/compartilhar); download de arquivo só pelo caminho
> existente `useDownloadPermission`; só as cores que o sistema já tem; **sem selo de canal ou de
> origem** do arquivo. Sem DDL, sem Edge Function, sem migration, sem dependência nova.
> O que não deu para provar no código está marcado **NÃO VERIFICADO**.

---

## 1. O que é e para quem

- **É:** um filtro de período (atalhos + calendário De/Até) na barra da aba **Arquivos**, que
  recorta a lista de mídias da conversa pela **data de envio** do arquivo. Complementa o filtro
  por tipo (chips) e a busca que já existiam.
- **Para quem:** o atendente na linha de frente do Inbox/Chat; supervisor e admin usam a mesma
  tela (não há permissão nova nem recorte por papel aqui).
- **Onde fica:** na barra de ferramentas da aba, ao lado da ordenação — `FilesToolbar.tsx:108-121`,
  no contêiner `data-testid="files-period-filter"`. A aba em si é `FilesTab` (aba **Arquivos** do
  painel da conversa).
- **Padrão:** **"Qualquer data"** — sem período, a aba se comporta exatamente como antes do filtro.

---

## 2. Atalhos e calendário (o mesmo seletor da IA)

O filtro **reusa o mesmo componente** da aba IA (`PeriodFilterSelector`) — mesma aparência,
mesmos atalhos e mesmo calendário. A única diferença é a lista de atalhos oferecida.

**Atalhos** (`PeriodFilterSelector.tsx:21-30`): `Qualquer data`, `Hoje`, `Últimos 3 dias`,
`Últimos 7 dias`, `Últimos 14 dias`, `Últimos 30 dias`, `Últimos 90 dias`.

- **`Última interação` não é oferecido.** A barra da aba passa `hiddenPeriods={['last_interaction']}`
  (`FilesToolbar.tsx:119`) e o seletor filtra esse atalho fora da coluna (`PeriodFilterSelector.tsx:173, 190-192`).
  Como a aba não tem histórico de mensagens, esse atalho cairia em "sem filtro"
  (`filesPeriod.ts:85`) — melhor não mostrá-lo do que mostrar um botão que não filtra.

**Gatilho** (`PeriodFilterSelector.tsx:196-227`):

- sem filtro: "Qualquer data" em tom neutro (`bg-muted/80`);
- com filtro: fundo `primary` e o rótulo do atalho; no personalizado, `dd/MM/yy — dd/MM/yy`
  (ou `— agora` quando só o "De" foi escolhido) — `PeriodLabel`, `PeriodFilterSelector.tsx:147-155`;
- **X para limpar** (`aria-label="Remover filtro de data"`, `:213-226`): chama `onPeriodChange('all')`
  e `onClearCustom()`, ou seja, volta para "Qualquer data" e zera as datas;
- contador do gatilho (`:207-212`): `filteredCount` e `totalCount`; quando diferem mostra `N/total`.
  Na aba, são `filtered.length` (recorte atual) e `items.length` (carregados)
  (`FilesTab.tsx:379-380`) — mesmo desenho da aba IA.

**Calendário** (`PeriodFilterSelector.tsx:270-303`): dois calendários, **"De"** e **"Até"**, em
pt-BR. O "De" desabilita datas futuras (`:281`) e o "Até" desabilita futuras e as anteriores ao
"De" (`:297`). Escolher qualquer dia leva o período para `custom` (`:276-279, 292-295`). O link
**"Limpar datas"** aparece quando há data escolhida e volta para "Qualquer data" (`:258-267`).

---

## 3. A data usada: `created_at`, no fuso do navegador

Toda a conversão período → intervalo vive em `src/lib/filesPeriod.ts`.

- **A data usada é `created_at` do item de mídia** — a data/hora de envio do arquivo
  (`messages.created_at` na origem; o item já chega com esse campo). `PeriodRange` é um par de
  instantes epoch ms, **inclusivo nas duas pontas** (`filesPeriod.ts:37-40`); o recorte compara
  instantes (`filterByPeriod`, `:110-121`).
- **O "dia" é o dia LOCAL do navegador.** `startOfDay`/`endOfDay` usam `setHours(0,0,0,0)` /
  `setHours(23,59,59,999)` (`:42-52`) e `created_at` é lido com `new Date(...)`, que interpreta no
  fuso local (`timeOf`, `:69-73`). A virada de dia é a do operador, não o corte UTC do texto ISO —
  um arquivo enviado 31/12 22:00 (UTC-3) continua no dia 31, como prova o caso do réveillon em
  `src/lib/__tests__/filesPeriod.test.ts`.

**Período → intervalo** (`buildPeriodRange`, `filesPeriod.ts:79-104`):

| Período | Intervalo `[from, to]` |
|---|---|
| `all` (Qualquer data) | `null` — sem filtro |
| `last_interaction` | `null` — não é oferecido na aba (`:85`) |
| `Hoje` | início do dia local de hoje .. fim do dia local de hoje |
| `3d`/`7d`/`14d`/`30d`/`90d` | início do dia local de **N dias atrás** .. fim do dia local de hoje |
| `custom` (personalizado) | início do dia do "De" .. fim do dia do "Até" |
| `custom` sem nenhuma data | `null` — sem filtro (`:90`) |
| `custom` com uma ponta só | o outro lado fica **aberto** (`from` ou `to` = `null`, `:91-95`) |
| `custom` invertido ("De" depois do "Até") | normalizado para `from <= to` (`:92-94`) |

- O atalho tem **as duas pontas**: `to` é o **fim do dia de hoje** (`:100-103`). Arquivo com data
  no futuro não entra — é dado errado. Isso é uma diferença em relação ao recorte por atalho da
  aba IA, que só aplica o piso (`PeriodFilterSelector.tsx:93-99`); o seletor é o mesmo, o recorte
  não é.
- `Hoje` conta **0 dias para trás** (do início do dia local), como a tabela da IA
  (`PERIOD_DAYS`, `filesPeriod.ts:24-31`).
- Data ausente ou inválida é tratada como ausente, nunca vira `NaN` no intervalo
  (`dayStart`/`dayEnd`, `:55-66`).
- **Sem período ativo** o recorte devolve a **mesma lista** (identidade, inclusive itens sem data
  válida); **com período ativo**, item sem data válida fica **fora** — não há como provar que ele
  pertence ao intervalo (`:106-121`).

---

## 4. Como o filtro se combina com tipo, busca e ordem

O recorte é feito numa passada só, em `filterMediaItems(items, typeFilter, search, periodRange)`
(`filesSort.ts:52-67`) e depois ordenado por `sortMediaItems`:

1. **tipo** (chips Todos/Imagens/Figurinhas/Vídeos/Áudios/Docs);
2. **período**, quando há intervalo ativo;
3. **busca** no nome do arquivo e na legenda (`filename`/`caption`), sem diferenciar maiúsculas;
4. **ordem** escolhida (`Mais recentes`/`Mais antigos`/`Maiores`/`Nome (A–Z)`).

O 4º parâmetro do filtro é **opcional**: sem ele o resultado é byte a byte o de antes do cartão
(por isso as chamadas e os testes antigos seguem valendo). A seleção não é afetada pelo período:
"Selecionar todos" opera sobre o recorte visível, e o encaminhamento resolve os itens escolhidos
sobre a **coleção completa** (`items`), não sobre o recorte filtrado (`FilesTab.tsx:280-288`).

---

## 5. Carga de páginas antigas (varredura do período)

A lista da aba não vem inteira: é paginada por **keyset `created_at desc`**, 60 por página
(`MEDIA_PAGE_SIZE`, `useContactMedia.ts:86, 274`). Sem cuidado, um período antigo ficaria vazio
só porque o filtro nunca veria as páginas antigas.

- **Com período ativo**, enquanto o item **mais antigo já carregado** não cruzou o limite que
  interessa, a aba busca as páginas antigas automaticamente (`FilesTab.tsx:160-184`).
- **Limite que interessa** (`periodScanReachedBoundary`, `FilesTab.tsx:67-71`):
  - com "De" (`from` definido): tudo que vem **abaixo de `from`** está fora — para quando o mais
    antigo é anterior a `from`;
  - **sem "De"** (período personalizado só com "Até"): o recorte é `[.., to]` e as primeiras
    páginas podem ser todas **posteriores** ao "Até" — então a varredura continua até o mais
    antigo cruzar `to` (`oldestTime <= to`). Parar antes esconderia os arquivos que casam
    (é a correção do `refazer 1`).
- **Condições de parada:** acabaram as páginas; o mais antigo cruzou o limite; ou o **teto de
  segurança de 500 páginas** (`MAX_PAGES_TO_LOAD_ALL = 500`, `FilesTab.tsx:58`, usado em `:176`)
  — o mesmo teto do botão "Carregar tudo". Se a página pedida não avançou (mesmo item mais antigo),
  a varredura para de pedir (`:175`).
- **Enquanto a varredura não terminou e nada casou ainda**, a área mostra o **carregamento** do
  modo (skeleton), não um vazio que ainda pode mudar: `showSkeleton = isLoading || (periodScanning
  && filtered.length === 0)` (`FilesTab.tsx:226`). A varredura está terminada quando
  `periodFullyLoaded` (`:189-192`) e ativa enquanto `periodScanning` (`:193`).
- A varredura reinicia ao trocar de conversa ou de período digitalizado
  (`periodLoadKey = contactId|from|to`, `FilesTab.tsx:152`).

---

## 6. Contadores (cabeçalho e chips)

- **Sem período ativo:** o cabeçalho "N arquivos" e os chips vêm do **banco** — contagem exata por
  tipo, uma consulta `count: 'exact', head: true` por tipo, em paralelo
  (`useContactMediaCounts.ts:15-94`). Se a contagem falha, o valor vira **"—"** com
  `title="Contagem indisponível"` (nunca "0" confirmado): `FilesTab.tsx:341, 346-347`.
- **Com período ativo:** os contadores passam a ser do **recorte carregado** do período
  (`periodCounts`, `FilesTab.tsx:202-212`) — `Todos` é o total de itens do período e cada tipo
  conta os seus, **incluindo Figurinhas** (o chip existe e entra na conta). Como a conta é derivada
  dos itens, o erro da RPC não a atinge (`displayCountsError`, `FilesTab.tsx:215`).
- **Só o período entra nessas contas:** tipo e busca continuam fora dos contadores, como sempre
  estiveram (`FilesTab.tsx:195-197`).
- Limite honesto: com período ativo os contadores refletem os itens **carregados** do período. A
  varredura tenta cobrir o período inteiro (§5), mas para no teto de 500 páginas — numa conversa
  gigante com período muito antigo, o total pode estar incompleto.

---

## 7. Estado vazio

Quando **há período ativo**, a varredura **terminou** e **nada** casou, a área mostra um vazio
próprio do filtro (`FilesTab.tsx:409-419`):

- ícone `CalendarX2`, título **"Nenhum arquivo neste período"**, descrição "Ajuste o período ou veja
  todos os arquivos da conversa." e botão **"Limpar período"** → `clearPeriod` (volta a
  "Qualquer data" e zera as datas).

Esse vazio **não** aparece durante a varredura (aí é carregamento, §5) nem em erro de consulta
(`periodEmpty` exige `!isLoading && !showSkeleton && !isError`, `FilesTab.tsx:227-228`).

Ele é **distinto** dos três vazios do recorte da lista, que continuam em `FilesContent.tsx:212-246`:
busca sem resultado ("Nada corresponde a \"...\"" + "Limpar busca"), tipo sem arquivo
("Nenhum arquivo deste tipo" + "Ver todos") e conversa sem arquivo ("Nenhum arquivo nesta conversa").

---

## 8. Onde o período fica guardado

- O período é **recorte de tela**, não preferência: mora em `FilesViewSession`
  (`period`, `customFrom`, `customTo` — `useFilesViewState.ts:42-60`), na memória da sessão, num
  `Map` por **`<userId>:<contactId>`** (`:66-68, 102-117`). Padrão: `all`, sem datas.
- Trocar de **conversa** ou de **usuário** recomeça do padrão (não herda o recorte anterior); sair
  do Chat e voltar a Arquivos **mantém** o recorte (mesma sessão, mesmo `Map`); **recarregar a
  página zera**; `SIGNED_OUT` esvazia o cache (`:104-107`).
- Nada disso vai para o `localStorage` — lá só vivem `viewMode` e `columns`, que são preferência do
  operador (`:10-19`). Salvar o período entre sessões está **fora de escopo** (§4 do plano).
- Funções de apoio: `setPeriod` troca o atalho e limpa as datas ao sair de `custom`
  (`:221-225`); `clearCustomDates` zera **só** as datas (é o `onClearCustom` do seletor);
  `clearPeriod` volta a "Qualquer data" e zera as datas (o botão do estado vazio) (`:228-235`).

---

## 9. Arquivos

**Filtro e período**

- `src/lib/filesPeriod.ts` — `buildPeriodRange` (`:79`), `filterByPeriod` (`:110`), `PeriodRange` (`:37`).
- `src/components/inbox/ai-tools/PeriodFilterSelector.tsx` — seletor compartilhado; ganhou a prop
  `hiddenPeriods` (`:173, 186, 190-192`).

**Aba Arquivos**

- `src/components/inbox/tabs/FilesToolbar.tsx` — seletor na barra (`:108-121`), sem "Última interação" (`:119`).
- `src/components/inbox/tabs/FilesTab.tsx` — intervalo (`:110-113`), varredura (`:58, 67-71, 152, 160-184`),
  contadores (`:198-215`), recorte (`:219-222`), vazio (`:226-228, 409-419`), ligação com a barra (`:372-380`).
- `src/components/inbox/tabs/filesSort.ts` — 4º parâmetro opcional em `filterMediaItems` (`:52-67`).
- `src/components/inbox/tabs/FilesContent.tsx` — vazios do recorte da lista (`:212-246`).

**Estado e dados**

- `src/hooks/chat/useFilesViewState.ts` — período na sessão, por conversa (`:42-60, 102-117, 221-235`).
- `src/hooks/chat/useContactMedia.ts` — paginação keyset `created_at desc`, 60/página (`:86, 251-281`).
- `src/hooks/chat/useContactMediaCounts.ts` — contagens por tipo no banco (`:15-84`).

---

## 10. Testes

| Arquivo | O que prova |
|---|---|
| `src/lib/__tests__/filesPeriod.test.ts` (157 linhas) | unidades do intervalo e do recorte: atalhos, `Hoje`, virada de mês e de ano, personalizado (dia inteiro, um dia só, invertido, uma ponta só, sem data, data inválida), pontas inclusivas, item sem data fora com período ativo, e a virada do dia no fuso local |
| `src/components/inbox/tabs/__tests__/FilesTab.periodo.test.tsx` (377 linhas) | a aba real (componente + seletor + estado + `filesSort` + `filesPeriod`, com só os hooks de dados mockados): sem período os contadores vêm da RPC; "Últimos 7 dias" recalcula cabeçalho e chips; combina com tipo e busca; o X limpa; De/Até do calendário filtra; estado vazio e "Limpar período"; carrega páginas antigas até passar do início; sem período não dispara carga automática; **só "Até"** carrega até cruzar o "Até"; e o teto de páginas termina a varredura sem skeleton infinito |
| `src/components/inbox/tabs/__tests__/FilesToolbar.test.tsx` (`describe` F04) | o seletor está na barra, "Última interação" não aparece, o gatilho anuncia "Qualquer data" sem o X, o X limpa, e o personalizado mostra o intervalo De — Até |
| `src/components/inbox/tabs/__tests__/filesSort.test.ts` (`describe` "filtro por data (F02)") | sem o 4º parâmetro nada muda; com o intervalo, período + tipo + busca combinam; item sem data válida fica fora com período e continua na lista sem período |
| `src/hooks/chat/__tests__/useFilesViewState.test.tsx` (`describe` "filtro por data (F03)") | padrão "Qualquer data", troca de atalho limpa as datas, `clearPeriod` e `clearCustomDates`, o período **não** vai para o `localStorage`, e remontar no mesmo contato restaura / em outro contato começa limpo |

---

## 11. Fora de escopo / limites

Do plano (§4) e do que o código mostra:

- **Não há filtro por data em outras abas** do painel, nem salvamento do período entre sessões,
  nem filtro no servidor (o recorte é 100% no cliente; nenhuma RPC nova).
- Sem DDL, sem Edge Function, sem migration, sem dependência nova.
- **Teto de páginas:** em conversas maiores que 500 páginas (30 mil itens) com período muito antigo,
  a varredura para no teto e o recorte/contadores podem não cobrir todo o período (§5, §6).
- **NÃO VERIFICADO** aqui: comportamento visual em 390 px e com mais de 60 arquivos em execução real
  — a verificação de pré-visualização do plano (F08) é passo separado, não deste documento.
