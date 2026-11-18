#!/usr/bin/env node
/**
 * W91 / E51 — política de rotação de issue de alerta.
 *
 * Issues de bot acumulam comentários sem valor e ficam ilegíveis após ~20.
 * Esta função implementa a rotação: quando o limite é atingido, fecha a issue
 * com um comentário-resumo e abre uma nova com link para a anterior.
 *
 * Uso:
 *   import { abrirOuRotacionar } from './issue-rotativa.mjs';
 *   const num = await abrirOuRotacionar({ gh, owner, repo, label, title, body });
 *
 * `gh(method, path, body?)` deve ser a função que faz chamadas à API do GitHub,
 * com a mesma assinatura de github-settings-guard.mjs.
 */

export const LIMITE_COMENTARIOS = 20;

// Valores vindos da API entram no log: quebras de linha sao neutralizadas.
// (Mesma regra do settings-guard; sem isto um number forjado quebra o log.)
const semQuebra = (valor) => String(valor).replace(/[\r\n\u0000-\u001f\u007f]/g, ' ');

/**
 * Conta os comentários de uma issue via paginação (max 100/página).
 * Retorna o total real, não apenas os da primeira página.
 */
export async function contarComentarios(gh, owner, repo, issueNumber) {
  let total = 0;
  let page = 1;
  for (;;) {
    const lista = await gh('GET', `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100&page=${page}`);
    if (!Array.isArray(lista) || lista.length === 0) break;
    total += lista.length;
    if (lista.length < 100) break;
    page += 1;
  }
  return total;
}

/**
 * Encontra a primeira issue aberta com o título e label dados.
 */
export async function encontrarIssue(gh, owner, repo, label, title) {
  const lista = await gh('GET', `/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(label)}&state=open&per_page=10`);
  return Array.isArray(lista) ? (lista.find((i) => i.title === title) ?? null) : null;
}

/**
 * Garante que o label existe (ignora 422 se já existir).
 */
async function garantirLabel(gh, owner, repo, label) {
  await gh('POST', `/repos/${owner}/${repo}/labels`, {
    name: label,
    color: 'e11d48',
    description: 'Issue de alerta de guarda automático',
  }).catch(() => {});
}

/**
 * Abre, atualiza ou rotaciona a issue de alerta.
 *
 * - Se não existe: cria.
 * - Se existe e tem ≤ LIMITE_COMENTARIOS: adiciona comentário.
 * - Se existe e tem > LIMITE_COMENTARIOS: fecha com resumo, abre nova com link.
 *
 * Dedupe opcional por causa: com `marcador` + `janelaMs`, suprime o comentário
 * quando o marcador já foi registrado por `autor` há menos de `janelaMs`
 * (olha as 2 últimas páginas; comentário alheio depois do marcador não zera;
 * marcador colado por terceiro não conta — repo público). Usado pelo
 * settings-guard (causa 6 h / ponto cego 7 d), db-live-guard e types-sync.
 *
 * Retorna o número da issue ativa (nova ou existente), ou `null` suprimido
 * por dedupe. `suprimido: true` no retorno objeto quando chamado com
 * `detalhar: true`.
 */
export async function abrirOuRotacionar({ gh, owner, repo, label, title, body, marcador = null, janelaMs = 0, autor = null, detalhar = false }) {
  const existing = await encontrarIssue(gh, owner, repo, label, title);

  if (existing) {
    // GA78: dedupe por causa antes de qualquer escrita.
    if (marcador && janelaMs > 0) {
      const registro = await registroMaisRecenteCom(gh, owner, repo, existing, marcador, autor);
      const idadeMs = registro ? Date.now() - new Date(registro.created_at).getTime() : Infinity;
      if (registro && idadeMs < janelaMs) {
        console.log(`Dedupe: mesma causa (${marcador}) ha menos de ${Math.round(janelaMs / 3600000)} h; comentario suprimido (issue #${existing.number}).`);
        return detalhar ? { numero: existing.number, suprimido: true } : existing.number;
      }
    }
    const total = await contarComentarios(gh, owner, repo, existing.number);

    if (total > LIMITE_COMENTARIOS) {
      // Rotação: fecha a issue saturada com resumo e abre nova.
      await gh('POST', `/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
        body: `⚠️ Esta issue atingiu ${total} comentários e está sendo rotacionada para manter legibilidade (política E51/W91).\n\nÚltimo alerta antes do fechamento:\n\n---\n\n${body}`,
      });
      // GA78: issue rotacionada (legivel demais) fecha como `not_planned` —
      // nao foi "resolvida", foi substituida pela continuacao.
      await gh('PATCH', `/repos/${owner}/${repo}/issues/${existing.number}`, {
        state: 'closed',
        state_reason: 'not_planned',
      });
      await garantirLabel(gh, owner, repo, label);
      const nova = await gh('POST', `/repos/${owner}/${repo}/issues`, {
        title,
        body: `Continuação de #${existing.number} (fechada por atingir ${total} comentários — E51/W91).\n\n---\n\n${body}`,
        labels: [label],
      });
      console.log(`Issue #${semQuebra(existing.number)} rotacionada → #${semQuebra(nova.number)}`);
      return nova.number;
    }

    await gh('POST', `/repos/${owner}/${repo}/issues/${existing.number}/comments`, { body });
    console.log(`Issue #${semQuebra(existing.number)} atualizada com novo comentario.`);
    return detalhar ? { numero: existing.number, suprimido: false } : existing.number;
  }

  // Não existe: cria.
  await garantirLabel(gh, owner, repo, label);
  const nova = await gh('POST', `/repos/${owner}/${repo}/issues`, {
    title,
    body,
    labels: [label],
  });
  console.log(`Issue #${semQuebra(nova.number)} aberta.`);
  return detalhar ? { numero: nova.number, suprimido: false } : nova.number;
}

/**
 * Registro MAIS RECENTE com o marcador escrito pelo autor esperado.
 * Olha as 2 últimas páginas: um comentário humano ou de outro bot depois do
 * marcador não zera o dedupe, e um marcador colado por terceiros não conta.
 * Devolve null quando a causa nunca foi registrada.
 */
export async function registroMaisRecenteCom(gh, owner, repo, issue, marcador, autor) {
  const total = Number(issue.comments ?? 0);
  const porPagina = 100;
  if (total > 0) {
    const ultimaPagina = Math.max(1, Math.ceil(total / porPagina));
    for (const pagina of [ultimaPagina, ultimaPagina - 1]) {
      if (pagina < 1) continue;
      const comentarios = await gh('GET', `/repos/${owner}/${repo}/issues/${issue.number}/comments?per_page=${porPagina}&page=${pagina}`);
      if (!Array.isArray(comentarios)) continue;
      for (let i = comentarios.length - 1; i >= 0; i -= 1) {
        const c = comentarios[i];
        if ((autor == null || c?.user?.login === autor) && (c?.body ?? '').includes(marcador)) {
          return c;
        }
      }
    }
  }
  if ((autor == null || issue?.user?.login === autor) && (issue?.body ?? '').includes(marcador)) {
    return issue;
  }
  return null;
}

/**
 * Fecha a issue de alerta se estiver aberta (sem regressão detectada).
 */
export async function fecharSeAberta(gh, owner, repo, label, title, mensagem) {
  const existing = await encontrarIssue(gh, owner, repo, label, title);
  if (!existing) return;
  await gh('POST', `/repos/${owner}/${repo}/issues/${existing.number}/comments`, {
    body: mensagem ?? '✅ Perímetro/guarda verificado sem divergência — fechando automaticamente.',
  });
  await gh('PATCH', `/repos/${owner}/${repo}/issues/${existing.number}`, {
    state: 'closed',
    state_reason: 'completed',
  });
  console.log(`Issue #${semQuebra(existing.number)} fechada.`);
}
