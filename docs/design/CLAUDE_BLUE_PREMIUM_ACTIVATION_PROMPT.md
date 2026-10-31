# CLAUDE — PROMPT DE ATIVAÇÃO DO BLUE PREMIUM DESIGN SYSTEM

Você está trabalhando no repositório:

`adm01-debug/Promo_Gifts_V4`

Leia integralmente e considere obrigatório:

`PROMO_GIFTS_V4_BLUE_PREMIUM_DESIGN_SYSTEM.md`

## Regras de execução

A screenshot existente explica a funcionalidade atual.

A screenshot de redesign aprovada define a intenção visual.

O código define o comportamento real.

O Design System define consistência de implementação.

### Antes de editar

Faça um RECON da tela:

1. rota;
2. componente principal;
3. subcomponentes;
4. hooks;
5. serviços;
6. dados;
7. testes;
8. design tokens;
9. responsividade;
10. funcionalidades que não podem sofrer regressão.

Retorne brevemente:

- arquivos que pretende alterar;
- componentes que serão reutilizados;
- funcionalidades protegidas;
- riscos.

### Durante a implementação

- use Blue Premium;
- use `brand-primary` e tokens semânticos sempre que possível;
- não espalhe hexadecimais em JSX;
- preserve dados reais;
- preserve regras de negócio;
- não crie dependência nova sem necessidade;
- não reescreva componente funcionalmente saudável só para aproximar screenshot;
- não altere banco/schema/RLS/migrations/auth/APIs/integrações em uma tarefa visual;
- implemente responsividade;
- preserve acessibilidade.

### Qualidade visual

A implementação deve possuir:

- background azul-preto profundo;
- superfícies em camadas discretas;
- bordas finas;
- azul vivo somente para intenção/estado;
- pouco glow;
- radius moderado;
- cards compactos;
- excelente uso de Full HD;
- toolbars densas;
- ações destrutivas contextuais;
- hierarquia clara;
- tipografia limpa;
- microinterações rápidas.

### QA obrigatório

Compare:

1. ORIGINAL
2. REDESIGN APROVADO
3. IMPLEMENTAÇÃO

Teste no mínimo:

- 1920×1080
- 1600×900
- 1440×900
- 1366×768
- 1024
- mobile

Execute os gates adequados do projeto:

- typecheck;
- lint;
- testes focados;
- build.

Ao final, informe:

- arquivos alterados;
- resumo visual;
- funcionalidades preservadas;
- testes executados;
- divergências restantes;
- confirmação explícita de que nenhuma camada proibida foi alterada.
