import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AppHeader } from "@/components/AppHeader";
import { SuporteWhatsApp } from "@/components/SuporteWhatsApp";
import {
  assinarFila,
  criarPedido,
  formatarReal,
  pedidosPendentes,
  useDados,
} from "@/lib/store";
import { gerarCodigoPix } from "@/lib/pix";
import { CATEGORIAS, type Categoria } from "@/lib/types";

export const Route = createFileRoute("/cliente")({
  validateSearch: (search: Record<string, unknown>): { mesa?: number } => {
    const bruto = search["mesa"];
    const n = bruto != null ? Number(bruto) : NaN;
    return Number.isFinite(n) ? { mesa: n } : {};
  },
  head: () => ({
    meta: [
      { title: "Cardápio da Mesa — BóraMar" },
      {
        name: "description",
        content:
          "Peça bebidas e porções direto da sua mesa e pague no Pix, sem taxa nenhuma.",
      },
      { property: "og:title", content: "Cardápio da Mesa — BóraMar" },
      {
        property: "og:description",
        content: "Peça da sua espreguiçadeira e pague no Pix.",
      },
    ],
  }),
  component: ClientePage,
});

const NUMERO_MESA_DEMO = 14;

function ClientePage() {
  const { mesa: mesaBuscada } = Route.useSearch();
  const dados = useDados();
  const { barraca, produtos, garcons } = dados;
  const numeroDesejado = mesaBuscada ?? NUMERO_MESA_DEMO;
  const mesa = dados.mesas.find((m) => m.numero === numeroDesejado) ??
    dados.mesas[0] ?? {
      id: "",
      barraca_id: "",
      numero: numeroDesejado,
      tem_qrcode: false,
    };

  const [etapa, setEtapa] = useState<"cardapio" | "checkout" | "pix" | "fim">(
    "cardapio",
  );
  const [aba, setAba] = useState<Categoria>("Bebidas");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [gorjeta, setGorjeta] = useState(5);
  const [outroValor, setOutroValor] = useState("");
  const [garcomId, setGarcomId] = useState<string>("");
  const [copiado, setCopiado] = useState(false);
  const [qr, setQr] = useState<string>("");
  const [pedidoId, setPedidoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erroGarcom, setErroGarcom] = useState(false);
  const [rachando, setRachando] = useState(false);
  const [pessoas, setPessoas] = useState(2);

  const meuPedido = dados.pedidos.find((p) => p.id === pedidoId);
  const expirado =
    !!meuPedido &&
    (meuPedido.status === "expirado" || meuPedido.status === "cancelado");
  

  // acompanha a fila de reenvio para tirar o aviso "Enviando…" quando entrar
  const [, forcar] = useState(0);
  useEffect(() => assinarFila(() => forcar((n) => n + 1)), []);
  const aindaNaFila = pendente && pedidosPendentes() > 0;

  const linhas = useMemo(
    () =>
      Object.entries(carrinho)
        .map(([id, quantidade]) => ({
          produto: produtos.find((p) => p.id === id)!,
          quantidade,
        }))
        .filter((l) => l.produto && l.quantidade > 0),
    [carrinho, produtos],
  );
  const consumo = linhas.reduce(
    (s, l) => s + l.produto.preco * l.quantidade,
    0,
  );
  const totalGeral = consumo + gorjeta;

  const codigoPix = useMemo(
    () =>
      gerarCodigoPix({
        chave: barraca.chave_pix,
        nome: barraca.nome,
        cidade: barraca.cidade,
        valor: totalGeral,
        txid: pedidoId,
      }),
    [barraca, totalGeral, pedidoId],
  );

  useEffect(() => {
    if (etapa !== "pix" || !codigoPix) return;
    let ativo = true;
    QRCode.toDataURL(codigoPix, { width: 320, margin: 1 }).then((url) => {
      if (ativo) setQr(url);
    });
    return () => {
      ativo = false;
    };
  }, [etapa, codigoPix]);

  const mudar = (id: string, delta: number) =>
    setCarrinho((c) => {
      const q = Math.max(0, (c[id] ?? 0) + delta);
      const novo = { ...c };
      if (q === 0) delete novo[id];
      else novo[id] = q;
      return novo;
    });

  async function irParaPix() {
    if (gorjeta > 0 && !garcomId) {
      setErroGarcom(true);
      return;
    }
    setErroGarcom(false);
    setEnviando(true);
    const r = await criarPedido({
      mesa_id: mesa.id,
      garcom_id: garcomId || null,
      origem: "cliente",
      gorjeta,
      pago: false,
      linhas,
    });
    setPedidoId(r.id);
    setPendente(r.pendente);
    setEnviando(false);
    setEtapa("pix");
  }

  if (!dados.pronto) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Carregando" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-bold">
          Carregando o cardápio…
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-32">
      <AppHeader subtitulo={`Mesa ${mesa.numero}`} />

      {etapa === "cardapio" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-extrabold">Cardápio</h1>
          <p className="mt-1 text-base text-muted-foreground">
            {barraca.nome}
          </p>

          <div className="sticky top-[60px] z-30 -mx-4 mt-4 flex gap-2 overflow-x-auto bg-background px-4 py-3">
            {CATEGORIAS.map((c) => (
              <button
                key={c}
                onClick={() => setAba(c)}
                className={`btn-base shrink-0 border-2 ${
                  aba === c
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <ul className="mt-2 grid gap-3">
            {produtos
              .filter((p) => p.categoria === aba)
              .map((p) => (
                <li
                  key={p.id}
                  className={`card-praia flex items-center gap-3 p-4 ${
                    p.disponivel ? "" : "opacity-45"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-extrabold">{p.nome}</p>
                    <p className="text-lg font-bold text-muted-foreground">
                      {formatarReal(p.preco)}
                      {!p.disponivel && (
                        <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-sm font-extrabold text-destructive-foreground">
                          acabou
                        </span>
                      )}
                    </p>
                  </div>
                  {p.disponivel ? (
                    carrinho[p.id] ? (
                      <div className="flex items-center gap-2">
                        <button
                          aria-label={`Remover um ${p.nome}`}
                          onClick={() => mudar(p.id, -1)}
                          className="btn-base h-12 w-12 border-2 border-primary bg-card text-2xl"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xl font-extrabold">
                          {carrinho[p.id]}
                        </span>
                        <button
                          aria-label={`Adicionar um ${p.nome}`}
                          onClick={() => mudar(p.id, 1)}
                          className="btn-base h-12 w-12 bg-accent text-2xl text-accent-foreground"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => mudar(p.id, 1)}
                        className="btn-base bg-accent text-accent-foreground"
                      >
                        Adicionar
                      </button>
                    )
                  ) : null}
                </li>
              ))}
          </ul>

          {linhas.length > 0 && (
            <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card p-4">
              <div className="mx-auto flex max-w-3xl items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-bold text-muted-foreground">
                    {linhas.reduce((s, l) => s + l.quantidade, 0)} itens
                  </p>
                  <p className="text-2xl font-extrabold">
                    {formatarReal(consumo)}
                  </p>
                </div>
                <button
                  onClick={() => setEtapa("checkout")}
                  className="btn-base bg-primary px-6 text-primary-foreground"
                >
                  Avançar para o Pagamento
                </button>
              </div>
            </div>
          )}
        </main>
      )}

      {etapa === "checkout" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-extrabold">Seu pedido</h1>
          <p className="mt-1 text-lg font-bold">Mesa {mesa.numero}</p>

          <ul className="card-praia mt-4 divide-y-2 divide-border p-4">
            {linhas.map((l) => (
              <li key={l.produto.id} className="flex justify-between py-2 text-lg">
                <span className="font-semibold">
                  {l.quantidade}× {l.produto.nome}
                </span>
                <span className="font-extrabold">
                  {formatarReal(l.produto.preco * l.quantidade)}
                </span>
              </li>
            ))}
          </ul>

          <h2 className="mt-6 text-2xl font-extrabold">
            Quer deixar uma caixinha para quem te atendeu?
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {[0, 2, 5, 10].map((v) => (
              <button
                key={v}
                onClick={() => {
                  setGorjeta(v);
                  setOutroValor("");
                  if (v === 0) setErroGarcom(false);
                }}
                className={`btn-base border-2 ${
                  gorjeta === v && outroValor === ""
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-border bg-card"
                }`}
              >
                {v === 0 ? "Sem caixinha" : formatarReal(v)}
              </button>
            ))}
            <input
              inputMode="decimal"
              placeholder="Outro valor"
              value={outroValor}
              onChange={(e) => {
                setOutroValor(e.target.value);
                const n = Number(e.target.value.replace(",", "."));
                setGorjeta(Number.isFinite(n) && n > 0 ? n : 0);
              }}
              className="btn-base w-36 border-2 border-border bg-card text-left"
            />
          </div>

          <h2 className="mt-6 text-2xl font-extrabold">
            Quem te atendeu?
            {gorjeta > 0 && (
              <span className="ml-2 text-lg font-bold text-destructive">
                obrigatório com caixinha
              </span>
            )}
          </h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {garcons.map((g) => (
              <button
                key={g.id}
                onClick={() => {
                  setGarcomId(g.id === garcomId ? "" : g.id);
                  setErroGarcom(false);
                }}
                className={`btn-base border-2 ${
                  garcomId === g.id
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card"
                }`}
              >
                {g.nome}
              </button>
            ))}
          </div>
          {erroGarcom && (
            <p className="mt-2 text-lg font-bold text-destructive">
              Escolha quem te atendeu para deixar a caixinha, ou toque em “Sem
              caixinha”.
            </p>
          )}

          <div className="card-praia mt-6 p-4 text-lg">
            <div className="flex justify-between">
              <span>Consumo</span>
              <span className="font-bold">{formatarReal(consumo)}</span>
            </div>
            <div className="flex justify-between">
              <span>Caixinha</span>
              <span className="font-bold">{formatarReal(gorjeta)}</span>
            </div>
            <div className="mt-2 flex justify-between border-t-2 border-border pt-2 text-2xl font-extrabold">
              <span>Total</span>
              <span>{formatarReal(totalGeral)}</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Sem taxa de serviço e sem taxa de aplicativo.
            </p>
          </div>

          <div className="mt-5 flex gap-2">
            <button
              onClick={() => setEtapa("cardapio")}
              className="btn-base border-2 border-border bg-card"
            >
              Voltar
            </button>
            <button
              onClick={irParaPix}
              disabled={enviando}
              className="btn-base flex-1 bg-primary text-primary-foreground"
            >
              {enviando ? "Enviando…" : "Pagar com Pix"}
            </button>
          </div>
        </main>
      )}

      {etapa === "pix" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-extrabold">Pague no Pix</h1>
          <p className="mt-1 text-lg">
            Mesa {mesa.numero} · Total{" "}
            <strong>{formatarReal(totalGeral)}</strong>
          </p>

          {aindaNaFila && (
            <p className="card-praia mt-3 p-3 text-lg font-bold">
              Enviando… a internet caiu, mas seu pedido está guardado e vai
              sozinho assim que o sinal voltar.
            </p>
          )}

          <div className="card-praia mt-4 flex flex-col items-center gap-3 p-5">
            {qr ? (
              <img
                src={qr}
                alt="QR Code do Pix da barraca"
                className="h-64 w-64 rounded-xl"
              />
            ) : (
              <div className="h-64 w-64 animate-pulse rounded-xl bg-sand" />
            )}
            <p className="text-center text-base text-muted-foreground">
              Chave Pix: <strong>{barraca.chave_pix}</strong>
            </p>
            <button
              onClick={() => {
                navigator.clipboard.writeText(codigoPix);
                setCopiado(true);
                setTimeout(() => setCopiado(false), 2500);
              }}
              className="btn-base w-full bg-accent text-accent-foreground"
            >
              {copiado ? "Código copiado!" : "Copiar código Pix"}
            </button>
          </div>

          <button
            onClick={() => {
              setEtapa("fim");
              setCarrinho({});
            }}
            className="btn-base mt-5 w-full bg-success py-5 text-xl text-success-foreground"
          >
            Já paguei, enviar pedido para a cozinha
          </button>
          <button
            onClick={() => setEtapa("checkout")}
            className="btn-base mt-3 w-full border-2 border-border bg-card"
          >
            Voltar
          </button>
        </main>
      )}

      {etapa === "fim" && (
        <main className="mx-auto max-w-3xl px-4 pt-10 text-center">
          <p className="text-6xl" aria-hidden>
            🍤
          </p>
          <h1 className="mt-4 text-3xl font-extrabold">
            Pedido enviado para a cozinha!
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            A barraca vai conferir o Pix e começar o preparo. Fica tranquilo na
            cadeira da Mesa {mesa.numero}.
          </p>
          {aindaNaFila && (
            <p className="mt-3 text-lg font-bold">
              Enviando… seu pedido está guardado e segue automaticamente quando
              o sinal voltar.
            </p>
          )}
          <button
            onClick={() => {
              setEtapa("cardapio");
              setGorjeta(5);
              setOutroValor("");
              setPedidoId("");
              setPendente(false);
            }}
            className="btn-base mt-6 bg-primary text-primary-foreground"
          >
            Pedir mais alguma coisa
          </button>
          <div className="mt-3">
            <Link to="/" className="btn-base border-2 border-border bg-card">
              Voltar ao início
            </Link>
          </div>
        </main>
      )}

      <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
    </div>
  );
}
