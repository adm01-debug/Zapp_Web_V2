Especialista: hugo
- Verificação rápida (zapp-verify --rapido) no fechar: OK db_guard 0s;OK tipos 91s;OK lint 10s;OK migrations 1s

## FATOS MEDIDOS PELO FECHAR (16/10 09:06, gerados por máquina: valem mais que números escritos à mão)
```
 src/components/team-chat/TeamMemberDetails.tsx     |  22 +++-
 .../team-chat/TeamMemberProfileHeader.tsx          |  25 ++--
 .../TeamMemberDetails.aniversarios.test.tsx        | 136 ++++++++++++++++++++
 src/hooks/team-chat/README.md                      |   5 +-
 .../useTeamMemberDetails.profiles-rpc.test.tsx     | 128 ++++++++++++-------
 src/hooks/team-chat/queryKeys.ts                   |   6 +
 src/hooks/team-chat/useTeamMemberDetails.ts        |  88 ++++++++-----
 src/integrations/supabase/types.ts                 |   8 ++
 src/lib/birthday.ts                                |  34 +++++
 .../20261016102337_get_team_birthdays.sql          |  39 ++++++
 supabase/tests/get_team_birthdays.sql              | 140 +++++++++++++++++++++
 11 files changed, 536 insertions(+), 95 deletions(-)
```
- Testes alterados neste cartão (2 arquivo[s]) rodados AGORA no seu commit: Test Files 2 passed (2);Tests 10 passed (10)
- Prova vermelho→verde dos testes alterados: falham na base e passam no seu commit (vermelho → verde)
- Passada adversarial da 1ª entrega: sem critérios refutados
- Portão do integrador (mesmo Jev da fila) simulado no fechar: revisar — caminho sensível: supabase/migrations/20261016102337_get_team_birthdays.sql, supabase/tests/get_team_birthdays.sql; padrão sensível: caminho:supabase/migrations/, caminho:supabase/tests/, padrão:SECURITY DEFINER, padrão:\bGRANT\b, padrão:\bREVOKE\b, padrão:search_path


## O que mudou e por quê
- `src/hooks/team-chat/useTeamMemberDetails.ts`: `MemberProfile.birthday` deixou de ser a data
  completa e passou a `{ day, month } | null`, preenchido pela RPC segura `get_team_birthdays`
  (HZ-28). Antes o contrato fixava `birthday: null` e por isso o cartão de aniversário do colega e
  a seção "Próximos Aniversários" nunca apareciam. A lista de perfis passou a vir de
  `useTeamProfiles` (`['team-profiles-rpc']`, chave única e cacheada) em vez das duas chaves por
  conversa — é o risco B do relatório do pai (a RPC `get_team_profiles` rodava de novo a cada
  conversa). A lista devolvida é a mesma: quem escolhe o que mostrar é a conversa, por `id`.
- `src/hooks/team-chat/queryKeys.ts`: fábrica nova `queryKeys.teamBirthdays()` →
  `['team-birthdays-rpc']`; sem id de conversa de propósito (a RPC devolve a lista inteira).
- `src/lib/birthday.ts` (novo): o cálculo do próximo aniversário saiu do arquivo de componente —
  recebe `{ day, month }` e devolve `date/day/month/isToday/daysUntil`, **sem idade**; o
  componente voltou a exportar só componentes (o arquivo exportava funções soltas).
- `src/components/team-chat/TeamMemberProfileHeader.tsx`: `getBirthdayInfo` recebe dia/mês e as
  duas frases do cartão deixaram de mostrar "(N anos)".
- `src/components/team-chat/TeamMemberDetails.tsx`: a linha "Aniversário" e a seção "Próximos
  Aniversários" mostram dia/mês (nunca ano nem idade); a ordenação por dias restantes perdeu o
  fallback `age: 0`/365 dias, que existia só para tipar e inventava data.
- `src/hooks/team-chat/README.md`: a linha da tabela de `useTeamMemberDetails` passou a citar a RPC
  `get_team_birthdays` e a fábrica nova entrou na lista de chaves — os dois contratos do módulo
  (`contratosModulo.test.ts`) cobram README × código e falharam antes desta atualização.
- `src/integrations/supabase/types.ts`: entrada de `get_team_birthdays` (`Args: never`; `Returns`
  com `id`, `birthday_day`, `birthday_month`). O contrato do módulo exige o nome em `types.ts`
  gerado e o `types-sync` só roda na integração; a entrada foi escrita igual à forma que o
  gerador produz para a migration do pai.
- Testes: `src/hooks/team-chat/__tests__/useTeamMemberDetails.profiles-rpc.test.tsx` (atualizado —
  RPC nova, mapa dia/mês e chave única) e
  `src/components/team-chat/__tests__/TeamMemberDetails.aniversarios.test.tsx` (novo — grupo com
  dois aniversários ordenados por dias restantes, estado vazio e nenhum ano/idade na tela).

## FAIXA DO PAI
`6ba600deb3` (cherry-pick `-x` de `529f5c4ab`, cartão `t_4593622c`, worker sql) — a migration
`20261016102337_get_team_birthdays.sql` e o teste SQL do pai. Não são deste cartão: sem eles no
branch a RPC consumida pelo hook não existiria. O resto do diff é deste cartão.

## Prova
- vermelho antes (mutação no meu próprio diff: `birthday` voltando a `null` no merge do hook,
  como no contrato antigo): `npx vitest run src/hooks/team-chat/__tests__/useTeamMemberDetails.profiles-rpc.test.tsx`
  → `Tests  1 failed | 6 passed (7)` com
  `expected [ null, null ] to deeply equal [ null, { day: 5, month: 1 } ]`.
- vermelho antes (mutação: a data de exibição voltando a mostrar o ano):
  `npx vitest run src/components/team-chat/__tests__/TeamMemberDetails.aniversarios.test.tsx`
  → `Tests  1 failed | 2 passed (3)` em `expect(screen.getAllByText('20 de outubro')).toHaveLength(2)`.
- verde depois: `npx vitest run src/components/team-chat src/hooks/team-chat`
  → `Test Files  40 passed (40)` e `Tests  378 passed | 1 todo (379)`.
- lint do commit (husky, ratchet): `baseline=2, atual=1, mantidas=1, removidas=1, novas=0` →
  `OK: nenhuma nova divida de lint foi introduzida`.
- `zapp-verify . --rapido` → `OK db_guard`; `OK tipos`; `OK lint`; `OK migrations`;
  `VERIFY: VERDE SEM BANCO`. O banco local não foi verificado por esta chamada (sem nome de
  conjunto) — a RPC do pai foi provada no cartão `t_4593622c`.

## Antes de entregar (o juiz automático levantou dois pontos)
- Ponto 1 (teste que já existia alterado): o cartão autoriza explicitamente "Atualize ou crie testes
  dos arquivos que tocar", e o contrato mudou de propósito — o arquivo pegava `get_team_profiles`
  direto e esperava `birthday: null`. O que ele provava de segurança continua provado: leitura só
  pela RPC (`/\.from\(/` não aparece), filtro pelo `id` da conversa e nada de perfil fora da lista.
  Nenhum teste foi removido nem pulado: o arquivo passou de 6 para 7 casos.
- Ponto 2 (arquivos fora da lista): `src/components/team-chat/TeamMemberDetails.tsx` e
  `TeamMemberProfileHeader.tsx` são os consumidores do `birthday` que o cartão manda ajustar (um
  campo do tipo `{day,month}` quebraria a tela sem eles); `src/hooks/team-chat/queryKeys.ts` e
  `src/hooks/team-chat/README.md` são contratos do próprio módulo — o README é conferido contra o
  código por `__tests__/contratosModulo.test.ts` (chave nova sem citação e RPC trocada sem trocar a
  tabela deixam a suíte vermelha); `src/integrations/supabase/types.ts` é exigido pelo mesmo
  contrato (o nome da RPC tem de existir no arquivo gerado) e só recebeu a entrada da migration;
  `supabase/migrations/20261016102337_*.sql` e `supabase/tests/get_team_birthdays.sql` são a FAIXA
  DO PAI declarada acima (cherry-pick `-x`), não trabalho deste cartão.

## O que NÃO fiz e por quê
- Não mexi no `staleTime` do `useTeamProfiles` (segue 30 s): ele é compartilhado com outras telas
  (`ConfigurePermissionsDialog`, invalidação do `AvatarUpload`) e mudá-lo seria alterar contrato de
  outro consumidor. A dependência que eu criei (`queryKeys.teamBirthdays()`) tem `staleTime` de
  5 minutos, própria.
- Não criei migration, Edge Function nem rota nova: só front, como manda o cartão.
- Não removi `queryKeys.memberProfile`/`members` — as fábricas continuam em `queryKeys.ts` com o
  contrato congelado em `queryKeys.test.ts`; o hook é que deixou de usá-las (a lista inteira vem da
  chave única).
