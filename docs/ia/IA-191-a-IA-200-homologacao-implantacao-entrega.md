# Bloco 20 do Plano IA 200 Etapas — estado REAL das etapas IA-191 a IA-200

> Fonte: [`docs/audits/PLANO_IA_200_ETAPAS_2026-09-29.md`](../audits/PLANO_IA_200_ETAPAS_2026-09-29.md)
> §"Bloco 20 — Homologação, implantação controlada e entrega (191–200)".
> Item do inventário: `docs/audits/INVENTARIO_MELHORIAS_2026-10-07.tsv` linha `Bloco 20 (191-200)`
> (`Outros/IA`, `NAO_IMPLEMENTADA`, P3, esforço G, evidência: "sem entrega das etapas 191-200").
> Cartão: `SL-219`.
>
> **Ponta medida:** branch `dia/2026-10-08`, commit `210c3e7c1`.
> **O que este documento é:** a revisão de evidência que o próprio bloco exige —
> *"Checkpoint do bloco: evidências dos dez critérios de aceite revisadas; itens não comprovados
> permanecem pendentes."* Cada etapa recebe um estado medido no código de hoje, com o caminho da
> prova ou a razão declarada de não existir.
> **O que este documento NÃO é:** implementação do bloco. O Bloco 20 é **operacional**: o plano o
> marca como `P1 — somente após autorização específica` e a etapa IA-200 exige aceite técnico e de
> negócio, com *"produção exige autorização expressa"*. Executá-lo significa homologar, disparar
> integrações reais e operar produção — nada disso cabe nas regras deste cartão (`sem DDL / Edge
> Function / migration`, sem deploy, sem produção) nem no nível `worker`. A execução é trabalho de
> trilha própria, sob autorização do dono. O contrário também não vale: nenhuma etapa entra aqui
> como entregue por intenção, projeto ou pela existência de infraestrutura vizinha.

## Vocabulário de estado

- **IMPLEMENTADA** — o critério de aceite da etapa está atendido no código de hoje, com prova.
- **PARCIAL** — existe uma parte real e verificável no repositório, mas o critério de aceite
  **não** está fechado.
- **NÃO IMPLEMENTADA** — não há caminho no repositório que atenda o critério, ou o critério depende
  de execução em ambiente autorizado que não foi feita.

## Índice por etapa

| Etapa | Estado |
|---|---|
| IA-191 — Confirmar topologia e disponibilidade reais | PARCIAL |
| IA-192 — Homologar migrations e compatibilidade | PARCIAL |
| IA-193 — Testar integrações reais com escopo mínimo | NÃO IMPLEMENTADA |
| IA-194 — Observar antes de automatizar | NÃO IMPLEMENTADA |
| IA-195 — Conduzir piloto por capacidade | NÃO IMPLEMENTADA |
| IA-196 — Expandir por coortes e flags | PARCIAL |
| IA-197 — Ensaiar rollback operacional | PARCIAL |
| IA-198 — Atualizar documentação e operação | PARCIAL |
| IA-199 — Consolidar evidências de entrega | PARCIAL |
| IA-200 — Encerrar por capacidade comprovada | NÃO IMPLEMENTADA |

## Estado por etapa

- **IA-191 — Confirmar topologia e disponibilidade reais — PARCIAL.** O critério proíbe **presumir**
  que Vercel, Supabase Cloud ou VPS rodam a mesma versão só porque o repositório diz. Existe
  mecanismo real que recusa essa presunção: o `supabase/config.toml` é a fonte de verdade do
  `verify_jwt`, e o deploy controlado em `.github/workflows/deploy-functions.yml` coleta um
  inventário remoto e exige **igualdade exata** entre o conjunto de funções local e remoto e entre
  o `verify_jwt` de cada uma, além de digests SHA-256 por arquivo. A topologia viva está declarada
  em `docs/architecture/edge-functions.md` e em `docs/runbooks/slo.md`, que lista onde cada
  componente roda e qual sinal de disponibilidade existe (`/version.json` na Vercel, `DB Live Guard`
  e `db_health` no banco, logs por função e `edge_rate_limits` nas edges, `connection_health_logs`
  no canal). **O que falta:** a certificação em si é produzida **rodando** o workflow contra os
  ambientes reais — é operação, não artefato de repositório —, então a disponibilidade ao vivo não
  foi confirmada por este cartão.

- **IA-192 — Homologar migrations e compatibilidade — PARCIAL.** O critério pede aplicar a mudança
  primeiro em ambiente autorizado, validar backfill, clientes antigos, permissões e recuperação, com
  ensaio que preserve dados e mantenha rollback ou avanço corretivo documentado. O **ensaio existe**:
  `.github/workflows/db-migrate.yml` exige `dry-run` antes de aplicar, publica apenas hashes
  estruturais e só aplica contra a confirmação do hash integral, fechando a janela TOCTOU; o
  contrato genérico do runtime prova que o schema `public` não mudou entre o dry-run e o apply. A
  **estratégia de rollback** está documentada em `docs/runbooks/deploy.md` §1.4 (não há DOWN scripts;
  a reversão é DDL de emergência seguida de migration retroativa, para manter a paridade
  arquivos↔ledger). **O que falta:** o ensaio autorizado em homologação, com dados, não foi
  executado aqui.

- **IA-193 — Testar integrações reais com escopo mínimo — NÃO IMPLEMENTADA.** O critério exige, após
  autorização, contas de teste, tetos de custo e destinatários controlados para provar provedor,
  armazenamento, canal e confirmação de entrega. Não há no repositório nenhum caminho que faça isso:
  as suítes dos blocos 04/05 provam o **despacho** com provedor falso e valores sintéticos
  justamente porque o disparo real depende de autorização e custo. Sem execução, a etapa não tem
  como ser marcada.

- **IA-194 — Observar antes de automatizar — NÃO IMPLEMENTADA.** O critério pede ativar o
  processamento de avaliação **sem envio nem alteração operacional**, comparando decisões, consumo e
  alertas com o atendimento humano. Não existe modo de observação/sombra em `src/` nem em
  `supabase/functions/`. O mais próximo é um **projeto**, não runtime: `docs/ia/IA-010-ambiente-de-ensaio.md`
  especifica dados sintéticos e perfis de ensaio e declara que o provisionamento **não** foi
  executado (escrita no banco canônico). Projeto não é modo de observação.

- **IA-195 — Conduzir piloto por capacidade — NÃO IMPLEMENTADA.** O critério pede liberar a um grupo
  autorizado, com treinamento, orçamento e acompanhamento de qualidade, sem habilitar a suíte
  inteira. Existe disciplina **vizinha**, mas de outra capacidade: o rollout do CRM em
  `docs/runbooks/CRM_INTEGRATION_ROLLOUT.md` é faseado, manual-primeiro e gateado por flag
  (`CRM_SYNC_WORKER_ENABLED` inerte até ser exatamente `true`; primeiro processamento manual e
  limitado a um item). Isso **não** é o piloto da suíte de IA, que não tem grupo, orçamento nem
  acompanhamento de qualidade medidos.

- **IA-196 — Expandir por coortes e flags — PARCIAL.** O critério pede rollout gradual por equipe,
  conexão e recurso, com pausa automática e aprovação para ampliar. A **metade das flags existe**:
  a tabela e a migration `supabase/migrations/20260905060000_feature_flags.sql`, os hooks de leitura
  no cliente `src/hooks/system/useFeatureFlag.ts` e `src/hooks/contacts/useContactsV2Flags.ts`, e a
  leitura no servidor em `supabase/functions/crm-integration/index.ts`. **O que falta:** a política
  de coorte — alvo por equipe/conexão/recurso, critério automático de pausa e aprovação de
  ampliação. Ter a flag é o insumo do rollout, não o rollout.

- **IA-197 — Ensaiar rollback operacional — PARCIAL.** O critério pede reverter provedor, versão e
  flags em ambiente controlado, preservando compatibilidade de dados e reconciliando trabalho em
  andamento, sem perder mensagens, aprovações, análises ou registros de consumo. Os **caminhos de
  reversão existem e estão documentados**: rollback de frontend por *Instant Rollback* e de edges
  pelo `source_ref` (SHA/tag anterior) com `dry_run`, ambos em `docs/runbooks/deploy.md` e no
  workflow de deploy; o registro de deploy `scripts/edge-deploy/deployment-record.mjs` **prende** o
  SHA publicado (não a branch que anda), que é o que torna o rollback rastreável; a estratégia de
  rollback de banco está em `docs/runbooks/deploy.md` §1.4 e a do CRM (desabilitar trigger, nunca
  apagar fila) em `docs/runbooks/CRM_INTEGRATION_ROLLOUT.md`. **O que falta:** o **ensaio** em
  ambiente controlado, com trabalho em andamento para reconciliar, não foi executado.

- **IA-198 — Atualizar documentação e operação — PARCIAL.** O critério pede corrigir exemplos
  desatualizados de autenticação e deploy e registrar contratos, limites, fontes, permissões,
  incidentes e dependências externas sem segredos. A documentação operacional **existe, é versionada
  e está viva**: `docs/runbooks/deploy.md` (atualizado em 03/09/2026, fluxo GitHub-first),
  `docs/runbooks/slo.md` (medido vs. alvo, com origem do número), `docs/runbooks/CRM_INTEGRATION_ROLLOUT.md`
  (contrato operacional com invariantes de credencial e ordem obrigatória) e `docs/architecture/edge-functions.md`.
  **O que falta:** a consolidação que o critério pede para **a camada de IA** — contratos, limites,
  fontes, permissões, incidentes e dependências externas num único lugar corrigido — não foi
  entregue como artefato do bloco.

- **IA-199 — Consolidar evidências de entrega — PARCIAL.** O critério pede vincular cada etapa a PR,
  commit, teste, ambiente, evidência, migration quando aplicável e resultado, registrando itens
  bloqueados ou substituídos. O **padrão existe e é usado**: `docs/ia/README.md` indexa a entrega por
  bloco com números de PR, commits e o **teste que prova** cada correção (blocos 01–05), e este
  documento aplica o mesmo padrão ao Bloco 20; os deploys de edge guardam atestação e evidência de
  smoke como artefato. **O que falta:** não há um ledger único de entrega ligando etapa→PR→commit→teste→ambiente→resultado
  para todo o plano, e os blocos 06–19 ainda não têm documento de estado por bloco.

- **IA-200 — Encerrar por capacidade comprovada — NÃO IMPLEMENTADA.** O critério pede aceite técnico
  e de negócio, com registro do que foi liberado, restrito ou adiado, mantendo pendências com
  responsável, e **produção exige autorização expressa**. Não existe registro de aceite no
  repositório, e o próprio plano diz que a entrega final "não presume autorização a partir deste
  documento". Sem aceite e sem autorização, a etapa permanece aberta.

## Consequência para o plano

O Bloco 20 permanece **pendente como operação**, e não como código a escrever. Há infraestrutura
**real** de implantação controlada no repositório — deploy de edges com igualdade local/remoto,
migrations com dry-run obrigatório, flags e runbooks de rollback — e é isso que as seis etapas
`PARCIAL` registram; o que **não** existe é a execução da homologação da suíte de IA (IA-193,
IA-194, IA-195) nem o aceite final (IA-200). Fechar o bloco é **executar sob autorização**: aplicar
em homologação, disparar integrações reais com escopo mínimo, observar sem enviar, pilotar por
capacidade e encerrar com aceite — cada passo com registro próprio. Nada disso é presumido a partir
deste documento.
