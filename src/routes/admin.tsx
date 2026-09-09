import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/AppHeader";
import { AbaCardapio, AbaEquipe } from "@/components/GestaoBarraca";
import { useDados } from "@/lib/store";
import { normalizarSlug } from "@/lib/types";
import {
  atualizarBarraca,
  criarBarraca,
  entrarAdmin,
  listarBarracas,
  sairAdmin,
  salvarImportacao,
  type BarracaAdmin,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Administração — BóraMar" },
      {
        name: "description",
        content: "Cadastre e cuide das barracas atendidas pelo BóraMar.",
      },
      { property: "og:title", content: "Administração — BóraMar" },
      {
        property: "og:description",
        content: "Cadastro de barracas, cardápios, equipe e QR Codes.",
      },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  const [liberado, setLiberado] = useState<boolean | null>(null);
  const [barracas, setBarracas] = useState<BarracaAdmin[]>([]);
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState(false);
  const [selecionada, setSelecionada] = useState<BarracaAdmin | null>(null);

  async function recarregar() {
    const r = await listarBarracas();
    setLiberado(r.liberado);
    setBarracas(r.barracas);
  }

  useEffect(() => {
    void recarregar();
  }, []);

  if (liberado === null) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Administração" />
        <p className="mx-auto max-w-3xl px-4 pt-8 text-xl font-bold">
          Carregando…
        </p>
      </div>
    );
  }

  if (!liberado) {
    return (
      <div className="min-h-screen">
        <AppHeader subtitulo="Administração" />
        <main className="mx-auto max-w-3xl px-4 pt-8">
          <h1 className="text-3xl font-extrabold">Área de administração</h1>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await entrarAdmin({ data: { senha } });
              if (r.ok) {
                setSenha("");
                await recarregar();
              } else setErro(true);
            }}
            className="mt-5 grid gap-3"
          >
            <input
              autoFocus
              type="password"
              value={senha}
              onChange={(e) => {
                setSenha(e.target.value);
                setErro(false);
              }}
              aria-label="Senha da administração"
              placeholder="Senha"
              className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 text-xl font-bold"
            />
            {erro && (
              <p className="text-lg font-bold text-destructive">
                Senha incorreta.
              </p>
            )}
            <button className="btn-base bg-primary text-primary-foreground">
              Entrar
            </button>
            <Link to="/" className="btn-base border-2 border-border bg-card">
              Voltar ao início
            </Link>
          </form>
        </main>
      </div>
    );
  }

  if (selecionada) {
    return (
      <GerenciarBarraca
        barraca={selecionada}
        aoVoltar={async () => {
          setSelecionada(null);
          await recarregar();
        }}
      />
    );
  }

  return (
    <div className="min-h-screen pb-20">
      <AppHeader subtitulo="Administração" />
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-3xl font-extrabold">Barracas</h1>
          <button
            onClick={async () => {
              await sairAdmin();
              setLiberado(false);
            }}
            className="btn-base border-2 border-border bg-card"
          >
            Sair
          </button>
        </div>

        <div className="mt-4 grid gap-3">
          {barracas.map((b) => (
            <article key={b.id} className="card-praia p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-2xl font-extrabold">{b.nome}</h2>
                <span className="text-base text-muted-foreground">
                  /{b.slug} · {b.mesas} mesas · {b.cidade}
                </span>
              </div>
              {!b.ativa && (
                <p className="mt-1 text-lg font-bold text-destructive">
                  Desativada
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setSelecionada(b)}
                  className="btn-base bg-primary text-primary-foreground"
                >
                  Gerenciar
                </button>
                <Link
                  to="/$slug/qrcodes"
                  params={{ slug: b.slug }}
                  className="btn-base border-2 border-border bg-card"
                >
                  QR Codes
                </Link>
                <Link
                  to="/$slug/painel"
                  params={{ slug: b.slug }}
                  className="btn-base border-2 border-border bg-card"
                >
                  Abrir painel
                </Link>
                <button
                  onClick={async () => {
                    await atualizarBarraca({
                      data: { id: b.id, patch: { ativa: !b.ativa } },
                    });
                    await recarregar();
                  }}
                  className="btn-base border-2 border-border bg-card"
                >
                  {b.ativa ? "Desativar" : "Reativar"}
                </button>
              </div>
              <BlocoLinks barraca={b} />
            </article>
          ))}
        </div>

        <NovaBarraca aoCriar={recarregar} />

        <div className="mt-8">
          <Link to="/" className="btn-base border-2 border-border bg-card">
            Voltar ao início
          </Link>
        </div>
      </main>
    </div>
  );
}

function NovaBarraca({ aoCriar }: { aoCriar: () => Promise<void> }) {
  const [nome, setNome] = useState("");
  const [slug, setSlug] = useState("");
  const [chavePix, setChavePix] = useState("");
  const [cidade, setCidade] = useState("Recife");
  const [whats, setWhats] = useState("");
  const [pin, setPin] = useState("");
  const [mesas, setMesas] = useState("10");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const campo =
    "w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold";

  return (
    <section className="card-praia mt-8 grid gap-3 p-4">
      <h2 className="text-2xl font-extrabold">Criar barraca</h2>
      <input
        value={nome}
        onChange={(e) => {
          setNome(e.target.value);
          if (!slug) setSlug("");
        }}
        onBlur={() => {
          if (!slug) setSlug(normalizarSlug(nome));
        }}
        placeholder="Nome da barraca"
        aria-label="Nome da barraca"
        className={campo}
      />
      <input
        value={slug}
        onChange={(e) => setSlug(normalizarSlug(e.target.value))}
        placeholder="Endereço curto (ex.: barraca-do-ze)"
        aria-label="Endereço curto"
        className={campo}
      />
      <input
        value={chavePix}
        onChange={(e) => setChavePix(e.target.value)}
        placeholder="Chave Pix"
        aria-label="Chave Pix"
        className={campo}
      />
      <input
        value={cidade}
        onChange={(e) => setCidade(e.target.value)}
        placeholder="Cidade"
        aria-label="Cidade"
        className={campo}
      />
      <input
        value={whats}
        onChange={(e) => setWhats(e.target.value)}
        placeholder="WhatsApp de suporte"
        aria-label="WhatsApp de suporte"
        className={campo}
      />
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
        inputMode="numeric"
        placeholder="PIN do painel (4 a 6 dígitos)"
        aria-label="PIN do painel"
        className={campo}
      />
      <input
        value={mesas}
        onChange={(e) => setMesas(e.target.value.replace(/\D/g, ""))}
        inputMode="numeric"
        placeholder="Quantidade de mesas"
        aria-label="Quantidade de mesas"
        className={campo}
      />
      {erro && <p className="text-lg font-bold text-destructive">{erro}</p>}
      <button
        disabled={salvando}
        onClick={async () => {
          setErro("");
          if (!nome.trim() || !slug || pin.length < 4) {
            setErro("Preencha nome, endereço curto e um PIN de 4 a 6 dígitos.");
            return;
          }
          setSalvando(true);
          const r = await criarBarraca({
            data: {
              nome: nome.trim(),
              slug,
              chave_pix: chavePix.trim(),
              cidade: cidade.trim() || "Recife",
              whatsapp_suporte: whats.trim(),
              pin,
              mesas: Number(mesas) || 10,
            },
          });
          setSalvando(false);
          if (!r.ok) {
            setErro(r.erro);
            return;
          }
          setNome("");
          setSlug("");
          setChavePix("");
          setWhats("");
          setPin("");
          setMesas("10");
          await aoCriar();
        }}
        className="btn-base bg-accent text-accent-foreground"
      >
        {salvando ? "Criando…" : "Criar barraca com o cardápio de exemplo"}
      </button>
    </section>
  );
}

type AbaAdmin = "dados" | "cardapio" | "equipe" | "importar";

function GerenciarBarraca({
  barraca,
  aoVoltar,
}: {
  barraca: BarracaAdmin;
  aoVoltar: () => Promise<void>;
}) {
  const dados = useDados(barraca.slug);
  const [aba, setAba] = useState<AbaAdmin>("dados");

  const abas: Array<[AbaAdmin, string]> = [
    ["dados", "Dados"],
    ["cardapio", "Cardápio"],
    ["equipe", "Equipe"],
    ["importar", "Importar cardápio"],
  ];

  return (
    <div className="min-h-screen pb-20">
      <AppHeader subtitulo="Administração" />
      <main className="mx-auto max-w-3xl px-4 pt-6">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="flex-1 text-3xl font-extrabold">{barraca.nome}</h1>
          <button
            onClick={() => void aoVoltar()}
            className="btn-base border-2 border-border bg-card"
          >
            Voltar às barracas
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {abas.map(([id, rotulo]) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`btn-base border-2 ${
                aba === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              }`}
            >
              {rotulo}
            </button>
          ))}
        </div>

        <div className="mt-5">
          {aba === "dados" && <EditarDados barraca={barraca} />}
          {aba === "cardapio" &&
            (dados.pronto ? (
              <AbaCardapio produtos={dados.produtos} />
            ) : (
              <p className="text-lg font-bold">Carregando o cardápio…</p>
            ))}
          {aba === "equipe" &&
            (dados.pronto ? (
              <AbaEquipe />
            ) : (
              <p className="text-lg font-bold">Carregando a equipe…</p>
            ))}
          {aba === "importar" && <ImportarCardapio barracaId={barraca.id} />}
        </div>
      </main>
    </div>
  );
}

function EditarDados({ barraca }: { barraca: BarracaAdmin }) {
  const [form, setForm] = useState(barraca);
  const [salvo, setSalvo] = useState(false);
  const [erro, setErro] = useState("");
  const campo =
    "w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold";

  const linhas: Array<[keyof BarracaAdmin, string]> = [
    ["nome", "Nome"],
    ["slug", "Endereço curto"],
    ["chave_pix", "Chave Pix"],
    ["cidade", "Cidade"],
    ["whatsapp_suporte", "WhatsApp de suporte"],
    ["pin", "PIN do painel"],
  ];

  return (
    <section className="card-praia grid gap-3 p-4">
      {linhas.map(([chave, rotulo]) => (
        <label key={chave} className="block text-lg font-bold">
          {rotulo}
          <input
            value={String(form[chave] ?? "")}
            onChange={(e) => {
              const valor =
                chave === "slug" ? normalizarSlug(e.target.value) : e.target.value;
              setForm({ ...form, [chave]: valor });
              setSalvo(false);
            }}
            className={`mt-1 ${campo}`}
          />
        </label>
      ))}
      {erro && <p className="text-lg font-bold text-destructive">{erro}</p>}
      <button
        onClick={async () => {
          setErro("");
          const r = await atualizarBarraca({
            data: {
              id: barraca.id,
              patch: {
                nome: form.nome,
                slug: form.slug,
                chave_pix: form.chave_pix,
                cidade: form.cidade,
                whatsapp_suporte: form.whatsapp_suporte,
                pin: form.pin,
              },
            },
          });
          if (r.ok) setSalvo(true);
          else setErro(r.erro);
        }}
        className="btn-base bg-primary text-primary-foreground"
      >
        Salvar
      </button>
      {salvo && <p className="text-lg font-bold">Dados salvos.</p>}
    </section>
  );
}

interface LinhaImportada {
  categoria: string;
  nome: string;
  preco: string;
  revisar: boolean;
}

function interpretar(texto: string): LinhaImportada[] {
  return texto
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((linha) => {
      const partes = (linha.includes("\t") ? linha.split("\t") : linha.split(";")).map(
        (p) => p.trim(),
      );
      const [categoria = "", nome = "", precoBruto = ""] = partes;
      const limpo = precoBruto.replace(/[^0-9,.-]/g, "").replace(",", ".");
      const valor = Number(limpo);
      const ok = limpo !== "" && Number.isFinite(valor) && valor >= 0;
      return {
        categoria: categoria || "Sem categoria",
        nome,
        preco: ok ? valor.toFixed(2) : precoBruto,
        revisar: !ok || !nome,
      };
    });
}

function ImportarCardapio({ barracaId }: { barracaId: string }) {
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<LinhaImportada[] | null>(null);
  const [mensagem, setMensagem] = useState("");

  const campo =
    "w-full rounded-xl border-2 border-border bg-background px-3 py-2 text-lg font-bold";

  function validar(l: LinhaImportada): LinhaImportada {
    const valor = Number(String(l.preco).replace(",", "."));
    return {
      ...l,
      revisar: !l.nome.trim() || !Number.isFinite(valor) || String(l.preco).trim() === "",
    };
  }

  if (!linhas) {
    return (
      <section className="card-praia grid gap-3 p-4">
        <h2 className="text-2xl font-extrabold">Importar cardápio</h2>
        <p className="text-base text-muted-foreground">
          Uma linha por item, no formato: categoria; nome do item; preço.
          Também aceita separação por tabulação (colado de uma planilha).
        </p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={10}
          aria-label="Lista do cardápio"
          placeholder={"Bebidas; Água de coco; 8,00\nPorções; Isca de peixe; 65,00"}
          className={campo}
        />
        <button
          onClick={() => {
            const l = interpretar(texto);
            if (l.length) setLinhas(l);
          }}
          className="btn-base bg-accent text-accent-foreground"
        >
          Conferir antes de salvar
        </button>
      </section>
    );
  }

  const paraRevisar = linhas.filter((l) => l.revisar).length;

  return (
    <section className="grid gap-3">
      <h2 className="text-2xl font-extrabold">Conferir cardápio</h2>
      <p className="text-base text-muted-foreground">
        {linhas.length} item(ns) interpretado(s)
        {paraRevisar ? ` · ${paraRevisar} para revisar` : ""}. Nada é salvo sem
        a sua confirmação.
      </p>

      <div className="grid gap-3">
        {linhas.map((l, i) => (
          <div
            key={i}
            className={`card-praia grid gap-2 p-3 ${
              l.revisar ? "border-destructive" : ""
            }`}
          >
            <div className="flex flex-wrap gap-2">
              <input
                value={l.categoria}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual!.map((x, j) =>
                      j === i ? validar({ ...x, categoria: e.target.value }) : x,
                    ),
                  )
                }
                aria-label={`Categoria da linha ${i + 1}`}
                className={`${campo} w-40 flex-none`}
              />
              <input
                value={l.nome}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual!.map((x, j) =>
                      j === i ? validar({ ...x, nome: e.target.value }) : x,
                    ),
                  )
                }
                aria-label={`Nome da linha ${i + 1}`}
                className={`${campo} min-w-0 flex-1`}
              />
              <input
                value={l.preco}
                onChange={(e) =>
                  setLinhas((atual) =>
                    atual!.map((x, j) =>
                      j === i ? validar({ ...x, preco: e.target.value }) : x,
                    ),
                  )
                }
                aria-label={`Preço da linha ${i + 1}`}
                className={`${campo} w-28 flex-none`}
              />
              <button
                onClick={() =>
                  setLinhas((atual) => atual!.filter((_, j) => j !== i))
                }
                className="btn-base border-2 border-border bg-card text-destructive"
              >
                Tirar
              </button>
            </div>
            {l.revisar && (
              <p className="text-base font-bold text-destructive">
                Revisar: nome ou preço não reconhecido.
              </p>
            )}
          </div>
        ))}
      </div>

      {mensagem && <p className="text-lg font-bold">{mensagem}</p>}

      <div className="flex flex-wrap gap-2">
        <button
          disabled={paraRevisar > 0 || linhas.length === 0}
          onClick={async () => {
            const r = await salvarImportacao({
              data: {
                barracaId,
                itens: linhas.map((l) => ({
                  nome: l.nome.trim(),
                  categoria: l.categoria.trim(),
                  preco: Number(String(l.preco).replace(",", ".")),
                })),
              },
            });
            if (r.ok) {
              setMensagem(`${r.total} item(ns) adicionados ao cardápio.`);
              setLinhas(null);
              setTexto("");
            } else setMensagem(r.erro);
          }}
          className="btn-base bg-success text-success-foreground"
        >
          Salvar no cardápio
        </button>
        <button
          onClick={() => setLinhas(null)}
          className="btn-base border-2 border-border bg-card"
        >
          Voltar e editar o texto
        </button>
      </div>
    </section>
  );
}
