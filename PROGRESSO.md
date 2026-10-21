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

## Etapa 9 (parte do frontend) — página pública (21/10/2026)

Adiantada a pedido do Eudes; a parte do backend (envio para a CDN) e o teste
de carga dependem do bucket na DigitalOcean.

**Feito**

- `public/index.html`, `styles.css`, `app.js`, `config.js` — HTML, CSS e JS
  puros, sem biblioteca e sem fonte externa. **~11 KB comprimidos** no total,
  com o timeline de exemplo.
- Status no topo, aviso de pós-debate, faixa de AMBIENTE DE TESTE fora de
  produção, aviso de IA com link para reportar erro (`config.js`).
- Cada checagem: título com ícone e texto (✓ / ! / ✗), horário da fala,
  candidato, trecho marcado "transcrição automática", afirmação, explicação,
  "o que não confere" (em NÃO É BEM ASSIM), indicadores e fontes.
- Item removido aparece como "Checagem removida/corrigida pela equipe", com
  horário e sem o conteúdo retirado.
- Gráfico em CSS puro, com os números do backend; % sempre com o total ao
  lado; abaixo do mínimo mostra "Dados insuficientes…"; nota fixa e link
  para "Como checamos". Os três tons diferem em luminosidade e FALSO tem
  listras, para quem não distingue vermelho de verde.
- Atualização: 20 s + até 10 s aleatórios; `cache: "no-cache"` (o navegador
  pergunta "mudou?" e recebe 304); aba em segundo plano consulta 3x menos;
  arquivo com `sequence` menor é ignorado; falha mantém a tela e tenta de novo.
- Dado do JSON entra como texto, nunca como HTML; link de fonte só http(s).
- Publicidade: faixa (topo ou rodapé, com espaço reservado) ou modal (uma vez
  por visita, depois do atraso, fecha com botão grande, ESC ou clique fora).
  Rótulo "Publicidade" sempre. Imagem só da própria CDN (`ads/...`). Carrega
  depois da linha do tempo; se falhar, some.

**Testado na nuvem**: `npm test` (contrato) e `npm run test:e2e` — 9
cenários num Chromium real, listados no README. Conferido também por
captura de tela, no celular (390 px) e no tema escuro.

**Pendente**

- Envio do `timeline.json` para o Spaces (backend) e a página no ar.
- Teste de carga contra a URL real (meta: 80 mil leitores ≈ 3.200
  pedidos/s, pela consulta a cada ~25 s).
- Trocar o e-mail de "reportar erro" em `config.js`.
