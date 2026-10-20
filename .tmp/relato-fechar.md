Especialista: iris
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 23s;OK lint 3s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (15/10 16:19, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/calls/IncomingCallAlert.tsx         |  29 ++++-
 .../__tests__/IncomingCallAlert.foto.test.tsx      | 143 +++++++++++++++++++++
 src/hooks/calls/useFotoDoContato.ts                |  68 ++++++++++
 3 files changed, 237 insertions(+), 3 deletions(-)
```
- Testes alterados neste cartão (1 arquivo[s]) rodados AGORA no seu commit: Test Files 1 passed (1);Tests 3 passed (3)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: juiz indisponível (não bloqueou)
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — relato = concluiu_com_ressalva; Jev inseguro sobre o relato; relato sem evidência limpa de verificação


Entreguei a foto do contato no alerta de chamada recebida (paridade com a V3), com iniciais quando não há foto e quando a imagem falha. O cartão compila e passa sozinho: `zapp-verify . --rapido` → `VERIFY: VERDE SEM BANCO (178s)` (OK db_guard, tipos, lint, migrations).

## O que mudou e por quê
- `src/hooks/calls/useFotoDoContato.ts` (novo): lê `contacts.avatar_url` do contato da chamada sob a RLS do agente e devolve `null` em qualquer falha (sem `contact_id`, sem linha, erro de rede/cliente). É best-effort `try/catch`: buscar a foto nunca derruba nem suja o alerta da chamada. O valor resolvido fica ancorado no `id` do contato que o pediu, então a próxima ligação não herda a foto da anterior (sem `setState` síncrono em efeito, que o lint do projeto reprova).
- `src/components/calls/IncomingCallAlert.tsx`: o bloco do avatar passa a mostrar a foto (`<img>` decorativa, `alt=""`, `data-testid="foto-do-contato"`, `object-cover` dentro do `Avatar`) e cai nas iniciais de `getInitials` quando não há foto OU quando a imagem não carrega (`onError` marca a identidade da chamada em cena e o quadrado vira iniciais, em vez de ficar vazio).
- `src/components/calls/__tests__/IncomingCallAlert.foto.test.tsx` (novo): 3 casos — com foto (src exibido e iniciais ausentes), sem foto (iniciais) e imagem quebrada (`fireEvent.error` → iniciais e o `<img>` sai da tela). Renderiza o `IncomingCallAlert` REAL; só a fronteira de dados é dublada (listener da notificação e client do Supabase). Nada de rede: o transporte realtime é dublado, como o cartão manda.

Sem migration, sem Edge Function, sem dependência nova, sem tocar canal/SIP real. Nenhum dado de terceiro em log (só o `id` interno do contato) e nada de novo exportado/baixado. A foto é a que a RLS já entrega ao agente: mesmos `contacts` que o listener já lê.

## Prova
- vermelho antes: `npx vitest run src/components/calls/__tests__/IncomingCallAlert.foto.test.tsx` com o bloco do avatar revertido ao original (`AvatarFallback` apenas) → `Tests  2 failed | 1 passed (3)` — falham "mostra a foto quando o contato tem uma" e "cai nas iniciais quando a foto não carrega (imagem quebrada)".
- verde depois: `npx vitest run src/components/calls/__tests__/ src/hooks/__tests__/useIncomingCallListener.test.tsx` → `Test Files  34 passed (34)` / `Tests  293 passed | 2 todo (295)`: 0 falhas, 0 pulados, 0 erros não tratados (os 2 `todo` são da suíte antiga, não deste diff).
- lint/ratchet no commit: `Lint ratchet (staged, 3 arquivo(s)): baseline=0, atual=0, ... novas=0` — nenhuma dívida nova.
- `npx eslint` nos 3 arquivos: sem saída (limpo). `tsc --noEmit`: nenhuma ocorrência nos arquivos tocados.

## O que NÃO fiz e por quê
- Edge (`supabase/functions/_shared/notification-events.ts`) não manda `contact_avatar_url` no metadata da notificação, ao contrário da V3: é área do perfil `worker (edge)`, então registrei como comentário no cartão em vez de editar. Refletir isso no metadata é ganho opcional, não requisito do cartão.
- Não toquei no `useIncomingCallListener` (`src/hooks/communication/`): a suíte dele garante que NÃO há leitura de `contacts` quando o metadata já traz `contact_name`; estender aquele hook mudaria contrato de outra área. A foto veio numa trilha própria (`useFotoDoContato`), chamada pelo alerta.
- O cartão PH-41 citado no corpo não tem registro em `~/hermes-workspaces/.v2-fila/`; o único ponto de contato possível com ele seria o `useIncomingCallListener`, que eu não modifiquei.
