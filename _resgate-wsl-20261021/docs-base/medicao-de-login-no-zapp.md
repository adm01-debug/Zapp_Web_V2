# Medir login e requisições no Zapp Web V2

## Provar que a chamada saiu: capturar REQUISIÇÃO, não resposta

Filtrar só `response` por padrões adivinhados produz "nenhuma chamada de auth" **falso** — já me
levou a concluir que o app não chamava o login quando ele chamava. Capture `request`, imprima
método+URL, e leia o corpo com `request.postData()`: essa leitura **não depende do backend
responder**, e é a única que continua válida quando a edge está pendurada.

## Produção reimplanta a cada poucos minutos: medida é INSTANTÂNEO, não propriedade

O deployment é substituído várias vezes por hora (builds distintos da `main` em sequência). Consequência
metodológica: **um 404 de chunk, ou o nome do chunk, observado uma vez NÃO é propriedade estável da `main`.**
Medido: `JourneyTab-<hash>.js` deu 404 numa janela e horas depois a mesma aba carregou `JourneyTab-<hash2>.js`
com **200** e sem erro — o "bug" era build defasada, não defeito. Antes de registrar achado de produção, leia
**duas vezes** (ou registre junto a identidade do build: o hash do chunk, a hora) e escreva no relatório a que
build a medida pertence. E não trate o testid/arquivo ausente como prova de código que nunca existiu.

## Estado selecionado: leia TODOS os candidatos, incluindo o padrão

Para medir qual aba/opção está ativa, `aria-selected` de cada candidato, **incluindo a que você não
está investigando**. Medido: com a preferência persistida, `orders=false` **e** `history=false` — que se
lê como "nenhuma aba selecionada / persistência quebrada", mas o selecionado era o padrão `chat`.
Sem ler o terceiro candidato, o fallback e a ausência de seleção são indistinguíveis.

**Persistência se mede nas DUAS pontas.** Antes do reload, confirme o que foi **gravado**
(`localStorage.getItem('<chave>')` + o `aria-selected` da aba clicada); depois do reload, confirme o que foi
**restaurado**. Um app pode gravar perfeitamente e não restaurar — e a asserção que só olha o storage fica
verde num produto quebrado. Vale para toda preferência persistida (aba, filtro, tema, painel).

## Formulário de login (produção)

- rota `/auth`; exatamente **1** `<form>` e **1** `button[type="submit"]`;
  `input[name="email"]` (id `login-email`) e `input[name="password"]` (id `login-password`).
- Antes do submit, afirme **o valor do campo E o `FormData` do form**
  (`new FormData(form).get('email')`): é o form que o handler lê, e um preenchimento que não pegou
  passa batido.
- O login vai pela edge **`auth-login`** (não pelo GoTrue direto) e a edge faz ~5 round-trips no
  banco: com o banco fora, o gateway devolve **nada** (pendura, sem erro) ou `503 PGRST002`.
  Trate "sem resposta" como indisponível, e nunca leia ausência de mensagem como ausência de erro.
- Uma tarefa **bloqueada** por banco instável: sonde a saúde a cada ~10 min num processo de segundo plano
  com notificação de término (`notify=true`, `persist_on_release=true`) e rode a medição **uma** vez na
  primeira leitura boa. Sinal vazio na sonda = "ainda fora", nunca "pronto" — e o vigia se encerra por
  linha-marcadora no stdout, que é o que dispara o aviso.

## `useAuthForm`: o submit lê o DOM

`src/hooks/auth/useAuthForm.ts` monta as credenciais lendo o **DOM** do form no submit, porque o
browser autopreenche **sem disparar `onChange`**. Regras atuais: **e-mail prefere o estado** (o DOM só
preenche quando o estado está vazio), **senha vem do DOM**, e **após uma recusa a senha é limpa no
estado E no DOM**. Ao testar esse hook, use o campo de senha **não controlado** — é como o
`PasswordInput` real se comporta, e sem isso a divergência estado/DOM nem acontece.
