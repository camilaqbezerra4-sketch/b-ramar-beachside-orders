import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { AppHeader } from "@/components/AppHeader";
import { SuporteWhatsApp } from "@/components/SuporteWhatsApp";
import { AbaCardapio, AbaEquipe } from "@/components/GestaoBarraca";
import { TelaPin } from "@/components/PortaoPin";
import { ItensParaLancar, useCarrinho } from "@/components/Escolhas";
import { gruposDaMesa, anterioresDeHoje, abreGrupo, resumoDaMesa } from "@/lib/mesas";
import { gerarCodigoPix } from "@/lib/pix";
import {
  abrirConta,
  alternarQrCodeMesa,
  atualizarStatus,
  avisoDoPedido,
  confirmarPagamento,
  criarPedido,
  encerrarPedido,
  fecharConta,
  formatarReal,
  liberarMesa,
  recusarConta,
  registrarServico,
  sairDoPainel,
  useDados,
  useHistorico,
} from "@/lib/store";
import { liberadoParaCozinha, type Pedido } from "@/lib/types";

export const Route = createFileRoute("/$slug/painel")({
  head: () => ({
    meta: [
      { title: "Painel da Barraca — BóraMar" },
      {
        name: "description",
        content: "Caixa, cozinha, cardápio, equipe, mesas e resultados do dia da barraca.",
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
  "caixa" | "cozinha" | "cardapio" | "equipe" | "mesas" | "resultados" | "historico" | "ajuda";

const MINUTO = 60000;
const JANELA_RODADA = 5 * MINUTO;
const LIMITE_PRONTO = 5 * MINUTO;

// ---- Som (precisa de um toque do usuário para o navegador liberar) ----
let ctxAudio: AudioContext | null = null;

function liberarAudio() {
  try {
    const Ctx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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

// PIN do painel: componente e utilidades em @/components/PortaoPin

// ---- Rodadas da cozinha ----
interface Rodada {
  chave: string;
  mesaId: string;
  numeroMesa: number | string;
  pedidos: Pedido[];
  emPreparo: Pedido[];
  prontos: Pedido[];
  aguardando: Pedido[]; // pagos ainda não iniciados
  numero: number;
}

const instantePago = (p: Pedido) => new Date(p.pago_em ?? p.criado_em).getTime();

const ATIVOS: Pedido["status"][] = ["pago", "em_preparo", "pronto"];

function agruparRodadas(lista: Pedido[]): Pedido[][] {
  const ordenada = [...lista].sort((a, b) => instantePago(a) - instantePago(b));
  const grupos: Pedido[][] = [];
  for (const p of ordenada) {
    const g = grupos[grupos.length - 1];
    const ultimo = g?.[g.length - 1];
    const aberta = g?.some((x) => x.status === "em_preparo" || x.status === "pronto");
    if (g && ultimo && (aberta || instantePago(p) - instantePago(ultimo) <= JANELA_RODADA)) {
      g.push(p);
    } else {
      grupos.push([p]);
    }
  }
  return grupos;
}

const horaCurta = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function minutosDesde(iso: string) {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / MINUTO));
}

/** Marcador de grupo da mesa mostrado no Caixa e na Cozinha. */
function MarcadorGrupo({ novo }: { novo: boolean }) {
  return (
    <span
      className={`rounded-full px-3 py-1 text-sm font-extrabold ${
        novo ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
      }`}
    >
      {novo ? "grupo novo" : "mesmo grupo"}
    </span>
  );
}

function PainelPage() {
  const { slug } = Route.useParams();
  const dados = useDados(slug);
  const { barraca, mesas, garcons, produtos, pedidos, liberacoes, servicos } = dados;
  const [aba, setAba] = useState<Aba>("caixa");
  const [lancando, setLancando] = useState(false);
  const [fechando, setFechando] = useState<string | null>(null);
  const [somAtivo, setSomAtivo] = useState(false);
  const [alertas, setAlertas] = useState<string[]>([]);
  const [, forcarRelogio] = useState(0);
  const pagosConhecidos = useRef<string[] | null>(null);
  const prontoDesde = useRef<Record<string, number>>({});

  // relógio para os tempos de espera e a expiração automática
  useEffect(() => {
    const t = setInterval(() => forcarRelogio((n) => n + 1), 15000);
    return () => clearInterval(t);
  }, []);

  const pendentesCaixa = useMemo(
    () => pedidos.filter((p) => !p.pago && p.status === "novo"),
    [pedidos],
  );

  // pedido aguardando Pix há mais de 10 minutos expira sozinho: quem faz
  // isso agora é o servidor, a cada carga do painel e a cada consulta do cliente

  // contas abertas e serviço a receber, mesa por mesa
  const resumos = useMemo(
    () =>
      [...mesas]
        .sort((a, b) => a.numero - b.numero)
        .map((mesa) => ({
          mesa,
          ...resumoDaMesa(pedidos, liberacoes, servicos, mesa.id, barraca.servico_percentual),
        })),
    [mesas, pedidos, liberacoes, servicos, barraca.servico_percentual],
  );
  const contasAbertas = resumos.filter((r) => r.emAberto > 0);
  const servicosAReceber = resumos.filter((r) => r.emAberto === 0 && r.servicoPendente > 0);

  // entrou item para preparar (pago ou na conta) → alerta da cozinha
  useEffect(() => {
    const ids = pedidos
      .filter((p) => liberadoParaCozinha(p) && ATIVOS.includes(p.status))
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

  const nomeMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const nomeGarcom = (id: string | null) => garcons.find((g) => g.id === id)?.nome ?? "—";

  const rodadas = useMemo<Rodada[]>(() => {
    const hoje = new Date().toDateString();
    const saida: Rodada[] = [];
    for (const mesa of mesas) {
      const daMesa = pedidos.filter((p) => p.mesa_id === mesa.id && liberadoParaCozinha(p));
      const entreguesHoje = daMesa.filter(
        (p) =>
          p.status === "entregue" && new Date(p.pago_em ?? p.criado_em).toDateString() === hoje,
      );
      const jaFechadas = agruparRodadas(entreguesHoje).length;
      const ativos = daMesa.filter((p) => ATIVOS.includes(p.status));
      agruparRodadas(ativos).forEach((grupo, i) => {
        saida.push({
          chave: grupo[0]!.id,
          mesaId: mesa.id,
          numeroMesa: mesa.numero,
          pedidos: grupo,
          emPreparo: grupo.filter((p) => p.status === "em_preparo"),
          prontos: grupo.filter((p) => p.status === "pronto"),
          aguardando: grupo.filter((p) => p.status === "pago"),
          numero: jaFechadas + i + 1,
        });
      });
    }
    return saida;
  }, [mesas, pedidos]);

  // marca desde quando cada card está pronto (para o tempo de espera)
  useEffect(() => {
    const agora = Date.now();
    const mapa = prontoDesde.current;
    for (const r of rodadas) {
      const pronto = r.prontos.length > 0 && r.emPreparo.length === 0;
      if (pronto && !mapa[r.chave]) mapa[r.chave] = agora;
      if (!pronto && mapa[r.chave]) delete mapa[r.chave];
    }
  }, [rodadas]);

  const ordenar = (lista: Rodada[]) => {
    const comAlerta = (r: Rodada) => r.pedidos.some((p) => alertas.includes(p.id));
    return [...lista].sort((a, b) => {
      if (comAlerta(a) !== comAlerta(b)) return comAlerta(a) ? -1 : 1;
      const ua = Math.max(...a.pedidos.map(instantePago));
      const ub = Math.max(...b.pedidos.map(instantePago));
      return ub - ua;
    });
  };

  const estaPronta = (r: Rodada) => r.prontos.length > 0 && r.emPreparo.length === 0;
  const prontas = ordenar(rodadas.filter(estaPronta));
  const emAndamento = ordenar(rodadas.filter((r) => !estaPronta(r)));

  if (!dados.pronto) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Painel" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-bold">Carregando os pedidos…</p>
      </div>
    );
  }

  if (!dados.existe) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Painel" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-bold">Barraca não encontrada.</p>
      </div>
    );
  }

  if (!dados.liberado) {
    return <TelaPin slug={slug} titulo="Painel da Barraca" subtitulo="Painel" />;
  }

  const abas: Array<{ id: Aba; rotulo: string }> = [
    {
      id: "caixa",
      rotulo: pendentesCaixa.length ? `Caixa (${pendentesCaixa.length})` : "Caixa",
    },
    { id: "cozinha", rotulo: "Cozinha" },
    { id: "cardapio", rotulo: "Cardápio" },
    { id: "equipe", rotulo: "Equipe" },
    { id: "mesas", rotulo: "Mesas" },
    { id: "resultados", rotulo: "Resultados" },
    { id: "historico", rotulo: "Histórico" },
    { id: "ajuda", rotulo: "Ajuda" },
  ];

  const cardRodada = (r: Rodada) => (
    <CardRodada
      key={r.chave}
      rodada={r}
      garcomDe={nomeGarcom}
      alertas={alertas}
      grupoNovo={abreGrupo(r.pedidos[0]!, pedidos, liberacoes)}
      prontoDesde={prontoDesde.current[r.chave]}
      aoTocar={() => setAlertas((a) => a.filter((id) => !r.pedidos.some((p) => p.id === id)))}
    />
  );

  return (
    <div className="min-h-screen pb-28">
      <AppHeader
        titulo={barraca.nome}
        subtitulo="Painel"
        acao={
          <button
            onClick={() => void sairDoPainel(slug)}
            className="rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-bold"
          >
            Sair
          </button>
        }
      />

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

            {contasAbertas.length > 0 && (
              <section className="mt-5">
                <h2 className="text-2xl font-extrabold">Contas abertas</h2>
                <p className="text-base text-muted-foreground">
                  Mesas que vão pagar no final. De olho na saída 👀
                </p>
                <div className="mt-3 grid gap-3">
                  {contasAbertas.map((c) => (
                    <article key={c.mesa.id} className="card-praia border-accent p-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-2xl font-extrabold">Mesa {c.mesa.numero}</h3>
                        <span className="text-2xl font-extrabold">{formatarReal(c.emAberto)}</span>
                      </div>
                      <p className="text-base text-muted-foreground">
                        na conta desde {c.contaDesde ? horaCurta(c.contaDesde) : "—"}
                        {c.servicoPendente > 0
                          ? ` · serviço ${formatarReal(c.servicoPendente)}`
                          : ""}
                      </p>
                      {c.fechamentoSolicitado && (
                        <p className="mt-2 rounded-xl bg-success/15 p-2 text-lg font-bold">
                          Avisou que pagou no Pix. Confere no banco 👍
                        </p>
                      )}
                      <button
                        onClick={() => setFechando(c.mesa.id)}
                        className="btn-base mt-3 bg-primary text-primary-foreground"
                      >
                        Fechar conta
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <h2 className="mt-6 text-2xl font-extrabold">Aguardando pagamento</h2>
            <p className="mt-1 text-base text-muted-foreground">
              {pendentesCaixa.length} pedido(s). Depois de 10 minutos o pedido expira sozinho.
            </p>

            <div className="mt-4 grid gap-3">
              {pendentesCaixa.map((p) => (
                <article
                  key={p.id}
                  className={`card-praia p-4 ${p.na_conta ? "border-accent" : ""}`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h2 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
                      Mesa {nomeMesa(p.mesa_id)}
                      {p.na_conta ? (
                        <span className="rounded-full bg-accent px-3 py-1 text-sm font-extrabold text-accent-foreground">
                          quer abrir conta
                        </span>
                      ) : (
                        <MarcadorGrupo novo={abreGrupo(p, pedidos, liberacoes)} />
                      )}
                      {!p.na_conta && p.forma_pagamento === "cartao" && (
                        <span className="rounded-full bg-accent px-3 py-1 text-sm font-extrabold text-accent-foreground">
                          aguardando cartão
                        </span>
                      )}
                      {!p.na_conta &&
                        p.forma_pagamento === "pix" &&
                        (p.fechamento_solicitado_em ? (
                          <span className="rounded-full bg-success px-3 py-1 text-sm font-extrabold text-success-foreground">
                            pagou no Pix · confira
                          </span>
                        ) : (
                          <span className="rounded-full bg-primary px-3 py-1 text-sm font-extrabold text-primary-foreground">
                            Pix
                          </span>
                        ))}
                    </h2>
                    <span className="text-base text-muted-foreground">
                      há {minutosDesde(p.criado_em)} min · Garçom: {nomeGarcom(p.garcom_id)}
                    </span>
                  </div>
                  <p className="mt-2 text-lg font-semibold">
                    {p.itens.map((i) => `${i.quantidade}× ${i.nome_produto}`).join(", ")}
                  </p>
                  <p className="mt-2 text-xl font-extrabold">{formatarReal(p.total)}</p>
                  {p.na_conta && (
                    <p className="mt-1 text-base text-muted-foreground">
                      Tem gente na Mesa {nomeMesa(p.mesa_id)}? Então é só abrir a conta.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {p.na_conta ? (
                      <>
                        <button
                          onClick={() => abrirConta(p.id)}
                          className="btn-base bg-success text-success-foreground"
                        >
                          Abrir conta
                        </button>
                        <button
                          onClick={() => recusarConta(p.id)}
                          className="btn-base border-2 border-border bg-card"
                        >
                          Recusar
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => confirmarPagamento(p.id)}
                          className="btn-base bg-success text-success-foreground"
                        >
                          {p.forma_pagamento === "cartao"
                            ? "Recebi no cartão"
                            : "Confirmar pagamento"}
                        </button>
                        <button
                          onClick={() => encerrarPedido(p.id, "cancelado")}
                          className="btn-base border-2 border-border bg-card"
                        >
                          Cancelar
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))}

              {pendentesCaixa.length === 0 && (
                <p className="text-lg text-muted-foreground">Nada esperando por aqui. 🌊</p>
              )}
            </div>

            {servicosAReceber.length > 0 && (
              <section className="mt-6">
                <h2 className="text-2xl font-extrabold">Serviço a receber</h2>
                <p className="text-base text-muted-foreground">
                  Mesas que já pagaram o consumo e ainda não deixaram o serviço.
                </p>
                <div className="mt-3 grid gap-3">
                  {servicosAReceber.map((c) => (
                    <article key={c.mesa.id} className="card-praia flex items-center gap-3 p-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xl font-extrabold">Mesa {c.mesa.numero}</p>
                        <p className="text-base text-muted-foreground">
                          consumo {formatarReal(c.consumo)} · serviço{" "}
                          <strong>{formatarReal(c.servicoPendente)}</strong>
                        </p>
                      </div>
                      <button
                        onClick={() => setFechando(c.mesa.id)}
                        className="btn-base bg-accent text-accent-foreground"
                      >
                        Cobrar
                      </button>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {aba === "cozinha" && (
          <>
            <h1 className="text-3xl font-extrabold">Cozinha</h1>
            <p className="mt-1 text-base text-muted-foreground">
              Só aparece aqui o que já está pago.
            </p>

            {prontas.length > 0 && (
              <section className="mt-4">
                <h2 className="text-2xl font-extrabold">Prontos pra entregar</h2>
                <div className="mt-3 grid gap-4">{prontas.map(cardRodada)}</div>
              </section>
            )}

            <div className="mt-4 grid gap-4">
              {emAndamento.map(cardRodada)}
              {rodadas.length === 0 && (
                <p className="text-lg text-muted-foreground">Nada para preparar agora.</p>
              )}
            </div>
          </>
        )}

        {aba === "cardapio" && <AbaCardapio produtos={produtos} />}
        {aba === "equipe" && <AbaEquipe />}
        {aba === "mesas" && <AbaMesas slug={slug} aoFecharConta={setFechando} />}
        {aba === "resultados" && <AbaResultados />}
        {aba === "historico" && <AbaHistorico />}
        {aba === "ajuda" && <AbaAjuda whatsapp={barraca.whatsapp_suporte} />}

        <div className="mt-8">
          <Link to="/" className="btn-base border-2 border-border bg-card">
            Voltar ao início
          </Link>
        </div>
      </main>

      {lancando && <LancarPedido aoFechar={() => setLancando(false)} />}
      {fechando && <FecharMesa mesaId={fechando} aoFechar={() => setFechando(null)} />}
      <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
    </div>
  );
}

function CardRodada({
  rodada,
  garcomDe,
  alertas,
  grupoNovo,
  prontoDesde,
  aoTocar,
}: {
  rodada: Rodada;
  garcomDe: (id: string | null) => string;
  alertas: string[];
  grupoNovo: boolean;
  prontoDesde: number | undefined;
  aoTocar: () => void;
}) {
  const emAlerta = rodada.pedidos.filter((p) => alertas.includes(p.id));
  const aberta = rodada.emPreparo.length > 0 || rodada.prontos.length > 0;
  const novos = aberta ? rodada.aguardando : [];
  const pronta = rodada.prontos.length > 0 && rodada.emPreparo.length === 0;
  const esperaPronto = prontoDesde ? Math.floor((Date.now() - prontoDesde) / MINUTO) : 0;
  const atrasado = pronta && prontoDesde ? Date.now() - prontoDesde > LIMITE_PRONTO : false;

  const somar = (lista: Pedido[]) => {
    const mapa = new Map<string, { nome: string; qtd: number }>();
    for (const p of lista)
      for (const i of p.itens) {
        const atual = mapa.get(i.nome_produto) ?? {
          nome: i.nome_produto,
          qtd: 0,
        };
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
  async function marcarPronto() {
    for (const p of rodada.emPreparo) await atualizarStatus(p.id, "pronto");
  }
  async function entregar() {
    for (const p of rodada.prontos) await atualizarStatus(p.id, "entregue");
    for (const p of rodada.aguardando) await atualizarStatus(p.id, "em_preparo");
  }

  return (
    <article
      onClick={aoTocar}
      className={`card-praia p-4 ${pronta ? "border-success bg-success/15" : ""} ${
        emAlerta.length || atrasado ? "destaque-novo border-accent" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex flex-wrap items-center gap-2 text-2xl font-extrabold">
          Mesa {rodada.numeroMesa}
          <MarcadorGrupo novo={grupoNovo} />
          {rodada.numero > 1 && (
            <span className="rounded-full bg-primary px-3 py-1 text-sm font-extrabold text-primary-foreground">
              {rodada.numero}ª rodada
            </span>
          )}
        </h2>
        <span
          className={`rounded-full px-3 py-1 text-sm font-extrabold ${
            pronta
              ? "bg-success text-success-foreground"
              : rodada.emPreparo.length
                ? "bg-primary text-primary-foreground"
                : "bg-success text-success-foreground"
          }`}
        >
          {pronta
            ? "Pronto"
            : rodada.emPreparo.length
              ? "Em preparo"
              : rodada.pedidos.every((p) => p.pago)
                ? "Pago, a preparar"
                : "A preparar"}
        </span>
      </div>

      {pronta && (
        <p className="mt-2 text-lg font-extrabold">
          Esperando o garçom há {esperaPronto} min
          {atrasado ? " — passou de 5 minutos!" : ""}
        </p>
      )}

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
            {p.na_conta && !p.pago ? " · na conta" : ""}
            {p.status === "pago" && aberta ? " · novo" : ""}
          </p>
        ))}
        <p className="mt-1 text-lg font-extrabold text-foreground">Total {formatarReal(total)}</p>
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
        {rodada.emPreparo.length > 0 && (
          <button
            onClick={() => void marcarPronto()}
            className="btn-base bg-success text-success-foreground"
          >
            Pronto
          </button>
        )}
        {rodada.prontos.length > 0 && (
          <button
            onClick={() => void entregar()}
            className="btn-base bg-success px-8 py-5 text-xl text-success-foreground"
          >
            Entregue
          </button>
        )}
      </div>
    </article>
  );
}

function AbaMesas({
  slug,
  aoFecharConta,
}: {
  slug: string;
  aoFecharConta: (mesaId: string) => void;
}) {
  const { barraca, mesas, garcons, pedidos, liberacoes, servicos } = useDados();
  const [aberta, setAberta] = useState<string | null>(null);

  const hora = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });
  const nomeGarcom = (id: string | null) => garcons.find((g) => g.id === id)?.nome ?? "—";

  const mesa = mesas.find((m) => m.id === aberta);
  if (mesa) {
    const { atual, anteriores } = gruposDaMesa(pedidos, liberacoes, mesa.id);
    const resumo = resumoDaMesa(pedidos, liberacoes, servicos, mesa.id, barraca.servico_percentual);
    return (
      <>
        <button onClick={() => setAberta(null)} className="btn-base border-2 border-border bg-card">
          ← Voltar às mesas
        </button>
        <h1 className="mt-3 text-3xl font-extrabold">Mesa {mesa.numero}</h1>
        <p className="mt-1 text-lg text-muted-foreground">
          {atual.inicio ? `Ocupada desde ${hora(atual.inicio)}` : "Livre no momento"}
        </p>

        <div className="mt-4 grid gap-3">
          {atual.pedidos.map((p) => (
            <div key={p.id} className="card-praia p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xl font-extrabold">{hora(p.criado_em)}</p>
                <span className="text-base text-muted-foreground">
                  {p.status} · {p.forma_pagamento === "cartao" ? "cartão" : "Pix"} ·{" "}
                  {nomeGarcom(p.garcom_id)}
                </span>
              </div>
              <p className="mt-1 text-lg font-semibold">
                {p.itens.map((i) => `${i.quantidade}× ${i.nome_produto}`).join(", ")}
              </p>
              <p className="mt-1 text-xl font-extrabold">{formatarReal(p.total)}</p>
            </div>
          ))}
          {atual.pedidos.length === 0 && (
            <p className="text-lg text-muted-foreground">Nenhum pedido neste grupo.</p>
          )}
        </div>

        <p className="mt-4 text-2xl font-extrabold">Total do grupo: {formatarReal(atual.total)}</p>
        {(resumo.emAberto > 0 || resumo.servicoPendente > 0) && (
          <div className="card-praia mt-3 border-accent p-4">
            {resumo.emAberto > 0 && (
              <p className="text-xl font-extrabold">Na conta: {formatarReal(resumo.emAberto)}</p>
            )}
            {resumo.servicoPendente > 0 && (
              <p className="text-lg font-bold">
                Serviço a receber: {formatarReal(resumo.servicoPendente)}
              </p>
            )}
            <button
              onClick={() => aoFecharConta(mesa.id)}
              className="btn-base mt-3 bg-primary text-primary-foreground"
            >
              {resumo.emAberto > 0 ? "Fechar conta" : "Cobrar serviço"}
            </button>
          </div>
        )}
        <button
          disabled={atual.pedidos.length === 0}
          onClick={() => {
            const falta = [
              resumo.emAberto > 0 ? `a conta de ${formatarReal(resumo.emAberto)}` : "",
              resumo.servicoPendente > 0
                ? `o serviço de ${formatarReal(resumo.servicoPendente)}`
                : "",
            ].filter(Boolean);
            if (
              falta.length &&
              !window.confirm(
                `A Mesa ${mesa.numero} ainda não pagou ${falta.join(" e ")}. Liberar mesmo assim?`,
              )
            )
              return;
            void liberarMesa(mesa.id);
          }}
          className="btn-base mt-3 border-2 border-border bg-card disabled:opacity-50"
        >
          Liberar mesa
        </button>

        <div className="mt-4 flex items-center gap-3">
          <p className="flex-1 text-lg font-bold">Plaquinha com QR Code</p>
          <button
            onClick={() => alternarQrCodeMesa(mesa.id)}
            aria-pressed={mesa.tem_qrcode}
            className={`btn-base min-w-[9rem] ${
              mesa.tem_qrcode
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {mesa.tem_qrcode ? "Com QR Code" : "Sem QR Code"}
          </button>
        </div>

        {anterioresDeHoje(anteriores).length > 0 && (
          <section className="mt-6">
            <h2 className="text-xl font-extrabold text-muted-foreground">
              Grupos anteriores de hoje
            </h2>
            <div className="mt-2 grid gap-2">
              {anterioresDeHoje(anteriores).map((g, i) => (
                <p key={i} className="text-lg text-muted-foreground">
                  {g.inicio ? hora(g.inicio) : "—"} até {g.fim ? hora(g.fim) : "—"} ·{" "}
                  {formatarReal(g.total)}
                </p>
              ))}
            </div>
          </section>
        )}
      </>
    );
  }

  return (
    <>
      <h1 className="text-3xl font-extrabold">Mesas</h1>
      <p className="mt-1 text-base text-muted-foreground">
        Toque numa mesa para ver o consumo do grupo e liberar a mesa.
      </p>
      <Link
        to="/$slug/qrcodes"
        params={{ slug }}
        className="btn-base mt-4 inline-flex bg-accent text-accent-foreground"
      >
        Gerar QR Codes
      </Link>
      <div className="mt-4 grid gap-3">
        {[...mesas]
          .sort((a, b) => a.numero - b.numero)
          .map((m) => {
            const { atual } = gruposDaMesa(pedidos, liberacoes, m.id);
            const ocupada = atual.pedidos.length > 0;
            const conta = resumoDaMesa(
              pedidos,
              liberacoes,
              servicos,
              m.id,
              barraca.servico_percentual,
            );
            return (
              <button
                key={m.id}
                onClick={() => setAberta(m.id)}
                className={`card-praia flex items-center gap-3 p-4 text-left ${
                  ocupada ? "border-accent" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xl font-extrabold">Mesa {m.numero}</p>
                  <p className="text-base text-muted-foreground">
                    {ocupada
                      ? `Ocupada desde ${hora(atual.inicio!)} · ${formatarReal(atual.total)}`
                      : "Livre"}
                  </p>
                  {conta.emAberto > 0 && (
                    <p className="text-base font-extrabold text-accent-foreground">
                      <span className="rounded-full bg-accent px-2 py-0.5">
                        conta aberta {formatarReal(conta.emAberto)}
                      </span>
                    </p>
                  )}
                </div>
                <span
                  className={`rounded-full px-3 py-1 text-sm font-extrabold ${
                    m.tem_qrcode
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {m.tem_qrcode ? "Com QR" : "Sem QR"}
                </span>
              </button>
            );
          })}
      </div>
    </>
  );
}

type Periodo = "hoje" | "semana" | "mes";

function AbaHistorico() {
  const { mesas, garcons } = useDados();
  const [periodo, setPeriodo] = useState<Periodo>("hoje");
  const historico = useHistorico(periodo === "hoje" ? 1 : periodo === "semana" ? 7 : 30);
  const pedidos = historico.pedidos;
  const [status, setStatus] = useState<string[]>(["entregue"]);

  const nomeMesa = (id: string) => mesas.find((m) => m.id === id)?.numero ?? "?";
  const nomeGarcom = (id: string | null) => garcons.find((g) => g.id === id)?.nome ?? "—";

  const dentroDoPeriodo = (iso: string) => {
    const d = new Date(iso).getTime();
    if (periodo === "hoje") return new Date(iso).toDateString() === new Date().toDateString();
    const dias = periodo === "semana" ? 7 : 30;
    return d >= Date.now() - dias * 86400000;
  };

  const lista = pedidos
    .filter((p) => dentroDoPeriodo(p.criado_em) && status.includes(p.status))
    .sort((a, b) => b.criado_em.localeCompare(a.criado_em));

  const totalValor = lista.reduce((s, p) => s + p.total, 0);

  const rotulos: Record<string, string> = {
    entregue: "Entregues",
    expirado: "Expirados",
    cancelado: "Cancelados",
  };

  const alternar = (s: string) =>
    setStatus((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));

  return (
    <>
      <h1 className="text-3xl font-extrabold">Histórico</h1>

      {historico.carregando && (
        <p className="mt-2 text-lg font-bold text-muted-foreground">Carregando…</p>
      )}
      {historico.erro && (
        <p className="mt-2 text-lg font-bold text-destructive">
          Não deu para carregar. Confira a internet e abra a aba de novo.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {(
          [
            ["hoje", "Hoje"],
            ["semana", "Semana"],
            ["mes", "Mês"],
          ] as Array<[Periodo, string]>
        ).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => setPeriodo(id)}
            className={`btn-base border-2 ${
              periodo === id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {Object.entries(rotulos).map(([id, rotulo]) => (
          <button
            key={id}
            onClick={() => alternar(id)}
            aria-pressed={status.includes(id)}
            className={`btn-base border-2 ${
              status.includes(id)
                ? "border-accent bg-accent text-accent-foreground"
                : "border-border bg-card"
            }`}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3">
        {lista.map((p) => (
          <article key={p.id} className="card-praia p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-xl font-extrabold">
                {new Date(p.criado_em).toLocaleTimeString("pt-BR", {
                  hour: "2-digit",
                  minute: "2-digit",
                })}{" "}
                · Mesa {nomeMesa(p.mesa_id)}
              </h2>
              <span className="rounded-full bg-muted px-3 py-1 text-sm font-extrabold text-muted-foreground">
                {rotulos[p.status] ?? p.status}
              </span>
            </div>
            <p className="mt-2 text-lg font-semibold">
              {p.itens.map((i) => `${i.quantidade}× ${i.nome_produto}`).join(", ")}
            </p>
            <p className="mt-1 text-base text-muted-foreground">
              Garçom: {nomeGarcom(p.garcom_id)}
            </p>
            <p className="mt-1 text-xl font-extrabold">{formatarReal(p.total)}</p>
          </article>
        ))}
        {lista.length === 0 && (
          <p className="text-lg text-muted-foreground">Nenhum pedido neste filtro.</p>
        )}
      </div>

      <div className="card-praia mt-4 flex flex-wrap justify-between gap-3 p-4 text-lg">
        <span className="font-bold">{lista.length} pedido(s)</span>
        <span className="font-extrabold">{formatarReal(totalValor)}</span>
      </div>
    </>
  );
}

interface ResumoGrupo {
  pedidos: number;
  faturamento: number;
  ticket: number;
  mesas: number;
  mesasQuePediram: number;
  porMesa: number;
  pix: number;
  cartao: number;
}

function AbaResultados() {
  const { mesas, garcons, barraca } = useDados();
  const [dias, setDias] = useState(7);
  const historico = useHistorico(dias);
  const pedidos = historico.pedidos;
  const aReceber = pedidos
    .filter(
      (p) =>
        p.na_conta &&
        !p.pago &&
        p.status !== "novo" &&
        p.status !== "cancelado" &&
        p.status !== "expirado",
    )
    .reduce((s, p) => s + p.total, 0);
  const servicoPorGarcom = [...garcons, { id: null as string | null, nome: "Equipe (sem nome)" }]
    .map((g) => ({
      nome: g.nome,
      total: historico.servicos
        .filter((x) => x.garcom_id === g.id)
        .reduce((s, x) => s + x.valor, 0),
    }))
    .filter((x) => x.total > 0 || x.nome !== "Equipe (sem nome)");

  const resumo = (lista: Pedido[]) => {
    // Todos os números consideram apenas pedidos pagos.
    const pagos = lista.filter((p) => p.pago);
    const comQr: Pedido[] = [];
    const semQr: Pedido[] = [];
    for (const p of pagos) {
      const mesa = mesas.find((m) => m.id === p.mesa_id);
      (mesa?.tem_qrcode ? comQr : semQr).push(p);
    }
    const calc = (l: Pedido[], totalMesas: number): ResumoGrupo => {
      const faturamento = l.reduce((s, p) => s + p.total - p.gorjeta, 0);
      const soma = (forma: "pix" | "cartao") =>
        l.filter((p) => p.forma_pagamento === forma).reduce((s, p) => s + p.total - p.gorjeta, 0);
      return {
        pedidos: l.length,
        faturamento,
        ticket: l.length ? faturamento / l.length : 0,
        mesas: totalMesas,
        mesasQuePediram: new Set(l.map((p) => p.mesa_id)).size,
        porMesa: totalMesas ? faturamento / totalMesas : 0,
        pix: soma("pix"),
        cartao: soma("cartao"),
      };
    };
    const mesasComQr = mesas.filter((m) => m.tem_qrcode).length;
    const mesasSemQr = mesas.length - mesasComQr;
    return {
      comQr: calc(comQr, mesasComQr),
      semQr: calc(semQr, mesasSemQr),
      total: calc(pagos, mesas.length),
    };
  };

  const hoje = new Date().toDateString();
  const doDia = pedidos.filter((p) => new Date(p.criado_em).toDateString() === hoje);
  const limite = Date.now() - dias * 86400000;
  const doPeriodo = pedidos.filter((p) => new Date(p.criado_em).getTime() >= limite);

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
        "Forma de pagamento",
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
          p.forma_pagamento === "cartao" ? "cartao" : "pix",
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

      {historico.carregando && (
        <p className="mt-2 text-lg font-bold text-muted-foreground">Carregando…</p>
      )}
      {historico.erro && (
        <p className="mt-2 text-lg font-bold text-destructive">
          Não deu para carregar. Confira a internet e abra a aba de novo.
        </p>
      )}

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

      {aReceber > 0 && (
        <p className="card-praia mt-4 border-accent p-4 text-lg font-bold">
          A receber (contas abertas): {formatarReal(aReceber)}
        </p>
      )}

      {barraca.servico_percentual > 0 && (
        <>
          <h2 className="mt-6 text-2xl font-extrabold">Serviço por garçom</h2>
          <div className="card-praia mt-3 divide-y-2 divide-border p-4 text-lg">
            {servicoPorGarcom.map((c) => (
              <div key={c.nome} className="flex justify-between py-2">
                <span className="font-semibold">{c.nome}</span>
                <span className="font-extrabold">{formatarReal(c.total)}</span>
              </div>
            ))}
          </div>
        </>
      )}

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
  const Linha = ({ rotulo, v, porMesa }: { rotulo: string; v: ResumoGrupo; porMesa?: boolean }) => (
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
        <span>
          Pix <strong>{formatarReal(v.pix)}</strong>
        </span>
        <span>
          Cartão <strong>{formatarReal(v.cartao)}</strong>
        </span>
        {porMesa && (
          <>
            <span>
              Mesas <strong>{v.mesas}</strong>
            </span>
            <span>
              Mesas que pediram{" "}
              <strong>
                {v.mesasQuePediram} de {v.mesas}
              </strong>
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
  const [forma, setForma] = useState<"pix" | "cartao" | "final">("final");
  const carrinho = useCarrinho(produtos);
  const [enviando, setEnviando] = useState(false);

  const linhas = carrinho.linhas;
  const total = carrinho.total;

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

        <p className="mt-4 text-lg font-bold">Pagamento</p>
        <div className="mt-1 grid grid-cols-3 gap-2">
          {(
            [
              ["final", "Na conta"],
              ["pix", "Pix agora"],
              ["cartao", "Cartão"],
            ] as const
          ).map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setForma(id)}
              className={`btn-base border-2 ${
                forma === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <ItensParaLancar produtos={produtos} carrinho={carrinho} />
      </div>

      <div className="border-t-2 border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <span className="flex-1 text-2xl font-extrabold">{formatarReal(total)}</span>
          <button
            disabled={linhas.length === 0 || enviando}
            onClick={async () => {
              setEnviando(true);
              const r = await criarPedido({
                mesa_id: mesaId,
                garcom_id: garcomId || null,
                origem: "garcom",
                gorjeta: 0,
                forma_pagamento: forma,
                linhas: carrinho.linhas.map((l) => ({ produto: l.produto, quantidade: l.quantidade, escolhas: l.escolhas })),
              });
              setEnviando(false);
              const aviso = avisoDoPedido(r);
              if (aviso) {
                window.alert(aviso);
                return;
              }
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

const PERGUNTAS: Array<[string, string]> = [
  [
    "Não escuto o som dos pedidos",
    "O celular só libera o som depois de um toque. Abra a aba Cozinha e toque no botão grande 'Ativar som'. Deixe a tela da Cozinha aberta e o volume do aparelho no alto. Se trocar de aparelho ou recarregar a página, toque em 'Ativar som' de novo.",
  ],
  [
    "O cliente disse que pagou e não apareceu no Caixa",
    "O pedido só aparece no Caixa depois que o cliente termina o pedido no celular dele. Peça para ele conferir se apertou o botão de enviar. Se o sinal estava fraco, o pedido fica guardado no celular e entra sozinho quando a internet voltar. Confira o comprovante do Pix antes de confirmar.",
  ],
  [
    "Como confirmo o pagamento",
    "Na aba Caixa, veja o pedido da mesa, confira o valor no seu aplicativo do banco e toque em 'Confirmar pagamento'. Só depois disso o pedido aparece na Cozinha. Se o cliente desistiu, toque em 'Cancelar'.",
  ],
  [
    "Como marco que um item acabou",
    "Vá na aba Cardápio e toque no botão 'Disponível' do item: ele muda para 'Acabou'. Quem abrir o cardápio a partir daí já vê o item como 'acabou'; quem já estava com o cardápio aberto recebe um aviso se tentar pedir. Quando chegar mais, é só ligar de novo.",
  ],
  [
    "Esqueci o PIN",
    "O PIN fica com o responsável pelo cadastro da barraca, na área de administração. Fale com a gente pelo WhatsApp aqui embaixo que reenviamos ou trocamos o PIN.",
  ],
  [
    "O celular está sem sinal",
    "Os pedidos feitos pelos clientes ficam guardados no aparelho deles e são enviados sozinhos quando a internet voltar, sem repetir pedido. No painel, quando o sinal voltar, a tela se atualiza sozinha. Se demorar, feche e abra a página de novo.",
  ],
  [
    "Como imprimo os QR Codes de novo",
    "Vá na aba Mesas e toque em 'Gerar QR Codes'. Abre uma página pronta para impressão, com quatro mesas por folha. Use a opção de imprimir do navegador.",
  ],
  [
    "Como adiciono um garçom",
    "Na aba Equipe, escreva o nome e a chave Pix do garçom e toque em adicionar. Ele passa a aparecer para o cliente escolher na hora da caixinha. Para tirar alguém, toque em remover.",
  ],
];

function AbaAjuda({ whatsapp }: { whatsapp: string }) {
  const [aberta, setAberta] = useState<number | null>(null);

  return (
    <section>
      <h1 className="text-3xl font-extrabold">Ajuda</h1>
      <p className="mt-1 text-base text-muted-foreground">Toque na pergunta para ver a resposta.</p>

      <div className="mt-4 grid gap-3">
        {PERGUNTAS.map(([pergunta, resposta], i) => (
          <article key={pergunta} className="card-praia p-4">
            <button
              onClick={() => setAberta(aberta === i ? null : i)}
              aria-expanded={aberta === i}
              className="flex w-full items-center justify-between gap-3 text-left text-xl font-extrabold"
            >
              {pergunta}
              <span aria-hidden>{aberta === i ? "−" : "+"}</span>
            </button>
            {aberta === i && <p className="mt-3 text-lg leading-relaxed">{resposta}</p>}
          </article>
        ))}
      </div>

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp.replace(/\D/g, "")}`}
          target="_blank"
          rel="noreferrer"
          className="btn-base mt-6 inline-flex bg-success px-6 py-5 text-xl text-success-foreground"
        >
          Não resolveu? Fala com a gente
        </a>
      )}
    </section>
  );
}

function QrPix({ codigo }: { codigo: string }) {
  const [qr, setQr] = useState("");
  useEffect(() => {
    if (!codigo) return;
    let ativo = true;
    void QRCode.toDataURL(codigo, { width: 280, margin: 1 }).then((url) => {
      if (ativo) setQr(url);
    });
    return () => {
      ativo = false;
    };
  }, [codigo]);
  return qr ? (
    <img src={qr} alt="QR Code do Pix" className="mx-auto h-56 w-56 rounded-xl" />
  ) : (
    <div className="mx-auto h-56 w-56 animate-pulse rounded-xl bg-sand" />
  );
}

/** Fechar a conta da mesa e/ou cobrar o serviço do garçom, pelo celular da barraca. */
function FecharMesa({ mesaId, aoFechar }: { mesaId: string; aoFechar: () => void }) {
  const { barraca, mesas, garcons, pedidos, liberacoes, servicos } = useDados();
  const mesa = mesas.find((m) => m.id === mesaId);
  const r = resumoDaMesa(pedidos, liberacoes, servicos, mesaId, barraca.servico_percentual);
  const [mostrarQrConta, setMostrarQrConta] = useState(false);
  // garçom que atendeu a turma (se algum pedido disse); senão, ninguém marcado
  const doGrupo = gruposDaMesa(pedidos, liberacoes, mesaId).atual.pedidos;
  const [garcomId, setGarcomId] = useState(
    [...doGrupo].reverse().find((p) => p.garcom_id)?.garcom_id ?? "",
  );
  const garcom = garcons.find((g) => g.id === garcomId);
  const [mostrarQrServico, setMostrarQrServico] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const itens = new Map<string, number>();
  for (const p of r.contaPedidos)
    for (const i of p.itens)
      itens.set(i.nome_produto, (itens.get(i.nome_produto) ?? 0) + i.quantidade);

  const fazer = async (acao: () => Promise<void>) => {
    setSalvando(true);
    await acao();
    setSalvando(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <div className="border-b-2 border-border bg-card px-4 py-3">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <h2 className="text-2xl font-extrabold">Mesa {mesa?.numero ?? "?"}</h2>
          <button onClick={aoFechar} className="btn-base border-2 border-border">
            Fechar
          </button>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto px-4 py-4">
        {r.emAberto > 0 && (
          <section className="card-praia p-4">
            <h3 className="text-2xl font-extrabold">Conta: {formatarReal(r.emAberto)}</h3>
            <p className="mt-1 text-lg">
              {[...itens].map(([nome, q]) => `${q}× ${nome}`).join(", ")}
            </p>
            {r.fechamentoSolicitado && (
              <p className="mt-2 rounded-xl bg-success/15 p-2 text-lg font-bold">
                O cliente avisou que pagou no Pix. Confere no banco 👍
              </p>
            )}
            <button
              onClick={() => setMostrarQrConta((v) => !v)}
              className="mt-3 text-base font-bold text-muted-foreground underline"
            >
              {mostrarQrConta ? "Esconder QR do Pix" : "Mostrar QR do Pix pro cliente"}
            </button>
            {mostrarQrConta && (
              <div className="mt-3">
                <QrPix
                  codigo={gerarCodigoPix({
                    chave: barraca.chave_pix,
                    nome: barraca.nome,
                    cidade: barraca.cidade,
                    valor: r.emAberto,
                  })}
                />
              </div>
            )}
            <p className="mt-4 text-lg font-bold">Recebeu? Toca em como foi:</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["pix", "Pix"],
                  ["cartao", "Cartão"],
                  ["dinheiro", "Dinheiro"],
                ] as const
              ).map(([forma, rotulo]) => (
                <button
                  key={forma}
                  disabled={salvando}
                  onClick={() => void fazer(() => fecharConta(mesaId, forma))}
                  className="btn-base bg-success text-success-foreground"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </section>
        )}

        {r.servicoPendente > 0 && (
          <section className="card-praia mt-4 p-4">
            <h3 className="text-2xl font-extrabold">Serviço: {formatarReal(r.servicoPendente)}</h3>
            <p className="mt-1 text-base text-muted-foreground">
              {barraca.servico_percentual}% de {formatarReal(r.consumo)} · opcional para o cliente
            </p>
            <p className="mt-3 text-lg font-bold">Quem atendeu?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[...garcons, { id: "equipe", nome: "Equipe", chave_pix: "" }].map((g) => (
                <button
                  key={g.id}
                  onClick={() => setGarcomId(g.id)}
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
            {garcom?.chave_pix && (
              <>
                <button
                  onClick={() => setMostrarQrServico((v) => !v)}
                  className="mt-3 text-base font-bold text-muted-foreground underline"
                >
                  {mostrarQrServico ? "Esconder QR" : `Mostrar QR do Pix de ${garcom.nome}`}
                </button>
                {mostrarQrServico && (
                  <div className="mt-3">
                    <QrPix
                      codigo={gerarCodigoPix({
                        chave: garcom.chave_pix,
                        nome: garcom.nome,
                        cidade: barraca.cidade,
                        valor: r.servicoPendente,
                      })}
                    />
                  </div>
                )}
              </>
            )}
            <p className="mt-4 text-lg font-bold">
              {garcomId
                ? "Recebeu o serviço? Toca em como foi:"
                : "Primeiro, toca em quem atendeu."}
            </p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(
                [
                  ["pix", "Pix"],
                  ["cartao", "Cartão"],
                  ["dinheiro", "Dinheiro"],
                ] as const
              ).map(([forma, rotulo]) => (
                <button
                  key={forma}
                  disabled={salvando || !garcomId}
                  onClick={() =>
                    void fazer(() =>
                      registrarServico(
                        mesaId,
                        garcomId === "equipe" ? null : garcomId,
                        r.servicoPendente,
                        forma,
                      ),
                    )
                  }
                  className="btn-base bg-success text-success-foreground"
                >
                  {rotulo}
                </button>
              ))}
            </div>
          </section>
        )}

        {r.emAberto === 0 && r.servicoPendente === 0 && (
          <p className="card-praia p-4 text-xl font-bold">Tudo pago por aqui 🌊</p>
        )}
      </div>
    </div>
  );
}
