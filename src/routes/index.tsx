import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useDados } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "BóraMar — pedidos na barraca de praia" },
      {
        name: "description",
        content:
          "Pedido na areia, sem fila e sem confusão. Fale com a gente no WhatsApp.",
      },
      { property: "og:title", content: "BóraMar — pedidos na barraca" },
      {
        property: "og:description",
        content: "Pedido na areia, sem fila e sem confusão.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const { barraca } = useDados("exemplo");
  const numero = (barraca.whatsapp_suporte || "").replace(/\D/g, "");

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-4 pb-24 pt-16 text-center">
        <p className="text-6xl" aria-hidden>
          🌊
        </p>
        <h1 className="mt-4 font-display text-5xl font-extrabold tracking-tight">
          Bóra<span className="text-accent">Mar</span>
        </h1>
        <p className="mt-4 text-2xl font-bold leading-snug">
          Pedido na areia, sem fila e sem confusão
        </p>

        {numero && (
          <a
            href={`https://wa.me/${numero}`}
            target="_blank"
            rel="noreferrer"
            className="btn-base mx-auto mt-10 inline-flex bg-success px-6 py-5 text-xl text-success-foreground"
          >
            Falar no WhatsApp
          </a>
        )}
      </main>
    </div>
  );
}
