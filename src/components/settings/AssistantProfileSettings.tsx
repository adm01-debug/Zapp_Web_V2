import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Loader2, AlertCircle, UserRound, Sparkles, Shield, MessageSquareText } from 'lucide-react';
import { motion } from '@/components/ui/motion';
import { toast } from '@/hooks/ui/use-toast';
import {
  useAssistantProfile,
  type Atividade,
  type AjudaPreferida,
  type TomPreferido,
  type AssistantProfile,
} from '@/hooks/assistant/useAssistantProfile';

const ATIVIDADES: { value: Atividade; label: string; desc: string }[] = [
  { value: 'venda', label: 'Vendo', desc: 'Ajuda a fechar vendas, superar objeções e priorizar leads' },
  { value: 'compra', label: 'Compro', desc: 'Ajuda a comparar fornecedores, prazos e recompra' },
  { value: 'atendimento', label: 'Atendo', desc: 'Ajuda a responder rápido com o tom certo' },
  { value: 'supervisao', label: 'Supervisiono', desc: 'Ajuda a acompanhar o time e detectar conversas esfriando' },
];

const AJUDAS: { value: AjudaPreferida; label: string }[] = [
  { value: 'sempre', label: 'Sugerir sempre' },
  { value: 'relevante', label: 'Só quando for relevante' },
  { value: 'sob_demanda', label: 'Só quando eu pedir' },
];

const TONS: { value: TomPreferido; label: string; desc: string }[] = [
  { value: 'direto', label: 'Direto', desc: 'Curto e objetivo' },
  { value: 'consultivo', label: 'Consultivo', desc: 'Explica o porquê antes do o quê' },
  { value: 'formal', label: 'Formal', desc: 'Linguagem de negócio, sem informalidade' },
];

/** Fase 1 do assistente pessoal: tela de perfil em Configurações. */
export function AssistantProfileSettings() {
  const { profile, isLoading, isError, isSaving, saveProfile } = useAssistantProfile();
  const [draft, setDraft] = useState<AssistantProfile | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">Carregando perfil do assistente...</CardContent>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p data-testid="assistant-profile-error" className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" /> Não foi possível carregar seu perfil do assistente.
          </p>
        </CardContent>
      </Card>
    );
  }

  const current = draft ?? profile;

  const handleSave = async () => {
    setErro(null);
    const ok = await saveProfile(current);
    if (ok) {
      setDraft(null);
      toast({ title: 'Perfil salvo', description: 'As preferências do assistente foram atualizadas.' });
    } else {
      setErro('Falha ao salvar o perfil. Tente novamente.');
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserRound className="w-5 h-5 text-primary" />
            Perfil do assistente
          </CardTitle>
          <CardDescription>
            Ensine o assistente a te ajudar do seu jeito. Ele usa este perfil para decidir o que sugerir,
            quando falar e o tom da resposta.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-primary" />
              O que você faz no sistema
            </Label>
            <Select
              value={current.atividade}
              onValueChange={(v) => setDraft({ ...current, atividade: v as Atividade })}
            >
              <SelectTrigger aria-label="Atuação" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ATIVIDADES.map((a) => (
                  <SelectItem key={a.value} value={a.value}>
                    <span className="block">{a.label}</span>
                    <span className="block text-xs text-muted-foreground">{a.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="assistant-foco">O que você cuida (produtos, carteira, setor)</Label>
            <Input
              id="assistant-foco"
              data-testid="assistant-foco-input"
              value={current.foco}
              placeholder="Ex.: brindes corporativos B2B, carteira Sudeste"
              onChange={(e) => setDraft({ ...current, foco: e.target.value })}
            />
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary" />
              Como você quer ser ajudado
            </Label>
            <Select value={current.ajuda} onValueChange={(v) => setDraft({ ...current, ajuda: v as AjudaPreferida })}>
              <SelectTrigger aria-label="Como ser ajudado" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {AJUDAS.map((a) => (
                  <SelectItem key={a.value} value={a.value}>{a.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <MessageSquareText className="w-4 h-4 text-primary" />
              Tom da comunicação
            </Label>
            <Select value={current.tom} onValueChange={(v) => setDraft({ ...current, tom: v as TomPreferido })}>
              <SelectTrigger aria-label="Tom da comunicação" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TONS.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    <span className="block">{t.label}</span>
                    <span className="block text-xs text-muted-foreground">{t.desc}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="pt-4 border-t border-border flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">O assistente ajusta as sugestões a partir destas escolhas.</p>
            <Button onClick={handleSave} disabled={isSaving} className="gap-2" aria-label="Salvar perfil do assistente">
              {isSaving
                ? <><Loader2 className="w-4 h-4 motion-safe:animate-spin" /> Salvando...</>
                : <><Save className="w-4 h-4" /> Salvar perfil</>}
            </Button>
          </div>
          {erro && (
            <p role="alert" data-testid="assistant-profile-save-error" className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="w-4 h-4" /> {erro}
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
