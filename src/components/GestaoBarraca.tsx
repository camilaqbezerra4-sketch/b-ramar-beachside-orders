import { useState } from "react";
import {
  atualizarProduto,
  criarGarcom,
  criarProduto,
  moverProduto,
  removerGarcom,
  removerProduto,
  renomearCategoria,
  useDados,
} from "@/lib/store";
import { categoriasDe, type Produto } from "@/lib/types";

export function AbaCardapio({ produtos }: { produtos: Produto[] }) {
  const categorias = categoriasDe(produtos);
  const [nome, setNome] = useState("");
  const [preco, setPreco] = useState("");
  const [categoria, setCategoria] = useState(categorias[0] ?? "Bebidas");
  const [novaCategoria, setNovaCategoria] = useState("");

  async function adicionar() {
    const valor = Number(preco.replace(",", "."));
    const cat = (novaCategoria.trim() || categoria).trim();
    if (!nome.trim() || !cat || !Number.isFinite(valor)) return;
    await criarProduto({ nome: nome.trim(), categoria: cat, preco: valor });
    setNome("");
    setPreco("");
    setNovaCategoria("");
    setCategoria(cat);
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold">Cardápio</h1>

      <div className="card-praia mt-4 grid gap-3 p-4">
        <p className="text-lg font-extrabold">Adicionar item</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do item"
          aria-label="Nome do item"
          className="w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Categoria"
            className="flex-1 rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
          >
            {categorias.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <input
            value={preco}
            onChange={(e) => setPreco(e.target.value)}
            inputMode="decimal"
            placeholder="Preço"
            aria-label="Preço"
            className="w-28 rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
          />
        </div>
        <input
          value={novaCategoria}
          onChange={(e) => setNovaCategoria(e.target.value)}
          placeholder="Ou crie uma categoria nova"
          aria-label="Nova categoria"
          className="w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
        />
        <button
          onClick={() => void adicionar()}
          className="btn-base bg-accent text-accent-foreground"
        >
          Adicionar ao cardápio
        </button>
      </div>

      {categorias.map((c) => {
        const daCategoria = produtos.filter((p) => p.categoria === c);
        if (daCategoria.length === 0) return null;
        return (
          <section key={c} className="mt-6">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 text-2xl font-extrabold">{c}</h2>
              <button
                onClick={() => {
                  const novo = window.prompt("Novo nome da categoria", c);
                  if (novo && novo.trim() && novo.trim() !== c)
                    void renomearCategoria(c, novo.trim());
                }}
                className="btn-base border-2 border-border bg-card"
              >
                Renomear
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {daCategoria.map((p, i) => (
                <div key={p.id} className="card-praia grid gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      value={p.nome}
                      onChange={(e) =>
                        atualizarProduto(p.id, { nome: e.target.value })
                      }
                      aria-label={`Nome de ${p.nome}`}
                      className="min-w-0 flex-1 rounded-xl border-2 border-border bg-background px-3 py-2 text-lg font-extrabold"
                    />
                    <label className="flex items-center gap-1 text-lg font-bold">
                      R$
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        value={p.preco}
                        onChange={(e) =>
                          atualizarProduto(p.id, {
                            preco: Number(e.target.value),
                          })
                        }
                        aria-label={`Preço de ${p.nome}`}
                        className="w-24 rounded-xl border-2 border-border bg-background px-2 py-2 text-lg font-bold"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        atualizarProduto(p.id, { disponivel: !p.disponivel })
                      }
                      aria-pressed={p.disponivel}
                      className={`btn-base min-w-[7.5rem] ${
                        p.disponivel
                          ? "bg-success text-success-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {p.disponivel ? "Disponível" : "Acabou"}
                    </button>
                    <button
                      disabled={i === 0}
                      onClick={() => void moverProduto(p.id, -1)}
                      aria-label={`Subir ${p.nome}`}
                      className="btn-base border-2 border-border bg-card"
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === daCategoria.length - 1}
                      onClick={() => void moverProduto(p.id, 1)}
                      aria-label={`Descer ${p.nome}`}
                      className="btn-base border-2 border-border bg-card"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remover ${p.nome} do cardápio?`))
                          void removerProduto(p.id);
                      }}
                      className="btn-base border-2 border-border bg-card text-destructive"
                    >
                      Remover
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </>
  );
}

export function AbaEquipe() {
  const { garcons } = useDados();
  const [nome, setNome] = useState("");
  const [pix, setPix] = useState("");

  return (
    <>
      <h1 className="text-3xl font-extrabold">Equipe</h1>
      <div className="card-praia mt-4 grid gap-3 p-4">
        <p className="text-lg font-extrabold">Adicionar garçom</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          aria-label="Nome do garçom"
          className="w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
        />
        <input
          value={pix}
          onChange={(e) => setPix(e.target.value)}
          placeholder="Chave Pix"
          aria-label="Chave Pix do garçom"
          className="w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
        />
        <button
          onClick={() => {
            if (!nome.trim()) return;
            void criarGarcom(nome.trim(), pix.trim());
            setNome("");
            setPix("");
          }}
          className="btn-base bg-accent text-accent-foreground"
        >
          Adicionar
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {garcons.map((g) => (
          <div key={g.id} className="card-praia flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold">{g.nome}</p>
              <p className="text-base text-muted-foreground">
                {g.chave_pix || "sem chave Pix"}
              </p>
            </div>
            <button
              onClick={() => {
                if (window.confirm(`Remover ${g.nome} da equipe?`))
                  void removerGarcom(g.id);
              }}
              className="btn-base border-2 border-border bg-card text-destructive"
            >
              Remover
            </button>
          </div>
        ))}
        {garcons.length === 0 && (
          <p className="text-lg text-muted-foreground">
            Nenhum garçom cadastrado.
          </p>
        )}
      </div>
    </>
  );
}
