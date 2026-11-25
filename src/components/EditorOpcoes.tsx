import { useEffect, useState } from "react";
import { atualizarProduto, formatarReal } from "@/lib/store";
import { idDe, modeloCaipirinha, type GrupoOpcao } from "@/lib/opcoes";
import type { Produto } from "@/lib/types";

const campo = "rounded-xl border border-border bg-background px-3 py-2 text-base font-semibold";
const real = (v: string) => {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
};

/**
 * Escolhas de um item (ex.: bebida e fruta da caipirinha).
 * Marcar o que tem/acabou salva na hora; o resto salva no botão "Salvar escolhas".
 */
export function EditorOpcoes({ produto }: { produto: Produto }) {
  const [aberto, setAberto] = useState(false);
  const [grupos, setGrupos] = useState<GrupoOpcao[]>(produto.opcoes);
  const [mudou, setMudou] = useState(false);
  const [novoItem, setNovoItem] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!mudou) setGrupos(produto.opcoes);
  }, [produto.opcoes, mudou]);

  function editar(fn: (g: GrupoOpcao[]) => GrupoOpcao[]) {
    setGrupos((atual) => fn(structuredClone(atual)));
    setMudou(true);
  }

  async function salvar(lista = grupos) {
    await atualizarProduto(produto.id, { opcoes: lista });
    setMudou(false);
  }

  /** tem / acabou: salva na hora, para o barraqueiro não esquecer */
  function alternarItem(gi: number, ii: number) {
    const nova = structuredClone(grupos);
    const item = nova[gi]?.itens[ii];
    if (!item) return;
    item.disponivel = !item.disponivel;
    setGrupos(nova);
    void salvar(nova);
  }

  const total = grupos.reduce((s, g) => s + g.itens.length, 0);

  if (!aberto)
    return (
      <button
        onClick={() => setAberto(true)}
        className="btn-base border border-border bg-card text-left"
      >
        {grupos.length
          ? `Escolhas: ${grupos.map((g) => g.nome).join(", ")} (${total} opções) · editar`
          : "+ Escolhas do cliente (sabor, bebida, ponto…)"}
      </button>
    );

  return (
    <div className="grid gap-4 rounded-2xl border border-primary/40 bg-background p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex-1 text-lg font-bold">Escolhas de {produto.nome}</p>
        <button
          onClick={() => {
            if (mudou && !window.confirm("Sair sem salvar as mudanças?")) return;
            setGrupos(produto.opcoes);
            setMudou(false);
            setAberto(false);
          }}
          className="btn-base border border-border bg-card"
        >
          Fechar
        </button>
      </div>

      {grupos.length === 0 && (
        <div className="grid gap-2">
          <p className="text-base text-muted-foreground">
            O cliente escolhe antes de pôr no pedido. Ex.: caipirinha com cachaça ou vodka, e o
            sabor.
          </p>
          <button
            onClick={() => editar(() => modeloCaipirinha())}
            className="btn-base bg-primary text-primary-foreground"
          >
            Usar modelo caipirinha (bebida + frutas)
          </button>
        </div>
      )}

      {grupos.map((g, gi) => (
        <section key={g.id} className="grid gap-2 rounded-xl border border-border bg-card p-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={g.nome}
              onChange={(e) => editar((l) => (l[gi] && (l[gi].nome = e.target.value), l))}
              aria-label="Nome do grupo"
              className={`${campo} min-w-0 flex-1 text-lg`}
            />
            <button
              onClick={() => {
                if (window.confirm(`Apagar o grupo ${g.nome}?`))
                  editar((l) => l.filter((_, i) => i !== gi));
              }}
              className="btn-base border border-border text-destructive"
            >
              Apagar grupo
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <button
              onClick={() => editar((l) => (l[gi] && (l[gi].min = g.min ? 0 : 1), l))}
              aria-pressed={g.min > 0}
              className={`btn-base border ${g.min ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
            >
              {g.min ? "Obrigatório" : "Opcional"}
            </button>
            <label className="flex items-center gap-1">
              Pode escolher até
              <select
                value={g.max}
                onChange={(e) =>
                  editar((l) => {
                    const grupo = l[gi];
                    if (grupo) grupo.max = Number(e.target.value);
                    return l;
                  })
                }
                className={campo}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            {g.max > 1 && (
              <label className="flex items-center gap-1">
                Misturar custa + R$
                <input
                  defaultValue={g.precoMistura ? String(g.precoMistura) : ""}
                  placeholder="0"
                  inputMode="decimal"
                  onChange={(e) =>
                    editar((l) => (l[gi] && (l[gi].precoMistura = real(e.target.value)), l))
                  }
                  aria-label="Acréscimo por misturar"
                  className={`${campo} w-20`}
                />
              </label>
            )}
          </div>
          {g.max > 1 && (
            <p className="text-sm text-muted-foreground">
              {g.precoMistura > 0
                ? `Quem misturar paga ${formatarReal(g.precoMistura)} a mais.`
                : "Misturar sai pelo mesmo preço."}
            </p>
          )}

          <p className="text-sm font-semibold text-muted-foreground">
            Toque para marcar o que tem (verde) e o que acabou.
          </p>
          <div className="grid gap-2">
            {g.itens.map((it, ii) => (
              <div key={it.id} className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => alternarItem(gi, ii)}
                  aria-pressed={it.disponivel}
                  className={`btn-base min-w-[9rem] flex-1 justify-start text-left ${
                    it.disponivel
                      ? "bg-success text-success-foreground"
                      : "bg-muted text-muted-foreground line-through"
                  }`}
                >
                  {it.disponivel ? "✓ " : ""}
                  {it.nome}
                  {it.apelido ? ` (${it.apelido})` : ""}
                </button>
                <label className="flex items-center gap-1 text-base font-semibold">
                  + R$
                  <input
                    defaultValue={it.preco ? String(it.preco) : ""}
                    placeholder="0"
                    inputMode="decimal"
                    onChange={(e) =>
                      editar((l) => {
                        const item = l[gi]?.itens[ii];
                        if (item) item.preco = real(e.target.value);
                        return l;
                      })
                    }
                    aria-label={`Acréscimo de ${it.nome}`}
                    className={`${campo} w-20`}
                  />
                </label>
                <button
                  onClick={() =>
                    editar(
                      (l) => (l[gi] && (l[gi].itens = l[gi].itens.filter((_, i) => i !== ii)), l),
                    )
                  }
                  aria-label={`Tirar ${it.nome}`}
                  className="btn-base border border-border px-3 text-destructive"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={novoItem[g.id] ?? ""}
              onChange={(e) => setNovoItem((n) => ({ ...n, [g.id]: e.target.value }))}
              placeholder="Nova opção (ex.: Cajá)"
              aria-label={`Nova opção em ${g.nome}`}
              className={`${campo} min-w-0 flex-1`}
            />
            <button
              onClick={() => {
                const nome = (novoItem[g.id] ?? "").trim();
                if (!nome) return;
                editar((l) => {
                  const grupo = l[gi];
                  if (!grupo) return l;
                  let id = idDe(nome);
                  while (grupo.itens.some((i) => i.id === id)) id += "-2";
                  grupo.itens.push({ id, nome, preco: 0, disponivel: true });
                  return l;
                });
                setNovoItem((n) => ({ ...n, [g.id]: "" }));
              }}
              className="btn-base border border-border bg-card"
            >
              Adicionar
            </button>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => {
            const nome = window.prompt(
              "Nome do grupo (ex.: Sabor, Ponto da carne, Acompanhamento)",
            );
            if (!nome?.trim()) return;
            editar((l) => {
              let id = idDe(nome);
              while (l.some((g) => g.id === id)) id += "-2";
              return [...l, { id, nome: nome.trim(), min: 1, max: 1, precoMistura: 0, itens: [] }];
            });
          }}
          className="btn-base border border-border bg-card"
        >
          + Grupo de escolha
        </button>
        <button
          disabled={!mudou}
          onClick={() => void salvar()}
          className="btn-base flex-1 bg-accent text-accent-foreground disabled:opacity-50"
        >
          {mudou ? "Salvar escolhas" : "Tudo salvo"}
        </button>
      </div>
    </div>
  );
}
