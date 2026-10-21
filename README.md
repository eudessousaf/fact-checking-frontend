# fact-checking-frontend

Página pública, **estática**, da checagem do debate: linha do tempo, gráfico
por candidato, "Como checamos" e espaço publicitário (desligado por padrão).

Não há servidor próprio no caminho do leitor: os arquivos de `public/` vão
para uma CDN (rede de servidores que distribui arquivos), e o backend só
envia para lá o `timeline.json` e o `ads.json` atualizados.

- O que está pronto e o que falta: [`PROGRESSO.md`](PROGRESSO.md)
- Quem gera os dados: repositório `fact-checking-backend`

## Contrato com o backend

`schemas/` é **cópia idêntica** de `fact-checking-backend/schemas/`. Mudança
no schema é feita nos dois repositórios no mesmo passo:

```bash
cp ../fact-checking-backend/schemas/*.json schemas/
```

`public/timeline.json` e `public/ads.json` são exemplos válidos, com
candidatos **fictícios**, para a página funcionar sem o backend.

## Rodar localmente (Linux)

Requisito: Node.js 18 ou mais novo (`node --version`). Ele só é usado nos
testes; a página em si não tem etapa de build.

```bash
git clone https://github.com/eudessousaf/fact-checking-frontend.git
cd fact-checking-frontend
npm install      # instala só o validador de JSON Schema (Ajv)
npm test         # valida os exemplos e compara os schemas com o backend
```

A comparação com o backend só roda se os dois repositórios estiverem clonados
lado a lado (`.../fact-checking-backend` e `.../fact-checking-frontend`).
