import { useState } from "react";
import { baixarRelatorio } from "../lib/exportar";

interface Props {
  urlBase: string;             // ex: "/relatorios/agendamentos"
  params?: Record<string, string>; // query params dinâmicos
  nomeBase: string;            // ex: "agendamentos"
  className?: string;
}

export default function BotaoExportar({ urlBase, params = {}, nomeBase, className = "" }: Props) {
  const [aberto, setAberto] = useState(false);
  const [baixando, setBaixando] = useState<"csv" | "pdf" | null>(null);

  const baixar = async (formato: "csv" | "pdf") => {
    setBaixando(formato);
    setAberto(false);
    try {
      const qs = new URLSearchParams({ ...params, formato }).toString();
      const ext = formato === "csv" ? "csv" : "pdf";
      await baixarRelatorio(`${urlBase}?${qs}`, `${nomeBase}.${ext}`);
    } catch {
      alert("Erro ao exportar relatório.");
    } finally {
      setBaixando(null);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={() => setAberto((v) => !v)}
        disabled={baixando !== null}
        className="flex items-center gap-2 px-3.5 py-2 text-sm border border-ab-border text-ab-muted hover:text-ab-text hover:bg-ab-hover rounded-input transition-all disabled:opacity-50"
      >
        {baixando ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {baixando ? "Exportando..." : "Exportar"}
        {!baixando && (
          <svg className={`w-3.5 h-3.5 transition-transform ${aberto ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {aberto && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setAberto(false)} />
          <div className="absolute right-0 mt-1 z-40 bg-ab-card border border-ab-border rounded-input shadow-xl shadow-black/20 py-1 min-w-[130px]">
            {(["csv", "pdf"] as const).map((fmt) => (
              <button
                key={fmt}
                onClick={() => baixar(fmt)}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-ab-muted hover:text-ab-text hover:bg-ab-hover transition-colors text-left"
              >
                <span className={`text-xs font-bold font-mono px-1.5 py-0.5 rounded ${fmt === "csv" ? "bg-green-500/15 text-green-400" : "bg-red-500/15 text-red-400"}`}>
                  {fmt.toUpperCase()}
                </span>
                {fmt === "csv" ? "Planilha CSV" : "Documento PDF"}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
