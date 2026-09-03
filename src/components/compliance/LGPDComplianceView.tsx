import { useState } from 'react';
import { getLogger } from '@/lib/logger';

const log = getLogger('LGPDCompliance');
import { motion } from 'framer-motion';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Shield, ShieldAlert, Download, Trash2, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

export function LGPDComplianceView() {
  const { user } = useAuth();
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [exportedData, setExportedData] = useState<string | null>(null);

  const handleExportData = async () => {
    toast.error('🔒 Exportação bloqueada por política de segurança', {
      description: 'A exportação de dados está desabilitada para proteção dos dados de clientes e fornecedores.',
    });
  };

  const handleDeleteRequest = async () => {
    if (!user) return;
    setIsDeleting(true);
    try {
      // Create a deletion request (admin reviews)
      await supabase.rpc('log_audit_event', {
        p_action: 'gdpr_deletion_request',
        p_entity_type: 'user',
        p_entity_id: user.id,
        p_details: {
          type: 'right_to_be_forgotten',
          requested_at: new Date().toISOString(),
          email: user.email,
        },
        p_user_agent: navigator.userAgent,
      });

      toast.success('Solicitação de exclusão registrada. Um administrador irá processar em até 30 dias.');
      setShowDeleteConfirm(false);
    } catch (error) {
      log.error('Delete request error:', error);
      toast.error('Erro ao registrar solicitação');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto w-full min-w-0">
      <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
            <Shield className="w-5 h-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">Privacidade & LGPD</h1>
            <p className="text-muted-foreground text-sm">Gerencie seus dados pessoais conforme a LGPD/GDPR</p>
          </div>
        </div>
      </motion.div>

      {/* Seus Direitos */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileText className="w-4 h-4" /> Seus Direitos
          </CardTitle>
          <CardDescription>De acordo com a Lei Geral de Proteção de Dados (LGPD)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { title: 'Acesso', desc: 'Solicitar acesso aos seus dados pessoais armazenados' },
              { title: 'Portabilidade', desc: 'Exportar seus dados em formato legível por máquina' },
              { title: 'Retificação', desc: 'Corrigir dados pessoais incorretos ou incompletos' },
              { title: 'Eliminação', desc: 'Solicitar a exclusão dos seus dados pessoais' },
            ].map((right) => (
              <div key={right.title} className="flex items-start gap-2 p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="w-4 h-4 text-success mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{right.title}</p>
                  <p className="text-xs text-muted-foreground">{right.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Exportar Dados - BLOQUEADO */}
      <Card className="border-destructive/30 bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-destructive" /> Portabilidade de Dados — Bloqueada
          </CardTitle>
          <CardDescription>A exportação de dados está desabilitada por política de segurança</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            A exportação de dados pessoais foi bloqueada para proteção dos dados de clientes e fornecedores (LGPD).
          </p>
          <Button disabled className="opacity-50 cursor-not-allowed" onClick={handleExportData}>
            <ShieldAlert className="w-4 h-4 mr-2 text-destructive" />
            Exportação Bloqueada
          </Button>
        </CardContent>
      </Card>

      {/* Excluir Dados */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2 text-destructive">
            <Trash2 className="w-4 h-4" /> Direito ao Esquecimento
          </CardTitle>
          <CardDescription>Solicite a exclusão permanente dos seus dados pessoais</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!showDeleteConfirm ? (
            <>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/5 border border-destructive/20">
                <AlertTriangle className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-destructive">Ação irreversível</p>
                  <p className="text-xs text-muted-foreground">
                    Ao solicitar a exclusão, todos os seus dados pessoais serão removidos permanentemente.
                    O processo pode levar até 30 dias conforme a legislação.
                  </p>
                </div>
              </div>
              <Button variant="destructive" onClick={() => setShowDeleteConfirm(true)}>
                Solicitar Exclusão de Dados
              </Button>
            </>
          ) : (
            <div className="space-y-3 p-4 rounded-lg border border-destructive/30 bg-destructive/5">
              <p className="text-sm font-medium text-destructive">
                Tem certeza? Esta ação não pode ser desfeita.
              </p>
              <div className="flex gap-2">
                <Button variant="destructive" onClick={handleDeleteRequest} disabled={isDeleting}>
                  {isDeleting ? 'Processando...' : 'Confirmar Exclusão'}
                </Button>
                <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Consentimento */}
      <Card className="border-secondary/30">
        <CardHeader>
          <CardTitle className="text-base">Dados Armazenados</CardTitle>
          <CardDescription>Tipos de dados que coletamos e processamos</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { type: 'Dados de Identificação', examples: 'Nome, email, telefone', basis: 'Execução contratual' },
              { type: 'Dados de Uso', examples: 'Logs, sessões, dispositivos', basis: 'Legítimo interesse' },
              { type: 'Dados de Comunicação', examples: 'Mensagens, templates', basis: 'Execução contratual' },
              { type: 'Dados de Segurança', examples: 'IPs, tentativas de login', basis: 'Obrigação legal' },
            ].map((item) => (
              <div key={item.type} className="flex items-center justify-between py-2 border-b border-secondary/20 last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{item.type}</p>
                  <p className="text-xs text-muted-foreground">{item.examples}</p>
                </div>
                <Badge variant="outline" className="text-xs">{item.basis}</Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
