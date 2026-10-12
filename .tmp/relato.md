Especialista: worker (sql) (area-sql-banco)

## O que mudou e por quê
- supabase/migrations/20261012032331_profiles_can_download_trigger.sql (nova): trigger `prevent_can_download_escalation`, BEFORE UPDATE em public.profiles, que levanta excecao quando quem muda `profiles.can_download` nao e admin/supervisor (`is_admin_or_supervisor(auth.uid())`). E a barreira pedida pelo R2-AUTH-027 (#252).
- supabase/migrations/20261006195049_profiles_can_download_escalation.sql (removida): a 1a entrega reconstruia a policy RESTRICTIVE `"Block sensitive field changes by non-admins"` para incluir can_download. Era a causa da recusa no `banco_local`, nao o efeito.
- scripts/db-audit/profiles-can-download-authorization.test.sh (mesmo caminho): reescrito para provar a correcao pelo trigger (A defeito -> B correcao -> C mutacao).

## Por que a policy virou trigger (a causa da recusa)
Nada de `zapp-verify` foi editado: o `banco_local` explica cada linha de estrutura mudada citando o NOME do objeto dentro da migration pendente (`explicada()` -> `cita()`). Para a secao `policies` o nome vem do retrato canonico como `profiles."Block sensitive field changes by non-admins"` (com aspas, por causa das maiusculas) e `cita()` procura `\b<nome>\b` num texto em minusculas: `\b"` nunca casa. Medido no banco local do cartao, com o texto real da migration da 1a entrega:
  `cita('"Block sensitive field changes by non-admins"')= False` / `cita('"block sensitive field changes by non-admins"')= False` (o `\b` antes da aspa falha) / `cita('block sensitive field changes by non-admins')= True`
Ou seja: qualquer migration que mexa numa policy desse retrato nasce "nao explicada". O trigger nao tem esse problema porque o nome e minusculo e sem aspas.

## Prova
- defeito (bloco A do teste, superficie com as migrations reais de profiles): `bash scripts/db-audit/profiles-can-download-authorization.test.sh` -> `[PASS] A4 DEFEITO: authenticated nao-admin liga can_download no proprio perfil`
- correcao: mesmo comando -> `[EVIDENCIA] recusa crua do Postgres: ERROR: Only administrators can change the can_download flag CONTEXT: PL/pgSQL function prevent_can_download_escalation() line 7 at RAISE` e `[PASS] B1 ... NAO liga mais o proprio can_download`; `[PASS] B3 dono segue editando campo nao sensivel`; `[PASS] B5/B6 admin segue liberando can_download de outro usuario`; `[OK] R2-AUTH-027: can_download do proprio perfil nao sobe sem admin`
- prova que o bloco B nao e vazio (mutacao removendo o calculo da escalada da copia): `[PASS] C2 sem o calculo da escalada o ataque volta a funcionar`
- CI no mesmo caminho registrado no workflow: `bash scripts/db-audit/retry-disposable-postgres-test.sh bash scripts/db-audit/profiles-can-download-authorization.test.sh` -> `[OK] R2-AUTH-027 ...`
- banco da tarefa: `hermes-db-migrar supabase/migrations/20261012032331_profiles_can_download_trigger.sql` -> `APLICADA no banco LOCAL 'v2-26101200173dcc' (producao nao foi tocada)`
- rollback executado de verdade no banco local (em BEGIN/ROLLBACK): `drop trigger if exists prevent_can_download_escalation on public.profiles;` -> `DROP TRIGGER`; `drop function if exists public.prevent_can_download_escalation();` -> `DROP FUNCTION`; `ainda_existe = 0`; depois `ROLLBACK` -> `voltou = 1`
- `banco_local` no banco local do cartao (`zapp-db-local check . v2-26101200173dcc` -> check-diferencas.txt): a linha `policies|profiles."Block sensitive field changes by non-admins"` que reprovava desapareceu, e as 5 linhas do meu objeto (`triggers|profiles.prevent_can_download_escalation`, `functions|f:prevent_can_download_escalation()` e 3 `routine_grants|f:prevent_can_download_escalation()|...`) sao todas citadas pela migration pendente (`explicada=True` nas 5). Eu nao consigo rodar o `banco_local` completo aqui: o `zapp-db-ler` (registro da producao) e PROIBIDO a agentes por R1, entao a regra estrita acusa "nao consegui ler o registro". A prova acima e o que o integrador vai medir com o registro legivel.

## Aviso automático do fechar (falso alarme)
- `SEM DDL/migration`: este é um cartão de BANCO (R2-AUTH-027, #252) e o corpo dele carrega o rodapé de template com essa linha; o diff é exatamente uma migration, que é o produto pedido. O aviso não procede.

## O que NAO fiz e por que
- Nao toquei em `supabase/schema-manifest.json` nem em `zapp-verify`: o retrato canonico e regenerado por ferramenta, e o problema era a barreira escolhida, nao o manifesto.
- Nao toquei na policy RESTRICTIVE vigente (role/access_level/permissions/is_active seguem como estavam) — o teste `B0b` confere que ela segue intacta.
- Nao redefini `prevent_profile_privilege_escalation` nem o trigger existente: a barreira nova e um objeto proprio, para nao mudar o comportamento do sync interno de papel (que nao toca can_download).
- `REVOKE EXECUTE ... FROM PUBLIC` na funcao de trigger nova (nao executavel por ninguem; trigger nao consulta EXECUTE) — objeto novo, nenhum GRANT/papel existente alterado.
