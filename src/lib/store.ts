import { useEffect, useState, useSyncExternalStore } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  acaoPainel,
  avisarContaPaga,
  avisarPixDoPedido,
  avisarServicoPago,
  carregarCardapio,
  carregarHistorico,
  carregarPainel,
  entrarPainel,
  enviarPedido,
  pixDoServico,
  sairPainel,
  situacaoMesa,
  situacaoPedido,
  type AcaoPainel,
  type EntradaPedido,
  type ResultadoPedido,
} from "./boramar.functions";
import type {
  Barraca,
  Garcom,
  LiberacaoMesa,
  Mesa,
  Pedido,
  Produto,
  Servico,
  StatusPedido,
} from "./types";
import type { Escolhas, GrupoOpcao } from "./opcoes";

/**
 * Camada de dados do BóraMar no navegador.
 *
 * O navegador não acessa as tabelas do banco: tudo passa pelas funções de
 * servidor em boramar.functions.ts.
 * - useDados(slug): operação da barraca (painel, garçom, admin). Exige PIN.
 *   Fica em tempo real escutando só a tabela "sinais" da própria barraca.
 * - useCardapio(slug): cardápio público da mesa. Carrega uma vez.
 * - useHistorico(dias): pedidos de um período maior, sob demanda.
 */

// =====================================================================
// Operação da barraca (painel, garçom, admin)
// =====================================================================

export interface DadosBarraca {
  pronto: boolean;
  existe: boolean;
  /** PIN conferido pelo servidor neste aparelho. */
  liberado: boolean;
  barraca: Barraca;
  mesas: Mesa[];
  garcons: Garcom[];
  produtos: Produto[];
  pedidos: Pedido[];
  liberacoes: LiberacaoMesa[];
  servicos: Servico[];
}

const barracaVazia: Barraca = {
  id: "",
  slug: "",
  nome: "",
  chave_pix: "",
  cidade: "",
  whatsapp_suporte: "",
  ativa: true,
  criado_em: new Date().toISOString(),
  servico_percentual: 0,
  permite_pagar_final: true,
};

const estadoInicial: DadosBarraca = {
  pronto: false,
  existe: true,
  liberado: false,
  barraca: barracaVazia,
  mesas: [],
  garcons: [],
  produtos: [],
  pedidos: [],
  liberacoes: [],
  servicos: [],
};

let estado: DadosBarraca = estadoInicial;
const ouvintes = new Set<() => void>();
function definir(patch: Partial<DadosBarraca>) {
  estado = { ...estado, ...patch };
  for (const fn of ouvintes) fn();
}

let slugAtivo: string | null = null;
let carregando: Promise<void> | null = null;
let proxima: Promise<void> | null = null;

async function carregar() {
  const slug = slugAtivo;
  if (!slug) return;
  const r = await carregarPainel({ data: { slug } });
  if (slug !== slugAtivo) return; // trocou de barraca no meio
  if (!r.existe) {
    definir({ ...estadoInicial, pronto: true, existe: false });
    return;
  }
  if (!r.liberado) {
    definir({ ...estadoInicial, pronto: true, existe: true, barraca: r.barraca });
    return;
  }
  definir({
    pronto: true,
    existe: true,
    liberado: true,
    barraca: r.barraca,
    mesas: r.mesas,
    garcons: r.garcons,
    produtos: r.produtos,
    pedidos: r.pedidos,
    liberacoes: r.liberacoes,
    servicos: r.servicos,
  });
  assinarSinais(r.barraca.id);
}

/**
 * Recarrega a operação. Chamadas simultâneas viram no máximo uma recarga extra,
 * e quem chama sempre recebe uma promessa que só termina com os dados novos.
 */
export function recarregar(): Promise<void> {
  if (carregando) {
    proxima ??= carregando.then(() => {
      proxima = null;
      return recarregar();
    });
    return proxima;
  }
  carregando = carregar()
    .catch((e) => console.error("BóraMar: falha ao carregar dados", e))
    .finally(() => {
      carregando = null;
    });
  return carregando;
}

// --- tempo real: só o sinal "mudou algo nesta barraca" ---
let canalBarraca: string | null = null;
let atraso: ReturnType<typeof setTimeout> | null = null;

function assinarSinais(barracaId: string) {
  if (typeof window === "undefined" || canalBarraca === barracaId) return;
  for (const c of supabase.getChannels()) {
    if (c.topic.startsWith("realtime:boramar-")) void supabase.removeChannel(c);
  }
  canalBarraca = barracaId;
  supabase
    .channel(`boramar-${barracaId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "sinais",
        filter: `barraca_id=eq.${barracaId}`,
      },
      () => {
        // vários sinais seguidos (pedido + itens) viram uma recarga só
        if (atraso) clearTimeout(atraso);
        atraso = setTimeout(() => void recarregar(), 400);
      },
    )
    .subscribe();
}

let iniciado = false;
function iniciar() {
  if (iniciado || typeof window === "undefined") return;
  iniciado = true;
  // garantia caso o tempo real caia: recarrega a cada minuto e ao voltar ao app
  setInterval(() => {
    if (slugAtivo && estado.liberado && document.visibilityState === "visible") void recarregar();
  }, 60000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && slugAtivo) void recarregar();
  });
  window.addEventListener("online", () => {
    if (slugAtivo) void recarregar();
  });
  if (slugAtivo) void recarregar();
}

function subscribe(fn: () => void) {
  iniciar();
  ouvintes.add(fn);
  return () => {
    ouvintes.delete(fn);
  };
}

const snapshot = () => estado;

/** Operação da barraca pelo slug (sem slug: mantém a barraca já carregada). */
export function useDados(slug?: string): DadosBarraca {
  if (slug !== undefined && slug !== slugAtivo) {
    slugAtivo = slug;
    canalBarraca = null;
    estado = { ...estadoInicial };
    if (iniciado) void recarregar();
  }
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/** Confere o PIN no servidor; se certo, este aparelho fica liberado. */
export async function entrarComPin(slug: string, pin: string) {
  const r = await entrarPainel({ data: { slug, pin } });
  if (r.ok) await recarregar();
  return r.ok;
}

export async function sairDoPainel(slug: string) {
  await sairPainel({ data: { slug } });
  await recarregar();
}

async function agir(acao: AcaoPainel) {
  if (!slugAtivo) return;
  try {
    await acaoPainel({ data: { slug: slugAtivo, acao } });
  } catch (e) {
    console.error("BóraMar: ação não concluída", e);
    if (typeof window !== "undefined")
      window.alert("Não deu para salvar. Confira a internet e tente de novo.");
  }
  await recarregar();
}

export const atualizarStatus = (pedidoId: string, status: StatusPedido) =>
  agir({
    tipo: "status",
    pedidoId,
    status: status as "em_preparo" | "pronto" | "entregue",
  });

export const confirmarPagamento = (pedidoId: string) =>
  agir({ tipo: "confirmarPagamento", pedidoId });

/** Cancela ou expira um pedido que nunca teve o pagamento confirmado. */
export const encerrarPedido = (pedidoId: string, status: "cancelado" | "expirado") =>
  agir({ tipo: "encerrar", pedidoId, status });

export const atualizarProduto = (produtoId: string, patch: Partial<Produto>) => {
  const limpo: {
    nome?: string;
    preco?: number;
    disponivel?: boolean;
    categoria?: string;
    descricao?: string;
    vegetariano?: boolean;
    vegano?: boolean;
    opcoes?: GrupoOpcao[];
    custo?: number | null;
  } = {};
  if (patch.custo !== undefined) limpo.custo = patch.custo;
  if (patch.descricao !== undefined) limpo.descricao = patch.descricao;
  if (patch.vegetariano !== undefined) limpo.vegetariano = patch.vegetariano;
  if (patch.vegano !== undefined) limpo.vegano = patch.vegano;
  if (patch.opcoes !== undefined) limpo.opcoes = patch.opcoes;
  if (patch.nome !== undefined) limpo.nome = patch.nome;
  if (patch.preco !== undefined) limpo.preco = patch.preco;
  if (patch.disponivel !== undefined) limpo.disponivel = patch.disponivel;
  if (patch.categoria !== undefined) limpo.categoria = patch.categoria;
  return agir({ tipo: "atualizarProduto", produtoId, patch: limpo });
};

export const criarProduto = (input: { nome: string; categoria: string; preco: number }) =>
  agir({ tipo: "criarProduto", ...input });

export const removerProduto = (produtoId: string) => agir({ tipo: "removerProduto", produtoId });

export const renomearCategoria = (de: string, para: string) =>
  agir({ tipo: "renomearCategoria", de, para });

/** Move um item para cima (-1) ou para baixo (+1) dentro da categoria. */
export const moverProduto = (produtoId: string, direcao: -1 | 1) =>
  agir({ tipo: "moverProduto", produtoId, direcao });

export const criarGarcom = (nome: string, chavePix: string) =>
  agir({ tipo: "criarGarcom", nome, chavePix });

export const removerGarcom = (garcomId: string) => agir({ tipo: "removerGarcom", garcomId });

export const alternarQrCodeMesa = (mesaId: string) => agir({ tipo: "alternarQrCode", mesaId });

/** Abre a conta da mesa: este e os próximos pedidos "pagar no final" vão para a cozinha. */
export const abrirConta = (pedidoId: string) => agir({ tipo: "abrirConta", pedidoId });

export const recusarConta = (pedidoId: string) => agir({ tipo: "recusarConta", pedidoId });

/** Marca como paga toda a conta em aberto da mesa. */
export const fecharConta = (mesaId: string, forma: "pix" | "cartao" | "dinheiro") =>
  agir({ tipo: "fecharConta", mesaId, forma });

export const registrarServico = (
  mesaId: string,
  garcomId: string | null,
  valor: number,
  forma: "pix" | "cartao" | "dinheiro",
) => agir({ tipo: "registrarServico", mesaId, garcomId, valor, forma });

/** Encerra o grupo atual da mesa: os próximos pedidos começam um grupo novo. */
export const liberarMesa = (mesaId: string) => agir({ tipo: "liberarMesa", mesaId });

// =====================================================================
// Histórico (Resultados e Histórico do painel)
// =====================================================================

/** Pedidos dos últimos `dias` dias. Recarrega ao trocar o período. */
export function useHistorico(dias: number) {
  const slug = slugAtivo;
  const [dados, setDados] = useState<{ pedidos: Pedido[]; servicos: Servico[] } | null>(null);
  const [erro, setErro] = useState(false);
  useEffect(() => {
    if (!slug) return;
    let ativo = true;
    setErro(false);
    carregarHistorico({ data: { slug, dias } })
      .then((r) => {
        if (ativo) setDados(r);
      })
      .catch((e) => {
        console.error("BóraMar: falha ao carregar histórico", e);
        if (ativo) setErro(true);
      });
    return () => {
      ativo = false;
    };
  }, [slug, dias]);
  return {
    pedidos: dados?.pedidos ?? [],
    servicos: dados?.servicos ?? [],
    carregando: dados === null && !erro,
    erro,
  };
}

// =====================================================================
// Cardápio público (cliente da mesa, QR Codes, página inicial)
// =====================================================================

export interface Cardapio {
  pronto: boolean;
  existe: boolean;
  erro: boolean;
  barraca: Barraca;
  mesas: Mesa[];
  garcons: Array<Pick<Garcom, "id" | "nome">>;
  produtos: Produto[];
}

const cardapioVazio: Cardapio = {
  pronto: false,
  existe: true,
  erro: false,
  barraca: barracaVazia,
  mesas: [],
  garcons: [],
  produtos: [],
};

/** Carrega o cardápio público da barraca uma vez (e de novo ao pedir). */
export function useCardapio(slug: string) {
  const [dados, setDados] = useState<Cardapio>(cardapioVazio);
  const [versao, setVersao] = useState(0);
  useEffect(() => {
    let ativo = true;
    carregarCardapio({ data: { slug } })
      .then((r) => {
        if (!ativo) return;
        if (!r.existe) setDados({ ...cardapioVazio, pronto: true, existe: false });
        else
          setDados({
            pronto: true,
            existe: true,
            erro: false,
            barraca: { ...r.barraca, criado_em: "" },
            mesas: r.mesas,
            garcons: r.garcons,
            produtos: r.produtos,
          });
      })
      .catch((e) => {
        console.error("BóraMar: falha ao carregar o cardápio", e);
        if (ativo) setDados((d) => ({ ...d, pronto: true, erro: true }));
      });
    return () => {
      ativo = false;
    };
  }, [slug, versao]);
  return { ...dados, recarregar: () => setVersao((v) => v + 1) };
}

/** Acompanha a situação de um pedido do cliente (a cada 5 s, até terminar). */
export function useSituacaoPedido(pedidoId: string, ativo: boolean) {
  const [situacao, setSituacao] = useState<{
    status: string;
    pago: boolean;
    total: number;
  } | null>(null);
  useEffect(() => {
    setSituacao(null);
  }, [pedidoId]);
  useEffect(() => {
    if (!pedidoId || !ativo) return;
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;
    const consultar = async () => {
      try {
        const s = await situacaoPedido({ data: { id: pedidoId } });
        if (!vivo) return;
        if (s) setSituacao(s);
        // saiu da espera (confirmado, na conta ou encerrado): nada mais a avisar
        if (s && s.status !== "novo") return;
      } catch {
        // sem sinal: tenta de novo
      }
      if (vivo) timer = setTimeout(consultar, 5000);
    };
    void consultar();
    return () => {
      vivo = false;
      clearTimeout(timer);
    };
  }, [pedidoId, ativo]);
  return situacao;
}

export interface SituacaoMesa {
  consumo: number;
  emAberto: number;
  itensEmAberto: Array<{ nome: string; quantidade: number }>;
  aguardandoAbertura: boolean;
  fechamentoSolicitado: boolean;
  servico: { percentual: number; sugerido: number; pago: number; pendente: number };
}

/** Conta e serviço da turma da mesa. Atualiza ao pedir `versao` nova e ao voltar ao app. */
export function useSituacaoMesa(slug: string, mesaId: string | undefined, versao: number) {
  const [situacao, setSituacao] = useState<SituacaoMesa | null>(null);
  const [vez, setVez] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const voltar = () => {
      if (document.visibilityState === "visible") setVez((v) => v + 1);
    };
    document.addEventListener("visibilitychange", voltar);
    return () => document.removeEventListener("visibilitychange", voltar);
  }, []);
  useEffect(() => {
    if (!mesaId) return;
    let ativo = true;
    situacaoMesa({ data: { slug, mesa_id: mesaId } })
      .then((s) => {
        if (ativo) setSituacao(s);
      })
      .catch(() => {
        // sem sinal: mantém o que já tinha
      });
    return () => {
      ativo = false;
    };
  }, [slug, mesaId, versao, vez]);
  return situacao;
}

/** O cliente avisa que pagou a conta da mesa no Pix (o caixa confere). */
/** O cliente avisa que pagou um pedido no Pix (o caixa vê "pagou no Pix · confira"). */
export const avisarQuePagouPedido = (pedidoId: string) =>
  avisarPixDoPedido({ data: { id: pedidoId } }).catch(() => {
    // sem sinal: o caixa confere pelo banco do mesmo jeito
  });

export const avisarQuePagouConta = (slug: string, mesaId: string) =>
  avisarContaPaga({ data: { slug, mesa_id: mesaId } });

/** Código Pix do serviço, direto na chave do garçom. */
export const pixServicoDoGarcom = (slug: string, garcomId: string, valor: number) =>
  pixDoServico({ data: { slug, garcom_id: garcomId, valor } });

export const avisarQuePagouServico = (
  slug: string,
  mesaId: string,
  garcomId: string,
  valor: number,
) => avisarServicoPago({ data: { slug, mesa_id: mesaId, garcom_id: garcomId, valor } });

// =====================================================================
// Envio de pedidos, com fila para quando a internet cai
// =====================================================================

const CHAVE_FILA = "boramar:pedidos-pendentes-v2";

function lerFila(): EntradaPedido[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(CHAVE_FILA) ?? "[]");
  } catch {
    return [];
  }
}
function gravarFila(fila: EntradaPedido[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
  } catch {
    // armazenamento indisponível: segue sem fila
  }
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
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // reserva para navegadores antigos: UUID v4 com Math.random
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Falha de conexão (sem sinal), e não um erro devolvido pelo servidor. */
function ehFalhaDeRede(e: unknown) {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const msg = e instanceof Error ? e.message : String(e);
  return e instanceof TypeError || /fetch|network|load failed|timeout/i.test(msg);
}

let tentando = false;
export async function reenviarPendentes() {
  if (tentando) return;
  tentando = true;
  try {
    for (const p of lerFila()) {
      try {
        await enviarPedido({ data: p });
        // entrou, ou foi recusado (ex.: item acabou): sai da fila de todo jeito
        gravarFila(lerFila().filter((x) => x.id !== p.id));
      } catch (e) {
        if (ehFalhaDeRede(e)) break; // ainda sem rede: tenta de novo depois
        console.error("BóraMar: pedido da fila recusado pelo servidor", e);
        gravarFila(lerFila().filter((x) => x.id !== p.id));
      }
    }
    if (slugAtivo && estado.liberado) await recarregar();
  } finally {
    tentando = false;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    void reenviarPendentes();
  });
  setInterval(() => {
    if (lerFila().length) void reenviarPendentes();
  }, 8000);
}

export type RespostaPedido =
  | { id: string; pendente: false; resultado: ResultadoPedido }
  | { id: string; pendente: true }
  | { id: string; pendente: false; erro: string };

/**
 * Envia um pedido (cliente ou garçom). O servidor confere preços e
 * disponibilidade. Sem internet, guarda e reenvia sozinho.
 */
export async function criarPedido(input: {
  slug?: string;
  mesa_id: string;
  garcom_id: string | null;
  origem: Pedido["origem"];
  gorjeta: number;
  /** "final" = pôr na conta da mesa e pagar no fim */
  forma_pagamento?: "pix" | "cartao" | "final";
  linhas: Array<{ produto: Produto; quantidade: number; escolhas?: Escolhas; obs?: string }>;
}): Promise<RespostaPedido> {
  const slug = input.slug ?? slugAtivo ?? "";
  const id = novoId();
  const pacote: EntradaPedido = {
    id,
    slug,
    mesa_id: input.mesa_id,
    garcom_id: input.garcom_id,
    origem: input.origem,
    gorjeta: input.gorjeta,
    forma_pagamento: input.forma_pagamento ?? "pix",
    itens: input.linhas.map((l) => ({
      id: novoId(),
      produto_id: l.produto.id,
      quantidade: l.quantidade,
      ...(l.escolhas && Object.keys(l.escolhas).length ? { escolhas: l.escolhas } : {}),
      ...(l.obs ? { obs: l.obs } : {}),
    })),
  };

  try {
    const resultado = await enviarPedido({ data: pacote });
    if (slugAtivo && estado.liberado) await recarregar();
    return { id, pendente: false, resultado };
  } catch (e) {
    if (!ehFalhaDeRede(e)) {
      console.error("BóraMar: pedido recusado pelo servidor", e);
      return { id, pendente: false, erro: e instanceof Error ? e.message : String(e) };
    }
    console.error("BóraMar: pedido guardado para reenvio", e);
    gravarFila([...lerFila(), pacote]);
    void reenviarPendentes();
    return { id, pendente: true };
  }
}

/** Mensagem para mostrar quando o pedido não entrou (ou null se entrou). */
export function avisoDoPedido(r: RespostaPedido): string | null {
  if (r.pendente) return null;
  if ("erro" in r) return "Não deu para registrar o pedido: " + r.erro;
  const res = r.resultado;
  if (res.ok) return null;
  switch (res.motivo) {
    case "escolha":
      return res.erro;
    case "indisponivel":
      return "Estes itens acabaram ou saíram do cardápio: " + res.itens.join(", ") + ".";
    case "garcom":
      return "Escolha quem atendeu para registrar a caixinha.";
    case "mesa":
      return "Essa mesa não existe nesta barraca.";
    case "limite":
      return `Sua conta já está em ${formatarReal(res.emAberto)}. Que tal acertar antes do próximo pedido?`;
    case "final_desligado":
      return "Aqui o pagamento é feito na hora. Escolha Pix ou cartão.";
    case "barraca":
      return "Esta barraca não está recebendo pedidos agora.";
    default:
      return "Pedido inválido. Confira os itens e tente de novo.";
  }
}

export const formatarReal = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
