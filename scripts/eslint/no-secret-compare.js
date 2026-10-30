/**
 * Z012 — proíbe comparação direta (===|!==) de identificadores que aludam a credenciais.
 * Requer timingSafeStringEqual (_shared/cron-secret-auth.ts) em vez de === direto.
 *
 * Pega: `token !== serviceRole`, `key === expected`, etc.
 * Não pega: literais, expressões sem nome legível.
 */
const CREDENTIAL_RE = /secret|token|key|password/i;

function nameOf(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') return node.property.name;
  return null;
}

export default {
  meta: {
    type: 'problem',
    docs: { description: 'Proíbe === / !== em variáveis de credencial; use timingSafeStringEqual.' },
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
        if (leftName && CREDENTIAL_RE.test(leftName)) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: leftName } });
        } else if (rightName && CREDENTIAL_RE.test(rightName)) {
          context.report({ node, messageId: 'noSecretCompare', data: { name: rightName } });
        }
      },
    };
  },
};
