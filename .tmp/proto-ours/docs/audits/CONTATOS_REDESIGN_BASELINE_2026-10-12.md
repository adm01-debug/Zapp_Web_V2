# Linha de base do módulo Contatos — ANTES do redesign (RD-001)

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
