import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import type { Usuario, RoleUsuario, Profissional } from "../lib/types";

const ROLES: { value: Exclude<RoleUsuario, "dono">; label: string; descricao: string }[] = [
  { value: "gerente", label: "Gerente", descricao: "Acesso total, exceto configurações de pagamento" },
  { value: "recepcionista", label: "Recepcionista", descricao: "Agenda e clientes, sem acesso financeiro" },
  { value: "barbeiro", label: "Barbeiro", descricao: "Somente a própria agenda" },
];

const ROLE_COR: Record<RoleUsuario, string> = {
  dono: "bg-ab-accent/15 text-ab-accent",
  gerente: "bg-blue-500/15 text-blue-400",
  recepcionista: "bg-ab-teal/15 text-ab-teal",
  barbeiro: "bg-yellow-500/15 text-yellow-400",
};

function ModalConvidar({ profissionais, onSalvar, onFechar }: {
  profissionais: Profissional[];
  onSalvar: (link: string, nome: string) => void;
  onFechar: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Exclude<RoleUsuario, "dono">>("barbeiro");
  const [profissionalId, setProfissionalId] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const enviar = async () => {
    if (!nome.trim() || !email.trim()) { setErro("Nome e e-mail são obrigatórios."); return; }
    setSalvando(true); setErro("");
    try {
      const r = await api.post<{ usuario: { nome: string }; link: string }>("/usuarios/convidar", {
        nome: nome.trim(), email: email.trim(), role,
        profissional_id: role === "barbeiro" && profissionalId ? profissionalId : null,
      });
      onSalvar(r.data.link, r.data.usuario.nome);
    } catch (e) {
      const msg = (e as { response?: { data?: { erro?: string } } }).response?.data?.erro;
      setErro(msg ?? "Erro ao criar convite.");
    } finally { setSalvando(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onFechar} />
      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-ab-border">
          <h2 className="text-base font-semibold text-ab-text">Convidar membro</h2>
          <button onClick={onFechar} className="text-ab-muted hover:text-ab-text transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Nome</label>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome completo"
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">E-mail</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com"
              className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text placeholder-ab-muted/50 focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all" />
          </div>
          <div>
            <label className="text-xs font-medium text-ab-muted block mb-1.5">Perfil de acesso</label>
            <div className="space-y-2">
              {ROLES.map((r) => (
                <label key={r.value} className={`flex items-start gap-3 p-3 rounded-input border cursor-pointer transition-all ${role === r.value ? "border-ab-accent bg-ab-accent/10" : "border-ab-border hover:border-ab-accent/50"}`}>
                  <input type="radio" className="mt-0.5 accent-ab-accent" checked={role === r.value} onChange={() => setRole(r.value)} />
                  <div>
                    <p className="text-sm font-medium text-ab-text">{r.label}</p>
                    <p className="text-xs text-ab-muted">{r.descricao}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
          {role === "barbeiro" && (
            <div>
              <label className="text-xs font-medium text-ab-muted block mb-1.5">Vincular ao profissional <span className="text-ab-muted/60">(opcional)</span></label>
              <select value={profissionalId} onChange={(e) => setProfissionalId(e.target.value)}
                className="w-full bg-ab-bg border border-ab-border rounded-input px-3.5 py-2.5 text-sm text-ab-text focus:outline-none focus:ring-2 focus:ring-ab-accent focus:border-transparent transition-all">
                <option value="">Não vincular</option>
                {profissionais.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}
          {erro && <p className="text-xs text-ab-danger">{erro}</p>}
        </div>
        <div className="flex gap-3 p-5 border-t border-ab-border">
          <button onClick={onFechar} className="flex-1 px-4 py-2.5 text-sm text-ab-muted border border-ab-border rounded-input hover:bg-ab-hover transition-colors">Cancelar</button>
          <button onClick={enviar} disabled={salvando}
            className="flex-1 px-4 py-2.5 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 disabled:opacity-60 transition-all">
            {salvando ? "Gerando..." : "Gerar link de convite"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DrawerLink({ link, nome, onFechar }: { link: string; nome: string; onFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  const copiar = async () => {
    await navigator.clipboard.writeText(link);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2000);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onFechar} />
      <div className="relative bg-ab-card border border-ab-border rounded-card w-full max-w-md shadow-2xl p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl mb-2">🔗</div>
          <h2 className="text-base font-semibold text-ab-text">Link de convite gerado</h2>
          <p className="text-xs text-ab-muted mt-1">Envie para <strong>{nome}</strong> ativar a conta</p>
        </div>
        <div className="bg-ab-bg border border-ab-border rounded-input p-3 text-xs text-ab-text break-all font-mono">{link}</div>
        <div className="flex gap-3">
          <button onClick={copiar} className="flex-1 py-2.5 text-sm border border-ab-border rounded-input text-ab-muted hover:text-ab-text hover:bg-ab-hover transition-colors">
            {copiado ? "✓ Copiado!" : "Copiar link"}
          </button>
          <button onClick={onFechar} className="flex-1 py-2.5 text-sm bg-ab-accent text-white rounded-input font-medium hover:bg-ab-accent-hover transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  );
}

export default function Equipe() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [profissionais, setProfissionais] = useState<Profissional[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [modal, setModal] = useState(false);
  const [linkConvite, setLinkConvite] = useState<{ link: string; nome: string } | null>(null);
  const [alterandoRole, setAlterandoRole] = useState<string | null>(null);
  const [alterandoStatus, setAlterandoStatus] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [u, p] = await Promise.all([
        api.get<{ usuarios: Usuario[] }>("/usuarios"),
        api.get<Profissional[]>("/profissionais"),
      ]);
      setUsuarios(u.data.usuarios);
      setProfissionais(p.data);
    } finally { setCarregando(false); }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const alterarRole = async (id: string, role: RoleUsuario) => {
    setAlterandoRole(id);
    try { await api.patch(`/usuarios/${id}/role`, { role }); await carregar(); }
    finally { setAlterandoRole(null); }
  };

  const alterarStatus = async (id: string, ativo: boolean) => {
    if (!confirm(ativo ? "Reativar acesso deste usuário?" : "Desativar acesso deste usuário?")) return;
    setAlterandoStatus(id);
    try { await api.patch(`/usuarios/${id}/status`, { ativo }); await carregar(); }
    finally { setAlterandoStatus(null); }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-ab-text">Equipe</h1>
          <p className="text-sm text-ab-muted mt-0.5">Gerencie membros e permissões de acesso ao painel</p>
        </div>
        <button
          onClick={() => setModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm bg-gradient-to-r from-ab-accent to-ab-accent-hover text-white rounded-input font-medium hover:shadow-lg hover:shadow-ab-accent/25 transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Convidar membro
        </button>
      </div>

      <div className="bg-ab-card border border-ab-border rounded-card overflow-x-auto">
        {carregando ? (
          <p className="p-8 text-center text-ab-muted">Carregando...</p>
        ) : usuarios.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <p className="text-ab-muted">Nenhum membro convidado ainda.</p>
            <p className="text-xs text-ab-muted/60">O proprietário do estabelecimento tem acesso total.</p>
          </div>
        ) : (
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-ab-border text-left text-ab-muted">
                <th className="px-5 py-3 font-medium">Membro</th>
                <th className="px-5 py-3 font-medium">Perfil</th>
                <th className="px-5 py-3 font-medium">Vinculado a</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ab-border/50">
              {usuarios.map((u) => (
                <tr key={u.id} className="hover:bg-ab-hover/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ab-accent/60 to-ab-teal/60 flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {u.nome.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-medium text-ab-text">{u.nome}</p>
                        <p className="text-xs text-ab-muted">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <select
                      value={u.role}
                      onChange={(e) => alterarRole(u.id, e.target.value as RoleUsuario)}
                      disabled={alterandoRole === u.id}
                      className={`text-xs px-2 py-1 rounded-full font-medium border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-ab-accent ${ROLE_COR[u.role]}`}
                    >
                      {ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </td>
                  <td className="px-5 py-3.5 text-ab-muted text-xs">
                    {u.profissional?.nome ?? <span className="italic text-ab-muted/50">—</span>}
                  </td>
                  <td className="px-5 py-3.5">
                    {u.convite_pendente ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400">Convite pendente</span>
                    ) : u.ativo ? (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Ativo</span>
                    ) : (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-ab-muted/20 text-ab-muted">Inativo</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <button
                      onClick={() => alterarStatus(u.id, !u.ativo)}
                      disabled={alterandoStatus === u.id}
                      className={`text-xs transition-colors disabled:opacity-50 ${u.ativo ? "text-ab-danger hover:text-ab-danger/80" : "text-ab-accent hover:text-ab-accent/80"}`}
                    >
                      {alterandoStatus === u.id ? "..." : u.ativo ? "Desativar" : "Reativar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {modal && (
        <ModalConvidar
          profissionais={profissionais}
          onSalvar={(link, nome) => { setModal(false); setLinkConvite({ link, nome }); carregar(); }}
          onFechar={() => setModal(false)}
        />
      )}
      {linkConvite && <DrawerLink link={linkConvite.link} nome={linkConvite.nome} onFechar={() => setLinkConvite(null)} />}
    </div>
  );
}
