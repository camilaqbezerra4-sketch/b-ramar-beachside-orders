import { useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import type {
  Barraca,
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
 * Os dados são carregados por barraca (slug); sem slug usa a primeira barraca.
 */

export interface DadosBarraca {
  pronto: boolean;
  existe: boolean;
  barraca: Barraca;
  mesas: Mesa[];
  garcons: Garcom[];
  produtos: Produto[];
  pedidos: Pedido[];
}

const barracaVazia: Barraca = {
  id: "",
  slug: "",
  nome: "",
  chave_pix: "",
  cidade: "",
  pin: "",
  whatsapp_suporte: "",
  ativa: true,
  criado_em: new Date().toISOString(),
};

let estado: DadosBarraca = {
  pronto: false,
  existe: true,
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
let slugAtivo: string | null = null;

async function carregar() {
  const consulta = supabase.from("barracas").select("*");
  const { data: barracas } = slugAtivo
    ? await consulta.eq("slug", slugAtivo).limit(1)
    : await consulta.order("criado_em", { ascending: true }).limit(1);
  const barraca = barracas?.[0];
  if (!barraca) {
    definir({ pronto: true, existe: false });
    return;
  }

  const [mesas, garcons, produtos, pedidos] = await Promise.all([
    supabase.from("mesas").select("*").eq("barraca_id", barraca.id).order("numero"),
    supabase.from("garcons").select("*").eq("barraca_id", barraca.id).order("nome"),
    supabase
      .from("produtos")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("categoria")
      .order("ordem")
      .order("nome"),
    supabase
      .from("pedidos")
      .select("*")
      .eq("barraca_id", barraca.id)
      .order("criado_em", { ascending: true }),
  ]);

  const idsPedidos = (pedidos.data ?? []).map((p) => p.id);
  const itens = idsPedidos.length
    ? await supabase.from("itens_pedido").select("*").in("pedido_id", idsPedidos)
    : { data: [] as never[] };

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
    existe: true,
    barraca: {
      id: barraca.id,
      slug: (barraca as { slug?: string }).slug ?? "",
      nome: barraca.nome,
      chave_pix: barraca.chave_pix,
      cidade: (barraca as { cidade?: string }).cidade ?? "Recife",
      pin: (barraca as { pin?: string }).pin ?? "",
      whatsapp_suporte: barraca.whatsapp_suporte,
      ativa: (barraca as { ativa?: boolean }).ativa ?? true,
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
      categoria: p.categoria,
      preco: Number(p.preco),
      disponivel: p.disponivel,
      ordem: (p as { ordem?: number }).ordem ?? 0,
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
      pago_em: (p as { pago_em?: string | null }).pago_em ?? null,
      itens: porPedido.get(p.id) ?? [],
    })),
  });
}

function recarregar() {
  return carregar().catch((e) => {
    console.error("BóraMar: falha ao carregar dados", e);
  });
}

function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  recarregar();
  const recarregarTabela = () => {
    recarregar();
  };
  // remove canais antigos (recarga a quente) antes de assinar de novo
  for (const c of supabase.getChannels()) {
    if (c.topic === "realtime:boramar") supabase.removeChannel(c);
  }
  supabase
    .channel("boramar")
    .on("postgres_changes", { event: "*", schema: "public", table: "pedidos" }, recarregarTabela)
    .on("postgres_changes", { event: "*", schema: "public", table: "itens_pedido" }, recarregarTabela)
    .on("postgres_changes", { event: "*", schema: "public", table: "produtos" }, recarregarTabela)
    .on("postgres_changes", { event: "*", schema: "public", table: "mesas" }, recarregarTabela)
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

/** Carrega os dados de uma barraca pelo slug (sem slug: a primeira barraca). */
export function useDados(slug?: string): DadosBarraca {
  // sem slug: mantém a barraca já carregada
  if (slug !== undefined && slug !== slugAtivo) {
    slugAtivo = slug;
    estado = { ...estado, pronto: false, existe: true };
    if (iniciado) recarregar();
  }
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

// ---- Ações ----

interface PedidoPendente {
  pedido: {
    id: string;
    barraca_id: string;
    mesa_id: string;
    garcom_id: string | null;
    origem: Pedido["origem"];
    status: StatusPedido;
    pago: boolean;
    total: number;
    gorjeta: number;
  };
  itens: Array<{
    id: string;
    pedido_id: string;
    produto_id: string;
    nome_produto: string;
    quantidade: number;
    preco: number;
  }>;
}

const CHAVE_FILA = "boramar:pedidos-pendentes";

function lerFila(): PedidoPendente[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FILA) ?? "[]");
  } catch {
    return [];
  }
}
function gravarFila(fila: PedidoPendente[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
  for (const fn of ouvintesFila) fn();
}

const ouvintesFila = new Set<() => void>();
export function assinarFila(fn: () => void) {
  ouvintesFila.add(fn);
  return () => {
    ouvintesFila.delete(fn);
  };
}
export function pedidosPendentes() {
  return lerFila().length;
}

function novoId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** Envia um pedido; idempotente — reenviar o mesmo id nunca duplica. */
async function enviarPedido(p: PedidoPendente) {
  const { error } = await supabase
    .from("pedidos")
    .upsert(p.pedido, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw error;
  const { error: erroItens } = await supabase
    .from("itens_pedido")
    .upsert(p.itens, { onConflict: "id", ignoreDuplicates: true });
  if (erroItens) throw erroItens;
}

let tentando = false;
export async function reenviarPendentes() {
  if (tentando) return;
  tentando = true;
  try {
    for (const p of lerFila()) {
      try {
        await enviarPedido(p);
        gravarFila(lerFila().filter((x) => x.pedido.id !== p.pedido.id));
      } catch {
        break; // ainda sem rede: tenta de novo depois
      }
    }
    if (lerFila().length === 0) await recarregar();
  } finally {
    tentando = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    reenviarPendentes();
  });
  setInterval(() => {
    if (lerFila().length) reenviarPendentes();
  }, 8000);
}

export async function criarPedido(input: {
  mesa_id: string;
  garcom_id: string | null;
  origem: Pedido["origem"];
  gorjeta: number;
  pago: boolean;
  linhas: Array<{ produto: Produto; quantidade: number }>;
}): Promise<{ id: string; pendente: boolean }> {
  const total =
    input.linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0) +
    input.gorjeta;

  const id = novoId();
  const pacote: PedidoPendente = {
    pedido: {
      id,
      barraca_id: estado.barraca.id,
      mesa_id: input.mesa_id,
      garcom_id: input.garcom_id,
      origem: input.origem,
      status: "novo",
      pago: input.pago,
      total,
      gorjeta: input.gorjeta,
    },
    itens: input.linhas.map((l) => ({
      id: novoId(),
      pedido_id: id,
      produto_id: l.produto.id,
      nome_produto: l.produto.nome,
      quantidade: l.quantidade,
      preco: l.produto.preco,
    })),
  };

  try {
    await enviarPedido(pacote);
    await recarregar();
    return { id, pendente: false };
  } catch (e) {
    console.error("BóraMar: pedido guardado para reenvio", e);
    gravarFila([...lerFila(), pacote]);
    reenviarPendentes();
    return { id, pendente: true };
  }
}

export async function atualizarStatus(pedidoId: string, status: StatusPedido) {
  await supabase.from("pedidos").update({ status }).eq("id", pedidoId);
  await recarregar();
}

export async function confirmarPagamento(pedidoId: string) {
  await supabase
    .from("pedidos")
    .update({ pago: true, status: "pago", pago_em: new Date().toISOString() })
    .eq("id", pedidoId);
  await recarregar();
}

/** Cancela ou expira um pedido que nunca teve o pagamento confirmado. */
export async function encerrarPedido(
  pedidoId: string,
  status: "cancelado" | "expirado",
) {
  await supabase
    .from("pedidos")
    .update({ status })
    .eq("id", pedidoId)
    .eq("pago", false);
  await recarregar();
}

// ---- Cardápio ----

export async function atualizarProduto(
  produtoId: string,
  patch: Partial<Produto>,
) {
  await supabase.from("produtos").update(patch).eq("id", produtoId);
  await recarregar();
}

export async function criarProduto(input: {
  nome: string;
  categoria: string;
  preco: number;
}) {
  const daCategoria = estado.produtos.filter((p) => p.categoria === input.categoria);
  await supabase.from("produtos").insert({
    barraca_id: estado.barraca.id,
    nome: input.nome,
    categoria: input.categoria,
    preco: input.preco,
    disponivel: true,
    ordem: daCategoria.length,
  });
  await recarregar();
}

export async function removerProduto(produtoId: string) {
  await supabase.from("produtos").delete().eq("id", produtoId);
  await recarregar();
}

export async function renomearCategoria(de: string, para: string) {
  await supabase
    .from("produtos")
    .update({ categoria: para })
    .eq("barraca_id", estado.barraca.id)
    .eq("categoria", de);
  await recarregar();
}

/** Move um item para cima (-1) ou para baixo (+1) dentro da categoria. */
export async function moverProduto(produtoId: string, direcao: -1 | 1) {
  const alvo = estado.produtos.find((p) => p.id === produtoId);
  if (!alvo) return;
  const lista = estado.produtos
    .filter((p) => p.categoria === alvo.categoria)
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const i = lista.findIndex((p) => p.id === produtoId);
  const j = i + direcao;
  if (j < 0 || j >= lista.length) return;
  const outro = lista[j]!;
  const trocado = [...lista];
  trocado[i] = outro;
  trocado[j] = alvo;
  await Promise.all(
    trocado.map((p, idx) =>
      supabase.from("produtos").update({ ordem: idx }).eq("id", p.id),
    ),
  );
  await recarregar();
}

// ---- Equipe ----

export async function criarGarcom(nome: string, chavePix: string) {
  await supabase.from("garcons").insert({
    barraca_id: estado.barraca.id,
    nome,
    chave_pix: chavePix,
  });
  await recarregar();
}

export async function removerGarcom(garcomId: string) {
  await supabase.from("garcons").delete().eq("id", garcomId);
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
