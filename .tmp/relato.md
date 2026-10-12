Especialista: iris (area-front-componentes)

## O que mudou e por quê
- `src/components/security/PasswordResetRequestsPanel.tsx` (`handleApprove`): o painel deixou de dizer "enviado" às cegas. A Edge `approve-password-reset` responde `emailSent:true/false` (o pai, t_8238b237, tirou `resetLink`/`action_link` da resposta). Agora:
  - `emailSent:true` → `toast.success('E-mail de redefinição enviado para <e-mail mascarado>')`; o endereço sai mascarado por `maskEmail` (`a***@dominio`), nunca inteiro.
  - `emailSent:false` (502 `approved_email_failed`, falha fechada: a aprovação NÃO foi gravada) → alerta `role="alert"` com "Aprovado, mas o e-mail não foi enviado — tente novamente" e botão **Reenviar**, que dispara uma nova aprovação idempotente para a mesma solicitação (que segue pendente). Nada de "sucesso".
  - 4xx/5xx reais → `toast.error` com a MENSAGEM REAL do corpo (`{ error }`), lida de `error.context` (a `Response` que o supabase-js devolve em não-2xx), com fallback para a mensagem do erro.
- `src/components/security/__tests__/PasswordResetRequestsPanel.resultado.test.tsx` (NOVO): prova os dois estados chamando o componente REAL.

## Consumidores e tokens (afinar-telas)
- Não mudei valor, teto nem escala; `maskEmail`/o estado `emailFailedRequest` são novos e só o painel os lê.
- Classes usadas (`bg-destructive/10`, `border-destructive/30`, `text-destructive`, `Button variant="outline" size="sm"`) já existem no projeto (ex.: `src/components/admin/CrisisRoom.tsx`).
- O painel já é admin-only: `SecurityView.tsx` só o renderiza dentro de `{isAdmin && …}` (aba "admin"). Nada a mudar.

## Prova
- vermelho antes: `npx vitest run src/components/security/__tests__/PasswordResetRequestsPanel.resultado.test.tsx` (código sem a correção) → `Tests 4 failed | 1 passed (5)` (o painel mostrava o sucesso fixo e não tinha o alerta de reenvio).
- verde depois: `npx vitest run src/components/security/__tests__/PasswordResetRequestsPanel` → `Test Files 3 passed (3); Tests 10 passed (10)`.
- `npx eslint` nos dois arquivos: `0 errors`, só o warning pré-existente da linha 10 (`no-restricted-imports` do client Supabase, já no baseline — o commit registra `novas=0`).
- Nenhum link na tela: o teste A verifica que `document.body` não contém `resetLink`, `action_link` nem `token`.

## O que NÃO fiz e por quê
- `git grep -n resetLink -- src` → **vazio** (nenhum uso no front; item 2 atendido, nada a remover).
- Guarda atômica de status em `supabase/functions/approve-password-reset/index.ts` (o update ainda filtra só por `id`, sem `.eq('status','pending')`): é código de Edge, fora dos ARQUIVOS QUE PODE TOCAR deste cartão (worker Edge / edgar). Registro em `kanban_comment`; os testes Deno da Edge já existem (commit do pai `39fa1b79a`), então o "hoje sem teste algum" do comentário está desatualizado.
- Não mexi em `src/hooks/security/`: a chamada não está em hook (o cartão só cita aquele caminho "se a chamada estiver num hook").
