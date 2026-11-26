import { useEffect, useState } from "react";
import {
  atualizarProduto,
  formatarReal,
  criarGarcom,
  criarProduto,
  editarGarcom,
  moverProduto,
  removerGarcom,
  removerProduto,
  renomearCategoria,
  useDados,
} from "@/lib/store";
import { categoriasComSugestoes, categoriasDe, type Produto } from "@/lib/types";
import { CampoChavePix } from "@/components/CampoChavePix";
import { analisarChavePix } from "@/lib/chave-pix";
import { EditorOpcoes } from "@/components/EditorOpcoes";

export function AbaCardapio({ produtos }: { produtos: Produto[] }) {
  const categorias = categoriasDe(produtos);
  const opcoesCategoria = categoriasComSugestoes(produtos);
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
      <h1 className="text-3xl font-bold">Cardápio</h1>

      <div className="card-praia mt-4 grid gap-3 p-4">
        <p className="text-lg font-bold">Adicionar item</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome do item"
          aria-label="Nome do item"
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
        />
        <div className="flex flex-wrap gap-2">
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            aria-label="Categoria"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
          >
            {opcoesCategoria.map((c) => (
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
            className="w-28 rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
          />
        </div>
        <input
          value={novaCategoria}
          onChange={(e) => setNovaCategoria(e.target.value)}
          placeholder="Ou crie uma categoria nova"
          aria-label="Nova categoria"
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
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
              <h2 className="flex-1 text-2xl font-bold">{c}</h2>
              <button
                onClick={() => {
                  const novo = window.prompt("Novo nome da categoria", c);
                  if (novo && novo.trim() && novo.trim() !== c)
                    void renomearCategoria(c, novo.trim());
                }}
                className="btn-base border border-border bg-card"
              >
                Renomear
              </button>
            </div>
            <div className="mt-3 grid gap-3">
              {daCategoria.map((p, i) => (
                <div key={p.id} className="card-praia grid gap-3 p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <CampoSalvaAoSair
                      valor={p.nome}
                      aoSalvar={(v) => {
                        const nome = v.trim();
                        if (nome && nome !== p.nome) void atualizarProduto(p.id, { nome });
                      }}
                      rotulo={`Nome de ${p.nome}`}
                      className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-lg font-bold"
                    />
                    <label className="flex items-center gap-1 text-lg font-semibold">
                      R$
                      <CampoSalvaAoSair
                        valor={String(p.preco)}
                        numerico
                        aoSalvar={(v) => {
                          const preco = Number(v.replace(",", "."));
                          if (Number.isFinite(preco) && preco >= 0 && preco !== p.preco)
                            void atualizarProduto(p.id, { preco });
                        }}
                        rotulo={`Preço de ${p.nome}`}
                        className="w-24 rounded-xl border border-border bg-background px-2 py-2 text-lg font-semibold"
                      />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-muted-foreground">
                    <label className="flex items-center gap-1">
                      Custo R$
                      <CampoSalvaAoSair
                        valor={p.custo == null ? "" : String(p.custo)}
                        numerico
                        placeholder="—"
                        aoSalvar={(v) => {
                          const t = v.trim();
                          if (!t) {
                            if (p.custo != null) void atualizarProduto(p.id, { custo: null });
                            return;
                          }
                          const custo = Number(t.replace(",", "."));
                          if (Number.isFinite(custo) && custo >= 0 && custo !== p.custo)
                            void atualizarProduto(p.id, { custo });
                        }}
                        rotulo={`Custo de ${p.nome}`}
                        className="w-20 rounded-lg border border-border bg-background px-2 py-1 text-base"
                      />
                    </label>
                    <span>
                      {p.custo != null && p.preco > 0
                        ? `Sobra ${formatarReal(p.preco - p.custo)} por unidade (${Math.round(((p.preco - p.custo) / p.preco) * 100)}%)`
                        : "Opcional: quanto este item custa para a barraca. Só a equipe vê."}
                    </span>
                  </div>
                  <CampoSalvaAoSair
                    valor={p.descricao}
                    aoSalvar={(v) => {
                      const descricao = v.trim().slice(0, 160);
                      if (descricao !== p.descricao) void atualizarProduto(p.id, { descricao });
                    }}
                    rotulo={`Descrição de ${p.nome}`}
                    placeholder="Descrição (opcional): ingredientes, tamanho, serve quantos…"
                    className="w-full rounded-xl border border-border bg-background px-3 py-2 text-base font-semibold"
                  />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() =>
                        void atualizarProduto(
                          p.id,
                          p.vegetariano
                            ? { vegetariano: false, vegano: false }
                            : { vegetariano: true },
                        )
                      }
                      aria-pressed={p.vegetariano}
                      className={`btn-base border ${p.vegetariano ? "border-success bg-success text-success-foreground" : "border-border bg-card"}`}
                    >
                      🌱 Vegetariano
                    </button>
                    <button
                      onClick={() =>
                        void atualizarProduto(
                          p.id,
                          p.vegano ? { vegano: false } : { vegano: true, vegetariano: true },
                        )
                      }
                      aria-pressed={p.vegano}
                      className={`btn-base border ${p.vegano ? "border-success bg-success text-success-foreground" : "border-border bg-card"}`}
                    >
                      🌱 Vegano
                    </button>
                  </div>
                  <EditorOpcoes produto={p} />
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => atualizarProduto(p.id, { disponivel: !p.disponivel })}
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
                      className="btn-base border border-border bg-card"
                    >
                      ↑
                    </button>
                    <button
                      disabled={i === daCategoria.length - 1}
                      onClick={() => void moverProduto(p.id, 1)}
                      aria-label={`Descer ${p.nome}`}
                      className="btn-base border border-border bg-card"
                    >
                      ↓
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Remover ${p.nome} do cardápio?`))
                          void removerProduto(p.id);
                      }}
                      className="btn-base border border-border bg-card text-destructive"
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
  const chave = analisarChavePix(pix);
  const podeSalvar = nome.trim().length > 0 && chave.ok;

  return (
    <>
      <h1 className="text-3xl font-bold">Equipe</h1>
      <div className="card-praia mt-4 grid gap-3 p-4">
        <p className="text-lg font-bold">Adicionar garçom</p>
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Nome"
          aria-label="Nome do garçom"
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
        />
        <CampoChavePix valor={pix} aoMudar={setPix} rotulo="Chave Pix do garçom" />
        <button
          disabled={!podeSalvar}
          onClick={() => {
            if (!podeSalvar) return;
            void criarGarcom(nome.trim(), chave.valor);
            setNome("");
            setPix("");
          }}
          className="btn-base bg-accent text-accent-foreground disabled:opacity-50"
        >
          Adicionar
        </button>
      </div>

      <div className="mt-4 grid gap-3">
        {garcons.map((g) => (
          <CartaoGarcom key={g.id} garcom={g} />
        ))}
        {garcons.length === 0 && (
          <p className="text-lg text-muted-foreground">Nenhum garçom cadastrado.</p>
        )}
      </div>
    </>
  );
}

/** Um garçom da equipe: ver, editar nome e chave Pix, ou remover. */
function CartaoGarcom({ garcom: g }: { garcom: { id: string; nome: string; chave_pix: string } }) {
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(g.nome);
  const [pix, setPix] = useState(g.chave_pix);
  const chave = analisarChavePix(pix);
  const podeSalvar = nome.trim().length > 0 && chave.ok;

  if (editando)
    return (
      <div className="card-praia grid gap-3 p-4">
        <input
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          aria-label={`Nome de ${g.nome}`}
          className="w-full rounded-xl border border-border bg-background px-3 py-3 text-lg font-semibold"
        />
        <CampoChavePix valor={pix} aoMudar={setPix} rotulo="Chave Pix do garçom" />
        <div className="flex flex-wrap gap-2">
          <button
            disabled={!podeSalvar}
            onClick={() => {
              void editarGarcom(g.id, nome.trim(), chave.valor).then((ok) => {
                if (ok) setEditando(false);
              });
            }}
            className="btn-base flex-1 bg-accent text-accent-foreground disabled:opacity-50"
          >
            Salvar
          </button>
          <button
            onClick={() => {
              setNome(g.nome);
              setPix(g.chave_pix);
              setEditando(false);
            }}
            className="btn-base border border-border bg-card"
          >
            Cancelar
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          A chave nova vale para os próximos serviços. O que já foi pago continua registrado.
        </p>
      </div>
    );

  return (
    <div className="card-praia flex flex-wrap items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-xl font-bold">{g.nome}</p>
        <p className="text-base text-muted-foreground">{g.chave_pix || "sem chave Pix"}</p>
      </div>
      <button
        onClick={() => {
          setNome(g.nome);
          setPix(g.chave_pix);
          setEditando(true);
        }}
        className="btn-base border border-border bg-card"
      >
        Editar
      </button>
      <button
        onClick={() => {
          if (window.confirm(`Remover ${g.nome} da equipe?`)) void removerGarcom(g.id);
        }}
        className="btn-base border border-border bg-card text-destructive"
      >
        Remover
      </button>
    </div>
  );
}

/**
 * Campo de texto que só salva quando a pessoa sai dele (ou aperta Enter),
 * em vez de gravar a cada tecla. Evita salvar preços pela metade (ex.: "2"
 * no meio de "25") e o campo "pular" enquanto se digita.
 */
function CampoSalvaAoSair({
  valor,
  aoSalvar,
  rotulo,
  className,
  numerico = false,
  placeholder,
}: {
  placeholder?: string;
  valor: string;
  aoSalvar: (v: string) => void;
  rotulo: string;
  className: string;
  numerico?: boolean;
}) {
  const [texto, setTexto] = useState(valor);
  const [editando, setEditando] = useState(false);
  useEffect(() => {
    if (!editando) setTexto(valor);
  }, [valor, editando]);
  return (
    <input
      value={texto}
      inputMode={numerico ? "decimal" : undefined}
      onFocus={() => setEditando(true)}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => {
        setEditando(false);
        if (texto !== valor) aoSalvar(texto);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
      aria-label={rotulo}
      placeholder={placeholder}
      className={className}
    />
  );
}
