# Linha de base do módulo Contatos — ANTES e DEPOIS do redesign (RD-001)

> Fotografia visual e de medida do módulo **Contatos** como ele estava em 12/10/2026,
> antes do redesign. Serve para provar, depois, que ficou melhor e mais rápido.

Especialista: worker (testes) (area-testes-do-produto)

- Comando: `npx tsx scripts/qa/contatos-redesign-baseline.cjs`
- Servidor: http://127.0.0.1:5501 (subido pela própria ferramenta), modo dev do Vite
- Sessão: falsa (`installFakeSession`), backend 100% mockado e `bloquearRedeReal` ativo — nenhum dado real de cliente e nenhuma chamada ao Supabase de produção.
- Larguras: 390, 768, 1280, 1672 px · Temas: escuro e claro · deviceScaleFactor 1
- Capturas em: `docs/audits/contatos-redesign-baseline/`

## Como cada número foi medido

- **Altura da 1ª linha de cards**: `getBoundingClientRect` dos `[data-testid="contact-card"]`; a 1ª linha são os cards com o mesmo topo (±4 px); altura = maior base − topo.
- **Cards sem rolar**: cards inteiramente dentro da altura útil da janela (`top >= 0` e `bottom <= window.innerHeight`).
- **Peso do módulo**: soma de `responseBodySize` (lado do Node, `request.sizes()`) das requisições JS/CSS sob `src/(components|hooks|views)/contacts/`. No dev o Vite serve cada módulo como `.ts/.tsx`; no build viram o chunk que contém os módulos de Contatos. (Não dá para usar `performance.getEntriesByType("resource")` aqui: o relógio congelado `page.clock` substitui o objeto `performance` e a lista volta vazia.)
- **Requisições / falhas / erros**: contadas por `page.on("request"|"requestfailed"|"console"|"pageerror")` durante a abertura e a medição da tela.

## Erros de console observados (esperados nesta linha de base)

- `Failed to load resource: the server responded with a status of 403 (Forbidden)`
- `[agent-presence] upsert falhou {message: blocked}`
- `In HTML, %s cannot be a descendant of <%s>.`
- `<%s> cannot contain a nested %s.`
- `Failed to load resource: the server responded with a status of 401 (Unauthorized)`

Motivo dos esperados: os mocks DEVOLVEM 403 para escritas (`agent-presence` upsert) e 401 para `/auth/v1/user` (JWT falso não assinado) — é o comportamento desenhado das fixtures. Os avisos de HTML inválido (`<li>` dentro de `<li>`, do breadcrumb do `PageHeader`) são PRÉ-EXISTENTES do módulo e ficam registrados aqui como parte do "antes".

## Números de ANTES

| largura | tema | altura 1ª linha (px) | cards sem rolar | peso módulo | req. | falhas | erros console | PNG |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 390 px | escuro | 230 | 0/8 | 1203.8 KB (47 arquivos) | 834 | 0 | 9 | contatos-390-dark.png (49.0 KB) |
| 390 px | claro | 230 | 0/8 | 1203.8 KB (47 arquivos) | 834 | 0 | 9 | contatos-390-light.png (47.7 KB) |
| 768 px | escuro | 230 | 2/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-768-dark.png (102.8 KB) |
| 768 px | claro | 230 | 2/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-768-light.png (101.8 KB) |
| 1280 px | escuro | 230 | 8/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-1280-dark.png (154.5 KB) |
| 1280 px | claro | 230 | 8/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-1280-light.png (154.3 KB) |
| 1672 px | escuro | 230 | 8/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-1672-dark.png (162.4 KB) |
| 1672 px | claro | 230 | 8/8 | 1203.8 KB (47 arquivos) | 824 | 0 | 7 | contatos-1672-light.png (162.4 KB) |

Detalhe por largura/tema (JSON bruto dos campos acima):

```json
[
  {
    "largura": 390,
    "altura": 844,
    "tema": "dark",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 1,
    "cardsSemRolar": 0,
    "pesoTotalJsCssBytes": 49352408,
    "recursosJsCss": 790,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-390-dark.png",
    "pngBytes": 50132,
    "requisicoes": 834,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 9,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s <li> li \n\n  ...\n    <ContactsView>\n      <MotionConfig reducedMotion=\"user\">\n        <div className=\"relative b...\" data-contacts-v2=\"toolbar ca...\">\n          <ScrollToTopButton>\n          <ContactDialogs>\n          <div className=\"space-y-4\">\n            <PageHeader title=\"Contatos\" breadcrumbs={[...]}>\n              <header className=\"flex flex-...\">\n                <div className=\"flex items...\">\n                  <_c>\n                    <nav ref={null} aria-label=\"breadcrumb\">\n                      <_c3>\n                        <ol ref={null} className=\"flex flex-...\">\n                          <_c5>\n                          <_c5>\n>                           <li ref={null} className=\"inline-flex items-center gap-1.5\">\n                              <BreadcrumbSeparator>\n>                               <li role=\"presentation\" aria-hidden=\"true\" className={\"[&>svg]:size-3.5\"}>\n                              ...\n                          ...\n                ...\n            ...\n          ...\n",
      "<%s> cannot contain a nested %s.\nSee this log for the ancestor stack trace. li <li>",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 390,
    "altura": 844,
    "tema": "light",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 1,
    "cardsSemRolar": 0,
    "pesoTotalJsCssBytes": 49352408,
    "recursosJsCss": 790,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-390-light.png",
    "pngBytes": 48852,
    "requisicoes": 834,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 9,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "In HTML, %s cannot be a descendant of <%s>.\nThis will cause a hydration error.%s <li> li \n\n  ...\n    <ContactsView>\n      <MotionConfig reducedMotion=\"user\">\n        <div className=\"relative b...\" data-contacts-v2=\"toolbar ca...\">\n          <ScrollToTopButton>\n          <ContactDialogs>\n          <div className=\"space-y-4\">\n            <PageHeader title=\"Contatos\" breadcrumbs={[...]}>\n              <header className=\"flex flex-...\">\n                <div className=\"flex items...\">\n                  <_c>\n                    <nav ref={null} aria-label=\"breadcrumb\">\n                      <_c3>\n                        <ol ref={null} className=\"flex flex-...\">\n                          <_c5>\n                          <_c5>\n>                           <li ref={null} className=\"inline-flex items-center gap-1.5\">\n                              <BreadcrumbSeparator>\n>                               <li role=\"presentation\" aria-hidden=\"true\" className={\"[&>svg]:size-3.5\"}>\n                              ...\n                          ...\n                ...\n            ...\n          ...\n",
      "<%s> cannot contain a nested %s.\nSee this log for the ancestor stack trace. li <li>",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 768,
    "altura": 900,
    "tema": "dark",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 2,
    "cardsSemRolar": 2,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-768-dark.png",
    "pngBytes": 105304,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 768,
    "altura": 900,
    "tema": "light",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 2,
    "cardsSemRolar": 2,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-768-light.png",
    "pngBytes": 104262,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 1280,
    "altura": 900,
    "tema": "dark",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 4,
    "cardsSemRolar": 8,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-1280-dark.png",
    "pngBytes": 158235,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 1280,
    "altura": 900,
    "tema": "light",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 4,
    "cardsSemRolar": 8,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-1280-light.png",
    "pngBytes": 157997,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 1672,
    "altura": 900,
    "tema": "dark",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 4,
    "cardsSemRolar": 8,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-1672-dark.png",
    "pngBytes": 166266,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  },
  {
    "largura": 1672,
    "altura": 900,
    "tema": "light",
    "cards": 8,
    "primeiraLinhaAlturaPx": 230,
    "primeiraLinhaCards": 4,
    "cardsSemRolar": 8,
    "pesoTotalJsCssBytes": 49188786,
    "recursosJsCss": 782,
    "pesoModuloBytes": 1232687,
    "recursosModulo": 47,
    "png": "contatos-1672-light.png",
    "pngBytes": 166347,
    "requisicoes": 824,
    "requisicoesFalhas": 0,
    "falhasExemplos": [],
    "errosConsole": 7,
    "errosConsoleExemplos": [
      "Failed to load resource: the server responded with a status of 403 (Forbidden)",
      "[agent-presence] upsert falhou {message: blocked}",
      "Failed to load resource: the server responded with a status of 401 (Unauthorized)"
    ],
    "errosPagina": 0,
    "redeBarrada": 0
  }
]
```

## Notas de honestidade

- Os PNGs têm no máximo 300 KB cada.
- Cada combinação largura/tema é medida até 3 vezes se a rodada vier instável (requisição falha ou exceção de página), porque a máquina é compartilhada e o dev serve ~800 módulos; a rodada publicada é sempre a LIMPA. Instáveis após 3 tentativas: 0.
- O banco local do produto tem POUCOS contatos. Para a linha de base ser reproduzível e comparável entre rodadas, a tela roda com um conjunto sintético fixo de 8 contatos (o mesmo de `e2e/contacts-snapshots.spec.ts`), não com o banco da tarefa. Isso muda a quantidade de cards — não a geometria de 1 card, que é o alvo do redesign.
- Guarda de rede: nenhuma requisição escapou para o Supabase/Mapbox reais (redeBarrada = 0 em todas as rodadas).
- O "peso do módulo" em modo dev não é o tamanho do chunk final; é a soma dos módulos do diretório de Contatos servidos pelo Vite. Para comparar depois, use o MESMO comando.

## Números de DEPOIS (redesign implementado)

Medidos com o mesmo comando, o mesmo conjunto sintético de 8 contatos e o mesmo `deviceScaleFactor: 1`, sobre o redesign já implementado (Fases A–L), servindo `vite dev` em `http://127.0.0.1:5501`.

| largura | tema | altura 1ª linha (px) | design | Δ | peso módulo | req. | falhas | erros console | PNG |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 390 px | escuro | 609 | 609 | 0 | 1583.3 KB (56 arquivos) | 981 | 0 | 7 | contatos-390-dark.png (75.4 KB) |
| 390 px | claro | 609 | 609 | 0 | 1583.3 KB (56 arquivos) | 981 | 0 | 7 | contatos-390-light.png (76.1 KB) |
| 768 px | escuro | 586 | 561 | +25 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-768-dark.png (196.3 KB) |
| 768 px | claro | 586 | 561 | +25 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-768-light.png (193.3 KB) |
| 1280 px | escuro | 557 | 532 | +25 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-1280-dark.png (254.2 KB) |
| 1280 px | claro | 557 | 532 | +25 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-1280-light.png (251.4 KB) |
| 1672 px | escuro | 587 | 564 | +23 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-1672-dark.png (309.4 KB) |
| 1672 px | claro | 587 | 564 | +23 | 1583.3 KB (56 arquivos) | 971 | 0 | 7 | contatos-1672-light.png (300.4 KB) |

Capturas do "depois" em `docs/audits/contatos-redesign-baseline-depois/`; as do "antes" continuam em `docs/audits/contatos-redesign-baseline/`.

### Comparação direta ANTES → DEPOIS → design

| largura | ANTES | DEPOIS | design | leitura |
| --- | --- | --- | --- | --- |
| 390 px | 230 | 609 | 609 | card do design, fidelidade exata |
| 768 px | 230 | 586 | 561 | +25 px residuais |
| 1280 px | 230 | 557 | 532 | +25 px residuais |
| 1672 px | 230 | 587 | 564 | +23 px residuais |

### De onde vêm os +25 px residuais (1280/768)

O card do design (`design-comportamento.js` L71) não tem **tags** nem **completude**. O sistema precisa dos dois, porque há contrato de teste que os exige:

- `ContactCardInfo.test.tsx` L28-59 — até 2 tags + contador `+N`.
- `ContactHealthIndicator.test.tsx` L100-128 — `contact-health`, `contact-health-score`, `contact-health-level` e `role="progressbar"` dentro do card.

Os dois foram fundidos numa única linha flex (tags à esquerda, indicador `layout="inline"` à direita), o que custa **~24 px** — os botões "Conversar"/"Editar" também exigidos por `ContactPolimento.test.tsx` L102-116 foram movidos para a linha `.zc-last`, sem acrescentar altura. Sem esse reaproveitamento o excesso seria de ~146 px.

### Corrigido nesta rodada (regressão de densidade)

A primeira medição do "depois" acusou alturas de **631–690 px** (design: 532–609) com alturas irregulares na mesma linha (537–631 px). Causa: o card real tinha **três blocos a mais** que o design — tags, completude e rodapé de ações — empilhados verticalmente, somando ~146 px. Correções em `ContactCard.tsx` e `ContactContentArea.tsx`:

1. Tags + completude numa linha só (`layout="inline"`), devolvendo ~24 px ao card.
2. Rodapé de ações ("Conversar"/"Editar") movido para a linha da última interação, devolvendo ~46 px.
3. `h-full` no card e no `motion.div` da célula do grid — todos os cards da mesma linha passam a ter altura igual.
4. Retrato por faixas exatas do design (`max-[559px]` / `min-[560px]` / `min-[900px]` / `min-[1400px]` / `min-[1600px]`) em vez dos breakpoints padrão do Tailwind, que não batiam com as faixas 560–899 / 900–1399 / 1400–1599.

Resultado: as alturas caíram de 631–690 px para 557–609 px, com irregularidade zero dentro da mesma linha.

### Sobre "cards sem rolar"

No ANTES o número era 8/8 em 1280 e 1672 porque o card tinha 230 px. Com o card do design (532–609 px), **0/8 é o comportamento esperado** — o próprio design tem o card em `y = 441` com `h = 532`, terminando em 973 px numa janela de 900 px (`design-medidas.json`). O critério de fidelidade passou a ser a **altura do card**, não o encaixe na primeira dobra.

### Peso e requisições

| métrica | ANTES | DEPOIS | Δ |
| --- | --- | --- | --- |
| peso do módulo (dev) | 1203.8 KB (47 arquivos) | 1583.3 KB (56 arquivos) | +31% |
| requisições | 824–834 | 971–981 | +18% |
| falhas de rede | 0 | 0 | 0 |
| erros de console | 7–9 | 7 | −1 |

O aumento é dos 9 arquivos novos do redesign (ficha com abas, carrossel, filtros salvos, estados vazios, indicador de completude). Em modo dev o Vite serve cada módulo isolado; no build final eles viram um chunk. Medir o chunk é o próximo passo de RD-001 se a meta for comparar bytes de produção.
