import type { LiberacaoMesa, Pedido, Servico } from "./types";

export interface GrupoMesa {
  /** null quando é o grupo atual (ainda aberto) */
  fim: string | null;
  inicio: string | null;
  pedidos: Pedido[];
  total: number;
}

const ativo = (p: Pedido) => p.status !== "cancelado" && p.status !== "expirado";

/** Momento que vale para a turma: quando foi trocado de mesa, ou quando foi criado. */
export const momento = (x: { criado_em: string; movido_em?: string | null }) =>
  x.movido_em ?? x.criado_em;

/** Divide os pedidos de uma mesa em grupos, separados pelas liberações. */
export function gruposDaMesa(
  pedidos: Pedido[],
  liberacoes: LiberacaoMesa[],
  mesaId: string,
): { atual: GrupoMesa; anteriores: GrupoMesa[] } {
  const daMesa = pedidos
    .filter((p) => p.mesa_id === mesaId && ativo(p))
    .sort((a, b) => momento(a).localeCompare(momento(b)));
  const cortes = liberacoes
    .filter((l) => l.mesa_id === mesaId)
    .map((l) => l.liberada_em)
    .sort((a, b) => a.localeCompare(b));

  const montar = (lista: Pedido[], fim: string | null): GrupoMesa => ({
    fim,
    inicio: lista[0] ? momento(lista[0]) : null,
    pedidos: lista,
    total: lista.reduce((s, p) => s + p.total, 0),
  });

  const anteriores: GrupoMesa[] = [];
  let restante = daMesa;
  for (const corte of cortes) {
    const dentro = restante.filter((p) => momento(p) < corte);
    restante = restante.filter((p) => momento(p) >= corte);
    if (dentro.length) anteriores.push(montar(dentro, corte));
  }

  return { atual: montar(restante, null), anteriores };
}

/** Momento em que o grupo atual da mesa começou (null se a mesa está livre). */
export function inicioDoGrupo(pedidos: Pedido[], liberacoes: LiberacaoMesa[], mesaId: string) {
  return gruposDaMesa(pedidos, liberacoes, mesaId).atual.inicio;
}

/** true quando o pedido é o primeiro do grupo atual da mesa. */
export function abreGrupo(pedido: Pedido, pedidos: Pedido[], liberacoes: LiberacaoMesa[]) {
  const { atual } = gruposDaMesa(pedidos, liberacoes, pedido.mesa_id);
  return atual.pedidos[0]?.id === pedido.id;
}

/** Só os grupos anteriores que começaram hoje. */
export function anterioresDeHoje(anteriores: GrupoMesa[]) {
  const hoje = new Date().toDateString();
  return anteriores.filter((g) => g.inicio && new Date(g.inicio).toDateString() === hoje);
}

/** Conta e serviço da turma atual da mesa (mesma regra do servidor). */
export function resumoDaMesa(
  pedidos: Pedido[],
  liberacoes: LiberacaoMesa[],
  servicos: Servico[],
  mesaId: string,
  percentualServico: number,
) {
  const { atual } = gruposDaMesa(pedidos, liberacoes, mesaId);
  const confirmados = atual.pedidos.filter((p) => p.pago || p.status !== "novo");
  const naConta = atual.pedidos.filter((p) => p.na_conta && !p.pago && p.status !== "novo");
  const consumo = confirmados.reduce((s, p) => s + p.total - p.gorjeta, 0);
  const desde = atual.inicio;
  const pagoServico = servicos
    .filter((x) => x.mesa_id === mesaId && (!desde || momento(x) >= desde))
    .reduce((s, x) => s + x.valor, 0);
  const sugerido = Math.round(consumo * percentualServico) / 100;
  return {
    consumo,
    contaPedidos: naConta,
    emAberto: naConta.reduce((s, p) => s + p.total, 0),
    contaDesde: naConta[0] ? momento(naConta[0]) : null,
    fechamentoSolicitado: naConta.some((p) => !!p.fechamento_solicitado_em),
    servicoSugerido: sugerido,
    servicoPago: pagoServico,
    servicoPendente:
      percentualServico > 0 ? Math.max(0, Math.round((sugerido - pagoServico) * 100) / 100) : 0,
  };
}
