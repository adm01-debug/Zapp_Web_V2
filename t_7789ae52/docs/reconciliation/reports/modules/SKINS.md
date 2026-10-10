# Reconciliação Skins Opera GX — 100 requisitos

Baseline fixo: `2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6`. Auditoria somente leitura em 2026-10-03.

## Resultado

As 100 tarefas foram reconciliadas individualmente. O sistema de 19 skins, a migração v6, o aplicador único e a página estão incorporados. A validação autenticada de fidelidade, os 14 checks funcionais e a prova de produção permanecem sem evidência de fechamento. O ledger de setembro já expunha esses limites: esta revisão preserva essa honestidade e impede que a marcação dos checkpoints ou o merge sejam convertidos em 100 tarefas verificadas.

Foram executados **299 probes offline: 297 passaram e 2 reproduziram falhas atuais**. São 150 comparações de tokens com corporate, 76 razões de contraste de dois pares sólidos, nove linhas de paridade GX e contratos de storage/aplicação. Os probes não são a suíte Vitest completa, não usam navegador e não enviam dados para serviços. Os dois defeitos encontrados são estado salvo incorreto sob quota e exceção com JSON null no storage.

| Status | Tarefas |
|---|---:|
| DONE_VERIFIED | 52 |
| PARTIAL | 11 |
| BLOCKED_EXTERNAL | 19 |
| IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | 8 |
| NEEDS_REVALIDATION | 6 |
| VALIDATED_FAIL | 2 |
| NO_LONGER_APPLICABLE | 2 |

## Evidência e limites

O escopo original está em [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:221](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L221) e os resultados históricos em [docs/design/SKINS_OPERA_GX_STATUS.md:5](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/SKINS_OPERA_GX_STATUS.md#L5). Foram lidos código, testes, PRs e ancestrais Git; não houve login, SQL, deploy ou alteração no repositório. A suíte Vitest não foi executada porque o checkout não contém node_modules. O arquivo `skins_probe_results.json` conserva cada resultado, hashes das fontes e as limitações dos mocks.

`DONE_VERIFIED` se refere ao requisito individual: por exemplo, o contrato puro medido ou o evento de entrega histórico comprovado no Git e no ledger. Um commit histórico concluído não declara verde o CI atual. `NEEDS_REVALIDATION` distingue arquivos de teste existentes e resultados históricos de uma execução da suíte neste baseline. Os bloqueios de QA são evidência histórica pendente, sem afirmar que as credenciais ou a conta de deploy continuem inválidas hoje.

## Linhagem e decisões preservadas

| PR | Papel | Resultado nesta auditoria |
|---|---|---|
| [#549](https://github.com/adm01-debug/Zapp_Web_V2/pull/549) | Implementação das 19 skins, storage e página | Squash ancestral do baseline; limitações de QA já declaradas |
| [#550](https://github.com/adm01-debug/Zapp_Web_V2/pull/550) | Fechamento documental CP11 | Não adicionou screenshots nem prova de deploy |
| [#1416](https://github.com/adm01-debug/Zapp_Web_V2/pull/1416) | Alto contraste vence variáveis inline | Correção presente; o probe confirma retirada das cores inline |
| [#1435](https://github.com/adm01-debug/Zapp_Web_V2/pull/1435) → [#1458](https://github.com/adm01-debug/Zapp_Web_V2/pull/1458) | Ajuste global AA, depois revertido para restaurar azul | Revert por decisão explícita; não reaplicar automaticamente |
| [#1533](https://github.com/adm01-debug/Zapp_Web_V2/pull/1533) | muted-foreground claro passa de L45 para L40 | Espelhos CSS/preset continuam iguais |
| [#1847](https://github.com/adm01-debug/Zapp_Web_V2/pull/1847) | Preferência de contraste do sistema passa a ter efeito | Listener e classe presentes; não reabrir esse defeito já corrigido |

A contagem correta é **10 clássicas, incluindo Diversity, mais 9 GX**. Permanecem aceitas: ausência de fonte nova, ausência de UI para import/export, reset que não muda o modo de cor, skeleton inaplicável, StarBackground inexistente no Zapp, três superfícies claras herdadas fora do escopo e as reconciliações decorativas de tokens registradas no ledger. A imprecisão do grep de `c.v === 5` foi resolvida a favor do código do apêndice; não se deve introduzir uma condição artificial para fazer o grep passar.

O teste de 76 razões usa **3:1** e dois pares de tokens sólidos. Todos passaram agora. Ele não prova contraste AA de texto normal com alfa, sliders, gradientes de Diversity ou todos os componentes. O #1458 registra seis pares reabertos na data do revert; esta auditoria não afirma que esses seis valores históricos sejam exatamente os atuais, pois houve correções posteriores como #1533.

## Achados

### SK01 — Autosave marca como salvo o estado que a gravação por quota rejeitou

**Severidade:** MEDIUM. **Tarefas:** 42, 43, 85.

updateConfig chama saveThemeConfig(next) e setSavedConfig(next) sem verificar o booleano. Sob quota, o estado em tela difere do storage mas hasUnsavedChanges retorna false; applyPreset emite somente sucesso. O handler Salvar trata false corretamente, o que não corrige o caminho de autosave.

**Impacto:** O usuário perde a sinalização de alterações não salvas e pode perder a skin/raio após recarregar.

**Tratamento registrado:** Atualizar savedConfig apenas depois de sucesso; exibir erro e conservar alterações pendentes quando a persistência falhar. Tratar o reset com a mesma política de falha.

**Aceite de eventual correção:** Com setItem lançando, selecionar GX mantém o storage anterior, aplica a mudança em memória, mostra erro e mantém o indicador; gravação posterior bem-sucedida limpa o indicador.

**Limite da prova:** O probe usa estado síncrono em memória e não mede renderização, batching React ou uma falha de armazenamento em navegador real. Não há incidente de usuário observado.

Fontes: [src/components/settings/theme/useThemePreset.ts:35](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/useThemePreset.ts#L35); [src/components/settings/ThemeCustomizer.tsx:50](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/ThemeCustomizer.tsx#L50); [src/components/settings/theme/presets.ts:629](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L629); [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:286](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L286); [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:364](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L364).

### SK02 — Formato JSON null no storage faz loadThemeConfig lançar em vez de recuperar

**Severidade:** MEDIUM. **Tarefas:** 20, 32, 70.

readStored faz cast do resultado de JSON.parse sem validar se é objeto não nulo. Quando a chave theme-custom-colors contém o texto null, o parse não lança, mas stored.v em loadThemeConfig lança TypeError. Initializer e o estado inicial do hook chamam essa função sem captura própria.

**Impacto:** Uma preferência local com formato incompatível pode interromper a inicialização do tema ou a montagem da página de Skins; o fallback para corporate não é alcançado nesse formato.

**Tratamento registrado:** Validar o objeto retornado por JSON.parse, rejeitando null e formatos incompatíveis para um objeto vazio/default antes de ler v. Manter a migração v5 e o merge de cache.

**Aceite de eventual correção:** null, arrays e primitivos na chave local não lançam; as migrações e os casos de quota existentes continuam válidos.

**Limite da prova:** Não há prova de que o escritor normal gere null nem de ocorrência em produção. Trata-se de robustez diante de estado local incompatível; JSON null é sintaticamente válido.

Fontes: [src/components/settings/theme/presets.ts:620](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L620); [src/components/ThemeInitializer.tsx:18](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/ThemeInitializer.tsx#L18); [src/components/settings/theme/useThemePreset.ts:20](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/useThemePreset.ts#L20); [src/components/settings/theme/__tests__/theme-storage.test.ts:51](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/__tests__/theme-storage.test.ts#L51).

### SK03 — Checkpoints técnicos marcados coexistem com gates visuais e globais não demonstrados

**Severidade:** MEDIUM. **Tarefas:** 8, 30, 51, 54, 57, 61, 62, 75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 86, 87, 88, 89, 90, 91, 96, 99, 100.

O ledger é honesto sobre login, ausência de screenshots, CP8/CP9 bloqueados e produção não verificada. Porém CP0/4/5/6/10/11 marcados não podem ser contados como cumprimento de cada gate: falta o antes exigido, prova visual e suíte inteira adiada. A aceitação funcional também tem falha atual SK01.

**Impacto:** Somar marcadores ou o merge produziria um total artificial de 100 concluídas e ocultaria o que foi realmente testado.

**Tratamento registrado:** Na reconciliação, separar entrega de código, testes históricos, QA visual, QA funcional e produção; conservar os bloqueios como pendências de evidência sem inventar execução.

**Aceite de eventual correção:** Cada etapa mantém sua evidência e seu status; nenhum screenshot, check autenticado ou deploy é inferido de checkbox/PR.

**Limite da prova:** A auditoria não tentou autenticar nem consultar a Vercel; bloqueio histórico não é diagnóstico de disponibilidade atual.

Fontes: [docs/design/SKINS_OPERA_GX_STATUS.md:5](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/SKINS_OPERA_GX_STATUS.md#L5); [docs/design/SKINS_OPERA_GX_STATUS.md:34](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/SKINS_OPERA_GX_STATUS.md#L34); [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:228](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L228); [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:331](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L331); [docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md:347](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/docs/design/PLANO_SKINS_OPERA_GX_100_ETAPAS.md#L347).

### SK04 — Contraste: correções de precedência sobrevivem, ajuste global AA foi revertido por decisão

**Severidade:** INFO. **Tarefas:** 21, 26, 64, 68, 69.

#1416 corrigiu a disputa entre cor inline e high-contrast; #1847 acrescentou resposta à preferência do sistema. #1435 alterou luminosidades globais para AA e foi revertido deliberadamente por #1458 para restaurar o azul corporate, aceitando na época a reabertura de seis pares. #1533 ajustou depois muted-foreground claro em ambos os espelhos.

**Impacto:** A exigência de 76 pares sólidos ≥3:1 da etapa 68 continua passando, mas isso não certifica todas as composições AA. Reaplicar #1435 sem decisão nova desfaria uma preferência explícita.

**Tratamento registrado:** Preservar a decisão de #1458. Eventual mudança AA global exige nova decisão de produto, considerando a aparência; esta auditoria apenas registra a distinção dos limiares e os sucessores.

**Aceite de eventual correção:** Não reportar o bug de precedência já corrigido como atual; não apresentar 3:1 de dois pares como AA global nem os seis valores antigos como medidos agora.

**Limite da prova:** Nenhum dos seis pares compostos históricos foi reamostrado em pixels nesta auditoria; alterações posteriores podem mudar valores individuais.

Fontes: [src/components/settings/theme/presets.ts:681](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L681); [src/components/theme/HighContrastToggle.tsx:56](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/theme/HighContrastToggle.tsx#L56); [src/components/settings/theme/__tests__/presets.test.ts:377](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/__tests__/presets.test.ts#L377).

## Resíduo específico do catálogo

Diversity guarda `gradient-success` nos objetos light/dark mediante cast para ThemeModeColors, mas essa chave está em FIXED_TOKENS e fora de CSS_VARS_TO_APPLY. O teste de presets verifica a string do objeto, não que ela chegue ao DOM. A busca atual não encontrou consumidor de aplicação desse override fora do catálogo/teste e dos valores fixos de tokens.css. É uma propriedade adicional inerte no caminho padrão, de prioridade baixa e sem defeito visual de usuário demonstrado. Classificação: **DEAD_CANDIDATE / DELETE-D** para a propriedade adicional, não para o módulo inteiro; preservar até decidir se ela deve ser aplicada como exceção ou removida/documentada em missão posterior. Fontes: [src/components/settings/theme/presets.ts:97](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L97), [src/components/settings/theme/presets.ts:444](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L444), [src/components/settings/theme/presets.ts:681](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/presets.ts#L681), [src/components/settings/theme/__tests__/presets.test.ts:371](https://github.com/adm01-debug/Zapp_Web_V2/blob/2e7cf81c6c4d6ae9942e4a5d7fbc1ddb06788ab6/src/components/settings/theme/__tests__/presets.test.ts#L371).

## Registro individual das 100 tarefas

A especificação integral e a evidência por linha estão em `skins_tasks.json`. A tabela abaixo resume a decisão de cada requisito.

| Etapa | Tipos | Status | Julgamento |
|---|---|---|
| 1 | CODE | DONE_VERIFIED | A preparação histórica foi registrada com worktree, branch e base; a entrega correspondente está incorporada pelo squash #549. A tarefa operacional era da execução de setembro e não manda recriar aquele worktree nesta auditoria. |
| 2 | CODE | DONE_VERIFIED | O ledger registra a busca histórica de PRs e a ausência de conflito na época; a base e os arquivos do #549 permitem relacionar essa preparação à entrega. Não é uma declaração sobre PRs abertas hoje. |
| 3 | CODE | DONE_VERIFIED | O fallback sem grafo foi expressamente registrado. Hoje os consumidores diretos incluem Initializer, hook, página e o tipo do card; HighContrastToggle também importa o aplicador após #1416. A premissa antiga de somente dois consumidores foi superada pela integração real. |
| 4 | CODE | DONE_VERIFIED | SKINS_OPERA_GX_STATUS.md existe, está no squash #549 e recebeu fechamento documental no #550. |
| 5 | CODE | DONE_VERIFIED | O requisito era registrar hashes das duas fontes de referência; o ledger contém SHA da referência e ambos os SHA-256. Esta auditoria confirma o registro, sem alegar nova obtenção do repositório Promo Gifts. |
| 6 | CODE, TEST, EXTERNAL | PARTIAL | A instalação histórica do Playwright está registrada, mas o mesmo ledger informa que a autenticação de QA falhou. A preparação não produziu um ambiente capaz de executar a validação autenticada exigida nas fases seguintes. |
| 7 | CODE, TEST | DONE_VERIFIED | CP0 enumera typecheck, ratchets, implicit-any e 299 testes do baseline com resultado histórico verde. O cumprimento é histórico e não certifica que o baseline atual passou pela suíte inteira. |
| 8 | CODE, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | O ledger declara before=BLOQUEADO e deploy a verificar externamente. O próprio plano diz que sem 00-before-themes.png CP0 não fecha; o marcador de CP0 não supre a imagem. |
| 9 | CODE, TEST | DONE_VERIFIED | ThemeModeColors usa campos explícitos, sem assinatura de índice. ThemePreset possui category, raio/fonte opcionais e quatro swatches. O contrato atual contém 75 chaves de cor; o número aproximado de 90 do plano não é uma obrigação de criar tokens artificiais. |
| 10 | CODE, TEST | DONE_VERIFIED | buildPreset deriva a primária dos parâmetros. O probe atual confirma as nove primárias GX exatas e 19 primárias dark distintas, eliminando a causa de primária dark fixa. |
| 11 | CODE, TEST | DONE_VERIFIED | As fórmulas e escalas tonais estão presentes; 150 comparações atuais de corporate com tokens.css passaram. O sucessor #1533 ajustou muted-foreground claro nos dois espelhos de forma coerente. |
| 12 | CODE, TEST | DONE_VERIFIED | FIXED_TOKENS registra os grupos semânticos que permanecem fora do aplicador; success, whatsapp e kpi-tile-green não estão nas 75 chaves aplicadas. |
| 13 | CODE, TEST | DONE_VERIFIED | As swatches são derivadas de quatro cores; o probe confirmou quatro valores distintos em corporate. Os testes existentes cobrem os quatro valores por preset. |
| 14 | CODE, TEST | DONE_VERIFIED | CSS_VARS_TO_APPLY é as const com satisfies keyof ThemeModeColors; tem 75 chaves e corresponde ao conjunto de corporate. Diversity possui uma propriedade adicional fora desse contrato, documentada como resíduo específico. |
| 15 | CODE, TEST | DONE_VERIFIED | O catálogo tem exatamente as dez clássicas do plano, com corporate primeiro e Diversity incluída nessas dez. O texto que soma 10 + Diversity + 9 é uma imprecisão de contagem do relato, não vinte skins no código. |
| 16 | CODE, TEST | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | A paleta Pride e os gradientes principais foram portados. A fidelidade visual de Diversity não foi demonstrada pelo QA autenticado; gradient-success é uma propriedade extra do objeto que não entra no loop de aplicação nem no cache. |
| 17 | CODE, TEST | DONE_VERIFIED | O pipeline GX está presente com superfícies roxas, glow, glass, raio 10 e ausência de fonte. O probe confirma a superfície dark e o raio aplicados; as nove especificações de primária passam. |
| 18 | CODE, TEST | DONE_VERIFIED | As nove GX possuem os ids e primárias do apêndice; o probe confirma category=gx, raio=10, fonte ausente e light.primary=dark.primary para cada uma. |
| 19 | CODE, TEST | DONE_VERIFIED | getPresetById e os filtros exportados existem; o probe confirma 10 clássicas e 9 GX. |
| 20 | CODE, TEST | PARTIAL | Storage v6, migração de quatro ids, merge de cache, clamps e retorno false por quota foram confirmados no probe. Há uma lacuna atual: JSON null é aceito por readStored e loadThemeConfig lança TypeError ao acessar stored.v. |
| 21 | CODE, TEST | DONE_VERIFIED | O aplicador usa um timer, escreve cache em um único módulo e respeita persistCache:false. O probe confirma zero gravações nessa opção. A exceção de alto contraste introduzida no #1416 retira cores inline e mantém raio/cache, em vez de deixar a classe perder precedência. |
| 22 | CODE, TEST | DONE_VERIFIED | applyRadius limita 0–20 e trata NaN; clearThemeOverrides remove cores, fontes, raio, data-preset-id e cache. O probe confirmou o retorno do raio inválido a 0.875rem e a limpeza. |
| 23 | CODE, TEST | DONE_VERIFIED | As funções puras de exportação/importação existem, sem UI de arquivos; round-trip foi executado e o parser valida id e raio. |
| 24 | CODE | DONE_VERIFIED | O núcleo documentado em CP1 está no diff incorporado pelo squash #549. O SHA intermediário do ledger é proveniência histórica, não uma exigência de refazer commits. |
| 25 | CODE, TEST | DONE_VERIFIED | tokens-sync.test.ts lê os blocos reais de tokens.css e compara as 75 chaves em light/dark. A reconciliação atual repetiu as 150 comparações com zero divergência. |
| 26 | CODE, TEST | DONE_VERIFIED | O ledger conserva a tabela de 13 reconciliações e seus ΔE, incluindo a decisão explícita sobre tokens decorativos. A igualdade atual dos dois espelhos passou; o ajuste posterior #1533 foi considerado. |
| 27 | CODE | DONE_VERIFIED | O arquivo Diversity e sua importação estão presentes; os seletores por data-preset-id ligam os overrides à skin. Isso confirma a integração do CSS, sem substituir a prova visual da fase 8. |
| 28 | CODE | DONE_VERIFIED | A classe sidebar-logo-tile continua no logo; o seletor Diversity correspondente está no CSS. |
| 29 | CODE | DONE_VERIFIED | A convivência dos timers de 350 e 500 ms foi expressamente analisada e aceita no ledger. Não há autorização para redesenhar a transição na auditoria. |
| 30 | CODE | PARTIAL | O plano exige lista antes/depois de azuis hardcoded. O ledger fecha CP2, mas não preserva essa lista detalhada; os resultados visuais de resíduos de CP6 também ficaram bloqueados. |
| 31 | CODE | DONE_VERIFIED | A sincronia e os overrides estão incorporados pelo squash #549, com checkpoint intermediário anotado no ledger. |
| 32 | CODE | PARTIAL | Initializer usa o efeito de resolvedTheme, não escreve storage diretamente, não força raio mínimo 14 e não usa requestAnimationFrame. Contudo, a exceção de loadThemeConfig com JSON null pode sair do efeito sem fallback. |
| 33 | CODE, TEST | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | O listener storage chama applyThemePreset com persistCache:false; o teste de componente exige zero setItem no handler. O fluxo real entre duas abas, com modos distintos, ficou sem prova autenticada. |
| 34 | CODE, TEST | DONE_VERIFIED | A migração v5→v6 conserva raio 8 e mapeia forest para emerald. O probe atual confirmou os quatro mapeamentos e a remoção do cache antigo; o teste de Initializer cobre a sequência de mount. |
| 35 | CODE | DONE_VERIFIED | O boot v6, checagem de cacheMode, preservação de v5 e rejeição de versões estranhas estão presentes. O probe rejeitou cache de modo diferente. O grep literal do plano é reconhecidamente incorreto e o Apêndice C foi a decisão seguida. |
| 36 | CODE | DONE_VERIFIED | A busca atual encontra as gravações de cssVarsCache somente no módulo presets.ts; o boot lê e o Initializer delega ao aplicador. Os novos consumidores não criam escritor de cache paralelo. |
| 37 | CODE | DONE_VERIFIED | AppProviders conserva ThemeSync antes de ThemeInitializer; HighContrastProvider os envolve. A ordem foi lida no código atual. |
| 38 | CODE, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | O efeito reage ao modo e o teste de componente cobre dark→light e cacheMode. A evidência disponível é o teste histórico, não uma nova inspeção autenticada no preview com a skin salva. |
| 39 | CODE, TEST | DONE_VERIFIED | O clamp compartilhado trata números inválidos e limita 0–20; o boot limita números finitos antes do React. Os probes de raio 999, -3, texto, null e NaN passaram nos caminhos aplicáveis. |
| 40 | CODE, TEST | NEEDS_REVALIDATION | O arquivo contém quatro testes pertinentes, incluindo mount, migração, storage sem eco e troca de modo. Os resultados históricos estão registrados, mas a suíte Vitest atual não foi reexecutada neste ambiente sem node_modules. |
| 41 | CODE | DONE_VERIFIED | A integração de boot/Initializer está no squash #549 e em sucessores rastreados. O checkpoint CP3 contém evidência histórica antes do React montar. |
| 42 | CODE | VALIDATED_FAIL | O hook atual ignora o false retornado por saveThemeConfig no autosave e chama setSavedConfig mesmo assim. O probe do corpo real do hook deixa storage em corporate, config em gx-hackerman e hasUnsavedChanges=false; há somente toast de sucesso. |
| 43 | CODE | PARTIAL | O header, botões e indicador condicionado a hasUnsavedChanges existem. O indicador não representa a falha de autosave porque o hook marca como salvo um estado que não foi persistido. |
| 44 | CODE, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | Claro, Escuro e Sistema mantêm os handlers e os tooltips. O teste atual verifica o handler Claro por mock; não foi refeita a prova funcional autenticada dos três modos nem uma comparação byte a byte com o bloco histórico. |
| 45 | CODE | DONE_VERIFIED | A seção clássica usa o array de 10 entradas, radiogroup nomeado, testid e grid 2/3/5 colunas. O teste de página preserva essa contagem. |
| 46 | CODE | DONE_VERIFIED | A seção GX usa as nove entradas, grupo acessível separado e badge GAMER. A fonte e o teste de página confirmam sua estrutura. |
| 47 | CODE, TEST | DONE_VERIFIED | A página fornece value e onChange à API atual de BorderRadiusControl; a atualização passa pelo hook e mantém o snap de raio. |
| 48 | CODE, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | fadeUp, parâmetros de animação e consulta a useReducedMotion estão presentes. O DoD exige ausência de warning em console real, evidência não conservada para o QA autenticado. |
| 49 | CODE | DONE_VERIFIED | As strings pt-BR estão no hook e no diálogo; a descrição do reset menciona somente skin e raio, preservando a decisão de não resetar o modo de cor. |
| 50 | CODE | DONE_VERIFIED | A página e o hook foram incorporados no squash #549; CP4 registra typecheck/build e oito testes históricos. |
| 51 | CODE, TEST, RUNTIME_REAL | PARTIAL | O card implementa radio, aria-checked, nome, Enter/Space e swatches. Os testes existentes são de DOM e eventos, não há execução axe autenticada registrada para o DoD completo. |
| 52 | CODE, TEST | DONE_VERIFIED | Há cinco presets de raio 0/4/8/12/20, slider 0–20, onChange numérico e preview. thumbLabel resolve a semântica no Thumb do Radix, em vez de copiar um aria-label ineficaz do Root. |
| 53 | CODE, TEST, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | O diálogo existe com confirmar/cancelar e a página tem teste de confirmação. A abertura, cancelamento e foco no navegador real não foram revalidados neste baseline. |
| 54 | CODE, TEST | PARTIAL | focusSibling e os handlers de setas/Home/End estão implementados. A busca nos testes atuais não encontra ArrowRight nem teste de focusSibling; os testes do card cobrem Enter e Space, deixando o DoD de navegação por setas sem execução durável. |
| 55 | CODE | NO_LONGER_APPLICABLE | O catálogo é estático; a própria tarefa e o ledger dispensam skeleton/empty state. |
| 56 | CODE, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | Há gates por useReducedMotion no card e na página. A prova de emulateMedia e ausência de transform animado não foi produzida no QA real. |
| 57 | CODE, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | O CSS prevê duas colunas e header flex-wrap, mas 05-mobile.png e a medição scrollWidth<=innerWidth ficaram bloqueadas por autenticação de QA. |
| 58 | CODE | DONE_VERIFIED | Os componentes foram incorporados pelo #549; o ledger mantém o checkpoint e o ajuste no slider. |
| 59 | CODE | DONE_VERIFIED | O ledger registra o inventário de 99 tokens da época, os grupos A/B/C e as cinco decisões de faltas. O comentário FIXED_TOKENS conserva as justificativas; o inventário é histórico, não uma enumeração automática de todos os consumidores atuais. |
| 60 | CODE | DONE_VERIFIED | As decisões para neutral, shadows e tokens constantes estão registradas; o contrato de 75 chaves passa na comparação atual com tokens.css. |
| 61 | CODE, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Oito screenshots de quatro telas com GX Classic e Diversity não foram executados. A alegação de cobertura por grep não prova ausência de resíduos azuis nos pixels. |
| 62 | CODE, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Esta etapa dependia da lista de resíduos e das screenshots da etapa 61. O ledger não conserva as imagens refeitas que permitiriam aceitar a limpeza visual limitada ao escopo. |
| 63 | CODE | NO_LONGER_APPLICABLE | StarBackground não existe no Zapp; o ledger identifica a referência como exclusiva de Promo Gifts. |
| 64 | CODE, TEST, RUNTIME_REAL | IMPLEMENTED_AWAITING_RUNTIME_EVIDENCE | A conclusão original por grep era insuficiente: #1416 corrigiu a prioridade inline sobre a classe; #1847 tornou a preferência do sistema efetiva. Ambas as correções sobrevivem. O probe atual confirma que o aplicador retira cores inline sob high-contrast. |
| 65 | CODE | DONE_VERIFIED | A cobertura de tokens e suas decisões estão incorporadas pelo #549. |
| 66 | CODE, TEST | NEEDS_REVALIDATION | A suíte de presets inclui catálogo, pipeline, aplicação, storage, fluxos, Diversity e casos de borda; o ledger registra a execução histórica. Os probes atuais cobrem contratos puros, mas não executam a suíte Vitest inteira nem todos os efeitos do DOM. |
| 67 | CODE, TEST | DONE_VERIFIED | A seção de paridade GX está ativa; o probe atual confirmou as nove linhas com cinco condições cada, sem skip e com HSL exatos. |
| 68 | CODE, TEST | DONE_VERIFIED | As 76 razões atuais dos dois pares sólidos em 19 skins×2 modos passaram com limiar 3:1. Esse é exatamente o escopo do item; não certifica AA de texto normal, alfas, gradientes ou todos os componentes. |
| 69 | CODE, TEST | DONE_VERIFIED | O teste de sincronia permanece na suíte e as 150 comparações foram repetidas com êxito no baseline atual, incluindo o ajuste coerente do #1533. |
| 70 | CODE, TEST | NEEDS_REVALIDATION | O arquivo cobre os casos enumerados de v6/v5, clamps, id desconhecido, merge e quota; o probe atual confirma esses contratos puros. O arquivo Vitest não foi reexecutado, e não há caso para objeto de storage null. |
| 71 | CODE, TEST | NEEDS_REVALIDATION | ThemeInitializer.test.tsx permanece com migração, storage sem eco e mudança de modo. A evidência verde é histórica e foi qualificada separadamente da inspeção atual. |
| 72 | CODE, TEST | NEEDS_REVALIDATION | Oito testes de página estão presentes e o ledger registra seu sucesso histórico. Eles cobrem fluxos positivos, mas não exercitam quota do autosave, dot vermelho nem roving por setas. |
| 73 | CODE, TEST | NEEDS_REVALIDATION | Os testes de card e raio existem, com seis testes no card e cinco no controle; o sucesso registrado é histórico. O teste por setas pedido na etapa 54 está ausente. |
| 74 | CODE, TEST | DONE_VERIFIED | A entrega de testes está no squash #549 e CP7 registra 302 novos, 601 no escopo e exit 0. O relato não registra tempo preciso daquela suíte e não equivale a execução atual. |
| 75 | CODE, TEST | PARTIAL | Build e preview foram usados no histórico, inclusive a prova de boot CP3. Não há evidência persistida do HTTP 200 específico do rebuild da fase 8; essa fase foi bloqueada. |
| 76 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | As 19 PNGs e 08-skins.json não foram produzidos; CP8 está explicitamente bloqueado no ledger. |
| 77 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Não há 19/19 de variáveis e de pixels com ΔE. O probe atual mede valores do objeto, sem amostrar uma sidebar renderizada. |
| 78 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | As três screenshots em modo claro não foram executadas; valores de paleta presentes no código não são a prova visual exigida. |
| 79 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | As regras de raio são confirmadas em código e testes puros, mas as quatro leituras e a imagem de raio 0 no fluxo visual ficaram sem execução autenticada. |
| 80 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | A proteção persistCache:false existe e é testada isoladamente; a contagem de gravações e atualização de outra aba real não foram registradas. |
| 81 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | O requisito é observação de transitionDuration e transform com emulateMedia; essa prova faz parte do CP8 bloqueado. |
| 82 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | O loop de correção depende de resultados de CP8, que não foi executado. A ausência de FAILs registrados não significa que a fidelidade passou. |
| 83 | CODE, TEST, RUNTIME_REAL | PARTIAL | O check de FOUC tem evidência histórica específica no CP3, antes do React montar. Os outros quatro checks autenticados e o JSON funcional completo não foram executados. |
| 84 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Salvar/reset/migração/snap têm código e testes de componente, mas faltam os quatro checks de navegador real previstos no CP9. |
| 85 | CODE, TEST, RUNTIME_REAL | VALIDATED_FAIL | O check 11 já falha no contrato local: quota deixa hasUnsavedChanges=false e nenhum toast de erro no autosave. Os checks de modo e teclado também não têm prova autenticada completa. |
| 86 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Não há prova mobile nem navegação nas quatro telas sem novos erros de console. O baseline visual inicial também não foi obtido. |
| 87 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | O alvo 14/14 não foi alcançado porque CP9 não foi executado; além do bloqueio histórico, SK01 fornece uma falha atual concreta de um dos checks. |
| 88 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | Diversity modifica estilos de foco, mas falta a captura dos três botões navegados com Tab. A leitura de CSS não demonstra o foco visível no pixel. |
| 89 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | AppearanceSettings continua usando o sistema de tema, mas o teste de regressão real pela seleção de Aparência não foi registrado no CP9. |
| 90 | CODE, TEST, EXTERNAL | BLOCKED_EXTERNAL | Não há commit de correções do QA funcional nem registro legítimo de sem ajustes, pois os 14 checks não rodaram. |
| 91 | CODE, TEST | PARTIAL | CP10 registra typecheck, ratchets, implicit-any, lint sem dívida nova, build e delta de 1186 B gzip. A suíte inteira foi explicitamente adiada, embora o plano exigisse oito saídas; 601 testes de escopo não fecham esse gate global. |
| 92 | CODE, TEST | DONE_VERIFIED | O ledger registra ratchet verde e nenhum erro novo, satisfazendo o resultado condicional. Não há base para exigir mudança de baseline ou reconstruir um problema não ocorrido. |
| 93 | CODE, TEST | DONE_VERIFIED | A busca atual não encontra as APIs antigas applyThemeColors/removeThemeColors/buildCustomPreset/normalizeStoredPresetId/DEFAULT_PRESET_ID/ALL_COLOR_KEYS em src. label/hue foram retirados do contrato ThemePreset; os nomes genéricos continuam legítimos em outros módulos. |
| 94 | CODE | DONE_VERIFIED | O ledger contém resumo, arquivos, funcionalidades, testes, decisões e bloqueios honestos. A conclusão desta tarefa documental não fecha os gates visual e de produção que o próprio documento declara pendentes. |
| 95 | CODE, TEST | DONE_VERIFIED | A base 02054d44 documentada coincide com a base da PR #549; o squash está no histórico do baseline. O rebase é um evento de entrega já consumado. |
| 96 | CODE | PARTIAL | A PR #549 existe e foi mergeada, mas seu corpo admite ausência do antes/depois e do E2E funcional. A URL satisfaz a parte administrativa; as imagens e a tabela de 14 checks exigidas pelo escopo não foram produzidas. |
| 97 | CODE, TEST, EXTERNAL | DONE_VERIFIED | #550 e o ledger registram os checks históricos da #549 sem falhas, com success/neutral/skipped separados. Isso verifica a entrega relatada e não prova deploy nem CI do baseline atual. |
| 98 | CODE, EXTERNAL | DONE_VERIFIED | O squash 7e6ceb923b9260b08d6f0087656fa91a47114ae7 é ancestral do baseline. A exclusão histórica da branch está registrada no ledger; nenhuma nova operação Git foi executada. |
| 99 | CODE, EXTERNAL | BLOCKED_EXTERNAL | O ledger diz deploy a verificar externamente. Não existe nesta auditoria uma leitura do estado READY do deployment correspondente, nem foi confirmado bloqueio atual da conta. |
| 100 | CODE, TEST, RUNTIME_REAL, EXTERNAL | BLOCKED_EXTERNAL | A screenshot e os asserts de produção foram explicitamente pulados por falta de confirmação do deploy e de sessão QA. O texto final do ledger conserva essa pendência, conforme a exceção do plano. |

## O que fecha esta missão de auditoria

O registro contém 100 ids únicos, cada um com especificação original, tipo de trabalho, estado de implementação, testes, runtime, aceite, PRs, commits, fontes e trabalho restante. As falhas estão documentadas e reproduzidas sem alterar o produto. Nenhum ajuste de contraste aprovado foi revertido, nenhuma credencial foi usada e nenhum novo artefato de QA autenticado foi fabricado. As pendências de produto e de runtime ficam identificadas para decisões futuras, enquanto a reconciliação documental das 100 etapas está completa.
