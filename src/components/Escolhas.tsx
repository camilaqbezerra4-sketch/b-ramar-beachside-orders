import { useMemo, useState } from "react";
import { formatarReal } from "@/lib/store";
import { aplicarEscolhas, escolhasIniciais, temEscolhaPossivel, type Escolhas } from "@/lib/opcoes";
import type { Produto } from "@/lib/types";

/** Uma linha do carrinho: o mesmo produto com escolhas diferentes vira linhas diferentes. */
export interface LinhaCarrinho {
  chave: string;
  produto: Produto;
  escolhas: Escolhas;
  quantidade: number;
  /** preço de uma unidade, já com as escolhas */
  preco: number;
  /** nome com as escolhas, ex.: "Caipirinha (Vodka · Maracujá + Morango)" */
  nome: string;
}

const chaveDe = (produtoId: string, escolhas: Escolhas) =>
  produtoId +
  "|" +
  Object.keys(escolhas)
    .sort()
    .map((g) => `${g}:${[...(escolhas[g] ?? [])].sort().join(",")}`)
    .join(";");

/** Carrinho com escolhas por item. */
export function useCarrinho(produtos: Produto[]) {
  const [itens, setItens] = useState<
    Array<{ chave: string; produtoId: string; escolhas: Escolhas; quantidade: number }>
  >([]);

  const linhas = useMemo<LinhaCarrinho[]>(() => {
    const saida: LinhaCarrinho[] = [];
    for (const i of itens) {
      const produto = produtos.find((p) => p.id === i.produtoId);
      if (!produto || !produto.disponivel || i.quantidade <= 0) continue;
      const r = aplicarEscolhas(produto, i.escolhas);
      if (!r.ok) continue; // uma escolha acabou: some do carrinho
      saida.push({
        chave: i.chave,
        produto,
        escolhas: i.escolhas,
        quantidade: i.quantidade,
        preco: r.precoUnitario,
        nome: r.nome,
      });
    }
    return saida;
  }, [itens, produtos]);

  return {
    linhas,
    total: linhas.reduce((s, l) => s + l.preco * l.quantidade, 0),
    quantidadeTotal: linhas.reduce((s, l) => s + l.quantidade, 0),
    quantidadeDo: (produtoId: string) =>
      itens.filter((i) => i.produtoId === produtoId).reduce((s, i) => s + i.quantidade, 0),
    adicionar(produto: Produto, escolhas: Escolhas = {}) {
      const chave = chaveDe(produto.id, escolhas);
      setItens((atual) =>
        atual.some((i) => i.chave === chave)
          ? atual.map((i) => (i.chave === chave ? { ...i, quantidade: i.quantidade + 1 } : i))
          : [...atual, { chave, produtoId: produto.id, escolhas, quantidade: 1 }],
      );
    },
    /** tira uma unidade da linha */
    tirar(chave: string) {
      setItens((atual) =>
        atual
          .map((i) => (i.chave === chave ? { ...i, quantidade: i.quantidade - 1 } : i))
          .filter((i) => i.quantidade > 0),
      );
    },
    /** tira uma unidade da última linha desse produto */
    tirarDoProduto(produtoId: string) {
      setItens((atual) => {
        const ultima = [...atual].reverse().find((i) => i.produtoId === produtoId);
        if (!ultima) return atual;
        return atual
          .map((i) => (i.chave === ultima.chave ? { ...i, quantidade: i.quantidade - 1 } : i))
          .filter((i) => i.quantidade > 0);
      });
    },
    limpar() {
      setItens([]);
    },
  };
}

/** Janela para escolher bebida, frutas etc. antes de pôr o item no pedido. */
export function JanelaEscolhas({
  produto,
  aoConfirmar,
  aoFechar,
}: {
  produto: Produto;
  aoConfirmar: (escolhas: Escolhas) => void;
  aoFechar: () => void;
}) {
  const [escolhas, setEscolhas] = useState<Escolhas>(() => escolhasIniciais(produto.opcoes));
  const resultado = aplicarEscolhas(produto, escolhas);

  function tocar(grupoId: string, itemId: string, max: number) {
    setEscolhas((e) => {
      const atuais = e[grupoId] ?? [];
      if (atuais.includes(itemId)) return { ...e, [grupoId]: atuais.filter((x) => x !== itemId) };
      if (max === 1) return { ...e, [grupoId]: [itemId] };
      if (atuais.length >= max) return e;
      return { ...e, [grupoId]: [...atuais, itemId] };
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="border-b-2 border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="text-2xl font-extrabold">{produto.nome}</h2>
            {produto.descricao && (
              <p className="text-base text-muted-foreground">{produto.descricao}</p>
            )}
          </div>
          <button onClick={aoFechar} className="btn-base border-2 border-border">
            Fechar
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4">
        {produto.opcoes.map((g) => {
          const marcados = escolhas[g.id] ?? [];
          return (
            <section key={g.id} className="mb-6">
              <h3 className="text-xl font-extrabold">{g.nome}</h3>
              <p className="text-base text-muted-foreground">
                {g.max === 1
                  ? g.min
                    ? "Escolha uma"
                    : "Opcional"
                  : `Escolha até ${g.max}${g.precoMistura > 0 ? ` · misturar + ${formatarReal(g.precoMistura)}` : " · misturar sai pelo mesmo preço"}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {g.itens.map((i) => {
                  const marcado = marcados.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      disabled={!i.disponivel}
                      onClick={() => tocar(g.id, i.id, g.max)}
                      aria-pressed={marcado}
                      className={`btn-base border-2 ${
                        marcado
                          ? "border-primary bg-primary text-primary-foreground"
                          : i.disponivel
                            ? "border-border bg-card"
                            : "border-border bg-card opacity-45"
                      }`}
                    >
                      {i.nome}
                      {i.apelido ? (
                        <span className="ml-1 font-semibold opacity-80">({i.apelido})</span>
                      ) : null}
                      {i.preco > 0 ? (
                        <span className="ml-1 font-semibold opacity-80">
                          + {formatarReal(i.preco)}
                        </span>
                      ) : null}
                      {!i.disponivel ? <span className="ml-1 font-semibold">· acabou</span> : null}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <div className="border-t-2 border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            {resultado.ok ? (
              <>
                <p className="text-sm font-bold text-muted-foreground">
                  {resultado.detalhe || produto.nome}
                </p>
                <p className="text-2xl font-extrabold">{formatarReal(resultado.precoUnitario)}</p>
              </>
            ) : (
              <p className="text-lg font-bold">{resultado.erro}</p>
            )}
          </div>
          <button
            disabled={!resultado.ok}
            onClick={() => aoConfirmar(escolhas)}
            className="btn-base bg-accent px-6 text-accent-foreground disabled:opacity-50"
          >
            Pôr no pedido
          </button>
        </div>
      </div>
    </div>
  );
}

/** Etiquetas de vegetariano / vegano. */
export function SelosVeg({ produto }: { produto: Produto }) {
  if (!produto.vegano && !produto.vegetariano) return null;
  return (
    <span className="ml-2 inline-block rounded-full bg-success/15 px-2 py-0.5 align-middle text-sm font-extrabold text-success">
      {produto.vegano ? "🌱 vegano" : "🌱 vegetariano"}
    </span>
  );
}

/** Lista de itens para a equipe lançar pedido (caixa e garçom), com escolhas. */
export function ItensParaLancar({
  produtos,
  carrinho,
}: {
  produtos: Produto[];
  carrinho: ReturnType<typeof useCarrinho>;
}) {
  const [escolhendo, setEscolhendo] = useState<Produto | null>(null);
  const comEscolhas = (p: Produto) => p.opcoes.some((g) => g.itens.length > 0);
  const categorias = [...new Set(produtos.map((p) => p.categoria))];

  return (
    <>
      {carrinho.linhas.length > 0 && (
        <ul className="card-praia mt-5 divide-y-2 divide-border p-3">
          {carrinho.linhas.map((l) => (
            <li key={l.chave} className="flex items-center gap-2 py-2 text-base">
              <span className="min-w-0 flex-1 font-bold">
                {l.quantidade}× {l.nome}
              </span>
              <span className="font-extrabold">{formatarReal(l.preco * l.quantidade)}</span>
              <button
                aria-label={`Tirar um ${l.nome}`}
                onClick={() => carrinho.tirar(l.chave)}
                className="btn-base h-10 w-10 border-2 border-border bg-card px-0 text-xl"
              >
                −
              </button>
            </li>
          ))}
        </ul>
      )}

      {categorias.map((c) => {
        const daCategoria = produtos.filter(
          (p) => p.categoria === c && p.disponivel && temEscolhaPossivel(p.opcoes),
        );
        if (!daCategoria.length) return null;
        return (
          <section key={c} className="mt-5">
            <h3 className="text-xl font-extrabold">{c}</h3>
            <div className="mt-2 grid gap-2">
              {daCategoria.map((p) => (
                <div key={p.id} className="card-praia flex items-center gap-2 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-lg font-extrabold">
                      {p.nome}
                      <SelosVeg produto={p} />
                    </p>
                    <p className="text-base text-muted-foreground">
                      {comEscolhas(p) ? "a partir de " : ""}
                      {formatarReal(p.preco)}
                    </p>
                  </div>
                  <button
                    onClick={() => carrinho.tirarDoProduto(p.id)}
                    aria-label={`Tirar ${p.nome}`}
                    className="btn-base h-12 w-12 border-2 border-border bg-card text-2xl"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-lg font-extrabold">
                    {carrinho.quantidadeDo(p.id)}
                  </span>
                  <button
                    onClick={() => (comEscolhas(p) ? setEscolhendo(p) : carrinho.adicionar(p))}
                    aria-label={`Adicionar ${p.nome}`}
                    className="btn-base h-12 w-12 bg-accent text-2xl text-accent-foreground"
                  >
                    +
                  </button>
                </div>
              ))}
            </div>
          </section>
        );
      })}

      {escolhendo && (
        <JanelaEscolhas
          produto={escolhendo}
          aoFechar={() => setEscolhendo(null)}
          aoConfirmar={(e) => {
            carrinho.adicionar(escolhendo, e);
            setEscolhendo(null);
          }}
        />
      )}
    </>
  );
}
