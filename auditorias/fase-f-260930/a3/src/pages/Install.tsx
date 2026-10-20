import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Smartphone, Wifi, WifiOff, Shield, Zap, CheckCircle2, Share } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const Install = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // Detect iOS
    const ua = navigator.userAgent;
    setIsIOS(/iPad|iPhone|iPod/.test(ua) && !(window as Window & { MSStream?: unknown }).MSStream);

    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setIsInstalled(true));

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const features = [
    { icon: Zap, title: "Acesso Rápido", desc: "Abra direto da tela inicial" },
    { icon: WifiOff, title: "Funciona Offline", desc: "Acesse dados mesmo sem internet" },
    { icon: Shield, title: "Seguro", desc: "Dados protegidos no dispositivo" },
    { icon: Smartphone, title: "Experiência Nativa", desc: "Interface otimizada para mobile" },
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full space-y-6">
        <div className="text-center space-y-2">
          <div className="w-20 h-20 bg-gradient-to-br from-primary to-primary/70 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
            <Smartphone className="w-10 h-10 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Instalar App</h1>
          <p className="text-muted-foreground text-sm">
            Instale o ZAPP Web no seu dispositivo para uma experiência completa
          </p>
        </div>

        {isInstalled ? (
          <Card className="border-success/30 bg-success/5">
            <CardContent className="pt-6 text-center space-y-3">
              <CheckCircle2 className="w-12 h-12 text-success mx-auto" />
              <p className="font-semibold text-foreground">App já instalado!</p>
              <p className="text-sm text-muted-foreground">
                Você já pode acessar pela tela inicial do seu dispositivo.
              </p>
              <Button onClick={() => navigate("/")} className="w-full">
                Ir para o App
              </Button>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              {features.map((f) => (
                <Card key={f.title} className="border-border/50">
                  <CardContent className="pt-4 pb-3 px-3 text-center space-y-1">
                    <f.icon className="w-6 h-6 text-primary mx-auto" />
                    <p className="text-xs font-medium text-foreground">{f.title}</p>
                    <p className="text-3xs text-muted-foreground">{f.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {isIOS ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Como instalar no iPhone</CardTitle>
                  <CardDescription className="text-xs">Siga os passos abaixo</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">1</div>
                    <p className="text-sm text-muted-foreground">
                      Toque no botão <Share className="w-4 h-4 inline text-primary" /> <strong>Compartilhar</strong> na barra do Safari
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">2</div>
                    <p className="text-sm text-muted-foreground">
                      Role para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>
                    </p>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-primary">3</div>
                    <p className="text-sm text-muted-foreground">
                      Toque em <strong>"Adicionar"</strong> para confirmar
                    </p>
                  </div>
                </CardContent>
              </Card>
            ) : deferredPrompt ? (
              <Button onClick={handleInstall} size="lg" className="w-full gap-2">
                <Download className="w-5 h-5" />
                Instalar Agora
              </Button>
            ) : (
              <Card>
                <CardContent className="pt-6 text-center space-y-2">
                  <Wifi className="w-8 h-8 text-muted-foreground mx-auto" />
                  <p className="text-sm text-muted-foreground">
                    Abra esta página no navegador Chrome ou Edge do seu celular para instalar o app.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}

        <Button variant="ghost" onClick={() => navigate("/")} className="w-full text-muted-foreground">
          Continuar no navegador
        </Button>
      </div>
    </div>
  );
};

export default Install;
