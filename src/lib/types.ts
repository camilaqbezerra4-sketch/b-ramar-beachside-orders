// Tipos espelhando o schema previsto no Supabase.
export type Categoria = "Bebidas" | "Porções" | "Sobremesas";
export type StatusPedido =
  | "novo"
  | "pago"
  | "em_preparo"
  | "entregue"
  | "cancelado"
  | "expirado";
export type OrigemPedido = "cliente" | "garcom";

export interface Barraca {
  id: string;
  nome: string;
  chave_pix: string;
  cidade: string;
  pin: string;
  whatsapp_suporte: string;
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
  total: number;
  gorjeta: number;
  criado_em: string;
  pago_em: string | null;
  itens: ItemPedido[];
}

export const CATEGORIAS: Categoria[] = ["Bebidas", "Porções", "Sobremesas"];
