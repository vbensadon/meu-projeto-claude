import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import type { AvaliarDados } from "../lib/types";

const API_BASE = "";

function Estrelas({ valor, onChange }: { valor: number; onChange?: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange?.(n)}
          onMouseEnter={() => onChange && setHover(n)}
          onMouseLeave={() => onChange && setHover(0)}
          className={`text-4xl transition-transform duration-100 ${onChange ? "hover:scale-110 cursor-pointer" : "cursor-default"} ${n <= (hover || valor) ? "text-yellow-400" : "text-ab-border"}`}
          disabled={!onChange}
        >
          ★
        </button>
      ))}
    </div>
  );
}

export default function Avaliar() {
  const { agendamentoId, token } = useParams<{ agendamentoId: string; token: string }>();
  const [dados, setDados] = useState<AvaliarDados | null>(null);
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [concluido, setConcluido] = useState(false);

  useEffect(() => {
    if (!agendamentoId || !token) return;
    axios
      .get<AvaliarDados>(`${API_BASE}/api/avaliar/${agendamentoId}/${token}`)
      .then((r) => { setDados(r.data); if (r.data.jaAvaliado) setConcluido(true); })
      .catch(() => setErro("Link inválido ou expirado."))
      .finally(() => setCarregando(false));
  }, [agendamentoId, token]);

  const enviar = async () => {
    if (nota === 0) return;
    setEnviando(true);
    try {
      await axios.post(`${API_BASE}/api/avaliar/${agendamentoId}/${token}`, { nota, comentario: comentario || undefined });
      setConcluido(true);
    } catch (e: unknown) {
      const msg = axios.isAxiosError(e) ? e.response?.data?.erro : "Erro ao enviar.";
      setErro(msg ?? "Erro ao enviar.");
    } finally { setEnviando(false); }
  };

  if (carregando) {
    return (
      <div className="min-h-screen bg-ab-bg flex items-center justify-center">
        <p className="text-ab-muted">Carregando...</p>
      </div>
    );
  }

  if (erro) {
    return (
      <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
        <div className="bg-ab-card border border-ab-border rounded-card p-8 max-w-sm w-full text-center">
          <p className="text-ab-danger text-lg font-semibold mb-2">Link inválido</p>
          <p className="text-ab-muted text-sm">{erro}</p>
        </div>
      </div>
    );
  }

  if (concluido) {
    return (
      <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
        <div className="bg-ab-card border border-ab-border rounded-card p-8 max-w-sm w-full text-center space-y-3">
          <div className="text-5xl">🎉</div>
          <h1 className="text-xl font-bold text-ab-text">Obrigado pelo feedback!</h1>
          <p className="text-ab-muted text-sm">Sua avaliação foi registrada. Até a próxima!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ab-bg flex items-center justify-center p-4">
      <div className="bg-ab-card border border-ab-border rounded-card p-8 max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-ab-accent to-ab-teal flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
            {dados?.profissional.nome.charAt(0).toUpperCase()}
          </div>
          <h1 className="text-lg font-bold text-ab-text">Como foi com {dados?.profissional.nome}?</h1>
          <p className="text-sm text-ab-muted mt-0.5">{dados?.servico.nome}</p>
        </div>

        <div className="flex justify-center">
          <Estrelas valor={nota} onChange={setNota} />
        </div>

        <div>
          <label className="text-xs text-ab-muted block mb-1.5">Comentário <span className="text-ab-muted/60">(opcional)</span></label>
          <textarea
            className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all duration-200 min-h-[80px] resize-none"
            placeholder="Conte como foi sua experiência..."
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
          />
        </div>

        <button
          onClick={enviar}
          disabled={nota === 0 || enviando}
          className="w-full bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white text-sm py-2.5 rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all duration-200"
        >
          {enviando ? "Enviando..." : "Enviar avaliação"}
        </button>

        {erro && <p className="text-sm text-ab-danger text-center">{erro}</p>}
      </div>
    </div>
  );
}
