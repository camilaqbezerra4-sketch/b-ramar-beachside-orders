import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useDados } from "@/lib/store";

export const Route = createFileRoute("/qrcodes")({
  head: () => ({
    meta: [
      { title: "QR Codes das mesas — BóraMar" },
      {
        name: "description",
        content:
          "Página pronta para imprimir em A4 com quatro plaquinhas de QR Code por folha.",
      },
      { property: "og:title", content: "QR Codes das mesas — BóraMar" },
      {
        property: "og:description",
        content: "Imprima as plaquinhas de QR Code das mesas da barraca.",
      },
    ],
  }),
  component: QrCodesPage,
});

function QrCodesPage() {
  const { pronto, barraca, mesas } = useDados();
  const comQr = [...mesas]
    .filter((m) => m.tem_qrcode)
    .sort((a, b) => a.numero - b.numero);
  const [imagens, setImagens] = useState<Record<string, string>>({});

  useEffect(() => {
    if (typeof window === "undefined") return;
    let ativo = true;
    Promise.all(
      comQr.map(async (m) => {
        const url = `${window.location.origin}/cliente?mesa=${m.numero}`;
        return [m.id, await QRCode.toDataURL(url, { width: 600, margin: 1 })] as const;
      }),
    ).then((pares) => {
      if (ativo) setImagens(Object.fromEntries(pares));
    });
    return () => {
      ativo = false;
    };
  }, [comQr.map((m) => m.id).join(",")]);

  if (!pronto) {
    return <p className="p-6 text-xl font-bold">Preparando os QR Codes…</p>;
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <style>{`
        @page { size: A4; margin: 10mm; }
        @media print {
          .sem-impressao { display: none !important; }
          .folha-qr { break-inside: avoid; }
        }
      `}</style>

      <div className="sem-impressao mx-auto mb-5 flex max-w-3xl flex-wrap items-center gap-3">
        <h1 className="flex-1 text-3xl font-extrabold">QR Codes das mesas</h1>
        <button
          onClick={() => window.print()}
          className="btn-base bg-primary text-primary-foreground"
        >
          Imprimir
        </button>
        <Link to="/painel" className="btn-base border-2 border-border bg-card">
          Voltar ao painel
        </Link>
      </div>

      {comQr.length === 0 ? (
        <p className="mx-auto max-w-3xl text-lg font-bold">
          Nenhuma mesa está marcada como “Com QR Code”.
        </p>
      ) : (
        <div className="mx-auto grid max-w-4xl grid-cols-2 gap-4">
          {comQr.map((m) => (
            <div
              key={m.id}
              className="folha-qr card-praia flex flex-col items-center gap-2 p-4 text-center"
              style={{ height: "128mm" }}
            >
              <p className="text-lg font-extrabold">{barraca.nome}</p>
              {imagens[m.id] ? (
                <img
                  src={imagens[m.id]}
                  alt={`QR Code da mesa ${m.numero}`}
                  className="h-auto w-full max-w-[70mm]"
                />
              ) : (
                <div className="h-40 w-40 animate-pulse rounded-xl bg-sand" />
              )}
              <p className="text-5xl font-extrabold">Mesa {m.numero}</p>
              <p className="text-base text-muted-foreground">
                Aponte a câmera e peça da sua cadeira
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
