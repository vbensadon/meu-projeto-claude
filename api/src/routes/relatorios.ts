import { Router, type Response } from "express";
import { z } from "zod";
import PDFDocument from "pdfkit";
import { prisma } from "../lib/prisma";
import { autenticar, requireRole } from "../middlewares/auth";

const router = Router();
router.use(autenticar);
router.use(requireRole("dono", "gerente"));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toCSV(rows: Record<string, unknown>[], colunas: { key: string; label: string }[]): string {
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const cabecalho = colunas.map((c) => esc(c.label)).join(",");
  const corpo = rows.map((r) => colunas.map((c) => esc(r[c.key])).join(",")).join("\n");
  return cabecalho + "\n" + corpo;
}

function enviarCSV(res: Response, csv: string, nome: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nome}"`);
  res.send("﻿" + csv); // BOM para compatibilidade com Excel
}

function criarPDF(
  res: Response,
  titulo: string,
  nomeArquivo: string,
  colunas: { label: string; width: number }[],
  linhas: string[][],
  subtitulo?: string
) {
  const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="${nomeArquivo}"`);
  doc.pipe(res);

  const larguraPagina = doc.page.width - 80; // margens
  const dataGeracao = new Date().toLocaleString("pt-BR");

  // Cabeçalho
  doc.fontSize(18).fillColor("#7C3AED").text("AgendaBot", 40, 40);
  doc.fontSize(14).fillColor("#1F2937").text(titulo, 40, 65);
  if (subtitulo) doc.fontSize(10).fillColor("#6B7280").text(subtitulo, 40, 85);
  doc.fontSize(9).fillColor("#9CA3AF").text(`Gerado em: ${dataGeracao}`, 40, subtitulo ? 100 : 85);

  doc.moveTo(40, subtitulo ? 118 : 103).lineTo(doc.page.width - 40, subtitulo ? 118 : 103).strokeColor("#E5E7EB").stroke();

  const inicioTabela = subtitulo ? 128 : 113;
  const alturaLinha = 20;
  const alturaHeader = 24;

  // Cabeçalho da tabela
  let xAtual = 40;
  doc.rect(40, inicioTabela, larguraPagina, alturaHeader).fillColor("#7C3AED").fill();
  doc.fillColor("#FFFFFF").fontSize(9);
  colunas.forEach((col) => {
    doc.text(col.label, xAtual + 4, inicioTabela + 7, { width: col.width - 8, ellipsis: true });
    xAtual += col.width;
  });

  // Linhas de dados
  let yAtual = inicioTabela + alturaHeader;
  linhas.forEach((linha, i) => {
    // Nova página se necessário
    if (yAtual + alturaLinha > doc.page.height - 40) {
      doc.addPage();
      yAtual = 40;
    }

    const bgCor = i % 2 === 0 ? "#FFFFFF" : "#F9FAFB";
    doc.rect(40, yAtual, larguraPagina, alturaLinha).fillColor(bgCor).fill();

    xAtual = 40;
    doc.fillColor("#374151").fontSize(8);
    linha.forEach((celula, j) => {
      const col = colunas[j];
      if (!col) return;
      doc.text(celula, xAtual + 4, yAtual + 5, { width: col.width - 8, ellipsis: true, lineBreak: false });
      xAtual += col.width;
    });

    // Borda inferior
    doc.moveTo(40, yAtual + alturaLinha).lineTo(doc.page.width - 40, yAtual + alturaLinha).strokeColor("#E5E7EB").lineWidth(0.5).stroke();
    yAtual += alturaLinha;
  });

  // Rodapé
  doc.fontSize(8).fillColor("#9CA3AF").text(`Total: ${linhas.length} registros`, 40, yAtual + 8);

  doc.end();
}

// ─── Parâmetro de formato ─────────────────────────────────────────────────────

const FormatoSchema = z.object({
  formato: z.enum(["csv", "pdf"]).default("csv"),
});

// ─── GET /api/relatorios/agendamentos ─────────────────────────────────────────

router.get("/agendamentos", async (req, res: Response): Promise<void> => {
  const qBase = FormatoSchema.merge(
    z.object({
      data_inicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      data_fim:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      profissional_id: z.string().optional(),
      status: z.string().optional(),
    })
  ).safeParse(req.query);

  if (!qBase.success) { res.status(400).json({ erro: "Parâmetros inválidos." }); return; }
  const { formato, data_inicio, data_fim, profissional_id, status } = qBase.data;

  const inicio = data_inicio ? new Date(`${data_inicio}T00:00:00`) : new Date(new Date().setDate(1));
  const fim    = data_fim    ? new Date(`${data_fim}T23:59:59`)    : new Date();

  const agendamentos = await prisma.agendamento.findMany({
    where: {
      tenant_id: req.tenantId,
      data_hora: { gte: inicio, lte: fim },
      ...(profissional_id && { profissional_id }),
      ...(status && { status: status as "pendente" | "confirmado" | "cancelado" | "concluido" | "nao_compareceu" }),
    },
    include: {
      profissional: { select: { nome: true } },
      servico:      { select: { nome: true, preco: true } },
    },
    orderBy: { data_hora: "asc" },
  });

  const STATUS_PT: Record<string, string> = {
    pendente: "Pendente", confirmado: "Confirmado", cancelado: "Cancelado",
    concluido: "Concluído", nao_compareceu: "Não compareceu",
  };

  if (formato === "csv") {
    const linhas = agendamentos.map((a) => ({
      data: new Date(a.data_hora).toLocaleDateString("pt-BR"),
      hora: new Date(a.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
      cliente: a.cliente_nome,
      telefone: a.cliente_telefone,
      profissional: a.profissional.nome,
      servico: a.servico.nome,
      valor: Number(a.servico.preco).toFixed(2).replace(".", ","),
      status: STATUS_PT[a.status] ?? a.status,
    }));
    const csv = toCSV(linhas, [
      { key: "data", label: "Data" },
      { key: "hora", label: "Hora" },
      { key: "cliente", label: "Cliente" },
      { key: "telefone", label: "Telefone" },
      { key: "profissional", label: "Profissional" },
      { key: "servico", label: "Serviço" },
      { key: "valor", label: "Valor (R$)" },
      { key: "status", label: "Status" },
    ]);
    enviarCSV(res, csv, `agendamentos_${data_inicio ?? "inicio"}_${data_fim ?? "fim"}.csv`);
    return;
  }

  // PDF
  const colunas = [
    { label: "Data",        width: 65 },
    { label: "Hora",        width: 45 },
    { label: "Cliente",     width: 120 },
    { label: "Profissional",width: 100 },
    { label: "Serviço",     width: 120 },
    { label: "Valor",       width: 70 },
    { label: "Status",      width: 90 },
  ];
  const larguraTotal = colunas.reduce((s, c) => s + c.width, 0);
  // Ajusta última coluna para preencher
  colunas[colunas.length - 1].width += (doc_largura_landscape() - larguraTotal);

  const linhas = agendamentos.map((a) => [
    new Date(a.data_hora).toLocaleDateString("pt-BR"),
    new Date(a.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
    a.cliente_nome,
    a.profissional.nome,
    a.servico.nome,
    `R$ ${Number(a.servico.preco).toFixed(2)}`,
    STATUS_PT[a.status] ?? a.status,
  ]);

  const subtitulo = `Período: ${inicio.toLocaleDateString("pt-BR")} a ${fim.toLocaleDateString("pt-BR")}`;
  criarPDF(res, "Relatório de Agendamentos", "agendamentos.pdf", colunas, linhas, subtitulo);
});

// ─── GET /api/relatorios/comissoes ────────────────────────────────────────────

router.get("/comissoes", async (req, res: Response): Promise<void> => {
  const q = FormatoSchema.merge(z.object({ mes: z.string().regex(/^\d{4}-\d{2}$/).optional() })).safeParse(req.query);
  if (!q.success) { res.status(400).json({ erro: "Parâmetros inválidos." }); return; }
  const { formato, mes } = q.data;

  const mesRef = mes ?? mesAtualISO();
  const [ano, mesNum] = mesRef.split("-").map(Number);
  const inicio = new Date(ano, mesNum - 1, 1);
  const fim    = new Date(ano, mesNum, 0, 23, 59, 59);

  const lancamentos = await prisma.lancamentoComissao.findMany({
    where: { tenant_id: req.tenantId, created_at: { gte: inicio, lte: fim } },
    include: {
      profissional: { select: { nome: true } },
      agendamento:  { select: { cliente_nome: true, data_hora: true, servico: { select: { nome: true } } } },
    },
    orderBy: [{ profissional: { nome: "asc" } }, { created_at: "asc" }],
  });

  if (formato === "csv") {
    const linhas = lancamentos.map((l) => ({
      data: new Date(l.agendamento.data_hora).toLocaleDateString("pt-BR"),
      profissional: l.profissional.nome,
      cliente: l.agendamento.cliente_nome,
      servico: l.agendamento.servico.nome,
      valor_bruto: Number(l.valor_bruto).toFixed(2).replace(".", ","),
      percentual: Number(l.comissao_percentual).toFixed(1).replace(".", ","),
      comissao: Number(l.comissao_valor).toFixed(2).replace(".", ","),
      pago: l.pago_em ? "Pago" : "Pendente",
    }));
    const csv = toCSV(linhas, [
      { key: "data",         label: "Data" },
      { key: "profissional", label: "Profissional" },
      { key: "cliente",      label: "Cliente" },
      { key: "servico",      label: "Serviço" },
      { key: "valor_bruto",  label: "Valor Bruto (R$)" },
      { key: "percentual",   label: "% Comissão" },
      { key: "comissao",     label: "Comissão (R$)" },
      { key: "pago",         label: "Status" },
    ]);
    enviarCSV(res, csv, `comissoes_${mesRef}.csv`);
    return;
  }

  const colunas = [
    { label: "Data",         width: 65 },
    { label: "Profissional", width: 110 },
    { label: "Cliente",      width: 110 },
    { label: "Serviço",      width: 110 },
    { label: "Valor Bruto",  width: 80 },
    { label: "% Comissão",   width: 70 },
    { label: "Comissão",     width: 80 },
    { label: "Status",       width: 75 },
  ];
  const linhas = lancamentos.map((l) => [
    new Date(l.agendamento.data_hora).toLocaleDateString("pt-BR"),
    l.profissional.nome,
    l.agendamento.cliente_nome,
    l.agendamento.servico.nome,
    `R$ ${Number(l.valor_bruto).toFixed(2)}`,
    `${Number(l.comissao_percentual).toFixed(1)}%`,
    `R$ ${Number(l.comissao_valor).toFixed(2)}`,
    l.pago_em ? "Pago" : "Pendente",
  ]);
  const [a, m] = mesRef.split("-").map(Number);
  const mesNome = new Date(a, m - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  criarPDF(res, "Relatório de Comissões", `comissoes_${mesRef}.pdf`, colunas, linhas, `Mês: ${mesNome}`);
});

// ─── GET /api/relatorios/clientes ─────────────────────────────────────────────

router.get("/clientes", async (req, res: Response): Promise<void> => {
  const q = FormatoSchema.safeParse(req.query);
  if (!q.success) { res.status(400).json({ erro: "Parâmetros inválidos." }); return; }
  const { formato } = q.data;

  const clientes = await prisma.cliente.findMany({
    where: { tenant_id: req.tenantId },
    orderBy: { nome: "asc" },
  });

  const FONTE_PT: Record<string, string> = { whatsapp: "WhatsApp", manual: "Manual", presencial: "Presencial" };

  if (formato === "csv") {
    const linhas = clientes.map((c) => ({
      nome:        c.nome,
      telefone:    c.telefone,
      aniversario: c.aniversario ? new Date(c.aniversario).toLocaleDateString("pt-BR") : "",
      fonte:       FONTE_PT[c.fonte] ?? c.fonte,
      notas:       c.notas ?? "",
      created_at:  new Date(c.created_at).toLocaleDateString("pt-BR"),
    }));
    const csv = toCSV(linhas, [
      { key: "nome",        label: "Nome" },
      { key: "telefone",    label: "Telefone" },
      { key: "aniversario", label: "Aniversário" },
      { key: "fonte",       label: "Origem" },
      { key: "notas",       label: "Notas" },
      { key: "created_at",  label: "Cadastrado em" },
    ]);
    enviarCSV(res, csv, `clientes_${new Date().toISOString().slice(0, 10)}.csv`);
    return;
  }

  const colunas = [
    { label: "Nome",         width: 160 },
    { label: "Telefone",     width: 110 },
    { label: "Aniversário",  width: 90 },
    { label: "Origem",       width: 90 },
    { label: "Notas",        width: 190 },
    { label: "Cadastrado em",width: 90 },
  ];
  const linhas = clientes.map((c) => [
    c.nome,
    c.telefone,
    c.aniversario ? new Date(c.aniversario).toLocaleDateString("pt-BR") : "—",
    FONTE_PT[c.fonte] ?? c.fonte,
    c.notas ?? "—",
    new Date(c.created_at).toLocaleDateString("pt-BR"),
  ]);
  criarPDF(res, "Relatório de Clientes", `clientes_${new Date().toISOString().slice(0, 10)}.pdf`, colunas, linhas);
});

// largura da página A4 landscape minus margens
function doc_largura_landscape() {
  return 841.89 - 80; // A4 landscape width minus 40px each side
}

function mesAtualISO() {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
}

export default router;
