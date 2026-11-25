// Escolhas por item do cardápio (ex.: bebida e frutas da caipirinha).
// Usado pelo servidor (confere escolhas e preço) e pelas telas (mostra e calcula).

export interface ItemOpcao {
  id: string;
  nome: string;
  /** texto curto ao lado do nome, ex.: "caipirosca" */
  apelido?: string;
  /** acréscimo no preço do item (0 = mesmo preço) */
  preco: number;
  disponivel: boolean;
}

export interface GrupoOpcao {
  id: string;
  nome: string;
  /** mínimo de escolhas (0 = opcional) */
  min: number;
  /** máximo de escolhas (1 = escolhe uma; 2 ou mais = pode misturar) */
  max: number;
  /** acréscimo quando o cliente escolhe mais de uma (mistura) */
  precoMistura: number;
  itens: ItemOpcao[];
}

/** Escolhas de um item no pedido: id do grupo → ids dos itens escolhidos. */
export type Escolhas = Record<string, string[]>;

export const FRUTAS_BRASIL = [
  "Limão",
  "Limão-siciliano",
  "Maracujá",
  "Morango",
  "Abacaxi",
  "Kiwi",
  "Caju",
  "Cajá",
  "Umbu",
  "Seriguela",
  "Acerola",
  "Manga",
  "Uva",
  "Tangerina",
  "Pitanga",
  "Graviola",
  "Cupuaçu",
  "Jabuticaba",
  "Mangaba",
  "Frutas vermelhas",
  "Melancia",
  "Lichia",
  "Tamarindo",
  "Carambola",
  "Goiaba",
];

const COMUNS = new Set([
  "Limão",
  "Maracujá",
  "Morango",
  "Abacaxi",
  "Kiwi",
  "Caju",
  "Cajá",
  "Uva",
  "Manga",
]);

export const idDe = (texto: string) =>
  texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "item";

/** Modelo pronto: bebida (cachaça, vodka, saquê) + frutas brasileiras. */
export function modeloCaipirinha(): GrupoOpcao[] {
  return [
    {
      id: "bebida",
      nome: "Bebida",
      min: 1,
      max: 1,
      precoMistura: 0,
      itens: [
        { id: "cachaca", nome: "Cachaça", apelido: "caipirinha", preco: 0, disponivel: true },
        { id: "vodka", nome: "Vodka", apelido: "caipirosca", preco: 0, disponivel: true },
        { id: "saque", nome: "Saquê", apelido: "sakerinha", preco: 0, disponivel: false },
      ],
    },
    {
      id: "fruta",
      nome: "Fruta",
      min: 1,
      max: 1,
      precoMistura: 0,
      itens: FRUTAS_BRASIL.map((f) => ({
        id: idDe(f),
        nome: f,
        preco: 0,
        disponivel: COMUNS.has(f),
      })),
    },
  ];
}

const num = (v: unknown, padrao = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};
const txt = (v: unknown, max = 40) =>
  String(v ?? "")
    .trim()
    .slice(0, max);

/** Limpa e limita o que vier do navegador (nunca confiar no formato recebido). */
export function sanitizarOpcoes(bruto: unknown): GrupoOpcao[] {
  if (!Array.isArray(bruto)) return [];
  const grupos: GrupoOpcao[] = [];
  const idsGrupo = new Set<string>();
  for (const g of bruto.slice(0, 6)) {
    if (!g || typeof g !== "object") continue;
    const r = g as Record<string, unknown>;
    const nome = txt(r["nome"]);
    if (!nome) continue;
    let id = idDe(txt(r["id"]) || nome);
    while (idsGrupo.has(id)) id += "-2";
    idsGrupo.add(id);
    const idsItem = new Set<string>();
    const itens: ItemOpcao[] = [];
    for (const i of Array.isArray(r["itens"]) ? r["itens"].slice(0, 40) : []) {
      if (!i || typeof i !== "object") continue;
      const ri = i as Record<string, unknown>;
      const nomeItem = txt(ri["nome"]);
      if (!nomeItem) continue;
      let idItem = idDe(txt(ri["id"]) || nomeItem);
      while (idsItem.has(idItem)) idItem += "-2";
      idsItem.add(idItem);
      const apelido = txt(ri["apelido"], 30);
      itens.push({
        id: idItem,
        nome: nomeItem,
        ...(apelido ? { apelido } : {}),
        preco: Math.max(0, Math.min(1000, Math.round(num(ri["preco"]) * 100) / 100)),
        disponivel: ri["disponivel"] !== false,
      });
    }
    const max = Math.max(1, Math.min(5, Math.floor(num(r["max"], 1))));
    grupos.push({
      id,
      nome,
      min: Math.max(0, Math.min(max, Math.floor(num(r["min"], 1)))),
      max,
      precoMistura: Math.max(0, Math.min(1000, Math.round(num(r["precoMistura"]) * 100) / 100)),
      itens,
    });
  }
  return grupos;
}

export type ResultadoEscolhas =
  { ok: true; precoUnitario: number; nome: string; detalhe: string } | { ok: false; erro: string };

/** Confere as escolhas de um item e calcula o preço e o nome que vai para o pedido. */
export function aplicarEscolhas(
  produto: { nome: string; preco: number; opcoes: GrupoOpcao[] },
  escolhas: Escolhas | undefined,
): ResultadoEscolhas {
  let preco = Number(produto.preco);
  const partes: string[] = [];
  for (const g of produto.opcoes ?? []) {
    if (g.itens.length === 0) continue; // grupo ainda sem opções cadastradas
    const bruto: unknown = escolhas && typeof escolhas === "object" ? escolhas[g.id] : undefined;
    const ids = [...new Set((Array.isArray(bruto) ? bruto.slice(0, 10) : []).map(String))];
    if (ids.length < g.min)
      return {
        ok: false,
        erro: g.min === 1 ? `Escolha a ${g.nome.toLowerCase()}.` : `Escolha ${g.min} em ${g.nome}.`,
      };
    if (ids.length > g.max) return { ok: false, erro: `Em ${g.nome}, no máximo ${g.max}.` };
    const escolhidos: ItemOpcao[] = [];
    for (const id of ids) {
      const item = g.itens.find((i) => i.id === id);
      if (!item) return { ok: false, erro: `Opção inválida em ${g.nome}.` };
      if (!item.disponivel) return { ok: false, erro: `${item.nome} acabou.` };
      escolhidos.push(item);
    }
    preco += escolhidos.reduce((s, i) => s + i.preco, 0);
    if (escolhidos.length > 1) preco += g.precoMistura;
    if (escolhidos.length) partes.push(escolhidos.map((i) => i.nome).join(" + "));
  }
  const detalhe = partes.join(" · ");
  return {
    ok: true,
    precoUnitario: Math.round(preco * 100) / 100,
    nome: detalhe ? `${produto.nome} (${detalhe})` : produto.nome,
    detalhe,
  };
}

/** Escolhas iniciais: em grupos obrigatórios de uma opção, já marca a primeira disponível. */
export function escolhasIniciais(opcoes: GrupoOpcao[]): Escolhas {
  const e: Escolhas = {};
  for (const g of opcoes) {
    const primeira = g.itens.find((i) => i.disponivel);
    e[g.id] = g.min >= 1 && g.max === 1 && g.id === "bebida" && primeira ? [primeira.id] : [];
  }
  return e;
}

/** Dá para pedir? (algum grupo obrigatório pode ter ficado sem nada disponível) */
export function temEscolhaPossivel(opcoes: GrupoOpcao[]): boolean {
  return opcoes.every(
    (g) => g.itens.length === 0 || g.itens.filter((i) => i.disponivel).length >= g.min,
  );
}
