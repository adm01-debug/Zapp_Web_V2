/**
 * Z012 — proíbe comparação direta (===|!==) de identificadores que aludam a credenciais.
 * Requer timingSafeStringEqual (_shared/cron-secret-auth.ts) em vez de === direto.
 *
 * Pega: `token !== serviceRole`, `apiKey === expected`, etc.
 * Não pega: comparação com literal (`token === 'abc'`, `e.key === 'Escape'`), expressões sem nome
 * legível, e `key` solto (KeyboardEvent.key, chave de Map/aba/ordenação — não é credencial).
 * `key` só conta quando qualificado: apiKey, serviceKey, privateKey, accessKey, authKey...
 */
const CREDENTIAL_RE = /secret|token|passw(?:or)?d|(?:api|service|private|access|auth|signing|encryption|anon|master)[_-]?key/i;

function nameOf(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression' && node.property?.type === 'Identifier') return node.property.name;
  return null;
}

function isLiteral(node) {
  if (node.type === 'Literal') return true;
  if (node.type === 'TemplateLiteral') return node.expressions.length === 0;
  return node.type === 'Identifier' && node.name === 'undefined';
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
        if (isLiteral(node.left) || isLiteral(node.right)) return;
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
