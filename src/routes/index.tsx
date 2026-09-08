import { createFileRoute, Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { SuporteWhatsApp } from "@/components/SuporteWhatsApp";
import { useDados } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BóraMar — pedidos na barraca de praia" },
      {
        name: "description",
        content:
          "Escolha entrar como cliente da mesa ou abrir o painel da barraca.",
      },
      { property: "og:title", content: "BóraMar — pedidos na barraca" },
      {
        property: "og:description",
        content: "Cardápio por QR Code, Pix e painel de pedidos ao vivo.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { barraca } = useDados();

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-8">
        <h1 className="text-4xl font-extrabold leading-tight">
          Pedido na areia, sem fila e sem confusão.
        </h1>
        <p className="mt-3 text-lg text-muted-foreground">
          {barraca.nome}
        </p>

        <div className="mt-8 grid gap-4">
          <Link
            to="/cliente"
            search={{ mesa: 14 }}
            className="btn-base card-praia flex-col items-start gap-1 bg-accent px-5 py-6 text-left text-accent-foreground"
          >
            <span className="text-2xl font-extrabold">Entrar como Cliente</span>
            <span className="text-base font-semibold opacity-80">
              Simula o QR Code da Mesa 14
            </span>
          </Link>

          <Link
            to="/painel"
            className="btn-base card-praia flex-col items-start gap-1 bg-primary px-5 py-6 text-left text-primary-foreground"
          >
            <span className="text-2xl font-extrabold">Painel da Barraca</span>
            <span className="text-base font-semibold opacity-80">
              Pedidos ao vivo, cardápio, mesas e resultados
            </span>
          </Link>
        </div>

        <p className="mt-8 rounded-2xl bg-sand p-4 text-base text-muted-foreground">
          Nenhuma taxa é cobrada do cliente: o total é só o consumo mais a
          caixinha do garçom.
        </p>
      </main>
      <SuporteWhatsApp numero={barraca.whatsapp_suporte} />
    </div>
  );
}
