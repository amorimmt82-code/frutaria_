-- Peso aproximado por unidade (em gramas), usado quando unit = 'un' para mostrar "≈ 190g".
ALTER TABLE products ADD COLUMN approx_weight_grams INTEGER;
