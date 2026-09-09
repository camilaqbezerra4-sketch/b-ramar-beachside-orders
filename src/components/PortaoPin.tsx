import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";

// PIN lembrado neste aparelho por 30 dias, por barraca.
export const chavePin = (slug: string) =>
  `boramar:painel-liberado-ate:${slug}`;

export function painelLiberado(slug: string) {
  if (typeof window === "undefined") return false;
  const ate = Number(localStorage.getItem(chavePin(slug)) ?? 0);
  return Number.isFinite(ate) && ate > Date.now();
}

export function guardarLiberacao(slug: string) {
  localStorage.setItem(chavePin(slug), String(Date.now() + 30 * 86400000));
}

export function TelaPin({
  pin,
  titulo,
  subtitulo,
  aoLiberar,
}: {
  pin: string;
  titulo: string;
  subtitulo: string;
  aoLiberar: () => void;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState(false);

  return (
    <div className="min-h-screen">
      <AppHeader subtitulo={subtitulo} />
      <main className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-3xl font-extrabold">{titulo}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Digite o PIN da barraca. Este aparelho fica lembrado por 30 dias.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valor === pin && pin) aoLiberar();
            else setErro(true);
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
            aria-label="PIN da barraca"
            placeholder="••••"
            className="w-full rounded-2xl border-2 border-border bg-card px-4 py-4 text-center text-3xl font-extrabold tracking-widest"
          />
          {erro && (
            <p className="text-lg font-bold text-destructive">
              PIN incorreto. Tente de novo.
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
