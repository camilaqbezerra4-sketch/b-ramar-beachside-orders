import { useMemo, useState } from "react";
import { formatarReal } from "@/lib/store";
import {
  aplicarEscolhas,
  escolhasIniciais,
  limparObs,
  MAX_OBS,
  normalizarBusca,
  separarObs,
  temEscolhaPossivel,
  type Escolhas,
} from "@/lib/opcoes";
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
  /** observação do cliente, ex.: "pouco açúcar" */
  obs: string;
}

const chaveDe = (produtoId: string, escolhas: Escolhas, obs = "") =>
  obs +
  "|" +
  produtoId +
  "|" +
  Object.keys(escolhas)
    .sort()
    .map((g) => `${g}:${[...(escolhas[g] ?? [])].sort().join(",")}`)
    .join(";");

/** Carrinho com escolhas por item. */
export function useCarrinho(produtos: Produto[]) {
  const [itens, setItens] = useState<
    Array<{ chave: string; produtoId: string; escolhas: Escolhas; quantidade: number; obs: string }>
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
        obs: i.obs,
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
    adicionar(produto: Produto, escolhas: Escolhas = {}, obsBruta = "") {
      const obs = limparObs(obsBruta);
      const chave = chaveDe(produto.id, escolhas, obs);
      setItens((atual) =>
        atual.some((i) => i.chave === chave)
          ? atual.map((i) => (i.chave === chave ? { ...i, quantidade: i.quantidade + 1 } : i))
          : [...atual, { chave, produtoId: produto.id, escolhas, quantidade: 1, obs }],
      );
    },
    /** muda a observação de uma linha (junta com outra linha igual, se houver) */
    definirObs(chave: string, obsBruta: string) {
      const obs = limparObs(obsBruta);
      setItens((atual) => {
        const linha = atual.find((i) => i.chave === chave);
        if (!linha || linha.obs === obs) return atual;
        const nova = chaveDe(linha.produtoId, linha.escolhas, obs);
        const resto = atual.filter((i) => i.chave !== chave);
        const igual = resto.find((i) => i.chave === nova);
        if (igual)
          return resto.map((i) =>
            i.chave === nova ? { ...i, quantidade: i.quantidade + linha.quantidade } : i,
          );
        return atual.map((i) => (i.chave === chave ? { ...i, chave: nova, obs } : i));
      });
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
  aoConfirmar: (escolhas: Escolhas, obs: string) => void;
  aoFechar: () => void;
}) {
  const [escolhas, setEscolhas] = useState<Escolhas>(() => escolhasIniciais(produto.opcoes));
  const [obs, setObs] = useState("");
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
    <div className="fixed inset-0 z-[60] flex flex-col bg-background">
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
        <label className="block text-lg font-extrabold">
          Observação <span className="font-semibold text-muted-foreground">(opcional)</span>
          <input
            value={obs}
            onChange={(e) => setObs(e.target.value.slice(0, MAX_OBS))}
            placeholder="Ex.: pouco açúcar, sem gelo"
            className="mt-1 w-full rounded-xl border-2 border-border bg-card px-3 py-3 text-base font-semibold"
          />
        </label>
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
            onClick={() => aoConfirmar(escolhas, obs)}
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
  const [busca, setBusca] = useState("");
  const comEscolhas = (p: Produto) => p.opcoes.some((g) => g.itens.length > 0);
  const termo = normalizarBusca(busca);
  const visiveis = termo ? produtos.filter((p) => combinaBusca(p, termo)) : produtos;
  const categorias = [...new Set(visiveis.map((p) => p.categoria))];

  return (
    <>
      {carrinho.linhas.length > 0 && (
        <ul className="card-praia mt-5 divide-y-2 divide-border p-3">
          {carrinho.linhas.map((l) => (
            <li key={l.chave} className="flex items-center gap-2 py-2 text-base">
              <span className="min-w-0 flex-1 font-bold">
                {l.quantidade}× {l.nome}
                <CampoObs obs={l.obs} aoMudar={(o) => carrinho.definirObs(l.chave, o)} />
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

      <BuscaCardapio valor={busca} aoMudar={setBusca} />

      {categorias.map((c) => {
        const daCategoria = visiveis.filter(
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
          aoConfirmar={(e, obs) => {
            carrinho.adicionar(escolhendo, e, obs);
            setEscolhendo(null);
          }}
        />
      )}
      {termo && categorias.length === 0 && (
        <p className="mt-4 text-lg font-bold text-muted-foreground">
          Nada com “{busca.trim()}” no cardápio.
        </p>
      )}
    </>
  );
}

/** O produto combina com a busca (nome, categoria ou descrição; sem acento). */
export function combinaBusca(p: Produto, termo: string) {
  return normalizarBusca(`${p.nome} ${p.categoria} ${p.descricao}`).includes(termo);
}

/** Campo de busca do cardápio. */
export function BuscaCardapio({ valor, aoMudar }: { valor: string; aoMudar: (v: string) => void }) {
  return (
    <div className="relative mt-4">
      <input
        type="search"
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder="🔍 Buscar no cardápio"
        aria-label="Buscar no cardápio"
        className="w-full rounded-xl border-2 border-border bg-card px-3 py-3 text-lg font-semibold"
      />
      {valor && (
        <button
          onClick={() => aoMudar("")}
          aria-label="Limpar busca"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-3 py-1 text-lg font-extrabold text-muted-foreground"
        >
          ✕
        </button>
      )}
    </div>
  );
}

/** Observação de uma linha do pedido: mostra, ou abre um campo para escrever. */
export function CampoObs({ obs, aoMudar }: { obs: string; aoMudar: (obs: string) => void }) {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState(obs);
  if (editando)
    return (
      <input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX_OBS))}
        onBlur={() => {
          setEditando(false);
          aoMudar(texto);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        placeholder="Ex.: pouco açúcar, sem gelo"
        aria-label="Observação"
        className="mt-1 block w-full rounded-lg border-2 border-primary bg-background px-2 py-1 text-base font-semibold"
      />
    );
  return (
    <button
      onClick={() => {
        setTexto(obs);
        setEditando(true);
      }}
      className="mt-0.5 block text-left text-sm font-bold text-primary underline-offset-2 hover:underline"
    >
      {obs ? `Obs: ${obs} · mudar` : "+ observação"}
    </button>
  );
}

/** Nome de item do pedido com a observação destacada (cozinha, caixa, conta). */
export function NomeComObs({ nome }: { nome: string }) {
  const { nome: base, obs } = separarObs(nome);
  return (
    <>
      {base}
      {obs && (
        <span className="ml-1 rounded-md bg-accent/20 px-1.5 py-0.5 font-extrabold text-foreground">
          Obs: {obs}
        </span>
      )}
    </>
  );
}
