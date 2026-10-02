// Temporario (nao commitado): medicao usa o servidor proprio da 5211.
import base from './playwright.config';
const { webServer: _i, ...sem } = base as Record<string, unknown>;
export default sem;
