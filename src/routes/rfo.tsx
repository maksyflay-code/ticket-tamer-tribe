import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { requireAuth } from "@/lib/guard";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { Download, ImagePlus, X, FileText } from "lucide-react";
import jsPDF from "jspdf";
import logoUrl from "@/assets/ivi-rfo-logo.jpg";

export const Route = createFileRoute("/rfo")({
  beforeLoad: requireAuth,
  component: RfoPage,
});

type RfoForm = {
  cliente: string;
  data: string; // yyyy-mm-dd
  inicio: string; // HH:MM
  fim: string; // HH:MM
  trecho: string;
  descricao: string;
  solucao: string;
  localizacao: string;
  responsavel: string;
  responsavelArea: string;
  responsavelEmail: string;
};

type FotoItem = { name: string; dataUrl: string };

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();
  return await fileToDataUrl(new File([blob], "logo"));
}

function formatDataBr(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

function RfoPage() {
  const { user } = useAuth();
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState<RfoForm>({
    cliente: "",
    data: today,
    inicio: "",
    fim: "",
    trecho: "",
    descricao: "",
    solucao: "",
    localizacao: "",
    responsavel: "",
    responsavelArea: "CSM – Central de Suporte e Monitoramento",
    responsavelEmail: user?.email ?? "",
  });
  const [fotos, setFotos] = useState<FotoItem[]>([]);
  const [generating, setGenerating] = useState(false);

  const onFotos = async (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).filter((f) => f.type.startsWith("image/"));
    const items: FotoItem[] = [];
    for (const f of arr) {
      try {
        items.push({ name: f.name, dataUrl: await fileToDataUrl(f) });
      } catch {
        toast.error(`Falha ao ler ${f.name}`);
      }
    }
    setFotos((prev) => [...prev, ...items]);
  };

  const removeFoto = (i: number) => setFotos((prev) => prev.filter((_, idx) => idx !== i));

  const generate = async () => {
    if (!form.cliente.trim()) return toast.error("Informe o cliente");
    if (!form.descricao.trim()) return toast.error("Informe a descrição do evento");
    setGenerating(true);
    try {
      const doc = new jsPDF({ unit: "pt", format: "a4" });
      const pageW = doc.internal.pageSize.getWidth();
      const pageH = doc.internal.pageSize.getHeight();
      const margin = 40;
      let y = margin;

      // Logo
      try {
        const logoData = await urlToDataUrl(logoUrl);
        doc.addImage(logoData, "JPEG", margin, y, 90, 50, undefined, "FAST");
      } catch {
        // continua sem logo
      }

      // Cabeçalho
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(20, 20, 20);
      doc.text("Reason For Outage – RFO", pageW - margin, y + 25, { align: "right" });
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(120);
      doc.text("IVI Tecnologia e Comunicação LTDA", pageW - margin, y + 42, { align: "right" });
      y += 70;

      doc.setDrawColor(220);
      doc.line(margin, y, pageW - margin, y);
      y += 16;

      // Tabela de dados
      const rows: [string, string][] = [
        ["CLIENTE", form.cliente],
        ["DATA", formatDataBr(form.data)],
        ["TEMPO DE EVENTO", `Início: ${form.inicio || "—"}    Fim: ${form.fim || "—"}`],
        ["TRECHO DO EVENTO", form.trecho || "—"],
      ];
      const labelW = 160;
      const rowH = 28;
      doc.setFontSize(10);
      rows.forEach(([k, v]) => {
        doc.setFillColor(245, 245, 248);
        doc.rect(margin, y, labelW, rowH, "F");
        doc.setDrawColor(225);
        doc.rect(margin, y, pageW - margin * 2, rowH);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(40);
        doc.text(k, margin + 10, y + 17);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(20);
        const text = doc.splitTextToSize(v, pageW - margin * 2 - labelW - 20);
        doc.text(text, margin + labelW + 10, y + 17);
        y += rowH;
      });
      y += 18;

      const section = (title: string, body: string) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.setTextColor(180, 0, 0);
        doc.text(title, margin, y);
        y += 14;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(20);
        const lines = doc.splitTextToSize(body || "—", pageW - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 13 + 14;
        if (y > pageH - 120) { doc.addPage(); y = margin; }
      };

      section("DESCRIÇÃO DO EVENTO:", form.descricao);
      section("SOLUÇÃO:", form.solucao);
      section("LOCALIZAÇÃO:", form.localizacao);

      // Responsável
      if (y > pageH - 120) { doc.addPage(); y = margin; }
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(20);
      doc.text("Responsável pelo acompanhamento:", margin, y); y += 14;
      doc.setFont("helvetica", "bold");
      doc.text(form.responsavel || "—", margin, y); y += 13;
      doc.setFont("helvetica", "normal");
      doc.setTextColor(80);
      if (form.responsavelArea) { doc.text(form.responsavelArea, margin, y); y += 13; }
      if (form.responsavelEmail) { doc.text(form.responsavelEmail, margin, y); y += 13; }
      y += 6;

      // Fotos
      if (fotos.length > 0) {
        doc.addPage();
        y = margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(20);
        doc.text("Registros fotográficos", margin, y);
        y += 20;
        const colW = (pageW - margin * 2 - 12) / 2;
        const imgH = 180;
        let col = 0;
        for (const foto of fotos) {
          if (y + imgH > pageH - margin) { doc.addPage(); y = margin; col = 0; }
          const x = margin + col * (colW + 12);
          try {
            const ext = foto.dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
            doc.addImage(foto.dataUrl, ext, x, y, colW, imgH, undefined, "FAST");
            doc.setDrawColor(220);
            doc.rect(x, y, colW, imgH);
            doc.setFontSize(8);
            doc.setTextColor(110);
            doc.text(foto.name.slice(0, 60), x + 2, y + imgH + 10);
          } catch {
            // ignore
          }
          col++;
          if (col >= 2) { col = 0; y += imgH + 24; }
        }
      }

      // Rodapé em todas as páginas
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(140);
        doc.text("IVI Tecnologia e Comunicação LTDA  |  www.ivitlm.com.br", pageW / 2, pageH - 18, { align: "center" });
        doc.text(`${i}/${pages}`, pageW - margin, pageH - 18, { align: "right" });
      }

      const filename = `RFO_${(form.cliente || "cliente").replace(/\s+/g, "_")}_${form.data.replaceAll("-", "")}.pdf`;
      doc.save(filename);
      toast.success("RFO gerado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao gerar PDF");
    } finally {
      setGenerating(false);
    }
  };

  const setF = <K extends keyof RfoForm>(k: K, v: RfoForm[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <AppShell title="Gerar RFO">
      <div className="max-w-4xl">
        <div className="flex items-center gap-3 mb-6">
          <FileText className="h-5 w-5 text-primary" />
          <p className="text-sm text-muted-foreground">
            Preencha os dados do evento e gere um relatório RFO em PDF.
          </p>
        </div>

        <div className="border border-border bg-card p-4 md:p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Cliente *">
              <input value={form.cliente} onChange={(e) => setF("cliente", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Data">
              <input type="date" value={form.data} onChange={(e) => setF("data", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Início">
              <input type="time" value={form.inicio} onChange={(e) => setF("inicio", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Fim">
              <input type="time" value={form.fim} onChange={(e) => setF("fim", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Trecho do evento" className="md:col-span-2">
              <input value={form.trecho} onChange={(e) => setF("trecho", e.target.value)} placeholder="Ex: TELXIUS X THOME" className={inputCls} />
            </Field>
            <Field label="Localização" className="md:col-span-2">
              <input value={form.localizacao} onChange={(e) => setF("localizacao", e.target.value)} placeholder="Endereço, coordenadas, ID de poste…" className={inputCls} />
            </Field>
            <Field label="Descrição do evento *" className="md:col-span-2">
              <textarea rows={4} value={form.descricao} onChange={(e) => setF("descricao", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Solução" className="md:col-span-2">
              <textarea rows={4} value={form.solucao} onChange={(e) => setF("solucao", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Responsável pelo acompanhamento">
              <input value={form.responsavel} onChange={(e) => setF("responsavel", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Área / função">
              <input value={form.responsavelArea} onChange={(e) => setF("responsavelArea", e.target.value)} className={inputCls} />
            </Field>
            <Field label="E-mail do responsável" className="md:col-span-2">
              <input type="email" value={form.responsavelEmail} onChange={(e) => setF("responsavelEmail", e.target.value)} className={inputCls} />
            </Field>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono mb-2">Fotos</div>
            <label className="block border border-dashed border-border bg-background hover:bg-secondary/30 cursor-pointer p-4 text-center text-xs text-muted-foreground font-mono">
              <ImagePlus className="h-4 w-4 inline mr-2" />
              Anexar fotos
              <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => { onFotos(e.target.files); e.target.value = ""; }} />
            </label>
            {fotos.length > 0 && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                {fotos.map((f, i) => (
                  <div key={i} className="relative border border-border bg-background">
                    <img src={f.dataUrl} alt={f.name} className="w-full h-28 object-cover" />
                    <button onClick={() => removeFoto(i)} className="absolute top-1 right-1 bg-background/90 border border-border p-1 hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                    <div className="text-[10px] font-mono px-2 py-1 truncate">{f.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2">
            <button
              disabled={generating}
              onClick={generate}
              className="bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold uppercase tracking-wider flex items-center gap-2 hover:opacity-90 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {generating ? "Gerando…" : "Gerar PDF"}
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

const inputCls = "mt-1 w-full bg-background border border-border px-3 py-2 text-sm focus:outline-none focus:border-primary";

function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-mono">{label}</label>
      {children}
    </div>
  );
}