import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Barraca,
  Categoria,
  Garcom,
  ItemPedido,
  Mesa,
  Pedido,
  Produto,
  StatusPedido,
} from "./types";

/**
 * Camada de dados do BóraMar — Supabase + Realtime.
 * Tabelas: barracas, mesas, garcons, produtos, pedidos, itens_pedido.
 */

export interface DadosBarraca {
  pronto: boolean;
  barraca: Barraca;
  mesas: Mesa[];
  garcons: Garcom[];
  produtos: Produto[];
  pedidos: Pedido[];
}

const barracaVazia: Barraca = {
  id: "",
  nome: "",
  chave_pix: "",
  whatsapp_suporte: "",
  criado_em: new Date().toISOString(),
};

let estado: DadosBarraca = {
  pronto: false,
  barraca: barracaVazia,
  mesas: [],
  garcons: [],
  produtos: [],
  pedidos: [],
};

const ouvintes = new Set<() => void>();
function avisar() {
  for (const fn of ouvintes) fn();
}
function definir(patch: Partial<DadosBarraca>) {
  estado = { ...estado, ...patch };
  avisar();
}

let iniciado = false;
let carregando: Promise<void> | null = null;

async function carregar() {
  const { data: barracas } = await supabase
    .from("barracas")
    .select("*")
    .order("criado_em", { ascending: true })
    .limit(1);
  const barraca = barracas?.[0];
  if (!barraca) return;

  const [mesas, garcons, produtos, pedidos, itens] = await Promise.all([
    supabase
      .from("mesas")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("numero"),
    supabase
      .from("garcons")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("nome"),
    supabase
      .from("produtos")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("nome"),
    supabase
      .from("pedidos")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("criado_em", { ascending: true }),
    supabase.from("itens_pedido").select("*"),
  ]);

  const porPedido = new Map<string, ItemPedido[]>();
  for (const i of itens.data ?? []) {
    const lista = porPedido.get(i.pedido_id) ?? [];
    lista.push({
      id: i.id,
      pedido_id: i.pedido_id,
      produto_id: i.produto_id ?? "",
      nome_produto: i.nome_produto,
      quantidade: i.quantidade,
      preco: Number(i.preco),
    });
    porPedido.set(i.pedido_id, lista);
  }

  definir({
    pronto: true,
    barraca: {
      id: barraca.id,
      nome: barraca.nome,
      chave_pix: barraca.chave_pix,
      whatsapp_suporte: barraca.whatsapp_suporte,
      criado_em: barraca.criado_em,
    },
    mesas: (mesas.data ?? []).map((m) => ({
      id: m.id,
      barraca_id: m.barraca_id,
      numero: m.numero,
      tem_qrcode: m.tem_qrcode,
    })),
    garcons: (garcons.data ?? []).map((g) => ({
      id: g.id,
      barraca_id: g.barraca_id,
      nome: g.nome,
      chave_pix: g.chave_pix,
    })),
    produtos: (produtos.data ?? []).map((p) => ({
      id: p.id,
      barraca_id: p.barraca_id,
      nome: p.nome,
      categoria: p.categoria as Categoria,
      preco: Number(p.preco),
      disponivel: p.disponivel,
    })),
    pedidos: (pedidos.data ?? []).map((p) => ({
      id: p.id,
      barraca_id: p.barraca_id,
      mesa_id: p.mesa_id,
      garcom_id: p.garcom_id,
      origem: p.origem as Pedido["origem"],
      status: p.status as StatusPedido,
      pago: p.pago,
      total: Number(p.total),
      gorjeta: Number(p.gorjeta),
      criado_em: p.criado_em,
      itens: porPedido.get(p.id) ?? [],
    })),
  });
}

function recarregar() {
  carregando = carregar().catch((e) => {
    console.error("BóraMar: falha ao carregar dados", e);
  });
  return carregando;
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  recarregar();
  supabase
    .channel("boramar")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pedidos" },
      () => recarregar(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "itens_pedido" },
      () => recarregar(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "produtos" },
      () => recarregar(),
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "mesas" },
      () => recarregar(),
    )
    .subscribe();
}

function subscribe(fn: () => void) {
  iniciar();
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

const snapshot = () => estado;

export function useDados(): DadosBarraca {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// ---- Ações ----

export async function criarPedido(input: {
  mesa_id: string;
  garcom_id: string | null;
  origem: Pedido["origem"];
  gorjeta: number;
  pago: boolean;
  linhas: Array<{ produto: Produto; quantidade: number }>;
}) {
  const total =
    input.linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0) +
    input.gorjeta;

  const { data, error } = await supabase
    .from("pedidos")
    .insert({
      barraca_id: estado.barraca.id,
      mesa_id: input.mesa_id,
      garcom_id: input.garcom_id,
      origem: input.origem,
      status: "novo",
      pago: input.pago,
      total,
      gorjeta: input.gorjeta,
    })
    .select()
    .single();
  if (error || !data) throw error;

  const { error: erroItens } = await supabase.from("itens_pedido").insert(
    input.linhas.map((l) => ({
      pedido_id: data.id,
      produto_id: l.produto.id,
      nome_produto: l.produto.nome,
      quantidade: l.quantidade,
      preco: l.produto.preco,
    })),
  );
  if (erroItens) throw erroItens;

  await recarregar();
}

export async function atualizarStatus(pedidoId: string, status: StatusPedido) {
  await supabase.from("pedidos").update({ status }).eq("id", pedidoId);
  await recarregar();
}

export async function confirmarPagamento(pedidoId: string) {
  await supabase.from("pedidos").update({ pago: true }).eq("id", pedidoId);
  await recarregar();
}

export async function atualizarProduto(
  produtoId: string,
  patch: Partial<Produto>,
) {
  await supabase.from("produtos").update(patch).eq("id", produtoId);
  await recarregar();
}

export async function alternarQrCodeMesa(mesaId: string) {
  const mesa = estado.mesas.find((m) => m.id === mesaId);
  if (!mesa) return;
  await supabase
    .from("mesas")
    .update({ tem_qrcode: !mesa.tem_qrcode })
    .eq("id", mesaId);
  await recarregar();
}

export const formatarReal = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
