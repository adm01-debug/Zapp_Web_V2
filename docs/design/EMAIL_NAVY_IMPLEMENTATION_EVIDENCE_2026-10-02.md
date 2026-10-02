# Email NAVY — evidências de implementação e auditoria

Data da validação: 2 de outubro de 2026  
Branch isolada: `codex/email-navy-implementation-20261002`  
Rota: `?view=email-chat`

## Veredito executivo

A implementação local tornou o workspace Email substancialmente mais seguro, íntegro e próximo da direção NAVY: a rota real, lista, conversa, contexto, composição, anexos, respostas históricas, isolamento por conta, rascunhos e contratos das Edge Functions foram corrigidos no código real. A bateria local está verde e não realizou envio real, DDL, deploy ou merge.

Ainda não é correto declarar a entrega “100% em produção” por dois bloqueios externos objetivos:

1. O arquivo formal `referencias/01_EMAIL_DIRECAO_VISUAL.png` não está no pacote ou no repositório. A captura anexada orientou a composição, mas não substitui uma comparação pixel a pixel certificada.
2. O banco canônico usado pela aplicação publicada não contém as tabelas Gmail exigidas e as Edge Functions `gmail-send`, `gmail-sync` e `gmail-oauth` respondem como ausentes. Portanto, o frontend não pode funcionar ponta a ponta online até uma mudança de infraestrutura separadamente revisada e autorizada.

Esses bloqueios não foram mascarados com mocks de produção, DDL improvisado ou deploy fora do escopo.

## Escopo implementado

### Reaproveitado

- Rota, shell, autenticação, sessão Supabase e transporte autenticado de Edge Functions.
- Modelo local de contas, threads, mensagens, labels e anexos.
- Sanitização DOMPurify e leitor HTML sandboxed.
- Serviços de contato e os consumidores Gmail existentes.
- Primitivas visuais e navegação global, sem criar uma segunda aplicação.

### Corrigido

- Escopo das consultas e ações por conta ativa.
- Seleção de thread por ID, deep link e atualização do objeto selecionado.
- Resposta e encaminhamento de uma mensagem histórica específica.
- `Reply-To`, reply-all, separação To/Cc, exclusão da própria conta e rejeição de CR/LF.
- Uso distinto de UUID local, Gmail message/thread ID e RFC Message-ID.
- Envio real de anexos nos fluxos de nova mensagem, resposta e encaminhamento.
- Limites de 10 arquivos e 25 MiB agregados nas duas camadas.
- Download base64url binário, nomes de arquivo e metadados de anexos.
- Trava contra duplo envio, IME e atalho Ctrl/Cmd+Enter.
- Rascunho remoto serializado por ID, atualização e exclusão.
- Diferença entre aceite remoto, falha local de reconciliação e rejeição.
- Arquivar/lixeira/restaurar/favoritar como operações de thread.
- Sincronização incremental paginada com eventos added/deleted/labels e cursor preservado em resultado parcial.
- Reagregação determinística de thread fora de ordem.
- Bloqueio de imagens remotas e `cid:` não resolvido em HTML recebido.
- Preview local seguro apenas para PNG/JPEG/GIF/WebP, texto e PDF; HTML/SVG não são executados.
- Estados de loading, erro, vazio, filtros, seleção e paginação local.
- Layout NAVY real e responsivo, com foco restaurado, ações touch e prevenção de colisão com o FAB.

### Novo

- `emailRecipients.ts`: parser, validação, deduplicação e resolução de reply/reply-all.
- `emailAttachments.ts`: validação, normalização e serialização binária.
- `emailComposeFormat.ts`: representação coerente de texto/HTML do compositor.
- `emailAttachmentPreview.ts` e viewer seguro de anexos.
- `gmail-mime.ts`: construção MIME testável e independente do handler.
- Fixture E2E sintética que bloqueia mutações externas.
- Projeto Playwright dedicado e treze capturas da rota real.

### Pendente ou parcial

- Referência visual formal ausente.
- Busca e paginação inteiramente server-side acima de 1.000 threads.
- Filtros por período e combinação completa refletida na URL.
- Restauração de rascunho remoto após reload, inclusive política explícita para arquivos locais.
- Editor HTML WYSIWYG completo; a formatação segura atual não é um editor rico de nível suíte office.
- Aplicação arbitrária de labels de usuário pela UI.
- Notas internas e conversas relacionadas no rail, sem fabricar vínculo CRM.
- Rail como drawer em breakpoints intermediários e validação formal de zoom a 200%.
- Benchmark de 1.000 threads e thread longa.
- Publicação do backend canônico e das Edge Functions, proibida nesta execução.

## Auditoria do backend canônico

Inspeção somente leitura do projeto canônico usado pela URL publicada:

| Verificação | Resultado |
|---|---|
| Projeto Supabase configurado e usado pelo bundle publicado | Mesmo projeto canônico configurado no repositório |
| Tabelas públicas catalogadas | 272 |
| `gmail_accounts` | Ausente |
| `email_threads` | Ausente |
| `email_messages` | Ausente |
| `email_attachments` | Ausente |
| Policies/índices/colunas dessas tabelas | Ausentes |
| Ledger de migrations | 362 entradas; migrations Gmail requeridas não registradas |
| `gmail-send` | Não publicada |
| `gmail-sync` | Não publicada |
| `gmail-oauth` | Não publicada |

Migrations versionadas relevantes e ainda ausentes no ledger canônico: `20260403105341`, `20260827210200`, `20260828220100` e `20260901100001`.

Consequência: a interface pode ser validada com fixture segura, mas a rota publicada não possui hoje o backend necessário para listar, sincronizar ou enviar Gmail. A correção exige PR/backup/revisão de migrations, validação de RLS e deployment controlado das funções; não deve ser aplicada incidentalmente em uma tarefa de frontend.

## Matriz dos 80 critérios de aceite

Legenda: **Aprovado localmente**, **Parcial**, **Bloqueado** ou **Pendente**. “Aprovado localmente” não equivale a homologação online enquanto o backend canônico estiver ausente.

| AC | Estado | Evidência ou gap objetivo |
|---|---|---|
| 001 | Aprovado localmente | Playwright monta `?view=email-chat` no shell real. |
| 002 | Bloqueado | PNG formal ausente; captura 1672×941 gerada, sem certificação pixel a pixel. |
| 003 | Parcial | Escopo `.email-navy` local; alternância completa entre módulos/alto contraste não homologada. |
| 004 | Parcial | Shell sem duplicação na rota real; consumidor Omnichannel compilado, mas não coberto visualmente. |
| 005 | Aprovado localmente | Ajuda, nova mensagem, busca e seleção de conta são funcionais. |
| 006 | Aprovado localmente | Seleção e não lido têm fundo, tipografia e indicador distintos. |
| 007 | Aprovado localmente | Assunto principal não é repetido sem necessidade; identidade permanece visível. |
| 008 | Parcial | Truncamento e quebra foram aplicados; corpus E2E de extremos ainda incompleto. |
| 009 | Aprovado localmente | Dados demonstrativos estão restritos à fixture E2E. |
| 010 | Parcial | Capturas inspecionadas; comparação formal depende do AC-002. |
| 011 | Parcial | `has_attachments` real é consultado; universo ainda limitado a 1.000 threads. |
| 012 | Aprovado localmente | Busca inclui `last_from`, contato e assunto sem exigir CRM. |
| 013 | Parcial | O teto de 1.000 substitui o antigo lote pequeno, mas não é busca server-side ilimitada. |
| 014 | Aprovado localmente | Ordenação usa data e ID como desempate; paginação local é estável. |
| 015 | Aprovado localmente | INBOX/SENT/TRASH/SPAM e labels reais filtram o conjunto consultado. |
| 016 | Parcial | Conta, pasta, leitura, anexo e busca combinam; período/URL ainda faltam. |
| 017 | Parcial | Contadores não confundem mensagens, porém representam o universo carregado, não total remoto. |
| 018 | Aprovado localmente | Busca é derivada sincronicamente do cache; resultado antigo assíncrono não substitui consulta nova. |
| 019 | Aprovado localmente | `emailThread` preserva `view`, histórico e deep link autorizado. |
| 020 | Parcial | Loading/erro/vazio/filtro/retry existem; offline e 403 ainda compartilham erro genérico. |
| 021 | Aprovado localmente | Estado de carga precede a decisão de reconectar. |
| 022 | Aprovado localmente | Queries, realtime, ações e composer são chaveados por conta. |
| 023 | Aprovado localmente | Seleção resolve o objeto atual pelo ID. |
| 024 | Parcial | B não recebe estado de A; retorno de A após desmontagem depende de draft remoto ainda não recarregado. |
| 025 | Parcial | Operações carregam account/composition snapshot; cenário completo entre telas ainda sem E2E dedicado. |
| 026 | Aprovado localmente | Minimizar/expandir preserva estado da mesma instância. |
| 027 | Aprovado localmente | Fechar mantém draft; descartar exige confirmação e exclui draft remoto. |
| 028 | Aprovado localmente | Fila serial de create/update usa um draft ID; teste cobre ACK fora de ordem. |
| 029 | Pendente | Não há hidratação de draft remoto após reload. |
| 030 | Parcial | Chaves incluem conta e sessão corrente; logout/login cruzado não tem E2E específico. |
| 031 | Aprovado localmente | Reply histórico transporta target local e Gmail/RFC correto. |
| 032 | Aprovado localmente | Forward usa mensagem e anexos selecionados do alvo histórico. |
| 033 | Aprovado localmente | Parser prioriza Reply-To válido. |
| 034 | Aprovado localmente | To/Cc disjuntos, deduplicados e sem autoendereçamento. |
| 035 | Aprovado localmente | Bcc recebido não é inferido nem reinserido. |
| 036 | Aprovado localmente | Testes cobrem nome com vírgula, Unicode, inválidos e CR/LF. |
| 037 | Parcial | Bold/italic/list/link produzem HTML/texto seguro; não é WYSIWYG completo com paste/undo avançado. |
| 038 | Aprovado localmente | MIME usa RFC Message-ID real; IDs Gmail/UUID/RFC não são intercambiados. |
| 039 | Aprovado localmente | Trava síncrona, IME e Ctrl/Cmd+Enter testados. |
| 040 | Parcial | Aceite+falha local e rejeição são distintos; UX de `outcome-unknown` ainda não está completa. |
| 041 | Aprovado localmente | Nova mensagem serializa todos os bytes selecionados. |
| 042 | Aprovado localmente | Reply/reply-all usam o mesmo contrato tipado sem cast. |
| 043 | Aprovado localmente | Cliente/schema/Edge limitam a dez arquivos. |
| 044 | Aprovado localmente | Limite agregado de 25 MiB é validado antes do envio e no backend. |
| 045 | Aprovado localmente | Base64url é normalizado em bytes, sem conversão UTF-8 destrutiva. |
| 046 | Aprovado localmente | Sync persiste múltiplos anexos pela chave mensagem+attachment e reconcilia resync. |
| 047 | Aprovado localmente | Forward combina originais escolhidos e novos; erro interrompe o envio. |
| 048 | Aprovado localmente | Viewer passivo; HTML/SVG/JS/unknown negados em teste. |
| 049 | Parcial | Object URLs são revogadas e troca de conta remonta a thread; teste de memória prolongado falta. |
| 050 | Aprovado localmente | Cartões usam metadados reais, fallback e quebra segura. |
| 051 | Aprovado localmente | Archive modifica INBOX na thread inteira. |
| 052 | Aprovado localmente | Sem remoção otimista enganosa; falha mantém estado e mostra erro. |
| 053 | Aprovado localmente | Trash e restore usam semântica Gmail própria. |
| 054 | Parcial | Favorito é real; aplicação arbitrária de label de usuário ainda não tem seletor. |
| 055 | Aprovado localmente | Resultado parcial retorna 207 e só confirma mensagens aceitas. |
| 056 | Aprovado localmente | Cursor não avança quando a página é parcial. |
| 057 | Aprovado localmente | History pagina added/deleted/labels e reconcilia cada tipo. |
| 058 | Aprovado localmente | Agregação determinística independe da ordem de chegada. |
| 059 | Parcial | Identidade sem/com CRM está coerente; conversas relacionadas ainda não são resolvidas. |
| 060 | Pendente | Notas internas não foram adicionadas ao rail; nenhum ID fictício foi criado. |
| 061 | Aprovado localmente | Handlers validam usuário→conta→thread/mensagem/anexo. |
| 062 | Aprovado localmente | CR/LF e campos malformados são rejeitados no schema e no MIME. |
| 063 | Aprovado localmente | Suíte de bypass do sanitizador continua verde. |
| 064 | Aprovado localmente | Leitor permanece sem `allow-scripts`/`allow-same-origin`. |
| 065 | Aprovado localmente | `http/https` remoto é bloqueado; política é explícita. |
| 066 | Aprovado localmente | Leitura completa usa diálogo rolável, sem corte definitivo do corpo. |
| 067 | Aprovado localmente | Sanitizador restringe protocolos e aplica isolamento aos links. |
| 068 | Aprovado localmente | UI não inventa empresa verificada, entrega ou leitura. |
| 069 | Aprovado localmente | `cid:` não resolvido e imagem remota viram placeholder sem fetch arbitrário. |
| 070 | Aprovado localmente | Fixture intercepta escrita externa; nenhum secret/sessão privada em artefatos. |
| 071 | Parcial | Dez viewports de 320–1920 passam; falta zoom 200% e drawer explícito para o rail. |
| 072 | Aprovado localmente | E2E valida teclado, Esc e restauração de foco. |
| 073 | Aprovado localmente | Ações históricas permanecem visíveis e acionáveis em touch. |
| 074 | Parcial | Axe não encontrou violações no workspace; temas alternativos não foram medidos. |
| 075 | Parcial | Scroll é preservado; aviso de nova mensagem e reduced-motion ainda não têm cenário completo. |
| 076 | Aprovado localmente | Matriz verifica que compositor e FAB não cobrem a ação primária. |
| 077 | Pendente | Não foi produzido benchmark com 1.000 threads e thread longa. |
| 078 | Aprovado localmente | Projeto `chromium-email-navy` coleta 14 testes sem login real. |
| 079 | Aprovado localmente | Typecheck, build, lint tocado, Deno, unitários e suíte global executados. |
| 080 | Aprovado localmente | Diff, screenshots, contratos e evidências foram revisados, separados em commits e rebaseados sobre `origin/main`, sem deploy/DDL/envio real. |

Totais da auditoria final: 56 aprovados localmente, 20 parciais, 3 pendentes e 1 bloqueado visual. Além disso, a ausência do backend Gmail canônico bloqueia a homologação online de todos os fluxos dependentes de dados reais.

## Validações executadas

| Validação | Resultado real |
|---|---|
| TypeScript | Aprovado (`tsc -b --force`) |
| Build Vite | Aprovado pós-rebase; 5.468 módulos; somente warning preexistente de chunk grande |
| ESLint dos arquivos tocados | Aprovado, zero erro/warning |
| Vitest global | 464 arquivos, 5.744 testes aprovados, 1 falha esperada e 38 `todo`, zero falha inesperada |
| Vitest direcionado após ajustes finais | 19/19 aprovados |
| Deno helpers/MIME | 18/18 aprovados |
| `deno check` handlers/helpers | Aprovado |
| Playwright Email NAVY | 14/14 aprovados |
| Acessibilidade Playwright/axe | Zero violação no cenário avaliado |
| Chamadas mutáveis externas | Interceptadas e bloqueadas; zero envio real |

O lint global continua contendo dívida histórica fora do diff; não foi enfraquecido. O critério aplicado à entrega é lint estrito em todos os arquivos tocados, além de typecheck/build/teste global.

## Capturas reproduzíveis

Diretório: `e2e/email-navy-visual/`

- Estados: `01-lista.png`, `02-conversa.png`, `03-compositor.png`.
- Mobile: 320×800, 360×800 e 390×844.
- Tablet: 768×1024 e 1024×768.
- Desktop: 1280×720, 1366×768, 1440×900, 1672×941 e 1920×1080.

As capturas usam dados sintéticos e não contêm e-mails, tokens ou sessões reais.

## Rollback e próxima autorização necessária

O trabalho está isolado em uma branch e pode ser revertido por commits sem tocar produção. Para colocar o módulo online, abrir uma entrega de infraestrutura separada com:

1. backup e inventário do projeto canônico;
2. revisão das migrations Gmail e da ordem do ledger;
3. validação de RLS, grants, índices e isolamento entre contas;
4. aplicação em staging descartável;
5. publicação versionada de `gmail-oauth`, `gmail-sync` e `gmail-send` com secrets via Supabase;
6. smoke autenticado sem envio real e depois canário explicitamente autorizado;
7. rollback documentado de schema e funções;
8. somente então deploy do frontend e homologação da rota publicada.
