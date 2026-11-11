/**
 * Z012 — proíbe comparação direta (===|!==) de identificadores que aludam a credenciais.
 * Requer timingSafeStringEqual (_shared/cron-secret-auth.ts) em vez de === direto.
 *
 * Pega: `token !== serviceRole`, `key === expected`, etc.
 * Não pega: literais, expressões sem nome legível, e os nomes exatos em NAO_CREDENCIAL
 * (modificadores de teclado/mouse do DOM que casam com /key/i sem serem credencial).
 */
const CREDENTIAL_RE = /secret|token|key|password/i;

// Nomes exatos que casam com CREDENTIAL_RE (por causa de "key") mas são sempre
// modificadores/propriedades de evento DOM, nunca credencial.
const NAO_CREDENCIAL = new Set(['key', 'ctrlKey', 'shiftKey', 'altKey', 'metaKey']);

function nameOf(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') return node.property.name;
  return null;
}

function nomeDeCredencial(name) {
  return !!name && !NAO_CREDENCIAL.has(name) && CREDENTIAL_RE.test(name);
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Proíbe comparação de variáveis de credencial; use timingSafeStringEqual.' },
    messages: {
      noSecretCompare: 'Comparação direta de credencial "{{name}}": use timingSafeStringEqual(_shared/cron-secret-auth.ts).',
    },
  },
  create(context) {
    return {
      BinaryExpression(node) {
        if (node.operator !== '===' && node.operator !== '!==') return;
        const leftName = nameOf(node.left);
        const rightName = nameOf(node.right);
        if (nomeDeCredencial(leftName)) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: leftName } });
        } else if (nomeDeCredencial(rightName)) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: rightName } });
        }
      },
    };
  },
};
