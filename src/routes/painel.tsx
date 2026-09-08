import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { SuporteWhatsApp } from "@/components/SuporteWhatsApp";
import {
  alternarQrCodeMesa,
  atualizarProduto,
  atualizarStatus,
  confirmarPagamento,
  criarPedido,
  formatarReal,
  useDados,
} from "@/lib/store";
import type { Pedido, Produto } from "@/lib/types";

export const Route = createFileRoute("/painel")({
  head: () => ({
    meta: [
      { title: "Painel da Barraca — BóraMar" },
      {
        name: "description",
        content:
          "Pedidos em tempo real, cardápio, mesas e resultados do dia da barraca.",
      },
      { property: "og:title", content: "Painel da Barraca — BóraMar" },
      {
        property: "og:description",
        content: "Acompanhe pedidos, faturamento e caixinha por garçom.",
      },
    ],
  }),
  component: PainelPage,
});

type Aba = "pedidos" | "cardapio" | "mesas" | "resultados";

const ABAS: Array<{ id: Aba; rotulo: string }> = [
  { id: "pedidos", rotulo: "Pedidos" },
  { id: "cardapio", rotulo: "Cardápio" },
  { id: "mesas", rotulo: "Mesas" },
  { id: "resultados", rotulo: "Resultados" },
];

// ---- Som (precisa de um toque do usuário para o navegador liberar) ----
let ctxAudio: AudioContext | null = null;

function liberarAudio() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext;
    ctxAudio = ctxAudio ?? new Ctx();
    if (ctxAudio.state === "suspended") ctxAudio.resume();
    return true;
  } catch {
    return false;
  }
}

function tocarSino() {
  const ctx = ctxAudio;
  if (!ctx) return;
  try {
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.16);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.62);
  } catch {
    /* som é opcional */
  }
}

// ---- PIN do painel, lembrado por 30 dias neste aparelho ----
const CHAVE_PIN = "boramar:painel-liberado-ate";

function painelLiberado() {
  if (typeof window === "undefined") return false;
  const ate = Number(localStorage.getItem(CHAVE_PIN) ?? 0);
  return Number.isFinite(ate) && ate > Date.now();
}

function guardarLiberacao() {
  localStorage.setItem(CHAVE_PIN, String(Date.now() + 30 * 86400000));
}

function TelaPin({ pin, aoLiberar }: { pin: string; aoLiberar: () => void }) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState(false);

  return (
    <div className="min-h-screen">
      <AppHeader subtitulo="Painel" />
      <main className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-3xl font-extrabold">Painel da Barraca</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Digite o PIN da barraca. Este aparelho fica lembrado por 30 dias.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valor === pin && pin) {
              guardarLiberacao();
              aoLiberar();
            } else {
              setErro(true);
            }
          }}
          className="mt-5 grid gap-3"
        >
          <input
            autoFocus
            inputMode="numeric"
            maxLength={6}
            value={valor}
            onChange={(e) => {
              setValor(e.target.value.replace(/\D/g, ""));
              setErro(false);
            }}
            aria-label="PIN do painel"
            placeholder="••••"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 text-center text-3xl font-extrabold tracking-widest"
          />
          {erro && (
            <p className="text-lg font-bold text-destructive">
              PIN incorreto. Tente de novo.
            </p>
          )}
          <button className="btn-base bg-primary text-primary-foreground">
            Entrar no painel
          </button>
          <Link to="/" className="btn-base border-2 border-border bg-card">
            Voltar ao início
          </Link>
        </form>
      </main>
    </div>
  );
}

function PainelPage() {
  const dados = useDados();
  const { barraca, mesas, garcons, produtos, pedidos } = dados;
  const [aba, setAba] = useState<Aba>("pedidos");
  const [lancando, setLancando] = useState(false);
  const [novos, setNovos] = useState<string[]>([]);
  const [somAtivo, setSomAtivo] = useState(false);
  const [liberado, setLiberado] = useState(false);
  const conhecidos = useRef<string[] | null>(null);

  useEffect(() => {
    setLiberado(painelLiberado());
  }, []);

  useEffect(() => {
    const ids = pedidos.map((p) => p.id);
    if (conhecidos.current === null) {
      conhecidos.current = ids;
      return;
    }
    const chegaram = ids.filter((id) => !conhecidos.current!.includes(id));
    conhecidos.current = ids;
    if (chegaram.length) {
      tocarSino();
      setNovos((n) => [...new Set([...n, ...chegaram])]);
    }
  }, [pedidos]);

  // pedidos que ainda pedem atenção: chegaram e o pagamento não foi confirmado
  const emAlerta = useMemo(
    () => novos.filter((id) => pedidos.some((p) => p.id === id && !p.pago)),
    [novos, pedidos],
  );

  useEffect(() => {
    if (emAlerta.length === 0) return;
    const t = setInterval(() => tocarSino(), 30000);
    return () => clearInterval(t);
  }, [emAlerta.length]);

  const ordenados = useMemo(
    () =>
      [...pedidos].sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    [pedidos],
  );

  const nomeMesa = (id: string) =>
    mesas.find((m) => m.id === id)?.numero ?? "?";
  const nomeGarcom = (id: string | null) =>
    garcons.find((g) => g.id === id)?.nome ?? "—";

  if (!dados.pronto) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Painel" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-bold">
          Carregando os pedidos…
        </p>
      </div>
    );
  }

  if (!liberado) {
    return <TelaPin pin={barraca.pin} aoLiberar={() => setLiberado(true)} />;
  }

  return (

    <div className="min-h-screen pb-28">
      <AppHeader subtitulo="Painel" />

      {!somAtivo && (
        <div className="sticky top-[60px] z-40 border-b-2 border-border bg-accent px-4 py-3 text-accent-foreground">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
            <p className="flex-1 text-lg font-extrabold">
              Som desativado: você não vai ouvir os pedidos novos.
            </p>
            <button
              onClick={() => {
                if (liberarAudio()) {
                  tocarSino();
                  setSomAtivo(true);
                }
              }}
              className="btn-base bg-primary px-6 py-4 text-xl text-primary-foreground"
            >
              Ativar som
            </button>
          </div>
        </div>
      )}


      <div className="sticky top-[60px] z-30 border-b-2 border-border bg-background">
        <div className="mx-auto flex max-w-3xl gap-2 overflow-x-auto px-4 py-3">
          {ABAS.map((a) => (
            <button
              key={a.id}
              onClick={() => setAba(a.id)}
              className={`btn-base shrink-0 border-2 ${
                aba === a.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {a.rotulo}
            </button>
          ))}
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 pt-5">
        {aba === "pedidos" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-extrabold">Pedidos</h1>
              <button
                onClick={() => setLancando(true)}
                className="btn-base bg-accent text-accent-foreground"
              >
                Lançar pedido
              </button>
            </div>

            <div className="mt-4 grid gap-4">
              {ordenados.map((p) => (
                <CardPedido
                  key={p.id}
                  pedido={p}
                  numeroMesa={nomeMesa(p.mesa_id)}
                  garcom={nomeGarcom(p.garcom_id)}
                  destaque={emAlerta.includes(p.id)}
                />
              ))}
              {ordenados.length === 0 && (
                <p className="text-lg text-muted-foreground">
                  Nenhum pedido ainda hoje.
                </p>
              )}
            </div>
          </>
        )}

        {aba === "cardapio" && <AbaCardapio produtos={produtos} />}
        {aba === "mesas" && <AbaMesas />}
        {aba === "resultados" && <AbaResultados />}

        <div className="mt-8">
          <Link to="/" className="btn-base border-2 border-border bg-card">
            Voltar ao início
          </Link>
        </div>
      </main>

      {lancando && <LancarPedido aoFechar={() => setLancando(false)} />}
      <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
    </div>
  );
}

function CardPedido({
  pedido,
  numeroMesa,
  garcom,
  destaque,
}: {
  pedido: Pedido;
  numeroMesa: number | string;
  garcom: string;
  destaque: boolean;
}) {
  const hora = new Date(pedido.criado_em).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  const rotuloStatus = {
    novo: "Novo",
    em_preparo: "Em preparo",
    entregue: "Entregue",
  }[pedido.status];

  return (
    <article
      className={`card-praia p-4 ${destaque ? "destaque-novo border-accent" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-extrabold">Mesa {numeroMesa}</h2>
          <p className="text-base text-muted-foreground">
            {hora} · {pedido.origem === "cliente" ? "Pelo QR Code" : "Pelo garçom"}{" "}
            · Garçom: {garcom}
          </p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-extrabold ${
            pedido.status === "novo"
              ? "bg-accent text-accent-foreground"
              : pedido.status === "em_preparo"
                ? "bg-primary text-primary-foreground"
                : "bg-success text-success-foreground"
          }`}
        >
          {rotuloStatus}
        </span>
      </div>

      <ul className="mt-3 grid gap-1 text-lg">
        {pedido.itens.map((i) => (
          <li key={i.id} className="flex justify-between">
            <span className="font-semibold">
              {i.quantidade}× {i.nome_produto}
            </span>
            <span className="font-bold">
              {formatarReal(i.preco * i.quantidade)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 border-t-2 border-border pt-3 text-lg">
        <span className="font-extrabold">Total {formatarReal(pedido.total)}</span>
        <span className="text-muted-foreground">
          Caixinha {formatarReal(pedido.gorjeta)}
        </span>
        <span
          className={`text-base font-bold ${pedido.pago ? "text-success" : "text-destructive"}`}
        >
          {pedido.pago ? "Pix conferido" : "Pix a conferir"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {!pedido.pago && (
          <button
            onClick={() => confirmarPagamento(pedido.id)}
            className="btn-base bg-success text-success-foreground"
          >
            Confirmar pagamento
          </button>
        )}
        {pedido.status === "novo" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "em_preparo")}
            className="btn-base bg-primary text-primary-foreground"
          >
            Iniciar preparo
          </button>
        )}
        {pedido.status !== "entregue" && (
          <button
            onClick={() => atualizarStatus(pedido.id, "entregue")}
            className="btn-base border-2 border-border bg-card"
          >
            Entregue
          </button>
        )}
      </div>
    </article>
  );
}

function AbaCardapio({ produtos }: { produtos: Produto[] }) {
  return (
    <>
      <h1 className="text-3xl font-extrabold">Cardápio</h1>
      <div className="mt-4 grid gap-3">
        {produtos.map((p) => (
          <div key={p.id} className="card-praia flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="text-xl font-extrabold">{p.nome}</p>
              <p className="text-base text-muted-foreground">{p.categoria}</p>
            </div>
            <label className="flex items-center gap-1 text-lg font-bold">
              R$
              <input
                type="number"
                step="0.5"
                min="0"
                value={p.preco}
                onChange={(e) =>
                  atualizarProduto(p.id, { preco: Number(e.target.value) })
                }
                aria-label={`Preço de ${p.nome}`}
                className="w-24 rounded-xl border-2 border-border bg-background px-2 py-2 text-lg font-bold"
              />
            </label>
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
          </div>
        ))}
      </div>
    </>
  );
}

function AbaMesas() {
  const { mesas } = useDados();
  return (
    <>
      <h1 className="text-3xl font-extrabold">Mesas</h1>
      <p className="mt-1 text-base text-muted-foreground">
        Marque quais mesas já têm a plaquinha com QR Code.
      </p>
      <Link
        to="/qrcodes"
        className="btn-base mt-4 inline-flex bg-accent text-accent-foreground"
      >
        Gerar QR Codes
      </Link>
      <div className="mt-4 grid gap-3">
        {[...mesas]
          .sort((a, b) => a.numero - b.numero)
          .map((m) => (
            <div key={m.id} className="card-praia flex items-center gap-3 p-4">
              <p className="flex-1 text-xl font-extrabold">Mesa {m.numero}</p>
              <button
                onClick={() => alternarQrCodeMesa(m.id)}
                aria-pressed={m.tem_qrcode}
                className={`btn-base min-w-[9rem] ${
                  m.tem_qrcode
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {m.tem_qrcode ? "Com QR Code" : "Sem QR Code"}
              </button>
            </div>
          ))}
      </div>
    </>
  );
}

function AbaResultados() {
  const { mesas, garcons, pedidos } = useDados();
  const [dias, setDias] = useState(7);

  const resumo = (lista: Pedido[]) => {
    // Só entra no faturamento o pedido com pagamento confirmado pela cozinha.
    const pagos = lista.filter((p) => p.pago);
    const comQr: Pedido[] = [];
    const semQr: Pedido[] = [];
    for (const p of pagos) {
      const mesa = mesas.find((m) => m.id === p.mesa_id);
      (mesa?.tem_qrcode ? comQr : semQr).push(p);
    }
    const calc = (l: Pedido[]) => {
      const faturamento = l.reduce((s, p) => s + p.total - p.gorjeta, 0);
      return {
        pedidos: l.length,
        faturamento,
        ticket: l.length ? faturamento / l.length : 0,
      };
    };
    const naoPagos = lista.filter((p) => !p.pago);
    return {
      comQr: calc(comQr),
      semQr: calc(semQr),
      total: calc(pagos),
      aguardando: {
        pedidos: naoPagos.length,
        valor: naoPagos.reduce((s, p) => s + p.total - p.gorjeta, 0),
      },
    };
  };

  const hoje = new Date().toDateString();
  const doDia = pedidos.filter(
    (p) => new Date(p.criado_em).toDateString() === hoje,
  );
  const limite = Date.now() - dias * 86400000;
  const doPeriodo = pedidos.filter(
    (p) => new Date(p.criado_em).getTime() >= limite,
  );

  const rDia = resumo(doDia);
  const rPeriodo = resumo(doPeriodo);

  const caixinhas = garcons.map((g) => ({
    nome: g.nome,
    total: doPeriodo
      .filter((p) => p.garcom_id === g.id)
      .reduce((s, p) => s + p.gorjeta, 0),
  }));

  function exportarCsv() {
    const linhas = [
      ["Pedido", "Data", "Mesa", "QR Code", "Origem", "Garçom", "Status", "Pago", "Consumo", "Caixinha", "Total"],
      ...doPeriodo.map((p) => {
        const mesa = mesas.find((m) => m.id === p.mesa_id);
        return [
          p.id,
          new Date(p.criado_em).toLocaleString("pt-BR"),
          String(mesa?.numero ?? ""),
          mesa?.tem_qrcode ? "sim" : "nao",
          p.origem,
          garcons.find((g) => g.id === p.garcom_id)?.nome ?? "",
          p.status,
          p.pago ? "sim" : "nao",
          (p.total - p.gorjeta).toFixed(2),
          p.gorjeta.toFixed(2),
          p.total.toFixed(2),
        ];
      }),
    ];
    const csv = linhas.map((l) => l.map((c) => `"${c}"`).join(";")).join("\n");
    const url = URL.createObjectURL(
      new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `boramar-resultados-${dias}dias.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold">Resultados</h1>

      <Bloco titulo="Hoje" r={rDia} />

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <span className="text-lg font-bold">Período:</span>
        {[7, 30, 90].map((d) => (
          <button
            key={d}
            onClick={() => setDias(d)}
            className={`btn-base border-2 ${
              dias === d
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            {d} dias
          </button>
        ))}
      </div>
      <Bloco titulo={`Últimos ${dias} dias`} r={rPeriodo} />

      <h2 className="mt-6 text-2xl font-extrabold">Caixinha por garçom</h2>
      <div className="card-praia mt-3 divide-y-2 divide-border p-4 text-lg">
        {caixinhas.map((c) => (
          <div key={c.nome} className="flex justify-between py-2">
            <span className="font-semibold">{c.nome}</span>
            <span className="font-extrabold">{formatarReal(c.total)}</span>
          </div>
        ))}
      </div>

      <button
        onClick={exportarCsv}
        className="btn-base mt-5 w-full bg-accent text-accent-foreground"
      >
        Exportar CSV do período
      </button>
    </>
  );
}

function Bloco({
  titulo,
  r,
}: {
  titulo: string;
  r: {
    comQr: { pedidos: number; faturamento: number; ticket: number };
    semQr: { pedidos: number; faturamento: number; ticket: number };
    total: { pedidos: number; faturamento: number; ticket: number };
    aguardando: { pedidos: number; valor: number };
  };
}) {
  const Linha = ({
    rotulo,
    v,
  }: {
    rotulo: string;
    v: { pedidos: number; faturamento: number; ticket: number };
  }) => (
    <div className="card-praia p-4">
      <p className="text-lg font-extrabold">{rotulo}</p>
      <div className="mt-1 flex flex-wrap gap-x-6 text-lg">
        <span>
          Pedidos <strong>{v.pedidos}</strong>
        </span>
        <span>
          Faturamento <strong>{formatarReal(v.faturamento)}</strong>
        </span>
        <span>
          Ticket médio <strong>{formatarReal(v.ticket)}</strong>
        </span>
      </div>
    </div>
  );

  return (
    <section className="mt-4 grid gap-3">
      <h2 className="text-2xl font-extrabold">{titulo}</h2>
      <Linha rotulo="Total da barraca" v={r.total} />
      <Linha rotulo="Mesas com QR Code" v={r.comQr} />
      <Linha rotulo="Mesas sem QR Code" v={r.semQr} />
    </section>
  );
}

function LancarPedido({ aoFechar }: { aoFechar: () => void }) {
  const { mesas, garcons, produtos } = useDados();
  const [mesaId, setMesaId] = useState(mesas[0]?.id ?? "");
  const [garcomId, setGarcomId] = useState(garcons[0]?.id ?? "");
  const [qtds, setQtds] = useState<Record<string, number>>({});

  const linhas = Object.entries(qtds)
    .map(([id, quantidade]) => ({
      produto: produtos.find((p) => p.id === id)!,
      quantidade,
    }))
    .filter((l) => l.produto && l.quantidade > 0);
  const total = linhas.reduce((s, l) => s + l.produto.preco * l.quantidade, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="border-b-2 border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h2 className="text-2xl font-extrabold">Lançar pedido</h2>
          <button onClick={aoFechar} className="btn-base border-2 border-border">
            Fechar
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4">
        <label className="block text-lg font-bold">
          Mesa
          <select
            value={mesaId}
            onChange={(e) => setMesaId(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-border bg-card px-3 py-3 text-lg font-bold"
          >
            {[...mesas]
              .sort((a, b) => a.numero - b.numero)
              .map((m) => (
                <option key={m.id} value={m.id}>
                  Mesa {m.numero}
                </option>
              ))}
          </select>
        </label>

        <label className="mt-4 block text-lg font-bold">
          Garçom
          <select
            value={garcomId}
            onChange={(e) => setGarcomId(e.target.value)}
            className="mt-1 w-full rounded-xl border-2 border-border bg-card px-3 py-3 text-lg font-bold"
          >
            {garcons.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>

        <div className="mt-5 grid gap-3">
          {produtos
            .filter((p) => p.disponivel)
            .map((p) => (
              <div key={p.id} className="card-praia flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-extrabold">{p.nome}</p>
                  <p className="text-base text-muted-foreground">
                    {formatarReal(p.preco)}
                  </p>
                </div>
                <button
                  aria-label={`Remover um ${p.nome}`}
                  onClick={() =>
                    setQtds((q) => ({
                      ...q,
                      [p.id]: Math.max(0, (q[p.id] ?? 0) - 1),
                    }))
                  }
                  className="btn-base h-12 w-12 border-2 border-primary bg-card text-2xl"
                >
                  −
                </button>
                <span className="w-6 text-center text-xl font-extrabold">
                  {qtds[p.id] ?? 0}
                </span>
                <button
                  aria-label={`Adicionar um ${p.nome}`}
                  onClick={() =>
                    setQtds((q) => ({ ...q, [p.id]: (q[p.id] ?? 0) + 1 }))
                  }
                  className="btn-base h-12 w-12 bg-accent text-2xl text-accent-foreground"
                >
                  +
                </button>
              </div>
            ))}
        </div>
      </div>

      <div className="border-t-2 border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex-1 text-2xl font-extrabold">
            {formatarReal(total)}
          </span>
          <button
            disabled={linhas.length === 0}
            onClick={() => {
              criarPedido({
                mesa_id: mesaId,
                garcom_id: garcomId || null,
                origem: "garcom",
                gorjeta: 0,
                pago: false,
                linhas,
              });
              aoFechar();
            }}
            className="btn-base bg-primary px-6 text-primary-foreground"
          >
            Registrar pedido
          </button>
        </div>
      </div>
    </div>
  );
}
