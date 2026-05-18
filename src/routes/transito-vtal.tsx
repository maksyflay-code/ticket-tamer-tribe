import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Download, Loader2, Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/transito-vtal")({
  component: TransitoVtalPage,
});

function TransitoVtalPage() {
  const [asNumber, setAsNumber] = useState("");
  const [asName, setAsName] = useState("");
  const [asPath, setAsPath] = useState("");
  const [prefixos, setPrefixos] = useState<string[]>([""]);
  const [busy, setBusy] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  const lookupAs = async (asn: string) => {
    const clean = asn.replace(/^AS/i, "").trim();
    if (!/^\d+$/.test(clean)) return;
    setLookingUp(true);
    try {
      const r = await fetch(`https://rdap.registro.br/autnum/${clean}`, {
        headers: { Accept: "application/rdap+json" },
      });
      if (!r.ok) {
        // fallback RDAP global
        const r2 = await fetch(`https://rdap.arin.net/registry/autnum/${clean}`);
        if (!r2.ok) throw new Error("not found");
        const j2 = await r2.json();
        const nm = j2.name || j2.handle;
        if (nm) setAsName(nm);
        toast.success(`AS${clean}: ${nm ?? "encontrado"}`);
        return;
      }
      const j = await r.json();
      // registro.br: name = handle do AS; entidade vCard tem o nome legal
      let nome: string | undefined = j.name;
      const ent = (j.entities ?? [])[0];
      const vcard = ent?.vcardArray?.[1];
      if (Array.isArray(vcard)) {
        const fn = vcard.find((v: any) => v[0] === "fn");
        if (fn?.[3]) nome = String(fn[3]);
      }
      if (nome) setAsName(nome);
      toast.success(`AS${clean}: ${nome ?? "encontrado"}`);
      // Busca prefixos anunciados pelo AS
      await lookupPrefixos(clean);
    } catch {
      toast.error("AS não encontrado no registro.br");
    } finally {
      setLookingUp(false);
    }
  };

  const lookupPrefixos = async (asn: string) => {
    try {
      const r = await fetch(
        `https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS${asn}&min_peers_seeing=1`,
      );
      if (!r.ok) throw new Error("ripestat falhou");
      const j = await r.json();
      const list: string[] = (j?.data?.prefixes ?? [])
        .map((p: any) => String(p.prefix || "").trim())
        .filter(Boolean);
      const unique = Array.from(new Set(list));
      const v4 = unique.filter((p) => p.includes(".")).sort();
      const v6 = unique.filter((p) => p.includes(":")).sort();
      const all = [...v4, ...v6];
      if (all.length === 0) {
        toast.message("Nenhum prefixo anunciado encontrado para este AS.");
        return;
      }
      setPrefixos(all);
      toast.success(
        `${all.length} prefixo(s) carregado(s) (IPv4: ${v4.length}, IPv6: ${v6.length}).`,
      );
    } catch {
      toast.error("Falha ao consultar prefixos (RIPEstat).");
    }
  };

  const updatePrefixo = (i: number, v: string) =>
    setPrefixos((p) => p.map((x, idx) => (idx === i ? v : x)));
  const addPrefixo = () => setPrefixos((p) => [...p, ""]);
  const removePrefixo = (i: number) =>
    setPrefixos((p) => (p.length === 1 ? [""] : p.filter((_, idx) => idx !== i)));

  const gerarPdf = async () => {
    const prefList = prefixos.map((p) => p.trim()).filter(Boolean);
    if (!asNumber.trim() || !asPath.trim() || prefList.length === 0) {
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

      // Cobrir valores antigos: AS / AS-PATH e a área de prefixos (estendida)
      const prefixAreaH = Math.max(13, 14 * prefList.length + 4);
      const lines = [
        { top: 612, h: 13, x: 83, w: 435 },
        { top: 635, h: 13, x: 83, w: 435 },
        { top: 657, h: prefixAreaH, x: 83, w: 435 },
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
      prefList.forEach((p, i) => draw(p, 83, 658 + i * 14));

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
                <div className="flex gap-2">
                  <Input
                    id="asn"
                    placeholder="268199"
                    value={asNumber}
                    onChange={(e) => setAsNumber(e.target.value)}
                    onBlur={(e) => e.target.value && lookupAs(e.target.value)}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => lookupAs(asNumber)}
                    disabled={lookingUp || !asNumber.trim()}
                    title="Consultar no registro.br"
                  >
                    {lookingUp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="asname">Nome do AS</Label>
                <Input
                  id="asname"
                  placeholder="Preenchido automaticamente"
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
              <div className="flex items-center justify-between">
                <Label>PREFIXOS</Label>
                <Button type="button" variant="outline" size="sm" onClick={addPrefixo}>
                  <Plus className="h-4 w-4 mr-1" /> Adicionar
                </Button>
              </div>
              <div className="space-y-2">
                {prefixos.map((p, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      placeholder="151.246.225.0/24"
                      value={p}
                      onChange={(e) => updatePrefixo(i, e.target.value)}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => removePrefixo(i)}
                      disabled={prefixos.length === 1 && !p}
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
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