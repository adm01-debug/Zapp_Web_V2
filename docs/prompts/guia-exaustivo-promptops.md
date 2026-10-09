# Guia Exaustivo de Engenharia de Prompts para Desenvolvimento de Sistemas (PromptOps)

Este documento estabelece o padrão de arquitetura de repositório, governança de contextos e engenharia de prompts avançada para a criação de sistemas de software ponta a ponta utilizando Modelos de Linguagem de Grande Porte (LLMs).

---

## 1. Arquitetura do Repositório de Prompts (Prompt-Driven Development)

Para garantir determinismo, modularidade e rastreabilidade no desenvolvimento orientado a prompts, a estrutura do repositório deve mimetizar o ciclo de vida do desenvolvimento de software (SDLC). 

```text
📂 promptops-repository/
├── 📄 README.md                        # Documentação global, guia de onboarding e convenções
├── 📂 .github/workflows/               # CI/CD para validação e testes automatizados de prompts
├── 📂 01-contexto-negocio/             # Alinhamento estratégico e escopo do produto
│   ├── 01-visao-produto.md            # Visão geral, objetivos de negócio e KPIs
│   ├── 02-requisitos-funcionais.md    # Matriz de rastreabilidade de requisitos e User Stories
│   └── 03-requisitos-nao-funcionais.md # SLAs, conformidade (LGPD/GDPR), segurança e performance
├── 📂 02-arquitetura-engenharia/       # Definição técnica estrutural
│   ├── 01-stack-tecnologica.md        # Definição estrita de linguagens, frameworks e bibliotecas
│   ├── 02-arquitetura-software.md     # Padrões de design (Clean Arch, DDD, Hexagonal, Serverless)
│   ├── 03-modelagem-dados.md          # Esquemas de banco de dados (DDL, ERD, NoSQL schemas)
│   └── 04-segurança-autenticacao.md   # RBAC, OAuth2, JWT, criptografia e vetores de ataque
├── 📂 03-prompts-geracao-codigo/       # Prompts executáveis (Templates reutilizáveis)
│   ├── 📂 backend/
│   │   ├── 01-bootstrap-projeto.md    # Inicialização do ecossistema e configurações base
│   │   ├── 02-camada-dados.md         # Repositories, ORM Mappings e conexões
│   │   ├── 03-regras-negocio.md       # Services, Use Cases e Domain Services
│   │   └── 04-camada-exposicao.md     # Controllers, Rotas REST/GraphQL e DTOs
│   ├── 📂 frontend/
│   │   ├── 01-design-system-tokens.md # Configurações de tema, Tailwind, estilos base
│   │   ├── 02-componentes-atomicos.md # UI components puros (Botões, Inputs, Modais)
│   │   └── 03-gerenciamento-estado.md # Hooks, Context, Redux/Zustand e integração com APIs
│   └── 📂 infraestrutura-devops/
│       ├── 01-conteinerizacao.md      # Dockerfile, Docker Compose multinível
│       └── 02-pipeline-cicd.md        # GitHub Actions, GitLab CI, Terraform IaC
├── 📂 04-prompts-validacao-testes/      # Garantia de qualidade (QA)
│   ├── 01-testes-unitarios.md         # Cobertura de testes de unidade (Jest, PyTest, JUnit)
│   ├── 02-testes-integracao.md        # Fluxos end-to-end e testes de API (Cypress, Playwright)
│   └── 03-auditoria-codigo.md         # Code review automático, análise estática (SonarQube)
└── 📂 .contexto-compartilhado/          # Memória persistente para injeção em sessões de IA
    ├── dump-arquitetura.json          # Snapshot consolidado do estado atual do sistema
    └── dicionario-dados.md            # Glossário de termos técnicos e domínios
```

---

## 2. Técnicas Avançadas de Engenharia de Prompts para Código

A geração de sistemas complexos falha quando prompts simples e ambíguos são utilizados. Para mitigar alucinações e garantir código pronto para produção, aplicamos quatro técnicas fundamentais:

### 2.1 Role-Play Baseado em Especialidades (Persona Prompting)
Instruir o LLM a agir não apenas como um "programador", mas como um especialista de nicho (ex: *Software Architect Sênior especialista em concorrência em Go* ou *DBA Sênior focado em otimização de queries PostgreSQL*). Isso força a ativação de pesos neurais específicos relacionados a padrões de alta performance.

### 2.2 Cadeia de Pensamento (Chain-of-Thought - CoT)
Obrigar o modelo a raciocinar sobre a arquitetura *antes* de cuspir o código. Ao separar o design lógico da escrita sintática do código, eliminam-se erros de acoplamento e lógica falha.

### 2.3 Prompting de Poucos Disparos (Few-Shot Prompting)
Fornecer exemplos exatos do padrão de design desejado (ex: fornecer um arquivo de Controller perfeitamente estruturado). O modelo usará este exemplo como um gabarito estrutural e sintático para gerar os demais arquivos.

### 2.4 Árvore de Pensamentos (Tree-of-Thoughts - ToT)
Utilizado para decisões arquiteturais complexas. Instancia múltiplos caminhos de solução virtuais, avalia os prós e contras de cada um e escolhe o ideal antes de prosseguir com a implementação.

---

## 3. Matrizes de Prompts Exaustivos (Templates Prontos para Produção)

### 3.1 Pasta `01-contexto-negocio/` -> Engenharia de Requisitos Detalhada

```markdown
# Padrão de Prompt: Engenharia de Requisitos Exaustiva
# Contexto de Uso: Executar no início do ciclo para extrair regras de negócio rígidas.

[PERSONA]
Atue como um Engenheiro de Requisitos Sênior e Analista de Negócios especializado em sistemas corporativos de alta escala. Seu objetivo é transformar uma ideia bruta de produto em especificações de engenharia de software determinísticas.

[CONTEXTO DO PROJETO]
- Nome do Sistema: [INSERIR NOME]
- Core Business: [INSERIR PROPÓSITO DO SISTEMA]
- Usuários Finais e Atores: [INSERIR PERFIS DE USUÁRIOS]
- Restrições Inegociáveis: [INSERIR EX: Orçamento de infra restrito, conformidade estrita com LGPD]

[TAREFA]
Gere uma Especificação de Requisitos de Software (SRS) ultra-detalhada estruturada estritamente nos seguintes tópicos:

1. MATRIZ DE REQUISITOS FUNCIONAIS (RF):
   - Mapeie cada RF usando o formato: RF001 - Nome do Requisito | Descrição Textual Curta | Ator Principal | Fluxo Principal (Passo a Passo) | Fluxo Alternativo/Exceção.
2. HISTÓRIAS DE USUÁRIO (USER STORIES) PADRÃO INVEST:
   - Forneça as Histórias de Usuário cruciais no formato: "Como [ator], eu quero [ação], para que [valor de negócio]".
   - Adicione Critérios de Aceitação estritos em formato Gherkin (Dado que... Quando... Então...) para cada uma.
3. MATRIZ DE REQUISITOS NÃO-FUNCIONAIS (RNF):
   - Especifique RNFs mensuráveis para: Segurança (autenticação, criptografia em repouso/trânsito), Performance (Tempo de resposta limite no percentil 95), Escalabilidade (Estratégia de particionamento/leitura), e Disponibilidade (Uptime alvo e estratégia de failover).

[REGRAS DE SAÍDA]
- Proíba respostas genéricas como "implementar segurança adequada". Defina explicitamente (ex: "Criptografia AES-256").
- Formate toda a saída em tabelas Markdown estruturadas para facilitar a legibilidade e varredura visual.
```

### 3.2 Pasta `02-arquitetura-engenharia/` -> Modelagem de Dados Relacional e Não-Relacional

```markdown
# Padrão de Prompt: Arquitetura de Dados Rígida
# Contexto de Uso: Alimentado com a saída do prompt de requisitos funcionais.

[PERSONA]
Você é um Administrador de Banco de Dados (DBA) Sênior e Arquiteto de Dados Principal. Você domina normalização de dados (1NF, 2NF, 3NF), indexação avançada, planos de execução de queries e estratégias de particionamento.

[INPUT DO SISTEMA]
[COLAR AQUI OS REQUISITOS FUNCIONAIS GERADOS NO PASSO ANTERIOR]

[ESPECIFICAÇÕES TÉCNICAS DO BANCO DE DADOS]
- SGBD Alvo: [EX: PostgreSQL 16 / MongoDB 7.0]
- Padrão de Nomenclatura: Snake_case, tabelas no plural, chaves primárias como `id` (UUIDv7).

[TAREFA]
Desenhe a arquitetura de dados completa para este sistema seguindo os passos:

1. ANÁLISE CONCEITUAL:
   - Identifique as entidades do domínio, seus relacionamentos (1:1, 1:N, N:M) e a justificativa para cada relacionamento.
2. DIAGRAMA ENTIDADE-RELACIONAMENTO (ERD) EM TEXTO:
   - Mapeie as tabelas usando notação textual limpa ou sintaxe Mermaid.js.
3. SCRIPT DDL DE PRODUÇÃO (SQL):
   - Forneça o script SQL de criação completo.
   - Todo ID de tabela deve ser `UUID` (preferencialmente UUIDv7 para performance de indexação).
   - Inclua chaves estrangeiras explicitamente com regras de deleção (`ON DELETE RESTRICT/CASCADE`).
   - Crie índices (`CREATE INDEX`) justificando quais colunas foram escolhidas baseado nas queries de leitura mais frequentes inferidas dos requisitos.
   - Adicione Constraints (`CHECK`, `UNIQUE`, `NOT NULL`) para garantir a integridade dos dados na camada do banco.
4. SCRIPT DE POPULAÇÃO INICIAL (SEED):
   - Forneça um script SQL com dados fictícios realistas e consistentes para testes, garantindo integridade referencial.

[DIRETRIZES DE QUALIDADE]
- Não utilize tipos genéricos como `VARCHAR(255)` indiscriminadamente; analise o tamanho real necessário para cada campo.
- Inclua colunas de auditoria em todas as tabelas: `created_at`, `updated_at`, `deleted_at` (soft delete).
```

### 3.3 Pasta `03-prompts-geracao-codigo/backend/` -> Camada de Domínio e Regras de Negócio

```markdown
# Padrão de Prompt: Geração de Código do Core Backend (Domain Driven Design)
# Contexto de Uso: Criar a lógica de negócios sem acoplamento com frameworks.

[PERSONA]
Você é um Engenheiro Backend Principal especialista em Arquitetura Limpa (Clean Architecture) e Domain-Driven Design (DDD). Você abomina acoplamento de código e preza por alta coesão, testabilidade e tipagem estrita.

[STACK E AMBIENTE]
- Linguagem/Framework: [EX: Node.js 22 com TypeScript 5.x / Python 3.12 com FastAPI]
- Banco de Dados/ORM: [EX: Prisma ORM / SQLAlchemy]
- Contexto de Negócio Atual: [EX: Módulo de Processamento de Pagamentos]

[ARQUITETURA DE ARQUIVOS ALVO]
Você deve gerar o código isolado para as seguintes camadas do domínio:
1. `domain/entities/`: Entidades ricas com validação de invariantes no construtor.
2. `domain/repositories/`: Interfaces/Contratos abstratos de acesso a dados.
3. `application/use-cases/`: Casos de uso puros (Lógica de negócio orquestradora).
4. `application/dtos/`: Objetos de transferência de dados de entrada e saída.

[TAREFA]
Escreva o código fonte completo de produção para o caso de uso: [EX: CriarPedido / EfetuarPagamento].

[REGRAS ESTRITAS DE IMPLEMENTAÇÃO]
1. ZERO DEPENDÊNCIAS DE FRAMEWORK NO DOMÍNIO: O código do domínio e casos de uso não deve importar Express, NestJS, FastAPI ou bibliotecas do ORM. Deve ser TypeScript/Python puro.
2. TRATAMENTO DE ERROS SEM EXCEÇÕES GLOBAIS: Utilize o padrão Either (Result/Failure) ou lance exceções de domínio altamente específicas herdadas de uma classe base `DomainError`. Nunca use `try/catch` genérico sem tipagem do erro.
3. VALIDAÇÃO DE ENTRADA RÍGIDA: Implemente validação dos dados de entrada do DTO utilizando regras explícitas de domínio ou tipos primitivos customizados (Value Objects).
4. CÓDIGO COMPLETO: Não abrevie o código, não coloque comentários como `// ... lógica aqui ...`. Escreva cada linha necessária para execução do arquivo.
```

### 3.4 Pasta `03-prompts-geracao-codigo/frontend/` -> UI Baseada em Componentes Atômicos

```markdown
# Padrão de Prompt: Engenharia de Frontend e Componentização Modular
# Contexto de Uso: Criar interfaces de usuário performáticas, acessíveis e componentizadas.

[PERSONA]
Você é um Engenheiro Frontend Sênior e Especialista em UI/UX Engineering. Você cria interfaces baseando-se em Componentização Atômica, Performance de Renderização (evitando re-renders desnecessários), Acessibilidade Estrita (WAI-ARIA) e Design Responsivo Fluido.

[STACK TECNOLÓGICA]
- Framework: [EX: React 19 com Next.js 15 (App Router)]
- Estilização: [EX: Tailwind CSS v4]
- Controle de Estado/Formulários: [EX: React Hook Form + Zod]

[COMPONENTE A SER CRIADO]
- Tela/Componente: [EX: Formulário de Checkout Multi-etapas com Resumo do Pedido]

[REQUISITOS DA INTERFACE]
1. DESIGN SYSTEM & ALINHAMENTO: Siga uma paleta de cores moderna (Slate/Indigo), suporte nativo a Dark Mode via classes Tailwind (`dark:`).
2. ACESSIBILIDADE (WCAG): Tags HTML semânticas (`<main>`, `<section>`, `<article>`, `<button>`), estados `:focus-visible` visíveis, atributos `aria-live` para atualizações dinâmicas, suporte completo a navegação por teclado.
3. ESTADO E VALIDAÇÃO: Validação em tempo de execução campo a campo com mensagens de erro claras abaixo de cada input. Bloqueio do botão de envio caso o formulário esteja inválido ou em estado de submissão (`isSubmitting`).
4. RESPONSIVIDADE EXTREMA: Abordagem estritamente Mobile-First (`w-full md:w-1/2 lg:w-1/3`).

[TAREFA]
Forneça a árvore de componentes completa necessária para esta UI, incluindo o código fonte integral dos arquivos tsx/jsx e hooks customizados se houver isolamento de estado/chamadas de API.
```

### 3.5 Pasta `04-prompts-validacao-testes/` -> Cobertura de Testes Unitários Rígidos

```markdown
# Padrão de Prompt: Fábrica de Testes Automatizados e Cobertura Rígida
# Contexto de Uso: Executado após a geração de qualquer arquivo de código backend ou frontend.

[PERSONA]
Você é um Engenheiro de Software em Teste (SDET) Sênior e Especialista em Automação de QA. Você segue estritamente a filosofia TDD (Test-Driven Development) e busca cobertura de código efetiva (não apenas linhas cobertas, mas caminhos de decisão cobertos - Branch Coverage).

[FRAMEWORK DE TESTE]
- Ferramenta: [EX: Jest com ts-jest / PyTest]
- Alvo do Teste: [EX: Arquivo do Caso de Uso de Pagamento gerado anteriormente]

[CÓDIGO FONTE ALVO]
[COLAR O CÓDIGO FONTE COMPLETO DO COMPONENTE OU CASO DE USO AQUI]

[TAREFA]
Escreva a suíte de testes unitários automatizados completa para o arquivo fornecido.

[DIRETRIZES DO ARQUIVO DE TESTE]
1. ISOLAMENTO TOTAL (MOCKING): Faça o mock de todas as dependências externas, bancos de dados, ORMs ou chamadas HTTP utilizando os recursos nativos do framework de testes. O teste deve rodar 100% em memória.
2. COBERTURA DE CENÁRIOS (HAPPY & UNHAPPY PATHS):
   - Mapeie o Caminho Feliz (Fluxo de sucesso com dados válidos).
   - Mapeie Múltiplos Caminhos de Exceção (Dados nulos, violação de regras de negócio, falha nas dependências simuladas/mocks lançando exceções).
3. ESTRUTURA DO TESTE (PADRÃO AAA): Organize cada bloco `it()` ou `test()` estritamente nas divisões: Arrange (Preparação), Act (Execução), Assert (Verificação).
4. ASSERTIVIDADE CLARA: Não use asserções genéricas. Verifique se funções específicas de mock foram chamadas com os parâmetros exatos esperados (`toHaveBeenCalledWith`).

Forneça o código do arquivo de teste completo, sem omissões.
```

---

## 4. Governança e Sincronização de Contexto (PromptOps)

O maior desafio no desenvolvimento de grandes sistemas com IA é a **perda de memória do contexto** devido aos limites da janela de contexto dos modelos. Para mitigar isso, adote o seguinte fluxo operacional:

1. **Injeção Prvia do Contexto**: Nunca envie um prompt de geração de código isolado. Sempre envie antes o arquivo da Stack Tecnológica e o Arquivo de Modelagem de Dados correspondente como contexto de background.
2. **Atualização do Snapshot do Sistema**: Sempre que a IA gerar uma alteração estrutural no código (ex: uma nova coluna na tabela ou uma nova rota da API), ordene que ela gere um JSON atualizado descrevendo o estado da aplicação. Armazene esse JSON na pasta `.contexto-compartilhado/dump-arquitetura.json`.
3. **Prompt de Sincronização de Contexto Recorrente**:
   ```markdown
   Analise o arquivo `.contexto-compartilhado/dump-arquitetura.json` em anexo. Ele representa o estado atual do sistema construído até agora. Com base nele, atualize sua memória operacional sobre as tabelas existentes, as rotas mapeadas e os componentes criados para garantir que o próximo bloco de código gerado seja 100% compatível e livre de quebras de contrato ou duplicidade.
   ```

Este ciclo operacional garante que múltiplos desenvolvedores (ou sessões diferentes de IA) possam trabalhar no mesmo sistema mantendo a consistência arquitetural impecável.