import { analisarChavePix } from "@/lib/chave-pix";

/** Campo de chave Pix com o tipo detectado e a chave já normalizada. */
export function CampoChavePix({
  valor,
  aoMudar,
  rotulo = "Chave Pix",
  className,
}: {
  valor: string;
  aoMudar: (v: string) => void;
  rotulo?: string;
  className?: string;
}) {
  const info = analisarChavePix(valor);

  return (
    <div className="grid gap-1">
      <input
        value={valor}
        onChange={(e) => aoMudar(e.target.value)}
        placeholder={rotulo}
        aria-label={rotulo}
        className={
          className ??
          "w-full rounded-xl border-2 border-border bg-background px-3 py-3 text-lg font-bold"
        }
      />
      {info.ok ? (
        <p className="text-base font-bold text-muted-foreground">
          {info.rotulo}: <span className="text-foreground">{info.valor}</span>
        </p>
      ) : info.vazia ? (
        <p className="text-base text-muted-foreground">
          Telefone, CPF, CNPJ, e-mail ou chave aleatória.
        </p>
      ) : (
        <p className="text-base font-bold text-destructive">
          Não reconhecemos esta chave Pix. Confira o número ou o e-mail.
        </p>
      )}
    </div>
  );
}
