import { useSyncExternalStore } from "react";
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
 * Camada de dados do BóraMar.
 *
 * Hoje: memória (dados de exemplo) para a interface de teste.
 * Depois: substituir as funções abaixo por chamadas ao Supabase
 * (tabelas barracas, mesas, garcons, produtos, pedidos, itens_pedido)
 * mantendo exatamente os mesmos nomes de campos.
 */

export interface DadosBarraca {
  barraca: Barraca;
  mesas: Mesa[];
  garcons: Garcom[];
  produtos: Produto[];
  pedidos: Pedido[];
}

let seq = 0;
const novoId = (prefixo: string) => `${prefixo}_${++seq}`;

let estado: DadosBarraca | null = null;
const ouvintes = new Set<() => void>();

function agora(offsetMin = 0) {
  return new Date(Date.now() - offsetMin * 60000).toISOString();
}

function semear(): DadosBarraca {
  const barracaId = "barraca_exemplo";
  const barraca: Barraca = {
    id: barracaId,
    nome: "Barraca do Zé — Praia de Boa Viagem",
    chave_pix: "boramar@barracadoze.com.br",
    whatsapp_suporte: "5581999990000",
    criado_em: agora(60 * 24 * 30),
  };

  const mesas: Mesa[] = Array.from({ length: 12 }, (_, i) => ({
    id: novoId("mesa"),
    barraca_id: barracaId,
    numero: i + 8,
    tem_qrcode: [10, 12, 14, 15, 16, 18].includes(i + 8),
  }));

  const garcons: Garcom[] = [
    { nome: "Rafa", chave_pix: "rafa@pix.com" },
    { nome: "Dedé", chave_pix: "81988887777" },
    { nome: "Jussara", chave_pix: "jussara@pix.com" },
  ].map((g) => ({ id: novoId("garcom"), barraca_id: barracaId, ...g }));

  const produtos: Produto[] = (
    [
      ["Água de Coco", "Bebidas", 10, true],
      ["Caipirinha", "Bebidas", 22, true],
      ["Cerveja Long Neck", "Bebidas", 12, true],
      ["Refrigerante Lata", "Bebidas", 8, true],
      ["Isca de Peixe", "Porções", 65, true],
      ["Batata Frita", "Porções", 35, true],
      ["Camarão Alho e Óleo", "Porções", 89, false],
      ["Açaí na Tigela", "Sobremesas", 24, true],
      ["Picolé de Coco", "Sobremesas", 9, false],
    ] as const
  ).map(([nome, categoria, preco, disponivel]) => ({
    id: novoId("produto"),
    barraca_id: barracaId,
    nome,
    categoria,
    preco,
    disponivel,
  }));

  const mesaDe = (numero: number) => mesas.find((m) => m.numero === numero)!;
  const prod = (nome: string) => produtos.find((p) => p.nome === nome)!;

  function pedidoExemplo(
    numeroMesa: number,
    origem: Pedido["origem"],
    status: StatusPedido,
    gorjeta: number,
    minutosAtras: number,
    garcomIdx: number | null,
    linhas: Array<[string, number]>,
  ): Pedido {
    const pedidoId = novoId("pedido");
    const itens: ItemPedido[] = linhas.map(([nome, quantidade]) => {
      const p = prod(nome);
      return {
        id: novoId("item"),
        pedido_id: pedidoId,
        produto_id: p.id,
        nome_produto: p.nome,
        quantidade,
        preco: p.preco,
      };
    });
    return {
      id: pedidoId,
      barraca_id: barracaId,
      mesa_id: mesaDe(numeroMesa).id,
      garcom_id: garcomIdx === null ? null : garcons[garcomIdx]!.id,
      origem,
      status,
      pago: status !== "novo",
      total: itens.reduce((s, i) => s + i.preco * i.quantidade, 0) + gorjeta,
      gorjeta,
      criado_em: agora(minutosAtras),
      itens,
    };
  }

  const pedidos: Pedido[] = [
    pedidoExemplo(14, "cliente", "entregue", 5, 95, 0, [
      ["Água de Coco", 2],
      ["Batata Frita", 1],
    ]),
    pedidoExemplo(9, "garcom", "em_preparo", 0, 40, 1, [
      ["Isca de Peixe", 1],
      ["Cerveja Long Neck", 4],
    ]),
    pedidoExemplo(12, "cliente", "novo", 10, 6, 2, [
      ["Caipirinha", 2],
      ["Açaí na Tigela", 1],
    ]),
  ];

  return { barraca, mesas, garcons, produtos, pedidos };
}

function db(): DadosBarraca {
  if (!estado) estado = semear();
  return estado;
}

function avisar() {
  for (const fn of ouvintes) fn();
}

function subscribe(fn: () => void) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export function useDados(): DadosBarraca {
  return useSyncExternalStore(subscribe, db, db);
}

// ---- Ações ----

export function criarPedido(input: {
  mesa_id: string;
  garcom_id: string | null;
  origem: Pedido["origem"];
  gorjeta: number;
  pago: boolean;
  linhas: Array<{ produto: Produto; quantidade: number }>;
}): Pedido {
  const dados = db();
  const pedidoId = novoId("pedido");
  const itens: ItemPedido[] = input.linhas.map(({ produto, quantidade }) => ({
    id: novoId("item"),
    pedido_id: pedidoId,
    produto_id: produto.id,
    nome_produto: produto.nome,
    quantidade,
    preco: produto.preco,
  }));
  const pedido: Pedido = {
    id: pedidoId,
    barraca_id: dados.barraca.id,
    mesa_id: input.mesa_id,
    garcom_id: input.garcom_id,
    origem: input.origem,
    status: "novo",
    pago: input.pago,
    total:
      itens.reduce((s, i) => s + i.preco * i.quantidade, 0) + input.gorjeta,
    gorjeta: input.gorjeta,
    criado_em: new Date().toISOString(),
    itens,
  };
  dados.pedidos = [...dados.pedidos, pedido];
  avisar();
  return pedido;
}

export function atualizarStatus(pedidoId: string, status: StatusPedido) {
  const dados = db();
  dados.pedidos = dados.pedidos.map((p) =>
    p.id === pedidoId ? { ...p, status } : p,
  );
  avisar();
}

export function confirmarPagamento(pedidoId: string) {
  const dados = db();
  dados.pedidos = dados.pedidos.map((p) =>
    p.id === pedidoId ? { ...p, pago: true } : p,
  );
  avisar();
}

export function atualizarProduto(produtoId: string, patch: Partial<Produto>) {
  const dados = db();
  dados.produtos = dados.produtos.map((p) =>
    p.id === produtoId ? { ...p, ...patch } : p,
  );
  avisar();
}

export function alternarQrCodeMesa(mesaId: string) {
  const dados = db();
  dados.mesas = dados.mesas.map((m) =>
    m.id === mesaId ? { ...m, tem_qrcode: !m.tem_qrcode } : m,
  );
  avisar();
}

export const formatarReal = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
