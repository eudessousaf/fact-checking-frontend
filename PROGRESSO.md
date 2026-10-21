# Progresso

## Etapa 1 — estrutura e contrato (21/10/2026)

**Feito**

- `schemas/`: cópia idêntica dos schemas do backend.
- `public/timeline.json` e `public/ads.json`: exemplos válidos, com
  candidatos fictícios. O exemplo tem um candidato acima do mínimo do
  gráfico (8 checagens) e outro abaixo, e um item removido — os três
  estados que a página precisa desenhar.
- `tests/fixtures/ads.example-active.json`: anúncio ligado, para testar a
  página com publicidade.
- `npm test`: valida os exemplos pelo schema e confere que os schemas são
  idênticos aos do backend.

**Pendente**: a página em si é a etapa 9.

**Para a página (etapa 9), o que o contrato já decide**

- O status e o modo vêm do arquivo; a página não deduz nada.
- Os números do gráfico vêm em `stats`, com `display` já decidido. A página
  não recalcula — senão página e painel podem divergir.
- Item `state: "removido"` é desenhado como "Checagem removida/corrigida pela
  equipe", com horário.
- Campo ausente não pode quebrar a página: o schema é rígido para quem gera,
  a página é tolerante para quem lê.
