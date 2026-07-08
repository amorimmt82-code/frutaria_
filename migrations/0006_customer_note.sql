-- Observação livre escrita pelo cliente no cesto (separada das notas internas do admin).
ALTER TABLE orders ADD COLUMN customer_note TEXT;
