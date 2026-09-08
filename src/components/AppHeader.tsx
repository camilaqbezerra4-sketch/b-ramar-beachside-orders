import { Link } from "@tanstack/react-router";

export function AppHeader({ subtitulo }: { subtitulo?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b-2 border-primary/20 bg-primary text-primary-foreground">
      <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>
            🌊
          </span>
          <span className="font-display text-2xl font-extrabold tracking-tight">
            Bóra<span className="text-accent">Mar</span>
          </span>
        </Link>
        {subtitulo ? (
          <span className="rounded-full bg-primary-foreground/15 px-3 py-1 text-sm font-bold">
            {subtitulo}
          </span>
        ) : null}
      </div>
    </header>
  );
}
