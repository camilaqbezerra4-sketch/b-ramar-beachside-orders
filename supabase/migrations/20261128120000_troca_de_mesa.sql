-- BóraMar: trocar a turma de mesa (o grupo muda para uma mesa mais perto do mar).
-- Guarda quando o pedido ou o serviço foi levado para a mesa nova, para ele
-- entrar na turma atual dela. Só acrescenta colunas; não altera dados.

ALTER TABLE public.pedidos
  ADD COLUMN IF NOT EXISTS movido_em timestamptz;

ALTER TABLE public.servicos
  ADD COLUMN IF NOT EXISTS movido_em timestamptz;
