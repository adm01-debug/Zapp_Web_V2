# Email NAVY — evidências de implementação e auditoria

Data da validação: 2 de outubro de 2026  
Branch isolada: `codex/email-navy-implementation-20261002`  
Rota: `?view=email-chat`

> **Continuação auditada em 3 de outubro de 2026:** a implementação foi retomada na branch isolada `codex/email-navy-completion-20261003`. Os gaps de paginação acima de 1.000 registros, filtros persistidos na URL, restauração segura de rascunho, editor WYSIWYG, labels Gmail, rail contextual real, notas internas, drawer intermediário, zoom a 200% e teste com 1.000 threads foram tratados e revalidados. Os números e a matriz abaixo incorporam esta continuação; o histórico de versões canônicas permanece identificado pelo marco em que foi medido.

## Veredito executivo

A implementação tornou o workspace Email substancialmente mais seguro, íntegro e próximo da direção NAVY: a rota real, lista, conversa, contexto, composição, anexos, respostas históricas, isolamento por conta, rascunhos e contratos das Edge Functions foram corrigidos no código real. A bateria local e o CI da branch estão verdes, sem envio real de e-mail. Após autorização explícita, `gmail-send` e `gmail-sync` foram publicados no projeto Supabase canônico e conferidos arquivo a arquivo contra a branch.

Ainda não é correto declarar a entrega “100% homologada” por dois gaps objetivos:

1. O arquivo formal `referencias/01_EMAIL_DIRECAO_VISUAL.png` não está no pacote ou no repositório. A captura anexada orientou a composição, mas não substitui uma comparação pixel a pixel certificada.
2. Os advisors de segurança e performance continuam intermitentes: performance respondeu uma vez com achados informativos preexistentes e novas tentativas, inclusive de segurança, encerraram por timeout. O inventário SQL, o ledger, a publicação, os smokes das funções e a homologação da rota publicada foram concluídos.

Esses gaps não foram mascarados com mocks de produção, DDL improvisado ou envio real.

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
- Filtros e busca são avaliados sobre todo o corpus paginado pelo servidor, mas a expressão de busca ainda não é enviada ao PostgREST como query própria.
- Logout isola imediatamente os rascunhos pela chave usuário+conta; a remoção física de chaves expiradas ocorre na leitura e não por um listener global de logout.
- O cenário de 1.000 threads está coberto; benchmark de uma thread individual extremamente longa permanece fora da fixture.
- Reexecução dos advisors Supabase quando o endpoint de auditoria deixar de responder com timeout.

## Auditoria do backend canônico

Inspeção e validação controlada do projeto canônico usado pela URL publicada:

| Verificação | Resultado |
|---|---|
| Projeto Supabase configurado e usado pelo bundle publicado | Mesmo projeto canônico configurado no repositório |
| Estado do projeto | `ACTIVE_HEALTHY`, PostgreSQL 17, região `us-west-2` |
| `gmail_accounts` | Presente; RLS ativo; 4 policies; 3 índices; 1 conta no instante da auditoria |
| `email_threads` | Presente; RLS ativo; 3 policies; 6 índices; 2.130 linhas no instante da auditoria |
| `email_messages` | Presente; RLS ativo; 2 policies; 6 índices; 2.787 linhas no instante da auditoria |
| `email_attachments` | Presente; RLS ativo; 2 policies; 3 índices; 2.220 linhas no instante da auditoria |
| `email_labels` | Presente; RLS ativo; 2 policies; 3 índices; 24 linhas no instante da auditoria |
| Ledger de migrations | 762 entradas; migrations Gmail `20260403105341`, `20260827210200`, `20260828220100` e `20260901100001` registradas |
| `gmail-oauth` | Publicada na versão 563; ativa; JWT obrigatório; quatro fontes remotas idênticas ao `main` |
| `gmail-send` | Ativa na versão 562; JWT obrigatório; não alterada nesta continuação |
| `gmail-sync` | Ativa na versão 560; JWT obrigatório; não alterada nesta continuação |
| `gmail-webhook` / `gmail-cron-sync` | Ativas com autenticação própria; não alteradas nesta entrega |
| Smoke anônimo de `gmail-send` / `gmail-sync` | HTTP 401 em ambas; nenhuma mensagem enviada |

Nenhuma migration precisou ser aplicada nesta etapa: o schema e as migrations Gmail requeridas já estavam presentes no banco canônico. A publicação foi limitada às duas Edge Functions cujo código remoto estava desatualizado.

As fontes publicadas de `gmail-send` e `gmail-sync` foram relidas pela API de gestão e comparadas byte a byte com todos os arquivos declarados no manifesto de deploy. Não houve leitura, impressão ou alteração de secrets. A tentativa posterior de detalhar novamente expressões de policies e executar os advisors falhou por timeout do conector inclusive em consulta trivial; esse incidente operacional permanece explícito e não invalida o inventário SQL já obtido.

## Matriz dos 80 critérios de aceite

Legenda: **Aprovado localmente**, **Parcial**, **Bloqueado** ou **Pendente**. “Aprovado localmente” não equivale a homologação online até o merge e o deploy do frontend.

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
| 011 | Aprovado localmente | `has_attachments` real é consultado em lotes e o corpus não é truncado em 1.000 threads. |
| 012 | Aprovado localmente | Busca inclui `last_from`, contato e assunto sem exigir CRM. |
| 013 | Aprovado localmente | Paginação server-side coleta mais de 2.200 registros em teste; busca opera sobre todo o corpus coletado. |
| 014 | Aprovado localmente | Ordenação usa data e ID como desempate; paginação local é estável. |
| 015 | Aprovado localmente | INBOX/SENT/TRASH/SPAM e labels reais filtram o conjunto consultado. |
| 016 | Aprovado localmente | Busca, pasta/label, leitura, anexo e período combinam e são restaurados pela URL. |
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
| 029 | Aprovado localmente | Conteúdo e ID remoto são restaurados após reload; bytes locais nunca são persistidos e exigem reanexo explícito. |
| 030 | Parcial | Chaves incluem usuário, conta, modo e alvo, com expiração em 7 dias; não há listener global que apague fisicamente todas as chaves no logout. |
| 031 | Aprovado localmente | Reply histórico transporta target local e Gmail/RFC correto. |
| 032 | Aprovado localmente | Forward usa mensagem e anexos selecionados do alvo histórico. |
| 033 | Aprovado localmente | Parser prioriza Reply-To válido. |
| 034 | Aprovado localmente | To/Cc disjuntos, deduplicados e sem autoendereçamento. |
| 035 | Aprovado localmente | Bcc recebido não é inferido nem reinserido. |
| 036 | Aprovado localmente | Testes cobrem nome com vírgula, Unicode, inválidos e CR/LF. |
| 037 | Aprovado localmente | TipTap WYSIWYG aplica bold/italic/listas/link, undo/redo e produz HTML + plain-text coerentes. |
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
| 054 | Aprovado localmente | Favorito e labels reais de usuário têm mutations e seletor persistente. |
| 055 | Aprovado localmente | Resultado parcial retorna 207 e só confirma mensagens aceitas. |
| 056 | Aprovado localmente | Cursor não avança quando a página é parcial. |
| 057 | Aprovado localmente | History pagina added/deleted/labels e reconcilia cada tipo. |
| 058 | Aprovado localmente | Agregação determinística independe da ordem de chegada. |
| 059 | Aprovado localmente | Identidade, participantes, anexos e conversas relacionadas usam dados reais, deduplicados e isolados pela conta. |
| 060 | Aprovado localmente | Notas internas usam `useContactNotes` somente quando há contato real vinculado; nada entra no MIME. |
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
| 071 | Aprovado localmente | Dez viewports de 320–1920, drawer intermediário com foco restaurado e reflow equivalente a zoom 200% passam. |
| 072 | Aprovado localmente | E2E valida teclado, Esc e restauração de foco. |
| 073 | Aprovado localmente | Ações históricas permanecem visíveis e acionáveis em touch. |
| 074 | Parcial | Axe não encontrou violações no workspace; temas alternativos não foram medidos. |
| 075 | Parcial | Scroll é preservado; aviso de nova mensagem e reduced-motion ainda não têm cenário completo. |
| 076 | Aprovado localmente | Matriz verifica que compositor e FAB não cobrem a ação primária. |
| 077 | Parcial | Teste com 1.000 threads monta apenas a página visível e confirma 50 páginas; fixture de thread individual extrema ainda falta. |
| 078 | Aprovado localmente | Projeto `chromium-email-navy` coleta 19 testes sem login real ou envio real. |
| 079 | Aprovado localmente | Typecheck, build, lint tocado, Deno, 5.816 unitários e E2E completo foram executados. |
| 080 | Aprovado | PR #1751 foi mergeada em `bc9cf299`; Vercel Production publicou esse build; `gmail-oauth` v563 foi conferida fonte a fonte e a rota pública passou 19/19 testes. |

Totais da auditoria neste marco: 65 aprovados, 14 parciais, nenhum pendente e 1 bloqueado visual. O único bloqueio é a comparação formal com o PNG ausente; merge, backend canônico, deploy e homologação online foram concluídos.

## Validações executadas

| Validação | Resultado real |
|---|---|
| TypeScript | Aprovado (`tsc -b --force`) |
| Build Vite | Aprovado; 5.521 módulos; somente warning preexistente de chunk grande |
| ESLint dos arquivos tocados | Aprovado, zero erro/warning |
| Vitest global | 473 arquivos, 5.816 testes aprovados e 38 `todo`, zero falha inesperada |
| Vitest direcionado após ajustes finais | Compositor 18/18 e utilitários novos incluídos na suíte global |
| Deno Edge Functions completo | 690 testes aprovados, zero falha, incluindo typecheck dos testes |
| `deno check` handlers/helpers | Aprovado; fake de escopo atualizado para o contrato tipado de reconciliação |
| Playwright Email NAVY | 19/19 aprovados, incluindo WYSIWYG, drawer, labels, zoom e matriz responsiva |
| Acessibilidade Playwright/axe | Zero violação no cenário avaliado |
| Chamadas mutáveis externas | Interceptadas e bloqueadas; zero envio real |
| CI da branch | Build, unitários, Playwright, lint/typecheck, segurança, DB Guard, CodeQL, SonarCloud, mutation e E2E Talk X aprovados no commit remoto auditado |
| Edge Functions canônicas | `gmail-oauth` v563, `gmail-send` v562 e `gmail-sync` v560 ativas; as três mantêm JWT obrigatório |
| Smoke remoto sem autenticação | 401 para ambas as funções; zero envio real |
| GitHub | PR #1751 validada por 12 checks bem-sucedidos, sem falhas, e mergeada por squash em `bc9cf299317423e09493e6164486d062acfbd5ed` |
| Vercel Production | Deployment concluído; `version.json` confirmou exatamente `bc9cf299317423e09493e6164486d062acfbd5ed` |
| Playwright na URL pública | 19/19 aprovados em `https://zapp-web-v2.vercel.app`; mutações externas interceptadas e zero envio real |
| `gmail-oauth` canônica | v563 `ACTIVE`, JWT obrigatório, quatro fontes remotas idênticas ao `main`; smoke anônimo HTTP 401 |

O lint global continua contendo dívida histórica fora do diff; não foi enfraquecido. O critério aplicado à entrega é lint estrito em todos os arquivos tocados, além de typecheck/build/teste global.

## Capturas reproduzíveis

Diretório: `e2e/email-navy-visual/`

- Estados: `01-lista.png`, `02-conversa.png`, `03-compositor.png` e `04-sidebar-expandida.png`.
- Mobile: 320×800, 360×800 e 390×844.
- Tablet: 768×1024 e 1024×768.
- Desktop: 1280×720, 1366×768, 1440×900, 1672×941 e 1920×1080.

As capturas usam dados sintéticos e não contêm e-mails, tokens ou sessões reais.

## Rollback e fechamento operacional

A implementação foi mergeada e homologada. O frontend pode ser revertido pelo histórico de deployments da Vercel/GitHub, e `gmail-oauth` pode ser revertida republicando a versão anterior registrada no Supabase. Não houve DDL nesta continuação; portanto não existe rollback de schema.

Permanece como acompanhamento não bloqueante:

1. anexar `referencias/01_EMAIL_DIRECAO_VISUAL.png` para a certificação visual formal do AC-002;
2. reexecutar integralmente os advisors e o catálogo detalhado de RLS/grants quando o endpoint deixar de responder com timeout;
3. tratar a dívida informativa de índices em uma iniciativa própria, com migration, análise de carga e rollback separados.
