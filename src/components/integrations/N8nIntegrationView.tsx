import { motion } from 'framer-motion';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Zap, FlaskConical } from 'lucide-react';

/**
 * n8n — tela sem integração real nesta versão.
 *
 * Não existe servidor n8n, webhook configurado, persistência nem validação de URL. Antes esta tela
 * simulava "Conectado" e "testado com sucesso" a partir de campos de texto locais (e um `setTimeout`),
 * sem nada sair do navegador. Nada disso confirma um fluxo real, então a tela não oferece conectar
 * nem testar: ela declara explicitamente que a integração não está disponível.
 */
export function N8nIntegrationView() {
  return (
    <div className="space-y-6 pt-6 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Zap className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Integração n8n</h1>
            <p className="text-muted-foreground text-sm">Conecte workflows de automação via webhooks</p>
          </div>
          <Badge variant="warning" className="ml-auto">
            Demonstração
          </Badge>
        </div>
      </motion.div>

      <Alert className="border-warning/30 bg-warning/10">
        <FlaskConical className="h-4 w-4 !text-warning" />
        <AlertTitle className="text-warning">Integração não disponível nesta versão</AlertTitle>
        <AlertDescription>
          A conexão com um servidor n8n e o disparo de workflows ainda não foram implementados. Esta tela
          não conecta, não testa webhooks e não salva configuração — nenhum dado é enviado para fora deste
          navegador.
        </AlertDescription>
      </Alert>
    </div>
  );
}
