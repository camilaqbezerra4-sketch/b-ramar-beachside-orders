// Funções de servidor do BóraMar.
//
// O navegador não fala mais direto com as tabelas do banco: tudo passa por
// aqui. O cliente da mesa só lê o cardápio público e cria o próprio pedido
// (com preços conferidos no servidor). O painel e a tela do garçom só operam
// depois do PIN, guardado num cookie assinado; o admin também pode operar.
import { createServerFn } from "@tanstack/react-start";
import { useSession } from "@tanstack/react-start/server";
import { createHash, timingSafeEqual } from "node:crypto";

const HORA = 60 * 60 * 1000;
/** Pedidos carregados para a operação do dia (Caixa, Cozinha, Mesas, Garçom). */
const JANELA_OPERACAO = 36 * HORA;
/** Pedido aguardando pagamento expira depois deste tempo. */
const LIMITE_ESPERA = 10 * 60 * 1000;

// ---------- sessões ----------

function segredo() {
  const s = process.env["SESSION_SECRET"];
  if (!s || s.length < 32) {
    throw new Error(
      "SESSION_SECRET não configurada (precisa de pelo menos 32 caracteres) nas variáveis de ambiente da hospedagem.",
    );
  }
  return s;
}

function configSessao(name: string, maxAge: number) {
  return {
    password: segredo(),
    name,
    maxAge,
    cookie: {
      httpOnly: true,
      secure: true,
      sameSite: "lax" as const,
      path: "/",
    },
  };
}

interface SessaoPainel {
  barracas?: string[];
}
interface SessaoAdmin {
  liberado?: boolean;
}

// useSession é do servidor (h3), não um hook do React
/* eslint-disable react-hooks/rules-of-hooks */
const sessaoPainel = () =>
  useSession<SessaoPainel>(configSessao("boramar-painel", 60 * 60 * 24 * 30));
// mesmo nome e validade usados em admin.functions.ts
const sessaoAdmin = () => useSession<SessaoAdmin>(configSessao("boramar-admin", 60 * 60 * 24 * 7));
/* eslint-enable react-hooks/rules-of-hooks */

async function podeOperar(barracaId: string) {
  if ((await sessaoAdmin()).data.liberado) return true;
  return ((await sessaoPainel()).data.barracas ?? []).includes(barracaId);
}

async function exigirOperacao(barracaId: string) {
  if (!(await podeOperar(barracaId))) {
    throw new Error("Acesso negado. Digite o PIN da barraca de novo.");
  }
}

function confere(entrada: string, esperada: string) {
  const a = createHash("sha256").update(entrada, "utf8").digest();
  const b = createHash("sha256").update(esperada, "utf8").digest();
  return timingSafeEqual(a, b);
}

// ---------- banco ----------

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function barracaPorSlug(slug: string) {
  const sb = await db();
  const { data, error } = await sb
    .from("barracas")
    .select("*")
    .eq("slug", String(slug ?? ""))
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Marca como expirados os pedidos que esperam pagamento há mais de 10 min. */
async function expirarPendentes(filtro: { barracaId?: string; pedidoId?: string }) {
  const sb = await db();
  let q = sb
    .from("pedidos")
    .update({ status: "expirado" })
    .eq("status", "novo")
    .eq("pago", false)
    .lt("criado_em", new Date(Date.now() - LIMITE_ESPERA).toISOString());
  if (filtro.barracaId) q = q.eq("barraca_id", filtro.barracaId);
  if (filtro.pedidoId) q = q.eq("id", filtro.pedidoId);
  const { error } = await q;
  if (error) console.error("BóraMar: falha ao expirar pedidos", error);
}

const texto = (v: unknown, max = 120) =>
  String(v ?? "")
    .trim()
    .slice(0, max);
const numero = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehUuid = (v: unknown) => typeof v === "string" && UUID.test(v);

// ---------- formatos devolvidos ao navegador ----------

type LinhaPedido = {
  id: string;
  barraca_id: string;
  mesa_id: string;
  garcom_id: string | null;
  origem: string;
  status: string;
  pago: boolean;
  forma_pagamento: string;
  total: number | string;
  gorjeta: number | string;
  criado_em: string;
  pago_em: string | null;
  itens_pedido?: Array<{
    id: string;
    pedido_id: string;
    produto_id: string | null;
    nome_produto: string;
    quantidade: number;
    preco: number | string;
  }>;
};

function formatarPedido(p: LinhaPedido) {
  return {
    id: p.id,
    barraca_id: p.barraca_id,
    mesa_id: p.mesa_id,
    garcom_id: p.garcom_id,
    origem: p.origem as "cliente" | "garcom",
    status: p.status as
      "novo" | "pago" | "em_preparo" | "pronto" | "entregue" | "cancelado" | "expirado",
    pago: p.pago,
    forma_pagamento: (p.forma_pagamento ?? "pix") as "pix" | "cartao",
    total: Number(p.total),
    gorjeta: Number(p.gorjeta),
    criado_em: p.criado_em,
    pago_em: p.pago_em ?? null,
    itens: (p.itens_pedido ?? []).map((i) => ({
      id: i.id,
      pedido_id: i.pedido_id,
      produto_id: i.produto_id ?? "",
      nome_produto: i.nome_produto,
      quantidade: i.quantidade,
      preco: Number(i.preco),
    })),
  };
}

async function pedidosDesde(barracaId: string, desdeMs: number) {
  const sb = await db();
  const desde = new Date(desdeMs).toISOString();
  const { data, error } = await sb
    .from("pedidos")
    .select("*, itens_pedido(*)")
    .eq("barraca_id", barracaId)
    .gte("criado_em", desde)
    .order("criado_em", { ascending: true })
    .limit(5000);
  if (error) throw error;
  return ((data ?? []) as unknown as LinhaPedido[]).map(formatarPedido);
}

async function produtosDa(barracaId: string) {
  const sb = await db();
  const { data, error } = await sb
    .from("produtos")
    .select("id, barraca_id, nome, categoria, preco, disponivel, ordem")
    .eq("barraca_id", barracaId)
    .order("categoria")
    .order("ordem")
    .order("nome");
  if (error) throw error;
  return (data ?? []).map((p) => ({
    id: p.id,
    barraca_id: p.barraca_id,
    nome: p.nome,
    categoria: p.categoria,
    preco: Number(p.preco),
    disponivel: p.disponivel,
    ordem: p.ordem ?? 0,
  }));
}

async function mesasDa(barracaId: string) {
  const sb = await db();
  const { data, error } = await sb
    .from("mesas")
    .select("id, barraca_id, numero, tem_qrcode")
    .eq("barraca_id", barracaId)
    .order("numero");
  if (error) throw error;
  return data ?? [];
}

// ---------- cliente da mesa (público) ----------

/** Cardápio público: sem PIN, sem chaves Pix dos garçons, sem pedidos. */
export const carregarCardapio = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({ slug: texto(data?.slug, 60) }))
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data.slug);
    if (!barraca) return { existe: false as const };
    const sb = await db();
    const [mesas, produtos, garcons] = await Promise.all([
      mesasDa(barraca.id),
      produtosDa(barraca.id),
      sb.from("garcons").select("id, nome").eq("barraca_id", barraca.id).order("nome"),
    ]);
    if (garcons.error) throw garcons.error;
    return {
      existe: true as const,
      barraca: {
        id: barraca.id,
        slug: barraca.slug,
        nome: barraca.nome,
        chave_pix: barraca.chave_pix,
        cidade: barraca.cidade,
        whatsapp_suporte: barraca.whatsapp_suporte,
        ativa: barraca.ativa,
      },
      mesas,
      produtos,
      garcons: garcons.data ?? [],
    };
  });

export interface EntradaPedido {
  id: string;
  slug: string;
  mesa_id: string;
  garcom_id: string | null;
  origem: "cliente" | "garcom";
  gorjeta: number;
  forma_pagamento: "pix" | "cartao";
  itens: Array<{ id: string; produto_id: string; quantidade: number }>;
}

export type ResultadoPedido =
  | { ok: true; id: string; total: number }
  | { ok: false; motivo: "indisponivel"; itens: string[] }
  | { ok: false; motivo: "garcom" | "mesa" | "barraca" | "invalido" };

/**
 * Cria um pedido. Os preços vêm do banco, não do navegador.
 * Idempotente: reenviar o mesmo id (fila sem sinal) nunca duplica.
 */
export const enviarPedido = createServerFn({ method: "POST" })
  .inputValidator((data: EntradaPedido) => data)
  .handler(async ({ data }): Promise<ResultadoPedido> => {
    const invalido = { ok: false as const, motivo: "invalido" as const };
    if (!ehUuid(data?.id) || !ehUuid(data?.mesa_id)) return invalido;
    if (data.garcom_id !== null && !ehUuid(data.garcom_id)) return invalido;
    const origem = data.origem === "garcom" ? "garcom" : "cliente";
    const forma = data.forma_pagamento === "cartao" ? "cartao" : "pix";
    const gorjeta = Math.round(numero(data.gorjeta) * 100) / 100;
    if (!(gorjeta >= 0 && gorjeta <= 1000)) return invalido;
    const itens = Array.isArray(data.itens) ? data.itens : [];
    if (itens.length === 0 || itens.length > 60) return invalido;
    for (const i of itens) {
      const q = numero(i?.quantidade);
      if (!ehUuid(i?.id) || !ehUuid(i?.produto_id)) return invalido;
      if (!Number.isInteger(q) || q < 1 || q > 99) return invalido;
    }

    const barraca = await barracaPorSlug(data.slug);
    if (!barraca || !barraca.ativa) return { ok: false, motivo: "barraca" };
    if (origem === "garcom") await exigirOperacao(barraca.id);

    const sb = await db();

    // reenvio de um pedido que já entrou: só confirma
    const { data: existente } = await sb
      .from("pedidos")
      .select("id, total, barraca_id")
      .eq("id", data.id)
      .maybeSingle();
    if (existente) {
      if (existente.barraca_id !== barraca.id) return invalido;
      return { ok: true, id: existente.id, total: Number(existente.total) };
    }

    const { data: mesa } = await sb
      .from("mesas")
      .select("id")
      .eq("id", data.mesa_id)
      .eq("barraca_id", barraca.id)
      .maybeSingle();
    if (!mesa) return { ok: false, motivo: "mesa" };

    if (data.garcom_id) {
      const { data: garcom } = await sb
        .from("garcons")
        .select("id")
        .eq("id", data.garcom_id)
        .eq("barraca_id", barraca.id)
        .maybeSingle();
      if (!garcom) return { ok: false, motivo: "garcom" };
    } else if (gorjeta > 0 && origem === "cliente") {
      return { ok: false, motivo: "garcom" };
    }

    const ids = [...new Set(itens.map((i) => i.produto_id))];
    const { data: produtos, error: erroProdutos } = await sb
      .from("produtos")
      .select("id, nome, preco, disponivel")
      .eq("barraca_id", barraca.id)
      .in("id", ids);
    if (erroProdutos) throw erroProdutos;
    const porId = new Map((produtos ?? []).map((p) => [p.id, p]));
    const faltando = ids
      .map((id) => porId.get(id))
      .filter((p) => !p || !p.disponivel)
      .map((p) => p?.nome ?? "item removido do cardápio");
    if (faltando.length) return { ok: false, motivo: "indisponivel", itens: faltando };

    const linhas = itens.map((i) => {
      const p = porId.get(i.produto_id)!;
      return {
        id: i.id,
        pedido_id: data.id,
        produto_id: p.id,
        nome_produto: p.nome,
        quantidade: Number(i.quantidade),
        preco: Number(p.preco),
      };
    });
    const consumo = linhas.reduce((s, l) => s + l.preco * l.quantidade, 0);
    const total = Math.round((consumo + gorjeta) * 100) / 100;

    const { error: erroPedido } = await sb.from("pedidos").upsert(
      {
        id: data.id,
        barraca_id: barraca.id,
        mesa_id: mesa.id,
        garcom_id: data.garcom_id,
        origem,
        status: "novo",
        pago: false,
        forma_pagamento: forma,
        total,
        gorjeta,
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
    if (erroPedido) throw erroPedido;
    const { error: erroItens } = await sb
      .from("itens_pedido")
      .upsert(linhas, { onConflict: "id", ignoreDuplicates: true });
    if (erroItens) throw erroItens;

    return { ok: true, id: data.id, total };
  });

/** Situação de um pedido, para a tela do cliente acompanhar. */
export const situacaoPedido = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => ({ id: String(data?.id ?? "") }))
  .handler(async ({ data }) => {
    if (!ehUuid(data.id)) return null;
    await expirarPendentes({ pedidoId: data.id });
    const sb = await db();
    const { data: p } = await sb
      .from("pedidos")
      .select("status, pago, total")
      .eq("id", data.id)
      .maybeSingle();
    if (!p) return null;
    return { status: p.status, pago: p.pago, total: Number(p.total) };
  });

// ---------- painel da barraca e tela do garçom ----------

export const entrarPainel = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; pin: string }) => ({
    slug: texto(data?.slug, 60),
    pin: texto(data?.pin, 12),
  }))
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data.slug);
    if (!barraca || !barraca.pin || !confere(data.pin, barraca.pin)) {
      // atraso para dificultar tentativas em sequência
      await new Promise((r) => setTimeout(r, 800));
      return { ok: false as const };
    }
    const sessao = await sessaoPainel();
    const atuais = sessao.data.barracas ?? [];
    await sessao.update({
      barracas: [...new Set([...atuais, barraca.id])].slice(-10),
    });
    return { ok: true as const };
  });

export const sairPainel = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string }) => ({ slug: texto(data?.slug, 60) }))
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data.slug);
    const sessao = await sessaoPainel();
    await sessao.update({
      barracas: (sessao.data.barracas ?? []).filter((id) => id !== barraca?.id),
    });
    return { ok: true as const };
  });

/** Dados da operação do dia. Sem PIN válido, devolve só o nome da barraca. */
export const carregarPainel = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string }) => ({ slug: texto(data?.slug, 60) }))
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data.slug);
    if (!barraca) return { existe: false as const };
    const publica = {
      id: barraca.id,
      slug: barraca.slug,
      nome: barraca.nome,
      chave_pix: barraca.chave_pix,
      cidade: barraca.cidade,
      whatsapp_suporte: barraca.whatsapp_suporte,
      ativa: barraca.ativa,
      criado_em: barraca.criado_em,
    };
    if (!(await podeOperar(barraca.id))) {
      return { existe: true as const, liberado: false as const, barraca: publica };
    }

    await expirarPendentes({ barracaId: barraca.id });
    const sb = await db();
    const desde = Date.now() - JANELA_OPERACAO;
    const [mesas, produtos, garcons, pedidos, liberacoes] = await Promise.all([
      mesasDa(barraca.id),
      produtosDa(barraca.id),
      sb
        .from("garcons")
        .select("id, barraca_id, nome, chave_pix")
        .eq("barraca_id", barraca.id)
        .order("nome"),
      pedidosDesde(barraca.id, desde),
      sb
        .from("liberacoes_mesa")
        .select("id, barraca_id, mesa_id, liberada_em")
        .eq("barraca_id", barraca.id)
        .gte("liberada_em", new Date(desde).toISOString())
        .order("liberada_em", { ascending: true }),
    ]);
    if (garcons.error) throw garcons.error;
    if (liberacoes.error) throw liberacoes.error;

    return {
      existe: true as const,
      liberado: true as const,
      barraca: publica,
      mesas,
      produtos,
      garcons: garcons.data ?? [],
      pedidos,
      liberacoes: liberacoes.data ?? [],
    };
  });

/** Pedidos de um período maior, para Histórico e Resultados (até 90 dias). */
export const carregarHistorico = createServerFn({ method: "GET" })
  .inputValidator((data: { slug: string; dias: number }) => ({
    slug: texto(data?.slug, 60),
    dias: Math.max(1, Math.min(90, Math.floor(numero(data?.dias) || 1))),
  }))
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data.slug);
    if (!barraca) return [];
    await exigirOperacao(barraca.id);
    // começa à meia-noite (horário de Brasília) de "dias - 1" dias atrás
    const agoraBr = new Date(Date.now() - 3 * HORA);
    const inicioHojeBr =
      Date.UTC(agoraBr.getUTCFullYear(), agoraBr.getUTCMonth(), agoraBr.getUTCDate()) + 3 * HORA;
    return pedidosDesde(barraca.id, inicioHojeBr - (data.dias - 1) * 24 * HORA);
  });

export type AcaoPainel =
  | { tipo: "status"; pedidoId: string; status: "em_preparo" | "pronto" | "entregue" }
  | { tipo: "confirmarPagamento"; pedidoId: string }
  | { tipo: "encerrar"; pedidoId: string; status: "cancelado" | "expirado" }
  | {
      tipo: "atualizarProduto";
      produtoId: string;
      patch: { nome?: string; preco?: number; disponivel?: boolean; categoria?: string };
    }
  | { tipo: "criarProduto"; nome: string; categoria: string; preco: number }
  | { tipo: "removerProduto"; produtoId: string }
  | { tipo: "renomearCategoria"; de: string; para: string }
  | { tipo: "moverProduto"; produtoId: string; direcao: -1 | 1 }
  | { tipo: "criarGarcom"; nome: string; chavePix: string }
  | { tipo: "removerGarcom"; garcomId: string }
  | { tipo: "alternarQrCode"; mesaId: string }
  | { tipo: "liberarMesa"; mesaId: string };

/** Todas as ações do painel, sempre restritas à barraca do PIN. */
export const acaoPainel = createServerFn({ method: "POST" })
  .inputValidator((data: { slug: string; acao: AcaoPainel }) => data)
  .handler(async ({ data }) => {
    const barraca = await barracaPorSlug(data?.slug);
    if (!barraca) throw new Error("Barraca não encontrada.");
    await exigirOperacao(barraca.id);
    const sb = await db();
    const bid = barraca.id;
    const a = data.acao;

    const conferir = (r: { error: unknown }) => {
      if (r.error) throw r.error;
    };

    switch (a?.tipo) {
      case "status": {
        if (!["em_preparo", "pronto", "entregue"].includes(a.status))
          throw new Error("Status inválido.");
        conferir(
          await sb
            .from("pedidos")
            .update({ status: a.status })
            .eq("id", a.pedidoId)
            .eq("barraca_id", bid)
            .eq("pago", true),
        );
        break;
      }
      case "confirmarPagamento": {
        conferir(
          await sb
            .from("pedidos")
            .update({ pago: true, status: "pago", pago_em: new Date().toISOString() })
            .eq("id", a.pedidoId)
            .eq("barraca_id", bid)
            .eq("status", "novo"),
        );
        break;
      }
      case "encerrar": {
        const status = a.status === "expirado" ? "expirado" : "cancelado";
        conferir(
          await sb
            .from("pedidos")
            .update({ status })
            .eq("id", a.pedidoId)
            .eq("barraca_id", bid)
            .eq("pago", false),
        );
        break;
      }
      case "atualizarProduto": {
        const patch: {
          nome?: string;
          categoria?: string;
          disponivel?: boolean;
          preco?: number;
        } = {};
        if (a.patch.nome !== undefined) patch.nome = texto(a.patch.nome, 80);
        if (a.patch.categoria !== undefined) patch.categoria = texto(a.patch.categoria, 40);
        if (a.patch.disponivel !== undefined) patch.disponivel = !!a.patch.disponivel;
        if (a.patch.preco !== undefined) {
          const preco = numero(a.patch.preco);
          if (!(preco >= 0 && preco <= 100000)) throw new Error("Preço inválido.");
          patch.preco = preco;
        }
        conferir(
          await sb.from("produtos").update(patch).eq("id", a.produtoId).eq("barraca_id", bid),
        );
        break;
      }
      case "criarProduto": {
        const preco = numero(a.preco);
        const nome = texto(a.nome, 80);
        const categoria = texto(a.categoria, 40);
        if (!nome || !categoria || !(preco >= 0 && preco <= 100000))
          throw new Error("Produto inválido.");
        const { count } = await sb
          .from("produtos")
          .select("id", { count: "exact", head: true })
          .eq("barraca_id", bid)
          .eq("categoria", categoria);
        conferir(
          await sb.from("produtos").insert({
            barraca_id: bid,
            nome,
            categoria,
            preco,
            disponivel: true,
            ordem: count ?? 0,
          }),
        );
        break;
      }
      case "removerProduto": {
        conferir(await sb.from("produtos").delete().eq("id", a.produtoId).eq("barraca_id", bid));
        break;
      }
      case "renomearCategoria": {
        const para = texto(a.para, 40);
        if (!para) throw new Error("Categoria inválida.");
        conferir(
          await sb
            .from("produtos")
            .update({ categoria: para })
            .eq("barraca_id", bid)
            .eq("categoria", texto(a.de, 40)),
        );
        break;
      }
      case "moverProduto": {
        const produtos = await produtosDa(bid);
        const alvo = produtos.find((p) => p.id === a.produtoId);
        if (!alvo) break;
        const lista = produtos
          .filter((p) => p.categoria === alvo.categoria)
          .sort((x, y) => x.ordem - y.ordem || x.nome.localeCompare(y.nome));
        const i = lista.findIndex((p) => p.id === a.produtoId);
        const j = i + (a.direcao === -1 ? -1 : 1);
        if (j < 0 || j >= lista.length) break;
        [lista[i], lista[j]] = [lista[j]!, lista[i]!];
        await Promise.all(
          lista.map((p, idx) =>
            sb.from("produtos").update({ ordem: idx }).eq("id", p.id).eq("barraca_id", bid),
          ),
        );
        break;
      }
      case "criarGarcom": {
        const nome = texto(a.nome, 60);
        if (!nome) throw new Error("Nome inválido.");
        conferir(
          await sb
            .from("garcons")
            .insert({ barraca_id: bid, nome, chave_pix: texto(a.chavePix, 120) }),
        );
        break;
      }
      case "removerGarcom": {
        conferir(await sb.from("garcons").delete().eq("id", a.garcomId).eq("barraca_id", bid));
        break;
      }
      case "alternarQrCode": {
        const { data: mesa } = await sb
          .from("mesas")
          .select("id, tem_qrcode")
          .eq("id", a.mesaId)
          .eq("barraca_id", bid)
          .maybeSingle();
        if (mesa)
          conferir(
            await sb.from("mesas").update({ tem_qrcode: !mesa.tem_qrcode }).eq("id", mesa.id),
          );
        break;
      }
      case "liberarMesa": {
        const { data: mesa } = await sb
          .from("mesas")
          .select("id")
          .eq("id", a.mesaId)
          .eq("barraca_id", bid)
          .maybeSingle();
        if (mesa)
          conferir(
            await sb.from("liberacoes_mesa").insert({
              barraca_id: bid,
              mesa_id: mesa.id,
              liberada_em: new Date().toISOString(),
            }),
          );
        break;
      }
      default:
        throw new Error("Ação desconhecida.");
    }
    return { ok: true as const };
  });
