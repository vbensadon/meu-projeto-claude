import { prisma } from "../lib/prisma";

interface LancamentoResult {
  regra_id: string | null;
  valor_bruto: number;
  comissao_percentual: number;
  comissao_valor: number;
}

export async function calcularERegistrarComissao(
  tenantId: string,
  agendamentoId: string,
  profissionalId: string,
  servicoId: string,
  valorBruto: number
): Promise<void> {
  // Idempotente — não cria duplicata se já existir
  const existente = await prisma.lancamentoComissao.findUnique({ where: { agendamento_id: agendamentoId } });
  if (existente) return;

  const resultado = await resolverRegra(tenantId, profissionalId, servicoId, valorBruto);

  await prisma.lancamentoComissao.create({
    data: {
      tenant_id: tenantId,
      profissional_id: profissionalId,
      agendamento_id: agendamentoId,
      regra_id: resultado.regra_id,
      valor_bruto: resultado.valor_bruto,
      comissao_percentual: resultado.comissao_percentual,
      comissao_valor: resultado.comissao_valor,
    },
  });
}

// Comissão para agendamento com múltiplos serviços: resolve a regra POR serviço
// e soma num único lançamento (mantém o @unique de agendamento_id).
export async function calcularERegistrarComissaoMulti(
  tenantId: string,
  agendamentoId: string,
  profissionalId: string,
  itens: { servicoId: string; preco: number }[]
): Promise<void> {
  const existente = await prisma.lancamentoComissao.findUnique({ where: { agendamento_id: agendamentoId } });
  if (existente) return;
  if (itens.length === 0) return;

  const resultados = await Promise.all(
    itens.map((it) => resolverRegra(tenantId, profissionalId, it.servicoId, it.preco))
  );

  const valorBruto = resultados.reduce((s, r) => s + r.valor_bruto, 0);
  const comissaoValor = Math.round(resultados.reduce((s, r) => s + r.comissao_valor, 0) * 100) / 100;
  // percentual efetivo (comissão / bruto) — regra_id fica nulo pois pode haver várias regras
  const pctEfetivo = valorBruto > 0 ? Math.round((comissaoValor / valorBruto) * 100 * 100) / 100 : 0;
  // se todos os itens usaram a mesma regra, preserva o id
  const regraUnica = resultados.every((r) => r.regra_id === resultados[0].regra_id) ? resultados[0].regra_id : null;

  await prisma.lancamentoComissao.create({
    data: {
      tenant_id: tenantId,
      profissional_id: profissionalId,
      agendamento_id: agendamentoId,
      regra_id: regraUnica,
      valor_bruto: valorBruto,
      comissao_percentual: pctEfetivo,
      comissao_valor: comissaoValor,
    },
  });
}

async function resolverRegra(
  tenantId: string,
  profissionalId: string,
  servicoId: string,
  valorBruto: number
): Promise<LancamentoResult> {
  // 1. Regra específica: profissional + serviço
  const regraEspecifica = await prisma.regraComissao.findFirst({
    where: { tenant_id: tenantId, profissional_id: profissionalId, servico_id: servicoId },
  });
  if (regraEspecifica) {
    return aplicarRegra(regraEspecifica.id, regraEspecifica.tipo, Number(regraEspecifica.valor), valorBruto);
  }

  // 2. Regra genérica: profissional sem serviço específico
  const regraGenerica = await prisma.regraComissao.findFirst({
    where: { tenant_id: tenantId, profissional_id: profissionalId, servico_id: null },
  });
  if (regraGenerica) {
    return aplicarRegra(regraGenerica.id, regraGenerica.tipo, Number(regraGenerica.valor), valorBruto);
  }

  // 3. Fallback: comissao_percentual do profissional
  const profissional = await prisma.profissional.findUnique({
    where: { id: profissionalId },
    select: { comissao_percentual: true },
  });
  const pct = Number(profissional?.comissao_percentual ?? 0);
  return {
    regra_id: null,
    valor_bruto: valorBruto,
    comissao_percentual: pct,
    comissao_valor: Math.round(((valorBruto * pct) / 100) * 100) / 100,
  };
}

function aplicarRegra(
  regraId: string,
  tipo: "percentual" | "fixo",
  valor: number,
  valorBruto: number
): LancamentoResult {
  if (tipo === "percentual") {
    const comissaoValor = Math.round(((valorBruto * valor) / 100) * 100) / 100;
    return { regra_id: regraId, valor_bruto: valorBruto, comissao_percentual: valor, comissao_valor: comissaoValor };
  }
  // fixo
  const pctDerivado = valorBruto > 0 ? Math.round(((valor / valorBruto) * 100) * 100) / 100 : 0;
  return { regra_id: regraId, valor_bruto: valorBruto, comissao_percentual: pctDerivado, comissao_valor: valor };
}
