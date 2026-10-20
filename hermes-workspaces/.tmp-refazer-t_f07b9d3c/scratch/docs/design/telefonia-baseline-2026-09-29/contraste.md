# T78 — Auditoria de contraste WCAG da Telefonia nos 3 temas

**Data da medição:** 2026-10-08 · **Item:** T78 · **Cartão:** SL-238
**Plano:** `docs/design/PLANO_TELEFONIA_FINALIZACAO_100_ETAPAS_2026-09-29.md:198`
**Escopo:** módulo Telefonia (`src/components/calls/**`) — tela `?view=voip`,
histórico, KPIs, painel lateral, alerta de chamada entrante e barra de chamada ativa.
**Critério (aceite do T78):** tabela ≥ 4,5:1 para texto / 3:1 para ícone
**ou resíduo registrado**.

> **Nada foi repintado.** O plano (T76/T78) manda **medir e registrar** quando o par não
> fecha AA — trocar cor é decisão de fora deste cartão. Todo par abaixo de 4,5:1 está na
> seção **Resíduos registrados**, com a origem e o motivo.

---

## 1. Método

1. **Tokens reais lidos do CSS do app** — `src/styles/tokens.css` (`:root` ll.3–373,
   `.dark` ll.376–528) e `src/styles/accessibility.css` (`.high-contrast` ll.4–24,
   `.dark.high-contrast` ll.27–47). Nada de valor copiado à mão: a medida é feita sobre
   o texto do arquivo.
2. **Medidor WCAG 2.1** — HSL → sRGB → luminância relativa → razão
   `(L₁+0,05)/(L₂+0,05)`. É o **mesmo medidor** de
   `src/components/tasks/__tests__/movimentoEContraste.test.tsx` e
   `src/components/tasks/__tests__/quadroLarguraFocoContraste.test.tsx`.
3. **Tinta translúcida** (`bg-primary/15`, `bg-muted/40`) é composta sobre o **card**
   como o navegador pinta: `tinta·α + card·(1−α)`, em sRGB.
4. **As classes medidas saíram do componente RENDERIZADO** (não de `readFileSync`): a
   parte de classes de `telefoniaContraste.test.tsx` monta o componente real
   (`CallResultCell`, `CallKpiCard`, `CallChannelBadge`, `CallDirectionCell`,
   `IncomingCallAlert`, `Badge`) e exige a classe que cada um pinta.
5. **Prova de mutação (dois lados):**
   - trocar `text-warning` por `text-info` em `CallResultCell.classeDoTom` →
     `× no_answer: expected '…text-info…' to contain 'text-warning'` (a prova lê a tela);
   - trocar `--warning: 38 92% 50%` por `42%` em `tokens.css` →
     `× --warning | --card: medida divergiu do laudo: expected { claro: 3, … } to deeply
     equal { claro: 2.14, … }` (a tabela abaixo é a medida, não decorada).
   Os dois foram revertidos.

**Reproduzir:**
```bash
npx vitest run src/components/calls/__tests__/telefoniaContraste.test.tsx
```

### Temas medidos

O design system tem 3 estados de tema — **claro**, **escuro** e **alto-contraste** — e o
alto-contraste é uma **camada** que compõe sobre qualquer base. Por isso a tabela traz a
4ª coluna (`alto-contraste+escuro`), a mesma convenção do E18 do módulo de mídia.

Nota do projeto: `.high-contrast` (claro) **não** declara `--success`, `--warning`,
`--info` nem `--*-foreground` (accessibility.css ll.4–24); nesses pares o tema claro com
alto contraste **herda os valores do `:root`**. O `.dark.high-contrast` herda de `.dark`.

---

## 2. Fontes dos tokens (`arquivo:linha`, conferidas no working tree em 2026-10-08)

| token | claro | escuro | alto-contraste (claro) | alto-contraste (escuro) |
|---|---|---|---|---|
| `--foreground` | `221 20% 12%` tokens.css:106 | `210 40% 98%` :408 | `0 0% 0%` acc.css:6 | `0 0% 100%` acc.css:29 |
| `--card` | `0 0% 100%` :107 | `240 5% 10%` :409 | `0 0% 100%` acc.css:7 | `0 0% 5%` acc.css:30 |
| `--muted-foreground` | `221 10% 40%` :137 | `215 20% 75%` :423 | `0 0% 20%` acc.css:16 | `0 0% 80%` acc.css:39 |
| `--primary` | `221 83% 53%` :119 | `221 83% 53%` :415 | `258 100% 45%` acc.css:11 | `258 100% 65%` acc.css:34 |
| `--primary-foreground` | `0 0% 100%` :120 | `0 0% 100%` :416 | `0 0% 100%` acc.css:12 | `0 0% 0%` acc.css:35 |
| `--secondary` | `215 70% 55%` :127 | `240 5% 16%` :420 | `0 0% 20%` acc.css:13 | `0 0% 80%` acc.css:36 |
| `--secondary-foreground` | `210 40% 92%` :128 | `0 0% 100%` :421 | `0 0% 100%` acc.css:14 | `0 0% 0%` acc.css:37 |
| `--destructive` | `0 84% 60%` :144 | `354 100% 68%` :426 | `0 100% 40%` acc.css:19 | `0 100% 60%` acc.css:42 |
| `--destructive-foreground` | `0 0% 100%` :145 | `0 0% 100%` :427 | `0 0% 100%` acc.css:20 | `0 0% 0%` acc.css:43 |
| `--success` | `160 70% 27%` :155 | `142 71% 45%` :431 | **herda `:root`** | `142 71% 45%` (herda `.dark`) |
| `--warning` | `38 92% 50%` :157 | `40 91% 60%` :434 | **herda `:root`** | `40 91% 60%` (herda `.dark`) |
| `--info` | `210 80% 55%` :160 | `213 94% 62%` :436 | **herda `:root`** | `213 94% 62%` (herda `.dark`) |

---

## 3. Tabela por par

### 3.1 Texto sobre o card (`--card` — tabela do histórico, KPIs, painéis)

| par (uso) | claro | escuro | alto-contraste | HC escuro | mín | veredito |
|---|---|---|---|---|---|---|
| `--foreground | --card` (valor da KPI, títulos, células) | 16,99 | 16,89 | 21,00 | 19,47 | 4,5 | **OK** |
| `--muted-foreground | --card` (rótulos, datas, cabeçalho) | 6,10 | 9,32 | 12,63 | 12,12 | 4,5 | **OK** |
| `--primary | --card` (ícones, resultado "em andamento") | 5,20 | **3,40** | 8,79 | **4,12** | 4,5 | resíduo |
| `--destructive | --card` (perdida, falhou, erro, mudo) | **3,78** | 5,89 | 5,89 | 5,35 | 4,5 | resíduo |
| `--warning | --card` (resultado "não atendida"/"ocupado") | **2,14** | 9,96 | **2,14** | 10,97 | 4,5 | resíduo |
| `--success | --card` (resultado "concluída", ícone recebida) | 5,66 | 7,70 | 5,66 | 8,47 | 4,5 | **OK** |
| `--info | --card` (**ícone** da chamada recebida, 1.4.11) | 3,47 | 5,82 | 3,47 | 6,40 | **3,0** | **OK** |

### 3.2 Texto sobre preenchimento sólido (selos e botões)

| par (uso) | claro | escuro | alto-contraste | HC escuro | mín | veredito |
|---|---|---|---|---|---|---|
| `--primary-foreground | --primary` (selo/botão primário) | 5,20 | 5,20 | 8,79 | **4,44** | 4,5 | resíduo |
| `--secondary-foreground | --secondary` (selo do canal, "Ocupado") | **3,30** | 14,92 | 12,63 | 13,08 | 4,5 | resíduo |
| `--destructive-foreground | --destructive` (selo/botão vermelho) | **3,78** | **3,00** | 5,89 | 5,77 | 4,5 | resíduo |
| `--primary-foreground | --success` (cabeçalho da chamada de voz) | 5,66 | **2,30** | 5,66 | 9,14 | 4,5 | resíduo |
| `--primary-foreground | --info` (cabeçalho da chamada de vídeo) | **3,47** | **3,04** | **3,47** | 6,91 | 4,5 | resíduo |

### 3.3 Texto sobre tinta translúcida (composta sobre o card)

| par (uso) | claro | escuro | alto-contraste | HC escuro | mín | veredito |
|---|---|---|---|---|---|---|
| `--primary | --primary/15` (avatar da barra ativa) | **4,21** | **2,99** | 6,51 | **3,65** | 4,5 | resíduo |
| `--primary | --primary/10` (avatar do painel/contato) | 4,52 | **3,14** | 7,22 | **3,83** | 4,5 | resíduo |
| `--foreground | --muted/40` (chip do seletor, anotações) | 15,77 | 15,49 | 19,23 | 17,94 | 4,5 | **OK** |

**Onde esses pares são pintados (componente:linha):**

| superfície | classe pintada |
|---|---|
| `CallResultCell.tsx:8-12` | `text-success` / `text-destructive` / `text-warning` / `text-muted-foreground` / `text-primary` sobre o card |
| `CallKpiCard.tsx:21,24,30` | `bg-card` · `text-muted-foreground` (rótulo) · `text-foreground` (valor) |
| `CallChannelBadge.tsx:38` | `bg-secondary` + `text-secondary-foreground` |
| `CallDirectionCell.tsx:19` | ícone `text-info` (recebida) / `text-primary` (realizada) |
| `TelefoniaView.tsx:157-159` | ícones `text-destructive` / `text-success` / `text-primary` |
| `TelefoniaView.tsx:176-187` | `Badge` variant `default` / `secondary` / `destructive` / `outline` |
| `IncomingCallAlert.tsx:215-218` | cabeçalho `bg-success` (voz) / `bg-info` (vídeo) + `text-primary-foreground` |
| `ActiveCallBar.tsx:47,63` | `bg-primary/15` + `text-primary` · botão `bg-success` |
| `ActiveCallPanel.tsx:84,107` | `bg-primary/10` + `text-primary` · botão `bg-success` |
| `ContactPicker.tsx:122,124` | `bg-muted/40` (chip) · `bg-primary/10` + `text-primary` (avatar) |

---

## 4. Resíduos registrados

Todos os resíduos têm **a mesma origem**: o módulo usa o token de **preenchimento**
(`--warning`, `--destructive`, `--info`, `--primary`) como cor de **texto**, ou põe
branco (`--primary-foreground`) sobre um preenchimento claro. O par de texto dedicado
(`--warning-text`, `--destructive-text`) existe no design system mas **não** é aplicado
aqui. Trocar cor/token é decisão de outro cartão — **está registrado, não corrigido**.

| # | par | tema(s) que falham | medido | motivo |
|---|---|---|---|---|
| 1 | `text-warning` sobre o card | claro, alto-contraste | 2,14 | o módulo pinta o texto com `--warning` (âmbar de preenchimento) |
| 2 | `text-destructive` sobre o card | claro | 3,78 | texto com `--destructive` (preenchimento) |
| 3 | `text-primary` sobre o card | escuro, HC escuro | 3,40 / 4,12 | texto/ícone com `--primary`; `--primary-text` existe e não é usado |
| 4 | selo do canal (`bg-secondary` + `text-secondary-foreground`) | claro | 3,30 | `--secondary` claro é azul-claro com texto claro |
| 5 | botão/selo destrutivo (`destructive-foreground` sobre `--destructive`) | claro, escuro | 3,78 / 3,00 | branco sobre vermelho claro |
| 6 | cabeçalho da chamada de voz (`--primary-foreground` sobre `--success`) | escuro | 2,30 | branco sobre o verde claro do tema escuro |
| 7 | cabeçalho da chamada de vídeo (`--primary-foreground` sobre `--info`) | claro, escuro, alto-contraste | 3,47 / 3,04 / 3,47 | branco sobre azul claro |
| 8 | avatar da barra ativa (`text-primary` sobre `bg-primary/15`) | claro, escuro, HC escuro | 4,21 / 2,99 / 3,65 | mesma origem do #3, com a tinta composta |
| 9 | avatar do painel (`text-primary` sobre `bg-primary/10`) | escuro, HC escuro | 3,14 / 3,83 | idem |
| 10 | selo/botão primário (`--primary-foreground` sobre `--primary`) | HC escuro | 4,44 | branco quase fecha 4,5 sobre o violeta claro do HC escuro |

### Achado adjacente (fora do escopo deste cartão — vai em `kanban_comment`)

`CallStatusBadge.tsx:14` monta o selo com `className={\`text-3xs ${RESULT_TONE[resultado]}\`}`,
e `RESULT_TONE` (em `src/lib/calls/callStatus.ts:98`) devolve o **nome do tom**
(`'success'`, `'warning'`, …), não uma classe Tailwind. O selo renderiza
`class="text-3xs success"`, que não existe no CSS: a variante `outline` fica com
`text-foreground` e o **tom do desfecho não chega à tela**. Não é um par de contraste
(por isso não entrou na tabela acima), mas é um defeito de apresentação — registrado no
cartão, não tocado aqui.

---

## 5. Conclusão

- **15 pares medidos** nos 4 estados de tema; **5 pares fecham AA em todos os temas** —
  o valor e os rótulos das KPIs, toda a coluna de data/duração da tabela, o resultado
  "concluída", o ícone da chamada recebida (1.4.11) e o chip do seletor.
- **10 pares ficam abaixo do mínimo** em pelo menos um tema, sempre pela mesma causa
  (token de preenchimento usado como texto, ou branco sobre preenchimento claro). Os 10
  estão na seção 4, com o número medido.
- Os pares que o T76 citava como risco (**`muted` sobre `card`**) **passam**: 6,10 (claro)
  a 12,63 (alto-contraste).
- A tranca é o teste `src/components/calls/__tests__/telefoniaContraste.test.tsx`
  (23 casos): ele mede exatamente esta tabela e falha se um token mudar — a medida acima
  precisa ser refeita antes de o teste voltar a passar.

**Critério do T78 — "tabela ≥ 4,5:1 **ou** resíduo registrado" — cumprido:** tabela
completa nas seções 3.1–3.3 e os resíduos registrados na seção 4.
