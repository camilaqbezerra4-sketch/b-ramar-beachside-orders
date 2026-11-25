-- BóraMar: "pagar no final" (conta da mesa) e serviço do garçom.
-- Só acrescenta colunas e uma tabela; não apaga nem altera dados existentes.

-- 1. Configurações por barraca
ALTER TABLE public.barracas
  ADD COLUMN IF NOT EXISTS servico_percentual numeric(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS permite_pagar_final boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS limite_conta numeric(10,2);
ALTER TABLE public.barracas DROP CONSTRAINT IF EXISTS barracas_servico_percentual_check;
ALTER TABLE public.barracas ADD CONSTRAINT barracas_servico_percentual_check
  CHECK (servico_percentual >= 0 AND servico_percentual <= 30);

-- 2. Pedidos na conta da mesa
ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS na_conta boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS fechamento_solicitado_em timestamptz;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_forma_pagamento_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_forma_pagamento_check
  CHECK (forma_pagamento IN ('pix','cartao','dinheiro'));

-- pedido só vai para a cozinha se estiver pago OU na conta da mesa
-- (remove também a regra antiga, de antes do status "pronto")
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_preparo_exige_pago;
ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_pago_check;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_pago_check
  CHECK (NOT (status IN ('em_preparo','pronto','entregue') AND pago = false AND na_conta = false));

CREATE OR REPLACE FUNCTION public.pedidos_regras_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('em_preparo','pronto','entregue') AND NEW.pago = false AND NEW.na_conta = false THEN
    RAISE EXCEPTION 'Pedido % nao pode ir para % sem pagamento confirmado', NEW.id, NEW.status;
  END IF;
  IF NEW.pago = true AND NEW.pago_em IS NULL THEN
    NEW.pago_em = now();
  END IF;
  IF NEW.pago = false THEN
    NEW.pago_em = NULL;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE INDEX IF NOT EXISTS idx_pedidos_mesa_criado
  ON public.pedidos (mesa_id, criado_em DESC);

-- 3. Serviço do garçom (pago direto na chave Pix dele, ou registrado pelo caixa)
CREATE TABLE IF NOT EXISTS public.servicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barraca_id uuid NOT NULL REFERENCES public.barracas(id) ON DELETE CASCADE,
  mesa_id uuid REFERENCES public.mesas(id) ON DELETE SET NULL,
  garcom_id uuid REFERENCES public.garcons(id) ON DELETE SET NULL,
  valor numeric(10,2) NOT NULL CHECK (valor > 0),
  forma text NOT NULL DEFAULT 'pix' CHECK (forma IN ('pix','cartao','dinheiro')),
  situacao text NOT NULL DEFAULT 'informado' CHECK (situacao IN ('informado','confirmado')),
  criado_em timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_servicos_barraca_data ON public.servicos (barraca_id, criado_em DESC);
ALTER TABLE public.servicos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.servicos FROM anon, authenticated;
GRANT ALL ON public.servicos TO service_role;

DROP TRIGGER IF EXISTS t_servicos_updated ON public.servicos;
CREATE TRIGGER t_servicos_updated BEFORE UPDATE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS t_servicos_sinal ON public.servicos;
CREATE TRIGGER t_servicos_sinal AFTER INSERT OR UPDATE OR DELETE ON public.servicos
  FOR EACH ROW EXECUTE FUNCTION public.marcar_sinal();
