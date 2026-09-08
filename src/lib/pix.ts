// BR Code Pix estático (EMV QRCPS-MPM, Banco Central).
function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

export function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function semAcento(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** txid: apenas letras e números, no máximo 25 caracteres. */
export function txidDePedido(pedidoId: string) {
  const limpo = pedidoId.replace(/[^A-Za-z0-9]/g, "").slice(0, 25);
  return limpo || "***";
}

export function gerarCodigoPix(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valor: number;
  txid?: string;
}) {
  const chave = opts.chave.trim();
  if (!chave) return "";

  const merchant = campo("00", "br.gov.bcb.pix") + campo("01", chave);
  const nome = semAcento(opts.nome).slice(0, 25) || "BORAMAR";
  const cidade = semAcento(opts.cidade).slice(0, 15) || "RECIFE";
  const txid = txidDePedido(opts.txid ?? "***");

  let payload =
    campo("00", "01") +
    campo("26", merchant) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", opts.valor.toFixed(2)) +
    campo("58", "BR") +
    campo("59", nome) +
    campo("60", cidade) +
    campo("62", campo("05", txid));

  payload += "6304";
  return payload + crc16(payload);
}
