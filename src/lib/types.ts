// Tipos espelhando o schema previsto no Supabase.
export type Categoria = string;
export type StatusPedido =
  | "novo"
  | "pago"
  | "em_preparo"
  | "pronto"
  | "entregue"
  | "cancelado"
  | "expirado";
export type OrigemPedido = "cliente" | "garcom";
export type FormaPagamento = "pix" | "cartao";

export interface Barraca {
  id: string;
  slug: string;
  nome: string;
  chave_pix: string;
  cidade: string;
  pin: string;
  whatsapp_suporte: string;
  ativa: boolean;
  criado_em: string;
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
}

export interface ItemPedido {
  id: string;
  pedido_id: string;
  produto_id: string;
  nome_produto: string;
  quantidade: number;
  preco: number;
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
  pago_em: string | null;
  itens: ItemPedido[];
}

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
