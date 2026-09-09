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
  encerrarPedido,
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
          "Caixa, cozinha, cardápio, mesas e resultados do dia da barraca.",
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

type Aba =
  | "caixa"
  | "cozinha"
  | "cardapio"
  | "mesas"
  | "resultados"
  | "pendencias";

const MINUTO = 60000;
const LIMITE_ESPERA = 10 * MINUTO;
const JANELA_RODADA = 5 * MINUTO;

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

// ---- Rodadas da cozinha ----
interface Rodada {
  chave: string;
  mesaId: string;
  numeroMesa: number | string;
  pedidos: Pedido[];
  emPreparo: Pedido[];
  aguardando: Pedido[]; // pagos ainda não iniciados
  numero: number;
}

const instantePago = (p: Pedido) =>
  new Date(p.pago_em ?? p.criado_em).getTime();

function agruparRodadas(lista: Pedido[]): Pedido[][] {
  const ordenada = [...lista].sort((a, b) => instantePago(a) - instantePago(b));
  const grupos: Pedido[][] = [];
  for (const p of ordenada) {
    const g = grupos[grupos.length - 1];
    const ultimo = g?.[g.length - 1];
    const emPreparo = g?.some((x) => x.status === "em_preparo");
    if (
      g &&
      ultimo &&
      (emPreparo || instantePago(p) - instantePago(ultimo) <= JANELA_RODADA)
    ) {
      g.push(p);
    } else {
      grupos.push([p]);
    }
  }
  return grupos;
}

function minutosDesde(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MINUTO));
}

function PainelPage() {
  const dados = useDados();
  const { barraca, mesas, garcons, produtos, pedidos } = dados;
  const [aba, setAba] = useState<Aba>("caixa");
  const [lancando, setLancando] = useState(false);
  const [somAtivo, setSomAtivo] = useState(false);
  const [liberado, setLiberado] = useState(false);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [, forcarRelogio] = useState(0);
  const pagosConhecidos = useRef<string[] | null>(null);

  useEffect(() => {
    setLiberado(painelLiberado());
  }, []);

  // relógio para os tempos de espera e a expiração automática
  useEffect(() => {
    const t = setInterval(() => forcarRelogio((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const pendentesCaixa = useMemo(
    () => pedidos.filter((p) => !p.pago && p.status === "novo"),
    [pedidos],
  );

  // pedido aguardando Pix há mais de 10 minutos expira sozinho
  useEffect(() => {
    for (const p of pendentesCaixa) {
      if (Date.now() - new Date(p.criado_em).getTime() > LIMITE_ESPERA) {
        void encerrarPedido(p.id, "expirado");
      }
    }
  });

  // entrou item pago para preparar → alerta da cozinha
  useEffect(() => {
    const ids = pedidos
      .filter((p) => p.pago && p.status !== "entregue")
      .map((p) => p.id);
    if (pagosConhecidos.current === null) {
      pagosConhecidos.current = ids;
      return;
    }
    const chegaram = ids.filter((id) => !pagosConhecidos.current!.includes(id));
    pagosConhecidos.current = ids;
    if (chegaram.length) {
      tocarSino();
      setAlertas((a) => [...new Set([...a, ...chegaram])]);
    }
  }, [pedidos]);

  useEffect(() => {
    if (alertas.length === 0) return;
    const t = setInterval(() => tocarSino(), 30000);
    return () => clearInterval(t);
  }, [alertas.length]);

  const nomeMesa = (id: string) =>
    mesas.find((m) => m.id === id)?.numero ?? "?";
  const nomeGarcom = (id: string | null) =>
    garcons.find((g) => g.id === id)?.nome ?? "—";

  const rodadas = useMemo<Rodada[]>(() => {
    const hoje = new Date().toDateString();
    const saida: Rodada[] = [];
    for (const mesa of mesas) {
      const daMesa = pedidos.filter((p) => p.mesa_id === mesa.id && p.pago);
      const entreguesHoje = daMesa.filter(
        (p) =>
          p.status === "entregue" &&
          new Date(p.pago_em ?? p.criado_em).toDateString() === hoje,
      );
      const jaFechadas = agruparRodadas(entreguesHoje).length;
      const ativos = daMesa.filter(
        (p) => p.status === "pago" || p.status === "em_preparo",
      );
      agruparRodadas(ativos).forEach((grupo, i) => {
        saida.push({
          chave: grupo[0]!.id,
          mesaId: mesa.id,
          numeroMesa: mesa.numero,
          pedidos: grupo,
          emPreparo: grupo.filter((p) => p.status === "em_preparo"),
          aguardando: grupo.filter((p) => p.status === "pago"),
          numero: jaFechadas + i + 1,
        });
      });
    }
    return saida;
  }, [mesas, pedidos]);

  const rodadasOrdenadas = useMemo(() => {
    const comAlerta = (r: Rodada) =>
      r.pedidos.some((p) => alertas.includes(p.id));
    return [...rodadas].sort((a, b) => {
      if (comAlerta(a) !== comAlerta(b)) return comAlerta(a) ? -1 : 1;
      const ua = Math.max(...a.pedidos.map(instantePago));
      const ub = Math.max(...b.pedidos.map(instantePago));
      return ub - ua;
    });
  }, [rodadas, alertas]);

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

  const abas: Array<{ id: Aba; rotulo: string }> = [
    {
      id: "caixa",
      rotulo: pendentesCaixa.length
        ? `Caixa (${pendentesCaixa.length})`
        : "Caixa",
    },
    { id: "cozinha", rotulo: "Cozinha" },
    { id: "cardapio", rotulo: "Cardápio" },
    { id: "mesas", rotulo: "Mesas" },
    { id: "resultados", rotulo: "Resultados" },
    { id: "pendencias", rotulo: "Pendências" },
  ];

  return (
    <div className="min-h-screen pb-28">
      <AppHeader subtitulo="Painel" />

      {aba === "cozinha" && !somAtivo && (
        <div className="sticky top-[60px] z-40 border-b-2 border-border bg-accent px-4 py-3 text-accent-foreground">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-3">
            <p className="flex-1 text-lg font-extrabold">
              Som desativado: você não vai ouvir os itens novos.
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
          {abas.map((a) => (
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
        {aba === "caixa" && (
          <>
            <div className="flex items-center justify-between gap-3">
              <h1 className="text-3xl font-extrabold">Caixa</h1>
              <button
                onClick={() => setLancando(true)}
                className="btn-base bg-accent text-accent-foreground"
              >
                Lançar pedido
              </button>
            </div>
            <p className="mt-1 text-base text-muted-foreground">
              {pendentesCaixa.length} pedido(s) aguardando confirmação do Pix.
              Depois de 10 minutos o pedido expira sozinho.
            </p>

            <div className="mt-4 grid gap-3">
              {pendentesCaixa.map((p) => (
                <article key={p.id} className="card-praia p-4">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="text-2xl font-extrabold">
                      Mesa {nomeMesa(p.mesa_id)}
                    </h2>
                    <span className="text-base text-muted-foreground">
                      há {minutosDesde(p.criado_em)} min · Garçom:{" "}
                      {nomeGarcom(p.garcom_id)}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {p.itens
                      .map((i) => `${i.quantidade}× ${i.nome_produto}`)
                      .join(", ")}
                  </p>
                  <p className="mt-2 text-xl font-extrabold">
                    {formatarReal(p.total)}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => confirmarPagamento(p.id)}
                      className="btn-base bg-success text-success-foreground"
                    >
                      Confirmar pagamento
                    </button>
                    <button
                      onClick={() => encerrarPedido(p.id, "cancelado")}
                      className="btn-base border-2 border-border bg-card"
                    >
                      Cancelar
                    </button>
                  </div>
                </article>
              ))}
              {pendentesCaixa.length === 0 && (
                <p className="text-lg text-muted-foreground">
                  Nenhum pedido aguardando pagamento.
                </p>
              )}
            </div>
          </>
        )}

        {aba === "cozinha" && (
          <>
            <h1 className="text-3xl font-extrabold">Cozinha</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Só aparece aqui o que já está pago.
            </p>
            <div className="mt-4 grid gap-4">
              {rodadasOrdenadas.map((r) => (
                <CardRodada
                  key={r.chave}
                  rodada={r}
                  garcomDe={nomeGarcom}
                  alertas={alertas}
                  aoTocar={() =>
                    setAlertas((a) =>
                      a.filter((id) => !r.pedidos.some((p) => p.id === id)),
                    )
                  }
                />
              ))}
              {rodadasOrdenadas.length === 0 && (
                <p className="text-lg text-muted-foreground">
                  Nada para preparar agora.
                </p>
              )}
            </div>
          </>
        )}

        {aba === "cardapio" && <AbaCardapio produtos={produtos} />}
        {aba === "mesas" && <AbaMesas />}
        {aba === "resultados" && <AbaResultados />}
        {aba === "pendencias" && <AbaPendencias />}

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

function CardRodada({
  rodada,
  garcomDe,
  alertas,
  aoTocar,
}: {
  rodada: Rodada;
  garcomDe: (id: string | null) => string;
  alertas: string[];
  aoTocar: () => void;
}) {
  const emAlerta = rodada.pedidos.filter((p) => alertas.includes(p.id));
  const preparando = rodada.emPreparo.length > 0;
  const novos = preparando ? rodada.aguardando : [];

  const somar = (lista: Pedido[]) => {
    const mapa = new Map<string, { nome: string; qtd: number }>();
    for (const p of lista)
      for (const i of p.itens) {
        const atual = mapa.get(i.nome_produto) ?? { nome: i.nome_produto, qtd: 0 };
        atual.qtd += i.quantidade;
        mapa.set(i.nome_produto, atual);
      }
    return [...mapa.values()];
  };

  const itens = somar(rodada.pedidos);
  const itensNovos = somar(novos);
  const total = rodada.pedidos.reduce((s, p) => s + p.total, 0);

  async function iniciarPreparo() {
    for (const p of rodada.aguardando) await atualizarStatus(p.id, "em_preparo");
  }
  async function entregar() {
    const prontos = preparando ? rodada.emPreparo : rodada.pedidos;
    for (const p of prontos) await atualizarStatus(p.id, "entregue");
    if (preparando)
      for (const p of rodada.aguardando) await atualizarStatus(p.id, "em_preparo");
  }

  return (
    <article
      onClick={aoTocar}
      className={`card-praia p-4 ${emAlerta.length ? "destaque-novo border-accent" : ""}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-extrabold">
          Mesa {rodada.numeroMesa}
          {rodada.numero > 1 && (
            <span className="ml-2 rounded-full bg-primary px-3 py-1 text-sm font-extrabold text-primary-foreground">
              {rodada.numero}ª rodada
            </span>
          )}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-extrabold ${
            preparando
              ? "bg-primary text-primary-foreground"
              : "bg-success text-success-foreground"
          }`}
        >
          {preparando ? "Em preparo" : "Pago, a preparar"}
        </span>
      </div>

      {emAlerta.length > 0 && novos.length > 0 && (
        <div className="mt-3 rounded-xl bg-accent p-3 text-accent-foreground">
          <p className="text-lg font-extrabold">NOVOS ITENS</p>
          <p className="text-lg font-semibold">
            {itensNovos.map((i) => `${i.qtd}× ${i.nome}`).join(", ")}
          </p>
        </div>
      )}

      <ul className="mt-3 grid gap-1 text-lg">
        {itens.map((i) => (
          <li key={i.nome} className="font-semibold">
            {i.qtd}× {i.nome}
          </li>
        ))}
      </ul>

      <div className="mt-3 border-t-2 border-border pt-3 text-base text-muted-foreground">
        {rodada.pedidos.map((p) => (
          <p key={p.id}>
            {new Date(p.pago_em ?? p.criado_em).toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
            })}{" "}
            · {formatarReal(p.total)} · Garçom: {garcomDe(p.garcom_id)}
            {p.status === "pago" && preparando ? " · novo" : ""}
          </p>
        ))}
        <p className="mt-1 text-lg font-extrabold text-foreground">
          Total {formatarReal(total)}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {rodada.aguardando.length > 0 && (
          <button
            onClick={() => void iniciarPreparo()}
            className="btn-base bg-primary text-primary-foreground"
          >
            Iniciar preparo
          </button>
        )}
        <button
          onClick={() => void entregar()}
          className="btn-base border-2 border-border bg-card"
        >
          Entregue
        </button>
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

function AbaPendencias() {
  const { mesas, garcons, pedidos } = useDados();
  const hoje = new Date().toDateString();
  const nomeMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const nomeGarcom = (id: string | null) =>
    garcons.find((g) => g.id === id)?.nome ?? "—";

  const aguardando = pedidos.filter((p) => !p.pago && p.status === "novo");
  const encerrados = pedidos.filter(
    (p) =>
      (p.status === "expirado" || p.status === "cancelado") &&
      new Date(p.criado_em).toDateString() === hoje,
  );

  return (
    <>
      <h1 className="text-3xl font-extrabold">Pendências</h1>

      <h2 className="mt-5 text-2xl font-extrabold">Aguardando Pix</h2>
      <div className="mt-3 grid gap-3">
        {aguardando.map((p) => (
          <div key={p.id} className="card-praia flex flex-wrap gap-x-4 p-4 text-lg">
            <span className="font-extrabold">Mesa {nomeMesa(p.mesa_id)}</span>
            <span className="font-bold">{formatarReal(p.total)}</span>
            <span className="text-muted-foreground">
              há {minutosDesde(p.criado_em)} min · {nomeGarcom(p.garcom_id)}
            </span>
          </div>
        ))}
        {aguardando.length === 0 && (
          <p className="text-lg text-muted-foreground">Nada aguardando Pix.</p>
        )}
      </div>

      <h2 className="mt-6 text-2xl font-extrabold">
        Expirados e cancelados de hoje
      </h2>
      <div className="mt-3 grid gap-3">
        {encerrados.map((p) => (
          <div key={p.id} className="card-praia flex flex-wrap gap-x-4 p-4 text-lg">
            <span className="font-extrabold">Mesa {nomeMesa(p.mesa_id)}</span>
            <span className="font-bold">{formatarReal(p.total)}</span>
            <span className="text-muted-foreground">
              {p.status === "expirado" ? "Expirado" : "Cancelado"} ·{" "}
              {new Date(p.criado_em).toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </div>
        ))}
        {encerrados.length === 0 && (
          <p className="text-lg text-muted-foreground">
            Nenhum pedido expirado ou cancelado hoje.
          </p>
        )}
      </div>
    </>
  );
}

interface ResumoGrupo {
  pedidos: number;
  faturamento: number;
  ticket: number;
  mesas: number;
  porMesa: number;
}

function AbaResultados() {
  const { mesas, garcons, pedidos } = useDados();
  const [dias, setDias] = useState(7);

  const resumo = (lista: Pedido[]) => {
    // Todos os números consideram apenas pedidos pagos.
    const pagos = lista.filter((p) => p.pago);
    const comQr: Pedido[] = [];
    const semQr: Pedido[] = [];
    for (const p of pagos) {
      const mesa = mesas.find((m) => m.id === p.mesa_id);
      (mesa?.tem_qrcode ? comQr : semQr).push(p);
    }
    const calc = (l: Pedido[]): ResumoGrupo => {
      const faturamento = l.reduce((s, p) => s + p.total - p.gorjeta, 0);
      const qtdMesas = new Set(l.map((p) => p.mesa_id)).size;
      return {
        pedidos: l.length,
        faturamento,
        ticket: l.length ? faturamento / l.length : 0,
        mesas: qtdMesas,
        porMesa: qtdMesas ? faturamento / qtdMesas : 0,
      };
    };
    return { comQr: calc(comQr), semQr: calc(semQr), total: calc(pagos) };
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
      .filter((p) => p.pago && p.garcom_id === g.id)
      .reduce((s, p) => s + p.gorjeta, 0),
  }));

  function exportarCsv() {
    const ordenados = [...doPeriodo].sort((a, b) => {
      if (a.pago !== b.pago) return a.pago ? -1 : 1;
      return a.criado_em.localeCompare(b.criado_em);
    });
    const linhas = [
      [
        "Pedido",
        "Data",
        "Mesa",
        "QR Code",
        "Origem",
        "Garçom",
        "Status",
        "Conta no faturamento",
        "Consumo",
        "Caixinha",
        "Total",
      ],
      ...ordenados.map((p) => {
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
  r: { comQr: ResumoGrupo; semQr: ResumoGrupo; total: ResumoGrupo };
}) {
  const Linha = ({
    rotulo,
    v,
    porMesa,
  }: {
    rotulo: string;
    v: ResumoGrupo;
    porMesa?: boolean;
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
          Média por pedido <strong>{formatarReal(v.ticket)}</strong>
        </span>
        {porMesa && (
          <>
            <span>
              Mesas <strong>{v.mesas}</strong>
            </span>
            <span>
              Média por mesa <strong>{formatarReal(v.porMesa)}</strong>
            </span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <section className="mt-4 grid gap-3">
      <h2 className="text-2xl font-extrabold">{titulo}</h2>
      <Linha rotulo="Total da barraca" v={r.total} />
      <Linha rotulo="Mesas com QR Code" v={r.comQr} porMesa />
      <Linha rotulo="Mesas sem QR Code" v={r.semQr} porMesa />
    </section>
  );
}

function LancarPedido({ aoFechar }: { aoFechar: () => void }) {
  const { mesas, garcons, produtos } = useDados();
  const [mesaId, setMesaId] = useState(mesas[0]?.id ?? "");
  const [garcomId, setGarcomId] = useState(garcons[0]?.id ?? "");
  const [qtds, setQtds] = useState<Record<string, number>>({});
  const [enviando, setEnviando] = useState(false);

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
            disabled={linhas.length === 0 || enviando}
            onClick={async () => {
              setEnviando(true);
              await criarPedido({
                mesa_id: mesaId,
                garcom_id: garcomId || null,
                origem: "garcom",
                gorjeta: 0,
                pago: false,
                linhas,
              });
              setEnviando(false);
              aoFechar();
            }}
            className="btn-base bg-primary px-6 text-primary-foreground"
          >
            {enviando ? "Enviando…" : "Registrar pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
