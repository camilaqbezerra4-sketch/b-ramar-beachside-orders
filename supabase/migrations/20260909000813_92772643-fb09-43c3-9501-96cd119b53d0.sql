ALTER TABLE public.pedidos ADD COLUMN IF NOT EXISTS pago_em timestamptz;

UPDATE public.pedidos SET pago = true WHERE status IN ('em_preparo','entregue') AND pago = false;
UPDATE public.pedidos SET pago_em = COALESCE(pago_em, updated_at, criado_em) WHERE pago = true AND pago_em IS NULL;

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_status_valido;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_status_valido
  CHECK (status IN ('novo','pago','em_preparo','entregue','cancelado','expirado'));

ALTER TABLE public.pedidos DROP CONSTRAINT IF EXISTS pedidos_preparo_exige_pago;
ALTER TABLE public.pedidos ADD CONSTRAINT pedidos_preparo_exige_pago
  CHECK (NOT (status IN ('em_preparo','entregue') AND pago = false));

CREATE OR REPLACE FUNCTION public.pedidos_regras_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('em_preparo','entregue') AND NEW.pago = false THEN
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
$$;

DROP TRIGGER IF EXISTS t_pedidos_regras_status ON public.pedidos;
CREATE TRIGGER t_pedidos_regras_status
  BEFORE INSERT OR UPDATE ON public.pedidos
  FOR EACH ROW EXECUTE FUNCTION public.pedidos_regras_status();