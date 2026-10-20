# Configuração de desenvolvimento e agentes — complemento de leitura

Fonte `da307ba5626dce892f0b37cb6762463f55d14a96`; 18 arquivos, 804 linhas.

Configuração declarada não comprova instalação ou execução. Cartographer, Claude-Mem e Headroom continuam no plano de avaliação; este passe não os instalou.

## [.claude/ecc-tools.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.claude/ecc-tools.json#L1-L251)

Leitura integral 1–251: metadados de geração, readiness, perfil solicitado security versus efetivo developer, componentes/pacotes selecionados e filtrados, dependências, arquivos e adapters foram examinados. É um registro gerado em agosto, com readiness zero e workflows vazio; não comprova instalação ativa nem ausência atual de relatórios. A lista memory de outro arquivo não se confunde com Claude-Mem. Nenhum pacote ou adapter foi executado/instalado.

## [.claude/identity.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.claude/identity.json#L1-L14)

Leitura integral 1–14: identidade sugerida, nível técnico, preferência de estilo e domínio TypeScript. Metadado histórico gerado; não substitui instruções explícitas atuais nem demonstra configuração carregada em qualquer sessão.

## [.claude/settings.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.claude/settings.json#L1-L26)

Leitura integral 1–26: PreToolUse cobre Bash/Grep e Read/Glob, chama graphify hook-guard após command -v e usa timeout10. A ausência do executável termina com exit0 por desenho, portanto configuração no arquivo não prova que a guarda esteja instalada/ativa. Não houve execução do hook nem alteração de permissões.

## [.codex/config.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.codex/config.toml#L1-L48)

Leitura integral 1–48: baseline declara MCPs GitHub, Context7, Exa, memory, Playwright e sequential-thinking; registra configuração de seis threads/uma profundidade e três papéis de agente. Declarações npx/latest não fixam uma instalação materializada; este exame não invocou comandos nem tomou as permissões do arquivo como autoridade sobre a sessão. MCP server-memory não é evidência de inclusão de Claude-Mem, Headroom ou Cartographer.

## [.codex/agents/docs-researcher.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.codex/agents/docs-researcher.toml#L1-L9)

Leitura integral 1–9: papel de consulta documental, modelo/effort declarados e sandbox read-only. Configuração local examinada como dado do repositório, sem disparar agente com esse modelo ou inferir disponibilidade atual do modelo.

## [.codex/agents/explorer.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.codex/agents/explorer.toml#L1-L9)

Leitura integral 1–9: papel de exploração, sandbox read-only, rastreamento de execução e busca dirigida. A existência da configuração não comprova que um executor a carregou; nenhuma política de sessão foi modificada.

## [.codex/agents/reviewer.toml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.codex/agents/reviewer.toml#L1-L9)

Leitura integral 1–9: papel de revisão de correção/segurança/regressão, esforço declarado high e sandbox read-only. O arquivo não é evidência de revisão executada ou aprovação de código; esse alcance foi preservado.

## [.agents/skills/zapp-web-v2/agents/openai.yaml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.agents/skills/zapp-web-v2/agents/openai.yaml#L1-L6)

Leitura integral 1–6: nome/descrição/prompt de interface e allow_implicit_invocation. Metadado de descoberta da skill do repositório, sem prova de instalação global ou execução. A skill não foi criada nem alterada neste passe.

## [.editorconfig](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.editorconfig#L1-L30)

Leitura integral 1–30: UTF-8/LF, duas posições por padrão, exceção de Markdown, SQL com quatro posições e Makefile com tabs. São preferências de editor, não verificação de formatação de todos os arquivos nem configuração de compilador.

## [.gitattributes](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.gitattributes#L1-L1)

Leitura integral da linha1: atribui merge driver graphify ao JSON do grafo. O atributo não instala nem define o executável do driver; o repositório não foi submetido a merge por esta auditoria.

## [.graphifyignore](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.graphifyignore#L1-L14)

Leitura integral 1–14: exclui ambientes/segredos, baselines, dependências, build/coverage e saídas do grafo; .env.example é exceção explícita. Esse filtro vale para a ferramenta que o interpretar; não constitui controle de acesso ou remoção de arquivos Git e não prova ausência de dados sensíveis no histórico.

## [.nvmrc](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.nvmrc#L1-L1)

Leitura integral da linha1: major Node24 declarado. O pin de major não fixa patch ou comprova runtime de CI/produção; nenhuma versão foi instalada.

## [.prettierignore](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.prettierignore#L1-L35)

Leitura integral 1–35: exclusões de dependências, build, locks, cache, tipos gerados, cobertura, IDE e minificados. Exclusão de formatação não equivale a exclusão da auditoria; o vendor minificado permanece separado no denominador próprio.

## [.prettierrc](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.prettierrc#L1-L12)

Leitura integral 1–12: semicolons, aspas simples, trailingComma es5, largura100, parênteses de arrow, LF e plugin Tailwind. É configuração de formatação; não prova que plugin esteja carregado ou que lint/testes passaram. Nenhum formatador executado.

## [.vscode/extensions.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.vscode/extensions.json#L1-L19)

Leitura integral 1–19: recomendações de editor, lint, Tailwind, Git, corretor e assistência de código; lista de indesejadas vazia. Recomendação não é instalação nem autorização para instalar; não foi inferido estado do ambiente do usuário.

## [.vscode/settings.json](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.vscode/settings.json#L1-L66)

Leitura integral 1–66: formatter e ações explícitas de save, preferências TypeScript/Emmet/Tailwind, regex de classes, lint e exclusões de busca/arquivos. O tsdk aponta para dependência local; opções do editor não substituem tsconfig e exclusões visuais não removem arquivos rastreados. Nenhuma configuração do editor foi aplicada.

## [.gitignore](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.gitignore#L1-L127)

Leitura integral 1–127: regras de ambientes, segredos, CA explicitamente permitido, artefatos de build/teste, sessões E2E, caches, editor, locks e worktrees. O próprio comentário permite .env.production para variáveis públicas; padrões ignore não removem dados já rastreados. A avaliação de credenciais/ambientes permanece na revisão Infra e não houve abertura de credenciais adicionais ou alteração de regras.

## [.claude/homunculus/instincts/inherited/zapp-web-v2-instincts.yaml](https://github.com/adm01-debug/Zapp_Web_V2/blob/da307ba5626dce892f0b37cb6762463f55d14a96/.claude/homunculus/instincts/inherited/zapp-web-v2-instincts.yaml#L1-L127)

Leitura integral 1–127: seis blocos de convenções de commit, comprimento, nomes, imports, exports e localização de testes, com confiança e origem declaradas. Os dois blocos de commits citam amostra de um commit; são heurísticas históricas e não levantamento exaustivo do repositório atual. Conteúdo misto de frontmatter e Markdown não foi tratado como YAML de runtime nem como nova autorização para alterar padrões.

