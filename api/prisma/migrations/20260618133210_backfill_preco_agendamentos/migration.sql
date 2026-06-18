-- Preenche o preço dos agendamentos já existentes com o preço atual do
-- serviço vinculado, já que antes dessa migration o valor não era
-- registrado no momento da criação (era sempre lido via join em tempo real).
UPDATE "agendamentos" a
SET "preco" = s."preco"
FROM "servicos" s
WHERE a."servico_id" = s."id"
  AND a."preco" IS NULL;