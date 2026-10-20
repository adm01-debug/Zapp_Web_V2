# Exceções conscientes — tipografia (Design System/UI)

Registro das exceções **conscientes** ao padrão de tipografia do Zapp Web V2: usos de tamanho
ou de família fora dos tokens que são **decisão declarada**, e não dívida esquecida.

- **Origem:** etapa 66 de `docs/tipografia/PLANO_AUDITORIA_FONTES_100_ETAPAS_2026-09-24.md`
  ("Registrar a lista de exceções conscientes em `docs/tipografia/EXCECOES.md`") e a regra de
  execução do mesmo plano: *"Exceções conscientes (120px do NotFound, `system-ui` do boot
  error) vão para `EXCECOES.md`, não somem."*
- **Criado em:** 08/10/2026 (cartão SL-178 · item E66 do inventário), sobre a ponta
  `210c3e7c1`. Nenhuma medição visual nova foi feita aqui: o registro é documental.
- **Guarda:** `scripts/ci/tipografia-excecoes-doc.unit.mjs`, que roda no passo de unit tests
  do CI (`node --test scripts/ci/*.unit.mjs`). Ela recusa o registro em duas direções:
  se uma das exceções obrigatórias sumir do texto, **e** se o uso que ela documenta deixar
  de existir no arquivo citado. Exceção registrada tem de continuar sendo exceção de verdade.

## Exceção não é dívida

Entra nesta tabela só o uso que tem motivo declarado e verificação no código. O que não está
aqui continua **dívida medida**: o placar vive em `scripts/qa/tipografia-budget.json`, medido
por `scripts/qa/medir-tipografia.cjs` (correr com
`node scripts/qa/medir-tipografia.cjs --check`), e gráficos e e-mails têm fase própria no
plano (F5 e F7). Registrar uma exceção aqui não dispensa o guard — ela só passa a ter nome e
motivo.

## Exceções registradas

| # | Exceção | Onde (arquivo:linha) | Valor | Por que é consciente |
|---|---|---|---|---|
| E1 | numeral "404" da página não encontrada | `src/pages/NotFound.tsx:27` | `120px` (classe `text-[120px]`) | tipografia decorativa, não texto de leitura |
| E2 | fonte da tela de erro de boot | `index.html:78` | `system-ui` (`font-family:system-ui,sans-serif`) | a tela roda antes de a fonte web carregar |

### E1 — `120px` do "404" em `src/pages/NotFound.tsx:27`

O numeral é decoração de fundo (`text-primary/20 select-none`), não texto de leitura: a escala
tipográfica não tem degrau de 120px e criar um token só para ele não ajudaria ninguém. É o
único uso acima de 16px fora dos tokens nomeados `kpi-value` e `page-title` — são esses três
que o `scripts/qa/tipografia-budget.json` registra (`above16` × `allowAbove16`).

### E2 — `system-ui` da tela de erro de boot em `index.html:78`

A tela "Falha ao inicializar o app" é montada por script inline no `index.html` (linhas 58–102)
antes de o React montar. Se o app não montou, a fonte web pode não ter carregado — ou o próprio
carregamento pode ser a falha —, então a tela usa a pilha do sistema para mostrar o motivo do
erro mesmo sem CSS nem fonte do app. O contêiner usa `system-ui,sans-serif` (linha 78) e o
bloco de detalhes usa `ui-monospace,Menlo,monospace` (linha 81).

## Como registrar uma exceção nova

1. Confirme o uso no código (arquivo e linha) e o motivo dele ser decisão, não dívida.
2. Adicione a linha na tabela de exceções registradas (arquivo:linha + valor).
3. Explique o motivo numa subseção, como em E1 e E2.
4. Se a exceção precisa ser travada contra desaparecimento, acrescente o caso em
   `EXCECOES_OBRIGATORIAS` do `scripts/ci/tipografia-excecoes-doc.unit.mjs` — sem isso a guarda
   não a defende.
5. Uso corrigido de propósito: remova a linha da tabela **e** o caso correspondente da guarda
   no mesmo commit. Exceção que acabou volta a ser decisão explícita, não evapora.
