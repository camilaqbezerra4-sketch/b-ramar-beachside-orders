import { CATEGORIAS_BASE } from "./modelo-cardapio";
import type { GrupoOpcao } from "./opcoes";
// Tipos espelhando o schema previsto no Supabase.
export type Categoria = string;
export type StatusPedido =
  "novo" | "pago" | "em_preparo" | "pronto" | "entregue" | "cancelado" | "expirado";
export type OrigemPedido = "cliente" | "garcom";
export type FormaPagamento = "pix" | "cartao" | "dinheiro";

export interface Barraca {
  id: string;
  slug: string;
  nome: string;
  chave_pix: string;
  cidade: string;
  whatsapp_suporte: string;
  ativa: boolean;
  criado_em: string;
  /** 0 = a barraca não cobra serviço */
  servico_percentual: number;
  permite_pagar_final: boolean;
  limite_conta?: number | null;
}

export interface Mesa {
  id: string;
  barraca_id: string;
  numero: number;
  tem_qrcode: boolean;
}

export interface Garcom {
  id: string;
  barraca_id: string;
  nome: string;
  chave_pix: string;
}

export interface Produto {
  id: string;
  barraca_id: string;
  nome: string;
  categoria: Categoria;
  preco: number;
  disponivel: boolean;
  ordem: number;
  /** texto curto mostrado ao cliente (ingredientes, tamanho etc.) */
  descricao: string;
  vegetariano: boolean;
  vegano: boolean;
  /** grupos de escolha (ex.: bebida e fruta da caipirinha) */
  opcoes: GrupoOpcao[];
  /** custo do item para a barraca (só no painel; nunca vai para o cliente) */
  custo: number | null;
}

export interface ItemPedido {
  id: string;
  pedido_id: string;
  produto_id: string;
  nome_produto: string;
  quantidade: number;
  preco: number;
  /** custo de uma unidade no momento da venda (null = não informado) */
  custo: number | null;
}

export interface Pedido {
  id: string;
  barraca_id: string;
  mesa_id: string;
  garcom_id: string | null;
  origem: OrigemPedido;
  status: StatusPedido;
  pago: boolean;
  forma_pagamento: FormaPagamento;
  total: number;
  gorjeta: number;
  criado_em: string;
  /** quando foi levado para outra mesa (troca de mesa); conta como o momento na turma */
  movido_em?: string | null;
  pago_em: string | null;
  /** pedido "pagar no final", na conta da mesa */
  na_conta: boolean;
  fechamento_solicitado_em: string | null;
  itens: ItemPedido[];
}

/** Serviço do garçom pago na saída (Pix direto para ele, ou registrado pelo caixa). */
export interface Servico {
  id: string;
  mesa_id: string | null;
  garcom_id: string | null;
  valor: number;
  forma: string;
  situacao: string;
  criado_em: string;
  /** quando foi levado para outra mesa (troca de mesa); conta como o momento na turma */
  movido_em?: string | null;
}

/** Pode ir para a cozinha: está pago, ou está na conta já aberta da mesa. */
export const liberadoParaCozinha = (p: Pedido) => p.pago || (p.na_conta && p.status !== "novo");

export interface LiberacaoMesa {
  id: string;
  barraca_id: string;
  mesa_id: string;
  liberada_em: string;
}

export const CATEGORIAS: Categoria[] = ["Bebidas", "Porções", "Sobremesas"];

/** Categorias existentes no cardápio, na ordem em que aparecem. */
export function categoriasDe(produtos: Produto[]): Categoria[] {
  const vistas: Categoria[] = [];
  for (const p of produtos) if (!vistas.includes(p.categoria)) vistas.push(p.categoria);
  return vistas.length ? vistas : CATEGORIAS;
}

/** Categorias da barraca + as do modelo de Recife que ela ainda não usa (para sugerir). */
export function categoriasComSugestoes(produtos: Produto[]): Categoria[] {
  const proprias = [...new Set(produtos.map((p) => p.categoria))];
  return [...proprias, ...CATEGORIAS_BASE.filter((c) => !proprias.includes(c))];
}

/** slug seguro: minúsculas, números e hífen. */
export function normalizarSlug(v: string) {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}
