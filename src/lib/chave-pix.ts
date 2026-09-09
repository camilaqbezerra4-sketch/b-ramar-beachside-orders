// Normalização e detecção de tipo de chave Pix (padrão Banco Central).
export type TipoChavePix = "telefone" | "cpf" | "cnpj" | "email" | "aleatoria";

export interface ChavePixInfo {
  ok: boolean;
  tipo: TipoChavePix | null;
  rotulo: string;
  valor: string;
  vazia: boolean;
}

const ROTULOS: Record<TipoChavePix, string> = {
  telefone: "Telefone",
  cpf: "CPF",
  cnpj: "CNPJ",
  email: "E-mail",
  aleatoria: "Chave aleatória",
};

function digitosDe(v: string) {
  return v.replace(/\D/g, "");
}

export function cpfValido(cpf: string) {
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  const calc = (ate: number) => {
    let soma = 0;
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(cpf[9]) && calc(10) === Number(cpf[10]);
}

export function cnpjValido(cnpj: string) {
  if (cnpj.length !== 14 || /^(\d)\1{13}$/.test(cnpj)) return false;
  const calc = (ate: number) => {
    let peso = ate - 7;
    let soma = 0;
    for (let i = 0; i < ate; i++) {
      soma += Number(cnpj[i]) * peso;
      peso = peso === 2 ? 9 : peso - 1;
    }
    const r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return calc(12) === Number(cnpj[12]) && calc(13) === Number(cnpj[13]);
}

function telefoneValido(numero: string) {
  // DDD (11 a 99) + 8 ou 9 dígitos
  if (!/^\d{10,11}$/.test(numero)) return false;
  const ddd = Number(numero.slice(0, 2));
  return ddd >= 11 && ddd <= 99;
}

const RE_EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const RE_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function invalida(vazia = false): ChavePixInfo {
  return { ok: false, tipo: null, rotulo: "", valor: "", vazia };
}

/** Analisa e normaliza a chave Pix digitada. */
export function analisarChavePix(entrada: string): ChavePixInfo {
  const bruto = (entrada ?? "").trim();
  if (!bruto) return invalida(true);

  const pronto = (tipo: TipoChavePix, valor: string): ChavePixInfo => ({
    ok: true,
    tipo,
    rotulo: ROTULOS[tipo],
    valor,
    vazia: false,
  });

  if (bruto.includes("@")) {
    const email = bruto.toLowerCase();
    return RE_EMAIL.test(email) ? pronto("email", email) : invalida();
  }

  if (RE_UUID.test(bruto)) return pronto("aleatoria", bruto.toLowerCase());

  const digitos = digitosDe(bruto);
  if (!digitos) return invalida();

  const pareceTelefone = /^\+/.test(bruto) || /[()\-\s]/.test(bruto);
  const semPais =
    digitos.startsWith("55") && (digitos.length === 12 || digitos.length === 13)
      ? digitos.slice(2)
      : digitos;

  if (pareceTelefone) {
    return telefoneValido(semPais)
      ? pronto("telefone", `+55${semPais}`)
      : invalida();
  }

  if (digitos.length === 14) {
    return cnpjValido(digitos) ? pronto("cnpj", digitos) : invalida();
  }

  if (digitos.length === 11) {
    if (cpfValido(digitos)) return pronto("cpf", digitos);
    return telefoneValido(digitos)
      ? pronto("telefone", `+55${digitos}`)
      : invalida();
  }

  if (digitos.length === 12 || digitos.length === 13) {
    return telefoneValido(semPais)
      ? pronto("telefone", `+55${semPais}`)
      : invalida();
  }

  if (digitos.length === 10) {
    return telefoneValido(digitos)
      ? pronto("telefone", `+55${digitos}`)
      : invalida();
  }

  return invalida();
}

/** Normaliza a chave; devolve string vazia se não reconhecer. */
export function normalizarChavePix(entrada: string) {
  const info = analisarChavePix(entrada);
  return info.ok ? info.valor : "";
}
