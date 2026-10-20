# Glows Tokenizados (`shadow-glow-*`)

Escala semântica de brilhos baseada em tokens HSL. Todas as classes adaptam-se ao dark mode automaticamente via variáveis em `src/styles/tokens.css`.

## Princípios

- Use `shadow-elev-*` para profundidade neutra (cards, modais, dropdowns).
- Use `shadow-glow-*` apenas para reforço de **identidade**, **estado** ou **gamificação**.
- Jamais reintroduza `shadow-[0_0_Xpx_hsl(...)]` hardcoded — sempre token.

## Mapeamento de intensidades

| Intensidade | Spread  | Opacidade | Uso recomendado |
| ----------- | ------- | --------- | --------------- |
| `sm`        | 10–15px | 0.3       | Hover sutil, foco em chips, badges pequenos |
| `md`        | 20px    | 0.4–0.5   | Estado ativo padrão (botões, inputs, cards selecionados) |
| `lg`        | 30px    | 0.5–0.6   | Destaque máximo (CTA primário, conquistas, alertas) |

Glows compostos (`aura-*`, `neon-inset`) não seguem a escala sm/md/lg — são presets de uso específico.

## Catálogo

### Cores semânticas

| Classe | Quando usar |
| ------ | ----------- |
| `shadow-glow-primary-{sm\|md\|lg}` | Ações primárias, foco do Corporate Blue |
| `shadow-glow-secondary-{sm\|md\|lg}` | Ações secundárias, realces neutros de marca |
| `shadow-glow-accent-{sm\|md}` | Elementos decorativos, tooltips, badges informativos |
| `shadow-glow-destructive-md` | Erros, exclusões, alertas críticos |
| `shadow-glow-success-md` | Confirmações, mensagens entregues, estados positivos |
| `shadow-glow-whatsapp-{md\|lg}` | Indicadores do canal WhatsApp (conexão ativa, QR válido) |

### Gamificação

| Classe | Quando usar |
| ------ | ----------- |
| `shadow-glow-xp-md` | Ganho de XP, barras de progresso |
| `shadow-glow-coins-md` | Saldo de moedas, recompensas monetárias |
| `shadow-glow-streak-md` | Sequências (streaks) ativas |
| `shadow-glow-rank-gold-md` | Ranking ouro, conquistas de topo |

### Compostos multi-layer

| Classe | Efeito |
| ------ | ------ |
| `shadow-glow-aura-secondary` | Halo duplo na cor secundária (avatar do agente em foco) |
| `shadow-glow-aura-gradient` | Halo bicromático secondary→primary (onboarding, celebrações) |
| `shadow-glow-aura-neon` | Neon difuso (modo foco, voice agent ativo) |
| `shadow-glow-neon-inset` | Neon com brilho interno (campos de input em estado "gravando") |

## Exemplos

```tsx
// Botão primário com foco realçado
<Button className="shadow-glow-primary-md hover:shadow-glow-primary-lg">
  Enviar
</Button>

// Badge de canal WhatsApp conectado
<span className="rounded-token-sm bg-whatsapp/10 shadow-glow-whatsapp-md">
  Online
</span>

// Card de conquista (gamificação)
<Card className="shadow-glow-rank-gold-md">…</Card>

// Voice agent ouvindo
<div className="rounded-token-2xl shadow-glow-aura-neon">…</div>

// Input gravando áudio
<div className="shadow-glow-neon-inset">…</div>
```

## Regras de revisão

1. Pull requests com `shadow-[0_0_` são bloqueados — substituir por token.
2. Não combinar `shadow-elev-*` e `shadow-glow-*` na mesma camada: escolha um propósito (profundidade **ou** identidade).
3. Em dark mode, os tokens já têm opacidade reforçada — não aplique `opacity-*` adicional no elemento.
4. Para novas cores semânticas, adicione `--glow-<nome>-{sm,md,lg}` em `src/styles/tokens.css` e o utilitário equivalente em `tailwind.config.ts` antes de usar no componente.
