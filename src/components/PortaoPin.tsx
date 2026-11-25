import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { entrarComPin } from "@/lib/store";

// O PIN é conferido no servidor. Se estiver certo, o servidor guarda um
// cookie assinado e este aparelho fica liberado por 30 dias.
export function TelaPin({
  slug,
  titulo,
  subtitulo,
}: {
  slug: string;
  titulo: string;
  subtitulo: string;
}) {
  const [valor, setValor] = useState("");
  const [erro, setErro] = useState(false);
  const [conferindo, setConferindo] = useState(false);

  return (
    <div className="min-h-screen">
      <AppHeader subtitulo={subtitulo} />
      <main className="mx-auto max-w-3xl px-4 pt-8">
        <h1 className="text-3xl font-bold">{titulo}</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Digite o PIN da barraca. Este aparelho fica lembrado por 30 dias.
        </p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!valor || conferindo) return;
            setConferindo(true);
            try {
              const ok = await entrarComPin(slug, valor);
              if (!ok) setErro(true);
            } catch {
              setErro(true);
            } finally {
              setConferindo(false);
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
            aria-label="PIN da barraca"
            placeholder="••••"
            className="w-full rounded-2xl border border-border bg-card px-4 py-4 text-center text-3xl font-bold tracking-widest"
          />
          {erro && (
            <p className="text-lg font-semibold text-destructive">
              PIN incorreto ou sem internet. Tente de novo.
            </p>
          )}
          <button disabled={conferindo} className="btn-base bg-primary text-primary-foreground">
            {conferindo ? "Conferindo…" : "Entrar"}
          </button>
          <Link to="/" className="btn-base border border-border bg-card">
            Voltar ao início
          </Link>
        </form>
      </main>
    </div>
  );
}
