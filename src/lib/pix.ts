// Gera o código Pix "copia e cola" estático (BR Code / EMV), sem gateway.
function campo(id: string, valor: string) {
  return id + String(valor.length).padStart(2, "0") + valor;
}

function crc16(payload: string) {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

function limpar(texto: string, max: number) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9 ]/g, "")
    .toUpperCase()
    .slice(0, max);
}

export function gerarCodigoPix(opts: {
  chave: string;
  nome: string;
  cidade: string;
  valor: number;
  identificador?: string;
}) {
  const merchant =
    campo("00", "br.gov.bcb.pix") + campo("01", opts.chave.trim());
  let payload =
    campo("00", "01") +
    campo("26", merchant) +
    campo("52", "0000") +
    campo("53", "986") +
    campo("54", opts.valor.toFixed(2)) +
    campo("58", "BR") +
    campo("59", limpar(opts.nome, 25) || "BORAMAR") +
    campo("60", limpar(opts.cidade, 15) || "RECIFE") +
    campo("62", campo("05", limpar(opts.identificador ?? "***", 25) || "***"));
  payload += "6304";
  return payload + crc16(payload);
}
