import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/transito-vtal")({
  component: TransitoVtalPage,
});

function TransitoVtalPage() {
  const [asNumber, setAsNumber] = useState("");
  const [asName, setAsName] = useState("");
  const [asPath, setAsPath] = useState("");
  const [prefixo, setPrefixo] = useState("");
  const [busy, setBusy] = useState(false);

  const gerarPdf = async () => {
    if (!asNumber.trim() || !asPath.trim() || !prefixo.trim()) {
      toast.error("Preencha AS, AS-PATH e PREFIXO.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/formulario-bgp-vtal-template.pdf");
      if (!res.ok) throw new Error("Falha ao carregar template");
      const bytes = await res.arrayBuffer();
      const pdf = await PDFDocument.load(bytes);
      const page = pdf.getPages()[0];
      const font = await pdf.embedFont(StandardFonts.Helvetica);
      const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
      const pageH = page.getHeight();
      const white = rgb(1, 1, 1);
      const black = rgb(0, 0, 0);

      // Cobrir valores antigos: AS / AS-PATH / Prefixo
      // Coordenadas extraídas do template (origem topo, converte p/ origem inferior).
      const lines = [
        { top: 612, h: 13, x: 82, w: 460 }, // linha AS:
        { top: 635, h: 13, x: 82, w: 460 }, // linha AS-PATH:
        { top: 657, h: 13, x: 82, w: 460 }, // linha do prefixo
      ];
      for (const l of lines) {
        page.drawRectangle({
          x: l.x,
          y: pageH - l.top - l.h,
          width: l.w,
          height: l.h,
          color: white,
        });
      }

      const draw = (text: string, x: number, top: number, opts?: { bold?: boolean }) => {
        page.drawText(text, {
          x,
          y: pageH - top - 9,
          size: 10,
          font: opts?.bold ? fontBold : font,
          color: black,
        });
      };

      const asLine = `AS: ${asNumber.trim()}${asName.trim() ? "  " + asName.trim() : ""}`;
      draw(asLine, 83, 613);
      draw(`AS-PATH: ${asPath.trim()}`, 83, 636);
      draw(prefixo.trim(), 83, 658);

      const out = await pdf.save();
      const blob = new Blob([out as BlobPart], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Formulario_BGP_VTAL_AS${asNumber.trim()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("PDF gerado com sucesso.");
    } catch (e) {
      console.error(e);
      toast.error("Erro ao gerar PDF.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell title="Solicitação de Trânsito VTAL">
      <div className="max-w-2xl mx-auto p-6">
        <Card>
          <CardHeader>
            <CardTitle>Solicitação de Trânsito VTAL</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="asn">AS (ASN)</Label>
                <Input
                  id="asn"
                  placeholder="268199"
                  value={asNumber}
                  onChange={(e) => setAsNumber(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="asname">Nome do AS (opcional)</Label>
                <Input
                  id="asname"
                  placeholder="Rios Network"
                  value={asName}
                  onChange={(e) => setAsName(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="aspath">AS-PATH</Label>
              <Input
                id="aspath"
                placeholder="262999 268199"
                value={asPath}
                onChange={(e) => setAsPath(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prefixo">PREFIXO</Label>
              <Input
                id="prefixo"
                placeholder="151.246.225.0/24"
                value={prefixo}
                onChange={(e) => setPrefixo(e.target.value)}
              />
            </div>
            <Button onClick={gerarPdf} disabled={busy} className="w-full">
              {busy ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Gerando...</>
              ) : (
                <><Download className="h-4 w-4 mr-2" /> Gerar Formulário BGP - VTAL (PDF)</>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}