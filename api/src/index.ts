import "dotenv/config";
import path from "path";
import express from "express";
import cors from "cors";
import webhookRouter from "./routes/webhook";
import googleAuthRouter from "./routes/googleAuth";
import authRouter from "./routes/auth";
import profissionaisRouter from "./routes/profissionais";
import servicosRouter from "./routes/servicos";
import agendamentosRouter from "./routes/agendamentos";
import configuracoesRouter from "./routes/configuracoes";
import comissoesRouter from "./routes/comissoes";
import dashboardRouter from "./routes/dashboard";
import bloqueiosRouter from "./routes/bloqueios";
import listaEsperaRouter from "./routes/listaEspera";
import lembretesRouter from "./routes/lembretes";
import clientesRouter from "./routes/clientes";
import campanhasRouter from "./routes/campanhas";
import avaliarRouter from "./routes/avaliar";
import avaliacoesRouter from "./routes/avaliacoes";
import usuariosRouter from "./routes/usuarios";
import configBotRouter from "./routes/configBot";
import relatoriosRouter from "./routes/relatorios";
import { errorHandler } from "./middlewares/errorHandler";
import { iniciarJobs } from "./jobs";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Público
app.use("/webhook", webhookRouter);
app.use("/api/auth", authRouter);
app.use("/api/google", googleAuthRouter);

// Painel (autenticado via JWT no middleware de cada rota)
app.use("/api/profissionais", profissionaisRouter);
app.use("/api/servicos", servicosRouter);
app.use("/api/agendamentos", agendamentosRouter);
app.use("/api/configuracoes", configuracoesRouter);
app.use("/api/comissoes", comissoesRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/bloqueios", bloqueiosRouter);
app.use("/api/lista-espera", listaEsperaRouter);
app.use("/api/lembretes", lembretesRouter);
app.use("/api/clientes", clientesRouter);
app.use("/api/campanhas", campanhasRouter);
app.use("/api/avaliar", avaliarRouter);
app.use("/api/avaliacoes", avaliacoesRouter);
app.use("/api/usuarios", usuariosRouter);
app.use("/api/config-bot", configBotRouter);
app.use("/api/relatorios", relatoriosRouter);

app.use(errorHandler);

// Em produção, serve o build do frontend (pasta web/dist fica em ../../web/dist relativo ao dist/index.js)
if (process.env.NODE_ENV === "production") {
  const webDist = path.join(__dirname, "../../web/dist");
  app.use(express.static(webDist));
  app.get("*", (_req, res) => res.sendFile(path.join(webDist, "index.html")));
}

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`AgendaBot API rodando na porta ${PORT}`);
  });
  iniciarJobs();
}

export default app;
