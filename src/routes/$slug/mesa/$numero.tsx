import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { AppHeader } from "@/components/AppHeader";
import { SuporteWhatsApp } from "@/components/SuporteWhatsApp";
import {
  assinarFila,
  avisarQuePagouConta,
  avisarQuePagouPedido,
  avisarQuePagouServico,
  avisoDoPedido,
  criarPedido,
  formatarReal,
  pedidosPendentes,
  pixServicoDoGarcom,
  useCardapio,
  useSituacaoMesa,
  useSituacaoPedido,
} from "@/lib/store";
import { gerarCodigoPix } from "@/lib/pix";
import { categoriasDe, type Produto } from "@/lib/types";
import {
  BuscaCardapio,
  CampoObs,
  combinaBusca,
  JanelaEscolhas,
  NomeComObs,
  SelosVeg,
  useCarrinho,
} from "@/components/Escolhas";
import { normalizarBusca, temEscolhaPossivel } from "@/lib/opcoes";

const ABA_VEG = "🌱 Vegetariano / Vegano";

export const Route = createFileRoute("/$slug/mesa/$numero")({
  head: () => ({
    meta: [
      { title: "Cardápio da Mesa — BóraMar" },
      {
        name: "description",
        content: "Peça bebidas e porções direto da sua mesa e pague no Pix, sem taxa nenhuma.",
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

type Etapa =
  | "cardapio"
  | "checkout"
  | "pix"
  | "cartao"
  | "fim"
  | "na_conta"
  | "conta"
  | "conta_ok"
  | "servico";

function ClientePage() {
  const { slug, numero } = Route.useParams();
  const dados = useCardapio(slug);
  const { barraca, produtos, garcons } = dados;
  // sem "plano B": mesa que não existe não recebe pedido de outra mesa
  const mesa = dados.mesas.find((m) => m.numero === Number(numero));
  const servicoLigado = barraca.servico_percentual > 0;

  const temVeg = produtos.some((p) => p.vegetariano || p.vegano);
  const categorias = useMemo(
    () => [...categoriasDe(produtos), ...(temVeg ? [ABA_VEG] : [])],
    [produtos, temVeg],
  );
  const [etapa, setEtapa] = useState<Etapa>("cardapio");
  const [abaEscolhida, setAba] = useState<string>("");
  const aba = abaEscolhida || categorias[0] || "";
  const carrinho = useCarrinho(produtos);
  const [escolhendo, setEscolhendo] = useState<Produto | null>(null);
  const [busca, setBusca] = useState("");
  const termo = normalizarBusca(busca);
  const [caixinha, setCaixinha] = useState(0);
  const [outroValor, setOutroValor] = useState("");
  const [garcomId, setGarcomId] = useState<string>("");
  const [pedidoId, setPedidoId] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState(false);
  const [erroGarcom, setErroGarcom] = useState(false);
  const [aviso, setAviso] = useState("");
  // total gravado pelo servidor (preços conferidos no banco)
  const [totalConfirmado, setTotalConfirmado] = useState<number | null>(null);
  const [versaoMesa, setVersaoMesa] = useState(0);

  const situacao = useSituacaoPedido(
    pedidoId,
    etapa === "pix" || etapa === "cartao" || etapa === "fim" || etapa === "na_conta",
  );
  const mesaInfo = useSituacaoMesa(slug, mesa?.id, versaoMesa);
  const atualizarMesa = () => setVersaoMesa((v) => v + 1);
  const expirado =
    !!situacao && (situacao.status === "expirado" || situacao.status === "cancelado");

  // acompanha a fila de reenvio para tirar o aviso "Enviando…" quando entrar
  const [, forcar] = useState(0);
  useEffect(() => assinarFila(() => forcar((n) => n + 1)), []);
  const aindaNaFila = pendente && pedidosPendentes() > 0;

  const linhas = carrinho.linhas;
  const consumo = carrinho.total;
  const caixinhaUsada = servicoLigado ? 0 : caixinha;
  const totalGeral = totalConfirmado ?? consumo + caixinhaUsada;

  const comEscolhas = (p: Produto) => p.opcoes.some((g) => g.itens.length > 0);
  const podePedir = (p: Produto) => p.disponivel && temEscolhaPossivel(p.opcoes);
  /** item com escolhas abre a janela; sem escolhas entra direto */
  const pedirMais = (p: Produto) => (comEscolhas(p) ? setEscolhendo(p) : carrinho.adicionar(p));

  function recomecar() {
    setEtapa("cardapio");
    setCaixinha(0);
    setOutroValor("");
    setPedidoId("");
    setPendente(false);
    setTotalConfirmado(null);
    setAviso("");
    atualizarMesa();
  }

  async function enviar(forma: "pix" | "cartao" | "final") {
    if (!mesa) return;
    if (caixinhaUsada > 0 && !garcomId) {
      setErroGarcom(true);
      return;
    }
    setErroGarcom(false);
    setAviso("");
    setEnviando(true);
    const r = await criarPedido({
      slug,
      mesa_id: mesa.id,
      garcom_id: garcomId || null,
      origem: "cliente",
      gorjeta: caixinhaUsada,
      forma_pagamento: forma,
      linhas: linhas.map((l) => ({
        produto: l.produto,
        quantidade: l.quantidade,
        escolhas: l.escolhas,
        obs: l.obs,
      })),
    });
    setEnviando(false);
    const problema = avisoDoPedido(r);
    if (problema) {
      setAviso(problema);
      if (!r.pendente && "resultado" in r && !r.resultado.ok) {
        if (r.resultado.motivo === "garcom") setErroGarcom(true);
        // algo acabou: busca o cardápio atualizado (itens que acabaram saem do carrinho)
        if (r.resultado.motivo === "indisponivel" || r.resultado.motivo === "escolha")
          dados.recarregar();
      }
      return;
    }
    setPedidoId(r.id);
    setPendente(r.pendente);
    setTotalConfirmado(
      !r.pendente && "resultado" in r && r.resultado.ok ? r.resultado.total : null,
    );
    if (forma === "final") {
      carrinho.limpar();
      atualizarMesa();
      setEtapa("na_conta");
    } else setEtapa(forma === "pix" ? "pix" : "cartao");
  }

  if (!dados.pronto) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Carregando" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-semibold">Carregando o cardápio…</p>
      </div>
    );
  }

  if (dados.erro) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="mx-auto max-w-3xl px-4 pt-8">
          <p className="text-xl font-semibold">O cardápio não abriu. Confere a internet?</p>
          <button
            onClick={() => dados.recarregar()}
            className="btn-base mt-4 bg-primary text-primary-foreground"
          >
            Tentar de novo
          </button>
        </main>
      </div>
    );
  }

  if (!dados.existe || !barraca.ativa) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-semibold">
          Esta barraca não está recebendo pedidos agora.
        </p>
      </div>
    );
  }

  if (!mesa) {
    return (
      <div className="min-h-screen">
        <AppHeader titulo={barraca.nome} />
        <main className="mx-auto max-w-3xl px-4 pt-8">
          <p className="text-2xl font-bold">Não achamos a mesa {numero} aqui.</p>
          <p className="mt-2 text-lg text-muted-foreground">
            Chama o garçom que ele anota seu pedido.
          </p>
        </main>
        <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
      </div>
    );
  }

  const emAberto = mesaInfo?.emAberto ?? 0;
  const servicoPendente = mesaInfo?.servico.pendente ?? 0;

  return (
    <div className="min-h-screen pb-32">
      <AppHeader titulo={barraca.nome} subtitulo={`Mesa ${mesa.numero}`} />

      {etapa === "cardapio" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-bold">Cardápio</h1>
          <p className="mt-1 text-base text-muted-foreground">{barraca.nome}</p>

          <BuscaCardapio valor={busca} aoMudar={setBusca} />

          {!termo && (
            <div className="sticky top-[60px] z-30 -mx-4 mt-2 flex gap-2 overflow-x-auto bg-background px-4 py-3">
              {categorias.map((c) => (
                <button
                  key={c}
                  onClick={() => setAba(c)}
                  className={`btn-base shrink-0 border ${
                    aba === c
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card text-foreground"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          )}

          <ul className="mt-2 grid gap-3">
            {termo && !produtos.some((p) => combinaBusca(p, termo)) && (
              <li className="text-lg font-semibold text-muted-foreground">
                Nada com “{busca.trim()}” no cardápio. Tenta outra palavra?
              </li>
            )}
            {!termo && aba === ABA_VEG && (
              <li className="text-base text-muted-foreground">
                Itens que a barraca marcou como vegetarianos ou veganos. Na dúvida, pergunte ao
                garçom.
              </li>
            )}
            {produtos
              .filter((p) =>
                termo
                  ? combinaBusca(p, termo)
                  : aba === ABA_VEG
                    ? p.vegetariano || p.vegano
                    : p.categoria === aba,
              )
              .map((p) => (
                <li
                  key={p.id}
                  className={`card-praia flex items-center gap-3 p-4 ${
                    podePedir(p) ? "" : "opacity-45"
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-xl font-bold">
                      {p.nome}
                      <SelosVeg produto={p} />
                    </p>
                    {p.descricao && (
                      <p className="text-base text-muted-foreground">{p.descricao}</p>
                    )}
                    {comEscolhas(p) && (
                      <p className="text-sm font-semibold text-primary">
                        Escolha{" "}
                        {p.opcoes
                          .filter((g) => g.itens.length)
                          .map((g) => g.nome.toLowerCase())
                          .join(" e ")}
                      </p>
                    )}
                    <p className="text-lg font-semibold text-muted-foreground">
                      {comEscolhas(p) ? "a partir de " : ""}
                      {formatarReal(p.preco)}
                      {!podePedir(p) && (
                        <span className="ml-2 rounded-full bg-destructive px-2 py-0.5 text-sm font-bold text-destructive-foreground">
                          acabou
                        </span>
                      )}
                    </p>
                  </div>
                  {podePedir(p) ? (
                    carrinho.quantidadeDo(p.id) ? (
                      <div className="flex items-center gap-2">
                        <button
                          aria-label={`Remover um ${p.nome}`}
                          onClick={() => carrinho.tirarDoProduto(p.id)}
                          className="btn-base h-12 w-12 border border-primary bg-card text-2xl"
                        >
                          −
                        </button>
                        <span className="w-6 text-center text-xl font-bold">
                          {carrinho.quantidadeDo(p.id)}
                        </span>
                        <button
                          aria-label={`Adicionar um ${p.nome}`}
                          onClick={() => pedirMais(p)}
                          className="btn-base h-12 w-12 bg-accent text-2xl text-accent-foreground"
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => pedirMais(p)}
                        className="btn-base bg-accent text-accent-foreground"
                      >
                        {comEscolhas(p) ? "Escolher" : "Adicionar"}
                      </button>
                    )
                  ) : null}
                </li>
              ))}
          </ul>

          {linhas.length > 0 ? (
            <BarraFixa>
              <div className="flex-1">
                <p className="text-sm font-semibold text-muted-foreground">
                  {carrinho.quantidadeTotal} itens
                </p>
                <p className="text-2xl font-bold">{formatarReal(consumo)}</p>
              </div>
              <button
                onClick={() => setEtapa("checkout")}
                className="btn-base bg-primary px-6 text-primary-foreground"
              >
                Ver meu pedido
              </button>
            </BarraFixa>
          ) : emAberto > 0 ? (
            <BarraFixa>
              <div className="flex-1">
                <p className="text-sm font-semibold text-muted-foreground">Na conta da mesa</p>
                <p className="text-2xl font-bold">{formatarReal(emAberto)}</p>
              </div>
              <button
                onClick={() => setEtapa("conta")}
                className="btn-base bg-primary px-6 text-primary-foreground"
              >
                Fechar a conta
              </button>
            </BarraFixa>
          ) : servicoPendente > 0 ? (
            <BarraFixa>
              <div className="flex-1">
                <p className="text-sm font-semibold text-muted-foreground">Serviço do garçom</p>
                <p className="text-2xl font-bold">{formatarReal(servicoPendente)}</p>
              </div>
              <button
                onClick={() => setEtapa("servico")}
                className="btn-base bg-accent px-6 text-accent-foreground"
              >
                Deixar o serviço
              </button>
            </BarraFixa>
          ) : null}
        </main>
      )}

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

      {etapa === "checkout" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-bold">Seu pedido</h1>
          <p className="mt-1 text-lg font-semibold">Mesa {mesa.numero}</p>

          <ul className="card-praia mt-4 divide-y divide-border p-4">
            {linhas.map((l) => (
              <li key={l.chave} className="flex items-center justify-between gap-2 py-2 text-lg">
                <span className="min-w-0 flex-1 font-semibold">
                  {l.quantidade}× {l.nome}
                  <CampoObs obs={l.obs} aoMudar={(o) => carrinho.definirObs(l.chave, o)} />
                </span>
                <span className="font-bold">{formatarReal(l.preco * l.quantidade)}</span>
                <button
                  aria-label={`Tirar um ${l.nome}`}
                  onClick={() => {
                    carrinho.tirar(l.chave);
                    if (carrinho.quantidadeTotal <= 1) setEtapa("cardapio");
                  }}
                  className="btn-base h-10 w-10 border border-border bg-card px-0 text-xl"
                >
                  −
                </button>
              </li>
            ))}
          </ul>

          {servicoLigado ? (
            <p className="mt-4 text-base text-muted-foreground">
              O serviço do garçom fica pro final, sem pressa.
            </p>
          ) : (
            <>
              <h2 className="mt-6 text-2xl font-bold">Quer deixar uma caixinha?</h2>
              <p className="text-base text-muted-foreground">É opcional 😊</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {[0, 2, 5, 10].map((v) => (
                  <button
                    key={v}
                    onClick={() => {
                      setCaixinha(v);
                      setOutroValor("");
                      if (v === 0) setErroGarcom(false);
                    }}
                    className={`btn-base border ${
                      caixinha === v && outroValor === ""
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card"
                    }`}
                  >
                    {v === 0 ? "Agora não" : formatarReal(v)}
                  </button>
                ))}
                <input
                  inputMode="decimal"
                  placeholder="Outro valor"
                  value={outroValor}
                  onChange={(e) => {
                    setOutroValor(e.target.value);
                    const n = Number(e.target.value.replace(",", "."));
                    setCaixinha(Number.isFinite(n) && n > 0 ? n : 0);
                  }}
                  className="btn-base w-36 border border-border bg-card text-left"
                />
              </div>
              {caixinha > 0 && (
                <EscolherGarcom
                  garcons={garcons}
                  escolhido={garcomId}
                  aoEscolher={(id) => {
                    setGarcomId(id);
                    setErroGarcom(false);
                  }}
                  erro={erroGarcom}
                />
              )}
            </>
          )}

          <div className="card-praia mt-6 p-4">
            <div className="flex justify-between text-2xl font-bold">
              <span>Total</span>
              <span>{formatarReal(consumo + caixinhaUsada)}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">Sem taxa de aplicativo.</p>
          </div>

          {aviso && (
            <p className="card-praia mt-4 p-3 text-lg font-semibold text-destructive">{aviso}</p>
          )}

          <h2 className="mt-6 text-xl font-bold">Como prefere pagar?</h2>
          <div className="mt-3 grid gap-2">
            <button
              onClick={() => void enviar("pix")}
              disabled={enviando}
              className="btn-base bg-primary text-primary-foreground"
            >
              {enviando ? "Enviando…" : "Pagar agora no Pix"}
            </button>
            <button
              onClick={() => void enviar("cartao")}
              disabled={enviando}
              className="btn-base bg-accent text-accent-foreground"
            >
              {enviando ? "Enviando…" : "Pagar no cartão com o garçom"}
            </button>
            {barraca.permite_pagar_final && (
              <button
                onClick={() => void enviar("final")}
                disabled={enviando}
                className="btn-base border border-primary bg-card text-primary"
              >
                {enviando ? "Enviando…" : "Pôr na conta e pagar no final"}
              </button>
            )}
            <button
              onClick={() => setEtapa("cardapio")}
              className="btn-base border border-border bg-card"
            >
              Voltar
            </button>
          </div>
        </main>
      )}

      {etapa === "pix" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-bold">Bora pagar no Pix</h1>
          <p className="mt-1 text-lg">
            Mesa {mesa.numero} · <strong>{formatarReal(totalGeral)}</strong>
          </p>
          {aindaNaFila && <Calma />}
          {expirado && <Expirado />}
          <CaixaPix
            codigo={gerarCodigoPix({
              chave: barraca.chave_pix,
              nome: barraca.nome,
              cidade: barraca.cidade,
              valor: totalGeral,
              txid: pedidoId,
            })}
            valor={totalGeral}
            legenda={`Pix para ${barraca.nome}`}
          />
          <button
            onClick={() => {
              if (pedidoId && !pendente) void avisarQuePagouPedido(pedidoId);
              setEtapa("fim");
              carrinho.limpar();
              atualizarMesa();
            }}
            className="btn-base mt-5 w-full bg-success py-5 text-xl text-success-foreground"
          >
            Pronto, paguei
          </button>
          <button
            onClick={() => {
              setTotalConfirmado(null);
              setEtapa("checkout");
            }}
            className="btn-base mt-3 w-full border border-border bg-card"
          >
            Voltar
          </button>
        </main>
      )}

      {etapa === "cartao" && (
        <Mensagem
          emoji={expirado ? "⏳" : "💳"}
          titulo={expirado ? "Esse pedido expirou" : "Já já o garçom chega com a maquininha"}
          texto={
            expirado
              ? "Sem problema, é só montar de novo quando quiser."
              : `Total: ${formatarReal(totalGeral)}. Pode relaxar aí na Mesa ${mesa.numero}.`
          }
          rodape={aindaNaFila ? <Calma /> : null}
          botao="Pedir mais alguma coisa"
          aoTocar={() => {
            carrinho.limpar();
            recomecar();
          }}
        />
      )}

      {etapa === "fim" && (
        <Mensagem
          emoji={expirado ? "⏳" : "🍤"}
          titulo={expirado ? "Esse pedido expirou" : "Pedido enviado!"}
          texto={
            expirado
              ? "O pagamento não chegou a tempo. É só montar de novo quando quiser."
              : `Assim que a barraca vir o Pix, já começa o preparo. Relaxa aí na Mesa ${mesa.numero}.`
          }
          rodape={aindaNaFila ? <Calma /> : null}
          botao="Pedir mais alguma coisa"
          aoTocar={recomecar}
        />
      )}

      {etapa === "na_conta" && (
        <Mensagem
          emoji={expirado ? "🙋" : situacao?.status === "novo" || !situacao ? "📝" : "✅"}
          titulo={
            expirado
              ? "Não deu pra abrir a conta"
              : situacao?.status === "novo" || !situacao
                ? "Anotado!"
                : "Tá na conta!"
          }
          texto={
            expirado
              ? "Chama o garçom que ele resolve rapidinho."
              : situacao?.status === "novo" || !situacao
                ? "Só um instante: a barraca confirma sua mesa e já manda pra cozinha."
                : "Já foi pra cozinha. Quando for embora, é só tocar em Fechar a conta."
          }
          rodape={aindaNaFila ? <Calma /> : null}
          botao="Voltar ao cardápio"
          aoTocar={recomecar}
        />
      )}

      {etapa === "conta" && (
        <main className="mx-auto max-w-3xl px-4 pt-5">
          <h1 className="text-3xl font-bold">Sua conta</h1>
          <p className="mt-1 text-lg font-semibold">Mesa {mesa.numero}</p>
          {mesaInfo && mesaInfo.emAberto > 0 ? (
            <>
              <ul className="card-praia mt-4 grid gap-1 p-4 text-lg">
                {mesaInfo.itensEmAberto.map((i) => (
                  <li key={i.nome} className="font-semibold">
                    {i.quantidade}× <NomeComObs nome={i.nome} />
                  </li>
                ))}
                <li className="mt-2 flex justify-between border-t-2 border-border pt-2 text-2xl font-bold">
                  <span>Total</span>
                  <span>{formatarReal(mesaInfo.emAberto)}</span>
                </li>
              </ul>
              {mesaInfo.fechamentoSolicitado ? (
                <p className="card-praia mt-4 p-4 text-lg font-semibold">
                  A barraca já está conferindo seu Pix 👍
                </p>
              ) : (
                <>
                  <CaixaPix
                    codigo={gerarCodigoPix({
                      chave: barraca.chave_pix,
                      nome: barraca.nome,
                      cidade: barraca.cidade,
                      valor: mesaInfo.emAberto,
                    })}
                    valor={mesaInfo.emAberto}
                    legenda={`Pix para ${barraca.nome}`}
                  />
                  <button
                    onClick={async () => {
                      try {
                        await avisarQuePagouConta(slug, mesa.id);
                      } catch {
                        // sem sinal: a equipe confere pelo painel
                      }
                      atualizarMesa();
                      setEtapa(
                        servicoLigado && mesaInfo.servico.pendente > 0 ? "servico" : "conta_ok",
                      );
                    }}
                    className="btn-base mt-5 w-full bg-success py-5 text-xl text-success-foreground"
                  >
                    Pronto, paguei
                  </button>
                  <p className="mt-3 text-center text-base text-muted-foreground">
                    Prefere cartão ou dinheiro? É só chamar o garçom.
                  </p>
                </>
              )}
            </>
          ) : (
            <p className="card-praia mt-4 p-4 text-lg font-semibold">
              Nada em aberto por aqui. Tudo certo! 🌊
            </p>
          )}
          <button
            onClick={() => setEtapa("cardapio")}
            className="btn-base mt-3 w-full border border-border bg-card"
          >
            Voltar
          </button>
        </main>
      )}

      {etapa === "conta_ok" && (
        <Mensagem
          emoji="🌊"
          titulo="Valeu, até a próxima!"
          texto="A barraca vai conferir o Pix. Aproveita o resto do dia."
          botao="Voltar ao cardápio"
          aoTocar={recomecar}
        />
      )}

      {etapa === "servico" && mesaInfo && (
        <ServicoDoGarcom
          slug={slug}
          mesaId={mesa.id}
          garcons={garcons}
          percentual={mesaInfo.servico.percentual}
          sugerido={mesaInfo.servico.pendente}
          aoTerminar={recomecar}
        />
      )}

      <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
    </div>
  );
}

function BarraFixa({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-border bg-card p-4">
      <div className="mx-auto flex max-w-3xl items-center gap-3 pr-16">{children}</div>
    </div>
  );
}

function Calma() {
  return (
    <p className="card-praia mt-3 p-3 text-lg font-semibold">
      A internet deu uma oscilada, mas seu pedido está guardado e vai sozinho assim que o sinal
      voltar.
    </p>
  );
}

function Expirado() {
  return (
    <p className="card-praia mt-3 p-3 text-lg font-bold text-destructive">
      Esse pedido expirou. Sem problema, é só montar de novo.
    </p>
  );
}

function Mensagem({
  emoji,
  titulo,
  texto,
  rodape,
  botao,
  aoTocar,
}: {
  emoji: string;
  titulo: string;
  texto: string;
  rodape?: ReactNode;
  botao: string;
  aoTocar: () => void;
}) {
  return (
    <main className="mx-auto max-w-3xl px-4 pt-10 text-center">
      <p className="text-6xl" aria-hidden>
        {emoji}
      </p>
      <h1 className="mt-4 text-3xl font-bold">{titulo}</h1>
      <p className="mt-2 text-lg text-muted-foreground">{texto}</p>
      {rodape}
      <button onClick={aoTocar} className="btn-base mt-6 bg-primary text-primary-foreground">
        {botao}
      </button>
      <div className="mt-3">
        <Link to="/" className="btn-base border border-border bg-card">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}

function EscolherGarcom({
  garcons,
  escolhido,
  aoEscolher,
  erro,
}: {
  garcons: Array<{ id: string; nome: string }>;
  escolhido: string;
  aoEscolher: (id: string) => void;
  erro?: boolean;
}) {
  return (
    <>
      <h2 className="mt-6 text-2xl font-bold">Quem te atendeu?</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {garcons.map((g) => (
          <button
            key={g.id}
            onClick={() => aoEscolher(g.id === escolhido ? "" : g.id)}
            className={`btn-base border ${
              escolhido === g.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card"
            }`}
          >
            {g.nome}
          </button>
        ))}
      </div>
      {erro && (
        <p className="mt-2 text-lg font-semibold text-destructive">
          Toca no nome de quem te atendeu, assim o valor vai certinho pra pessoa.
        </p>
      )}
    </>
  );
}

/** QR Code + "copiar código" + "vai rachar?" (só cálculo visual). */
function CaixaPix({ codigo, valor, legenda }: { codigo: string; valor: number; legenda: string }) {
  const [qr, setQr] = useState("");
  const [copiado, setCopiado] = useState(false);
  const [rachando, setRachando] = useState(false);
  const [pessoas, setPessoas] = useState(2);
  useEffect(() => {
    if (!codigo) return;
    let ativo = true;
    void QRCode.toDataURL(codigo, { width: 320, margin: 1 }).then((url) => {
      if (ativo) setQr(url);
    });
    return () => {
      ativo = false;
    };
  }, [codigo]);
  const porPessoa = Math.ceil((valor * 100) / pessoas) / 100;
  return (
    <>
      <div className="card-praia mt-4 flex flex-col items-center gap-3 p-5">
        <p className="text-center text-base text-muted-foreground">
          Abre o app do banco e lê o QR, ou copia o código. O valor já vem certinho.
        </p>
        {qr ? (
          <img src={qr} alt="QR Code do Pix" className="h-64 w-64 rounded-xl" />
        ) : (
          <div className="h-64 w-64 animate-pulse rounded-xl bg-sand" />
        )}
        <p className="text-center text-base text-muted-foreground">{legenda}</p>
        <button
          onClick={() => {
            void navigator.clipboard.writeText(codigo);
            setCopiado(true);
            setTimeout(() => setCopiado(false), 2500);
          }}
          className="btn-base w-full bg-accent text-accent-foreground"
        >
          {copiado ? "Copiado! Agora é só colar no banco" : "Copiar código Pix"}
        </button>
      </div>
      <div className="mt-3">
        <button
          onClick={() => setRachando((v) => !v)}
          aria-expanded={rachando}
          className="text-base font-semibold text-muted-foreground underline"
        >
          Vai rachar?
        </button>
        {rachando && (
          <div className="card-praia mt-3 p-4">
            <p className="text-lg font-semibold">Dividir por quantos?</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map((n) => (
                <button
                  key={n}
                  onClick={() => setPessoas(n)}
                  className={`btn-base border ${
                    pessoas === n
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-card"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-3 text-2xl font-bold">{formatarReal(porPessoa)} cada</p>
            <p className="mt-1 text-base text-muted-foreground">
              É só uma conta de cabeça: o Pix continua um só, de {formatarReal(valor)}.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** Serviço do garçom na saída: valor sugerido, quem atendeu e Pix direto pra ele. */
function ServicoDoGarcom({
  slug,
  mesaId,
  garcons,
  percentual,
  sugerido,
  aoTerminar,
}: {
  slug: string;
  mesaId: string;
  garcons: Array<{ id: string; nome: string }>;
  percentual: number;
  sugerido: number;
  aoTerminar: () => void;
}) {
  const [valor, setValor] = useState(sugerido);
  const [outro, setOutro] = useState("");
  const [garcomId, setGarcomId] = useState(garcons.length === 1 ? garcons[0]!.id : "");
  const [pix, setPix] = useState<{ nome: string; codigo: string } | null | "sem_chave">(null);
  const [buscando, setBuscando] = useState(false);
  const [pronto, setPronto] = useState(false);

  if (pronto) {
    const nome = garcons.find((g) => g.id === garcomId)?.nome ?? "O garçom";
    return (
      <Mensagem
        emoji="🙌"
        titulo={`${nome} agradece!`}
        texto="Valeu pela preferência. Aproveita o resto do dia."
        botao="Voltar ao cardápio"
        aoTocar={aoTerminar}
      />
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-4 pt-5">
      <h1 className="text-3xl font-bold">Serviço do garçom</h1>
      <p className="mt-1 text-lg text-muted-foreground">
        É opcional, e faz diferença pra quem te atendeu 😊
      </p>

      {!pix && (
        <>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => {
                setValor(sugerido);
                setOutro("");
              }}
              className={`btn-base border ${
                valor === sugerido && outro === ""
                  ? "border-accent bg-accent text-accent-foreground"
                  : "border-border bg-card"
              }`}
            >
              {formatarReal(sugerido)} ({percentual}%)
            </button>
            <input
              inputMode="decimal"
              placeholder="Outro valor"
              value={outro}
              onChange={(e) => {
                setOutro(e.target.value);
                const n = Number(e.target.value.replace(",", "."));
                setValor(Number.isFinite(n) && n > 0 ? n : 0);
              }}
              className="btn-base w-36 border border-border bg-card text-left"
            />
          </div>

          <EscolherGarcom garcons={garcons} escolhido={garcomId} aoEscolher={setGarcomId} />

          <button
            disabled={!garcomId || !(valor > 0) || buscando}
            onClick={async () => {
              setBuscando(true);
              try {
                const r = await pixServicoDoGarcom(slug, garcomId, valor);
                setPix(r ?? "sem_chave");
              } catch {
                setPix("sem_chave");
              } finally {
                setBuscando(false);
              }
            }}
            className="btn-base mt-6 w-full bg-primary text-primary-foreground disabled:opacity-50"
          >
            {buscando ? "Um instante…" : "Deixar no Pix"}
          </button>
        </>
      )}

      {pix === "sem_chave" && (
        <p className="card-praia mt-4 p-4 text-lg font-semibold">
          Esse garçom ainda não tem Pix por aqui. Pode deixar direto com ele, no dinheiro ou no
          cartão.
        </p>
      )}

      {pix && pix !== "sem_chave" && (
        <>
          <CaixaPix codigo={pix.codigo} valor={valor} legenda={`Pix para ${pix.nome}`} />
          <button
            onClick={async () => {
              try {
                await avisarQuePagouServico(slug, mesaId, garcomId, valor);
              } catch {
                // sem sinal: segue mesmo assim
              }
              setPronto(true);
            }}
            className="btn-base mt-5 w-full bg-success py-5 text-xl text-success-foreground"
          >
            Pronto, paguei
          </button>
        </>
      )}

      <button onClick={aoTerminar} className="btn-base mt-3 w-full border border-border bg-card">
        Agora não
      </button>
    </main>
  );
}
