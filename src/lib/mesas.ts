import type { LiberacaoMesa, Pedido } from "./types";

export interface GrupoMesa {
  /** null quando é o grupo atual (ainda aberto) */
  fim: string | null;
  inicio: string | null;
  pedidos: Pedido[];
  total: number;
}

const ativo = (p: Pedido) =>
  p.status !== "cancelado" && p.status !== "expirado";

/** Divide os pedidos de uma mesa em grupos, separados pelas liberações. */
export function gruposDaMesa(
  pedidos: Pedido[],
  liberacoes: LiberacaoMesa[],
  mesaId: string,
): { atual: GrupoMesa; anteriores: GrupoMesa[] } {
  const daMesa = pedidos
    .filter((p) => p.mesa_id === mesaId && ativo(p))
    .sort((a, b) => a.criado_em.localeCompare(b.criado_em));
  const cortes = liberacoes
    .filter((l) => l.mesa_id === mesaId)
    .map((l) => l.liberada_em)
    .sort((a, b) => a.localeCompare(b));

  const montar = (lista: Pedido[], fim: string | null): GrupoMesa => ({
    fim,
    inicio: lista[0]?.criado_em ?? null,
    pedidos: lista,
    total: lista.reduce((s, p) => s + p.total, 0),
  });

  const anteriores: GrupoMesa[] = [];
  let restante = daMesa;
  for (const corte of cortes) {
    const dentro = restante.filter((p) => p.criado_em < corte);
    restante = restante.filter((p) => p.criado_em >= corte);
    if (dentro.length) anteriores.push(montar(dentro, corte));
  }

  return { atual: montar(restante, null), anteriores };
}

/** Momento em que o grupo atual da mesa começou (null se a mesa está livre). */
export function inicioDoGrupo(
  pedidos: Pedido[],
  liberacoes: LiberacaoMesa[],
  mesaId: string,
) {
  return gruposDaMesa(pedidos, liberacoes, mesaId).atual.inicio;
}

/** true quando o pedido é o primeiro do grupo atual da mesa. */
export function abreGrupo(
  pedido: Pedido,
  pedidos: Pedido[],
  liberacoes: LiberacaoMesa[],
) {
  const { atual } = gruposDaMesa(pedidos, liberacoes, pedido.mesa_id);
  return atual.pedidos[0]?.id === pedido.id;
}

/** Só os grupos anteriores que começaram hoje. */
export function anterioresDeHoje(anteriores: GrupoMesa[]) {
  const hoje = new Date().toDateString();
  return anteriores.filter(
    (g) => g.inicio && new Date(g.inicio).toDateString() === hoje,
  );
}
