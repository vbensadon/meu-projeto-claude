import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { ListaEspera as ListaEsperaItem } from "../lib/types";

const STATUS_LABEL: Record<ListaEsperaItem["status"], string> = {
  aguardando: "Aguardando",
  notificado: "Notificado",
  convertido: "Convertido",
  expirado: "Expirado",
};

const STATUS_BADGE: Record<ListaEsperaItem["status"], string> = {
  aguardando: "bg-yellow-500/15 text-yellow-400",
  notificado: "bg-ab-accent/15 text-ab-accent",
  convertido: "bg-ab-teal/15 text-ab-teal",
  expirado: "bg-ab-muted/15 text-ab-muted",
};

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

function tempoNaFila(criadoEmIso: string): string {
  const minutos = Math.floor((Date.now() - new Date(criadoEmIso).getTime()) / 60_000);
  if (minutos < 60) return `${minutos}min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `${horas}h`;
  const dias = Math.floor(horas / 24);
  return `${dias}d`;
}

function ehHoje(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const hoje = new Date();
  return d.toDateString() === hoje.toDateString();
}

function ehMesAtual(iso: string): boolean {
  const d = new Date(iso);
  const hoje = new Date();
  return d.getMonth() === hoje.getMonth() && d.getFullYear() === hoje.getFullYear();
}

export default function ListaEspera() {
  const [lista, setLista] = useState<ListaEsperaItem[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erro, setErro] = useState("");

  const carregar = () => {
    setCarregando(true);
    return api
      .get<ListaEsperaItem[]>("/lista-espera")
      .then((r) => setLista(r.data))
      .finally(() => setCarregando(false));
  };

  useEffect(() => { carregar(); }, []);

  const remover = async (id: string) => {
    if (!confirm("Remover este cliente da fila de espera?")) return;
    setRemovendo(id);
    setErro("");
    try {
      await api.delete(`/lista-espera/${id}`);
      await carregar();
    } catch {
      setErro("Erro ao remover da fila de espera.");
    } finally {
      setRemovendo(null);
    }
  };

  const totalNaFila = lista.filter((l) => l.status === "aguardando").length;
  const notificadosHoje = lista.filter((l) => l.status !== "aguardando" && ehHoje(l.notificado_em)).length;
  const convertidosMes = lista.filter((l) => l.status === "convertido" && ehMesAtual(l.created_at)).length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <h1 className="text-xl font-bold text-ab-text mb-6">Fila de espera</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-ab-card border border-ab-border rounded-card p-5">
          <p className="text-sm text-ab-muted">Total na fila</p>
          <p className="text-2xl font-bold text-ab-text mt-1">{totalNaFila}</p>
        </div>
        <div className="bg-ab-card border border-ab-border rounded-card p-5">
          <p className="text-sm text-ab-muted">Notificados hoje</p>
          <p className="text-2xl font-bold text-ab-text mt-1">{notificadosHoje}</p>
        </div>
        <div className="bg-ab-card border border-ab-border rounded-card p-5">
          <p className="text-sm text-ab-muted">Convertidos no mês</p>
          <p className="text-2xl font-bold text-ab-teal mt-1">{convertidosMes}</p>
        </div>
      </div>

      {erro && <p className="text-ab-danger text-sm mb-4">{erro}</p>}

      <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
        {carregando ? (
          <p className="p-8 text-center text-ab-muted text-sm">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="p-8 text-center text-ab-muted text-sm">Nenhum cliente na fila de espera.</p>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-ab-border text-left text-ab-muted">
                <th className="px-5 py-3 font-medium">Cliente</th>
                <th className="px-5 py-3 font-medium">Serviço</th>
                <th className="px-5 py-3 font-medium">Profissional</th>
                <th className="px-5 py-3 font-medium">Data desejada</th>
                <th className="px-5 py-3 font-medium">Na fila há</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ab-border/50">
              {lista.map((l) => (
                <tr key={l.id} className="hover:bg-ab-hover/50 transition-colors duration-150">
                  <td className="px-5 py-3.5 font-medium text-ab-text whitespace-nowrap">{l.cliente_nome}</td>
                  <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{l.servico.nome}</td>
                  <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{l.profissional?.nome ?? "Qualquer"}</td>
                  <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{formatarData(l.data_desejada)}</td>
                  <td className="px-5 py-3.5 text-ab-muted whitespace-nowrap">{tempoNaFila(l.created_at)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block text-xs px-2 py-0.5 rounded-full font-medium whitespace-nowrap ${STATUS_BADGE[l.status]}`}>
                      {STATUS_LABEL[l.status]}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => remover(l.id)}
                      disabled={removendo === l.id}
                      className="text-xs px-3 py-1.5 rounded-input border border-ab-border text-ab-muted hover:text-ab-danger hover:border-ab-danger/40 disabled:opacity-60 transition-all duration-200 whitespace-nowrap"
                    >
                      {removendo === l.id ? "Removendo..." : "Remover"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
