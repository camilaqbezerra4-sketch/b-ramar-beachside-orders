import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import {
  guardarLiberacao,
  painelLiberado,
  TelaPin,
} from "@/components/PortaoPin";
import {
  atualizarStatus,
  confirmarPagamento,
  criarPedido,
  formatarReal,
  useDados,
} from "@/lib/store";
import { categoriasDe } from "@/lib/types";

export const Route = createFileRoute("/$slug/garcom")({
  component: GarcomPage,
  head: () => ({
    meta: [
      { title: "Tela do Garçom · BóraMar" },
      {
        name: "description",
        content:
          "Lance pedidos, receba no cartão e entregue os pratos prontos.",
      },
      { property: "og:title", content: "Tela do Garçom · BóraMar" },
      {
        property: "og:description",
        content: "Lançamento de pedidos e entregas na palma da mão.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function GarcomPage() {
  const { slug } = Route.useParams();
  const dados = useDados(slug);
  const { barraca, mesas, garcons, produtos, pedidos } = dados;
  const [liberado, setLiberado] = useState(false);
  const [lancando, setLancando] = useState(false);

  useEffect(() => {
    setLiberado(painelLiberado(slug));
  }, [slug]);

  const nomeMesa = (id: string) =>
    mesas.find((m) => m.id === id)?.numero ?? "?";

  const noCartao = pedidos.filter(
    (p) => !p.pago && p.status === "novo" && p.forma_pagamento === "cartao",
  );
  const prontos = pedidos.filter((p) => p.status === "pronto");

  if (!dados.pronto) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Carregando" />
        <p className="mx-auto max-w-xl px-4 pt-8 text-xl font-bold">
          Carregando…
        </p>
      </div>
    );
  }

  if (!dados.existe) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Barraca" />
        <p className="mx-auto max-w-xl px-4 pt-8 text-xl font-bold">
          Não encontramos esta barraca.
        </p>
      </div>
    );
  }

  if (!liberado) {
    return (
      <TelaPin
        pin={barraca.pin}
        titulo="Tela do Garçom"
        subtitulo="Garçom"
        aoLiberar={() => {
          guardarLiberacao(slug);
          setLiberado(true);
        }}
      />
    );
  }

  if (lancando) {
    return (
      <div className="min-h-screen">
        <AppHeader titulo={barraca.nome} subtitulo="Garçom" />
        <main className="mx-auto max-w-xl px-4 pt-5">
          <LancarPedidoGarcom aoFechar={() => setLancando(false)} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader titulo={barraca.nome} subtitulo="Garçom" />
      <main className="mx-auto max-w-xl px-4 pb-16 pt-5">
        <button
          onClick={() => setLancando(true)}
          className="btn-base w-full bg-accent text-accent-foreground"
        >
          Lançar pedido
        </button>

        <h2 className="mt-6 text-2xl font-extrabold">Cobrar no cartão</h2>
        <div className="mt-3 grid gap-3">
          {noCartao.map((p) => (
            <div key={p.id} className="card-praia flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold">
                  Mesa {nomeMesa(p.mesa_id)}
                </p>
                <p className="text-lg font-bold">{formatarReal(p.total)}</p>
              </div>
              <button
                onClick={() => void confirmarPagamento(p.id)}
                className="btn-base bg-success text-success-foreground"
              >
                Recebi
              </button>
            </div>
          ))}
          {noCartao.length === 0 && (
            <p className="text-lg text-muted-foreground">
              Nada para cobrar agora.
            </p>
          )}
        </div>

        <h2 className="mt-6 text-2xl font-extrabold">Prontos pra entregar</h2>
        <div className="mt-3 grid gap-3">
          {prontos.map((p) => (
            <div key={p.id} className="card-praia flex items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <p className="text-xl font-extrabold">
                  Mesa {nomeMesa(p.mesa_id)}
                </p>
                <p className="text-base text-muted-foreground">
                  {p.itens
                    .map((i) => `${i.quantidade}× ${i.nome_produto}`)
                    .join(", ")}
                </p>
              </div>
              <button
                onClick={() => void atualizarStatus(p.id, "entregue")}
                className="btn-base bg-primary text-primary-foreground"
              >
                Entregue
              </button>
            </div>
          ))}
          {prontos.length === 0 && (
            <p className="text-lg text-muted-foreground">
              Nenhum prato pronto agora.
            </p>
          )}
        </div>
      </main>
    </div>
  );

  function LancarPedidoGarcom({ aoFechar }: { aoFechar: () => void }) {
    const [mesaId, setMesaId] = useState(mesas[0]?.id ?? "");
    const [garcomId, setGarcomId] = useState(garcons[0]?.id ?? "");
    const [forma, setForma] = useState<"pix" | "cartao">("cartao");
    const [carrinho, setCarrinho] = useState<Record<string, number>>({});
    const [enviando, setEnviando] = useState(false);

    const categorias = useMemo(() => categoriasDe(produtos), []);
    const linhas = Object.entries(carrinho)
      .map(([id, quantidade]) => ({
        produto: produtos.find((p) => p.id === id)!,
        quantidade,
      }))
      .filter((l) => l.produto && l.quantidade > 0);
    const total = linhas.reduce(
      (s, l) => s + l.produto.preco * l.quantidade,
      0,
    );

    const mudar = (id: string, delta: number) =>
      setCarrinho((c) => {
        const q = Math.max(0, (c[id] ?? 0) + delta);
        const novo = { ...c };
        if (q === 0) delete novo[id];
        else novo[id] = q;
        return novo;
      });

    const campo =
      "w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold";

    return (
      <>
        <h1 className="text-3xl font-extrabold">Lançar pedido</h1>
        <div className="mt-4 grid gap-3">
          <select
            value={mesaId}
            onChange={(e) => setMesaId(e.target.value)}
            aria-label="Mesa"
            className={campo}
          >
            {[...mesas]
              .sort((a, b) => a.numero - b.numero)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Mesa {m.numero}
                </option>
              ))}
          </select>
          <select
            value={garcomId}
            onChange={(e) => setGarcomId(e.target.value)}
            aria-label="Garçom"
            className={campo}
          >
            {garcons.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            {(["pix", "cartao"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setForma(f)}
                aria-pressed={forma === f}
                className={`btn-base flex-1 border-2 ${
                  forma === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {f === "pix" ? "Pix" : "Cartão"}
              </button>
            ))}
          </div>
        </div>

        {categorias.map((c) => (
          <section key={c} className="mt-5">
            <h2 className="text-xl font-extrabold">{c}</h2>
            <div className="mt-2 grid gap-2">
              {produtos
                .filter((p) => p.categoria === c && p.disponivel)
                .map((p) => (
                  <div
                    key={p.id}
                    className="card-praia flex items-center gap-2 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-lg font-extrabold">{p.nome}</p>
                      <p className="text-base text-muted-foreground">
                        {formatarReal(p.preco)}
                      </p>
                    </div>
                    <button
                      onClick={() => mudar(p.id, -1)}
                      aria-label={`Tirar ${p.nome}`}
                      className="btn-base border-2 border-border bg-card"
                    >
                      −
                    </button>
                    <span className="w-8 text-center text-lg font-extrabold">
                      {carrinho[p.id] ?? 0}
                    </span>
                    <button
                      onClick={() => mudar(p.id, 1)}
                      aria-label={`Adicionar ${p.nome}`}
                      className="btn-base bg-accent text-accent-foreground"
                    >
                      +
                    </button>
                  </div>
                ))}
            </div>
          </section>
        ))}

        <div className="sticky bottom-0 mt-6 grid gap-2 bg-background py-3">
          <p className="text-2xl font-extrabold">Total {formatarReal(total)}</p>
          <button
            disabled={enviando || linhas.length === 0 || !mesaId}
            onClick={async () => {
              setEnviando(true);
              await criarPedido({
                mesa_id: mesaId,
                garcom_id: garcomId || null,
                origem: "garcom",
                gorjeta: 0,
                pago: false,
                forma_pagamento: forma,
                linhas,
              });
              setEnviando(false);
              aoFechar();
            }}
            className="btn-base bg-primary text-primary-foreground disabled:opacity-50"
          >
            {enviando ? "Enviando…" : "Enviar pedido"}
          </button>
          <button
            onClick={aoFechar}
            className="btn-base border-2 border-border bg-card"
          >
            Cancelar
          </button>
        </div>
      </>
    );
  }
}
