Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/agents/InviteAgentDialog.tsx`: o convite deixou de chamar a Edge `send-email` (relay de template, que só mandava um e-mail avulso) e passou a chamar `invite-user`, que é quem emite o convite do GoTrue — ou seja, o convidado recebe o caminho para definir a senha e entrar, sem depender de cadastro público. O corpo agora vai com `{ email, role }` (nada de `name`/`subject`/`html`, que o `bodySchema` estrito da Edge rejeita com 400).
- `src/components/agents/InviteAgentDialog.tsx`: cada falha da Edge virou frase em pt-BR por código/causa (`describeInviteError`, em `src/components/agents/inviteErrors.ts`, exportada para o teste): 401 sessão expirada, 429 excesso de tentativas, 403 com a explicação do servidor (inclusive "supervisor só convida atendente"), domínio não confiável, e-mail já cadastrado (a mensagem do GoTrue chega em inglês) e queda de rede. Antes o `catch` mostraria sempre o genérico "Erro ao enviar convite".
- `src/components/agents/inviteErrors.ts` (novo): `readInviteFailure` + `describeInviteError` vivem fora do componente porque o arquivo do diálogo só pode exportar componentes (regra `react-refresh/only-export-components` do lint do projeto — manter as funções lá dentro criaria ocorrência nova no ratchet).
- `src/components/agents/InviteAgentDialog.tsx`: o campo "Nome" saiu — a Edge `invite-user` não aceita `name` (schema estrito) e o convite do GoTrue não usa nome; mantê-lo só criaria um campo que não faz nada. O seletor "Cargo" só aparece para `admin`; para supervisor o diálogo mostra "Atendente" fixo, porque a Edge recusa outro papel.
- `src/components/agents/AgentsView.tsx`: o campo "Buscar atendentes" ganhou `aria-label` (antes só tinha placeholder, sem nome acessível).
- Testes: `src/components/agents/__tests__/InviteAgentDialog.test.tsx` (reescrito para o novo contrato), mais o mock do hook de papel nos outros três testes de `AgentsView` (`AgentsView.actions/capacidade/pendencias.test.tsx`), que montam a tela real e por isso compõem o diálogo.

## Prova
- vermelho antes (mesmo arquivo de teste, com o componente na versão anterior do HEAD): `npx vitest run src/components/agents/__tests__/InviteAgentDialog.test.tsx` → `Tests 1 failed | ...` com `AssertionError: expected 'send-email' to be 'invite-user'` e mais 7 falhas de mensagem por código (`8 failed`).
- verde depois: `npx vitest run src/components/agents/__tests__/` → `Test Files 4 passed (4); Tests 25 passed (25)`.
- o teste renderiza o componente REAL e dispara o clique em "Enviar Convite", conferindo a função chamada e o corpo exato do convite; as mensagens de erro são provadas com `context.status` + `context.json()` reais da Edge.

## Arquivos fora da lista 'ARQUIVOS QUE PODE TOCAR' — por que são indispensáveis
- `supabase/functions/invite-user/index.ts`, `supabase/functions/invite-user/index.test.ts`, `supabase/config.toml`: são a faixa do cartão pai (t_6f48e99d), que o cartão manda trazer por `cherry-pick` quando ainda não estiver integrada. São indispensáveis porque a tarefa é justamente apontar o diálogo para essa Edge: sem eles o diálogo chamaria uma função inexistente no workspace. Não foram escritos nem editados por mim (vêm dos commits bdd3fb256/576e3716f do cartão pai).
- `src/components/agents/inviteErrors.ts` (arquivo novo, dentro do módulo do cartão): indispensável porque as duas funções usadas pelo diálogo não podem ser exportadas de um arquivo de componente — a regra `react-refresh/only-export-components` criaria ocorrência nova no ratchet de lint (eu tentei: o lint barrou com `2 ocorrência(s) nova(s)`). Além disso o teste precisa da `describeInviteError` exportada. Extrair para um arquivo do próprio módulo foi a menor mudança que mantém o lint verde; a alternativa (deixar as funções dentro do diálogo) é o que o lint reprova.

## Faixa trazida do cartão pai (t_6f48e99d), por `cherry-pick` como o cartão manda
- `supabase/functions/invite-user/index.ts`, `supabase/functions/invite-user/index.test.ts` e `supabase/config.toml`: a Edge `invite-user` e o registro dela na configuração do Supabase — o convite que o diálogo passou a chamar. Código do worker (edge); eu só o trouxe, não o alterei (vêm dos commits bdd3fb256/576e3716f do cartão pai via `cherry-pick`).

## O que NÃO fiz e por quê
- Não mexi em `src/pages/Auth.tsx` (aba "Criar Conta"): o cartão lista em ARQUIVOS QUE PODE TOCAR só os dois componentes de `agents/` e os testes, e a remoção da aba é o cartão SG1 — fora do meu escopo por instrução do próprio cartão.
- Não mexi na Edge `invite-user` (código do worker (edge)): a faixa do cartão pai (t_6f48e99d) foi trazida por `cherry-pick` conforme o cartão manda. Ela ainda não tem a regra de domínio (apontada pelo revisor no cartão pai), mas a tela já mapeia essa causa pela mensagem que a Edge devolver; a regra em si é do worker (edge).
