# Análise dos 15 agentes da fábrica na VPS Hostinger (08/10/2026)

Sistema-alvo: Promo_Gifts_V4. VPS: srv1481814. Hermes v2026.9.24 fixado. Dados medidos na VPS e comparados com a fábrica local (perfis do Zapp).

## Veredito geral

| Item | Situação na VPS | Situação na fábrica local | Conclusão |
|---|---|---|---|
| SOUL.md | idêntico nos 16 perfis: 668 bytes, texto genérico "You are Hermes Agent" | 12 a 19 KB por perfil, escritos para cada papel | **Reprovado: nenhum agente tem identidade nem regras próprias** |
| Skills | 58 skills padrão em todos (Apple Notes, música, YouTube, planilhas, arXiv...) e **0** de engenharia da fábrica | 11 a 22 skills curadas por perfil | **Reprovado: skills sem relação com o trabalho, só gastam contexto** |
| Modelos | corretos: 7 Flash, 5 Sonnet, 3 Opus | — | Aprovado, testado com chamada real |
| Portão | funciona: reprova client.ts, aprova mudança válida | — | Aprovado, com 4 lacunas (abaixo) |

**Os SOULs locais não podem ser copiados.** Eles citam ferramentas e pessoas que não existem na VPS: `hermes-tarefa-iniciar`, `hermes-tarefa-fechar`, `zapp-verify`, o Jev, o banco do Zapp, o quadro `zapp-web-v2`, GPT e Devin, a regra "tudo é local, ninguém faz push". Precisam ser **reescritos** para o Promo_Gifts_V4, o portão `gate.py`, o integrador que faz push de `v2/*`, e os modelos DeepSeek/Sonnet/Opus. O que dá para aproveitar são as skills genéricas e o formato dos SOULs.

## Análise por agente

Legenda de nota (prontidão hoje): 1 = não presta, 5 = pronto.

| # | Agente | Modelo | Papel no Promo_Gifts_V4 | Modelo adequado? | SOUL | Skills | Nota | Principal problema e ajuste |
|---|---|---|---|---|---|---|---|---|
| 1 | worker | Flash | caixa de entrada: docs, 1 a 3 arquivos, sem área | sim | genérico | 58 irrelevantes | 2 | Sem regra de "não tentar cartão de área"; local tinha 31% de aproveitamento por isso. SOUL deve mandar bloquear e indicar o perfil |
| 2 | iris | Flash | telas e componentes (`src/components`, `pages`) | sim para ajuste pequeno | genérico | falta `design-system-zapp` equivalente | 2 | Skill de design do Zapp não serve. Criar uma do Promo_Gifts_V4 a partir de `docs/ACCESSIBILITY.md` e do padrão de componentes do repo |
| 3 | hugo | Flash | hooks, estado, serviços | sim | genérico | 58 irrelevantes | 2 | **Falha de roteamento:** `src/stores`, `logic`, `utils`, `routes`, `config`, `constants` não casam em nenhuma regra e caem no worker. Corrigir o manifesto |
| 4 | edgar | Flash | 113 Edge Functions (Deno) | **duvidoso** | genérico | falta skill de edge | 2 | O portão não tipa nem testa Deno. Flash em função de servidor sem verificação é risco. Adicionar `check:edge-zod-ratchet` e `check:contract-coverage` ao portão, ou subir para Sonnet |
| 5 | vera | Flash | CI, guardas, ratchets | sim | genérico | falta skill de CI | 1 | **Conflito de escopo:** workflows e baselines estão proibidos no manifesto, então a Vera não tem onde trabalhar. Desativar até haver cartão de `scripts/` |
| 6 | workertestes | Flash | testes do produto | sim | genérico | falta TDD e prova | 2 | **Risco de afrouxar teste** para passar. O portão deve reprovar `.skip`, `xit`, `test.todo`, `@ts-ignore` e `as any` novos |
| 7 | workermensageria | Flash | WhatsApp (38 ocorrências no repo) | sim | genérico | falta skill | 1 | O SOUL local fala de Talk X e Multiplix, que são do Zapp. Volume provavelmente baixo. Manter desligado até haver backlog |
| 8 | complexo | Sonnet | cartão grande ou que cruza camadas | sim | genérico | amplo, falta curadoria | 3 | Bom encaixe. Falta regra de escalonamento e de quando devolver ao coordenador |
| 9 | designer | Sonnet | visual e acessibilidade | sim | genérico | falta direção visual | 3 | Skill do Zapp não serve. Mesmo ajuste da Íris |
| 10 | workersql | Sonnet | banco, RLS, RPC | sim | genérico | falta skills de Postgres/RLS | 2 | **Conflito:** `supabase/migrations` é proibido (REGRA #1 e #8 do CLAUDE.md: schema só com aprovação do dono). Ele deve produzir **proposta** em comentário do cartão, não migration |
| 11 | workerauth | Sonnet | login, permissões, segurança | sim | genérico | falta skill de auth | 3 | Funciona em `src` e em Edge. Mesma restrição de migrations |
| 12 | workeria | Sonnet | camada de IA (prompts de mockup, uso de modelo) | sim | genérico | falta skill de IA | 3 | Volume baixo. Sonnet em cartão pequeno pode custar mais que o necessário. Avaliar Flash |
| 13 | coordenador | Opus | quebrar cartões | sim | genérico | falta `escrever-cartao` | 2 | Precisa seguir o formato do `abrir_cartao.py` (idempotência, regras do projeto) e **nunca executar código de produto**. Hoje não há fonte de backlog: sem ela ele não tem o que quebrar |
| 14 | senior | Opus | refazer o que foi recusado | sim | genérico | falta skills de refazer | 2 | Precisa de `refazer-sem-diff-alheio` e `receber-revisao-de-codigo`. Só entra na 3ª escada |
| 15 | revisor | Opus | julgar o diff | sim | genérico | falta critérios | 2 | Deve ter ferramentas só de leitura, saída em JSON de veredito e **nunca revisar o que o próprio perfil escreveu** (o senior é revisado pelo Sonnet) |

Média de prontidão: **2,1 de 5.** O motor está certo (modelos, portão, acesso), mas **os agentes ainda não sabem trabalhar**.

## Lacunas do portão encontradas no teste

1. **Lentidão:** a etapa de testes relacionados levou 253 s para um arquivo só. O portão inteiro levou uns 335 s. Com 2 agentes é aceitável. Limitar a testes do arquivo e usar `--bail` deve cortar bastante.
2. **Edge Functions sem verificação** (item do Edgar).
3. **Sem regra anti-afrouxamento de teste** (item do workertestes).
4. **Roteamento incompleto** para `stores`, `logic`, `utils`, `routes`, `config`.

## Correção proposta (nesta ordem)

1. Escrever 15 SOULs novos, no formato dos locais, adaptados ao Promo_Gifts_V4.
2. Remover as 58 skills padrão de cada perfil e instalar as skills certas. Genéricas reaproveitáveis da fábrica local: autorrevisao-antes-de-fechar, verificar-antes-de-declarar-pronto, test-driven-development, systematic-debugging, cacar-falha-silenciosa, analisar-prova-dos-testes, receber-revisao-de-codigo, refazer-sem-diff-alheio, decidir-refazer, rollback-de-verdade e as de Postgres/RLS. Criar novas: design do Promo_Gifts_V4, edge do Promo_Gifts_V4, e regras do repo (REGRA #1 a #8).
3. Corrigir o manifesto (roteamento) e o portão (as 4 lacunas).
4. Desativar vera e workermensageria por enquanto. Reposicionar workersql em "proposta".
5. Só depois ligar o gateway e rodar o primeiro cartão.

---

## Atualização 12:15 — correção aplicada (ordem do Joaquim: adaptar, não excluir)

Nenhum agente foi desativado. Tudo da seção "Correção proposta" foi executado, com estes reposicionamentos:
- **vera**: guardiã de `scripts/` e `tests/scripts/` (os check-*.mjs). Workflows e baselines continuam proibidos: ela escreve a proposta pronta e bloqueia com needs-human.
- **workermensageria**: integrações reais do repo (WhatsApp, Bitrix, e-mail), sem nunca disparar mensagem de verdade.
- **workersql**: modo proposta — migration completa com rollback em comentário do cartão; o Joaquim aplica.
Entregues: 15 SOULs novos, 19 skills portadas (sem nenhuma referência ao Zapp), skills padrão removidas, portão v2 (anti-afrouxamento de teste, verificação de Edge, vitest --bail, roteamento corrigido). Prontidão revisada: ~4 de 5 — falta o integrador e a prova de fogo do 1º cartão.

---

# Revisão exaustiva v2 — configuração final por agente (08/10, tarde)

SOULs reescritos do zero (6,4–7,6 KB cada) com o mapa REAL do repo (fatos conferidos: 60+ pastas de componentes, kit em `components/ui`, stores zustand, `_shared` das 113 Edge Functions, 101 scripts `check-*`, ~40 pastas de testes, docs/ADRs). Cada SOUL tem: papel, mapa da área, regras de trabalho e a seção "Minhas skills — abro na hora certa" com o gatilho de cada skill.

**11 skills novas criadas** (ancoradas só em fatos verificados no repo):
`regras-do-repo-promo-gifts` (as 8 regras do CLAUDE.md + o que o portão reprova) · `area-promo-componentes` · `area-promo-hooks-dados` · `area-promo-edge` · `area-promo-scripts-verificacao` · `area-promo-testes` · `area-promo-mensageria-integracoes` · `area-promo-banco` (com o FORMATO obrigatório da proposta de migration) · `area-promo-ia` · `revisar-entrega` (ritual + formato do veredito) · `decompor-cartao-grande`.

**Base de 7 skills** de método em toda executora: regras-do-repo, TDD, systematic-debugging, caçar-falha-silenciosa, autorrevisão, analisar-prova, verificar-antes-de-declarar-pronto.

| Agente | Modelo | Skills (total) | Além da base |
|---|---|---|---|
| worker | Flash | 7 | só a base — tabela de roteamento no SOUL o impede de pegar cartão de área |
| iris | Flash | 9 | area-promo-componentes, revisao-de-interface-web |
| hugo | Flash | 8 | area-promo-hooks-dados |
| edgar | Flash | 8 | area-promo-edge |
| vera | Flash | 8 | area-promo-scripts-verificacao |
| workertestes | Flash | 8 | area-promo-testes |
| workermensageria | Flash | 8 | area-promo-mensageria-integracoes |
| complexo | Sonnet | 12 | receber-revisao, decompor-cartao-grande + as 3 áreas que mais se cruzam |
| designer | Sonnet | 10 | area-promo-componentes, revisao-de-interface-web, direcao-visual-tela-nova |
| workersql | Sonnet | 15 | area-promo-banco + 7 de Postgres/RLS/migration/rollback |
| workerauth | Sonnet | 12 | area-promo-banco, area-promo-edge + 3 de RLS/função segura |
| workeria | Sonnet | 9 | area-promo-ia, area-promo-edge |
| coordenador | Opus | 4 | SÓ regras, escrever-cartao, decompor, decidir-refazer (não executa código) |
| senior | Opus | 11 | receber-revisao, refazer-sem-diff-alheio, rollback, area-promo-banco |
| revisor | Opus | 4 | SÓ revisar-entrega, regras, analisar-prova, caçar-falha (só leitura, nunca edita) |

Podas feitas na revisão: revisor perdeu `receber-revisao-de-codigo` (é skill de autor, não de juiz) e ganhou `revisar-entrega`; coordenador e revisor não carregam skills de execução (TDD/debug) — não codam; `verificar-antes-de-declarar-pronto` perdeu a última menção ao Devin. Zero contaminação do Zapp nas 30 skills (única menção restante é histórica e intencional, no núcleo dos SOULs). Hermes confirma tudo "enabled" (4–15 por perfil). Instalação com `chown 10000:10000`.
