Especialista: Íris (area-front-componentes)

## O que mudou e por quê
- `src/components/agents/InviteAgentDialog.tsx`: o convite deixou de chamar a Edge `send-email` (relay de template, que só mandava um e-mail avulso) e passou a chamar `invite-user`, que é quem emite o convite do GoTrue — ou seja, o convidado recebe o caminho para definir a senha e entrar, sem depender de cadastro público. O corpo agora vai com `{ email, role }` (nada de `name`/`subject`/`html`, que o `bodySchema` estrito da Edge rejeita com 400).
- `src/components/agents/InviteAgentDialog.tsx`: cada falha da Edge virou frase em pt-BR por código/causa (`describeInviteError`, exportada para o teste): 401 sessão expirada, 429 excesso de tentativas, 403 com a explicação do servidor (inclusive "supervisor só convida atendente"), domínio não confiável, e-mail já cadastrado (a mensagem do GoTrue chega em inglês) e queda de rede. Antes o `catch` mostraria sempre o genérico "Erro ao enviar convite".
- `src/components/agents/InviteAgentDialog.tsx`: o campo "Nome" saiu — a Edge `invite-user` não aceita `name` (schema estrito) e o convite do GoTrue não usa nome; mantê-lo só criaria um campo que não faz nada. O seletor "Cargo" só aparece para `admin`; para supervisor o diálogo mostra "Atendente" fixo, porque a Edge recusa outro papel.
- `src/components/agents/AgentsView.tsx`: o campo "Buscar atendentes" ganhou `aria-label` (antes só tinha placeholder, sem nome acessível).
- Testes: `src/components/agents/__tests__/InviteAgentDialog.test.tsx` (reescrito para o novo contrato), mais o mock do hook de papel nos outros três testes de `AgentsView` (`AgentsView.actions/capacidade/pendencias.test.tsx`), que montam a tela real e por isso compõem o diálogo.

## Prova
- vermelho antes (mesmo arquivo de teste, com o componente na versão anterior do HEAD): `npx vitest run src/components/agents/__tests__/InviteAgentDialog.test.tsx` → `Tests 1 failed | ...` com `AssertionError: expected 'send-email' to be 'invite-user'` e mais 7 falhas de mensagem por código (`8 failed`).
- verde depois: `npx vitest run src/components/agents/__tests__/` → `Test Files 4 passed (4); Tests 25 passed (25)`.
- o teste renderiza o componente REAL e dispara o clique em "Enviar Convite", conferindo a função chamada e o corpo exato do convite; as mensagens de erro são provadas com `context.status` + `context.json()` reais da Edge.

## O que NÃO fiz e por quê
- Não mexi em `src/pages/Auth.tsx` (aba "Criar Conta"): o cartão lista em ARQUIVOS QUE PODE TOCAR só os dois componentes de `agents/` e os testes, e a remoção da aba é o cartão SG1 — fora do meu escopo por instrução do próprio cartão.
- Não mexi na Edge `invite-user` (código do worker (edge)): a faixa do cartão pai (t_6f48e99d) foi trazida por `cherry-pick` conforme o cartão manda. Ela ainda não tem a regra de domínio (apontada pelo revisor no cartão pai), mas a tela já mapeia essa causa pela mensagem que a Edge devolver; a regra em si é do worker (edge).
