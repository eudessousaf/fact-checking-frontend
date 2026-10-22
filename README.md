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

## Ver a página no navegador

```bash
npm run serve        # http://127.0.0.1:8080  (Ctrl+C para parar)
```

O `scripts/serve.mjs` imita a CDN no que importa para a página (ETag e
resposta 304, compressão, cache curto). Ele é só para teste: em produção
quem serve é a CDN, nunca a máquina do operador.

## Testes no navegador

```bash
npm run test:e2e
```

Abre um Chromium de verdade e confere: status, vereditos, gráfico (com o
total ao lado de cada %), item removido, atualização sozinha, arquivo velho
ignorado, falha de rede, texto malicioso no JSON, aviso de pós-debate, tela
de celular sem rolagem lateral e as regras de publicidade.

Usa o Google Chrome instalado na máquina. Para outro navegador:
`CHROMIUM_PATH=/caminho/do/chrome npm run test:e2e`.

## Arquivos publicados

Tudo o que vai para a CDN está em `public/`:

| arquivo | quem escreve | muda durante o debate? |
|---|---|---|
| `index.html`, `styles.css`, `app.js` | este repositório | não |
| `config.js` | este repositório (editar e-mail de erro antes de publicar) | não |
| `timeline.json` | o backend | sim, a cada checagem |
| `ads.json`, `ads/*` | o backend, pelo painel | quando o operador mudar |

## Publicar na DigitalOcean

O envio é feito pelo backend (que tem as chaves no `.env` dele):

```bash
cd ../fact-checking-backend
factcheck deploy-site ../fact-checking-frontend/public --com-exemplos   # 1ª vez
factcheck deploy-site ../fact-checking-frontend/public                  # depois
```

Antes de publicar: troque o e-mail de "reportar erro" em `public/config.js`.

No painel da DigitalOcean, na CDN do bucket, ponha o **TTL de 1 minuto** (o
menor disponível). Os arquivos sobem com `Cache-Control: max-age=15` nos JSON;
se a CDN respeitar o cabeçalho, a atualização chega mais rápido que 1 minuto.

## Teste de carga

Requer o [k6](https://k6.io) (`sudo apt install k6` não existe no Ubuntu
padrão; siga https://grafana.com/docs/k6/latest/set-up/install-k6/).

```bash
k6 run -e URL=https://SEU-BUCKET.REGIAO.cdn.digitaloceanspaces.com/teste/ -e RATE=300 loadtest/k6-timeline.js
```

**Leia o resultado com honestidade:** 80 mil leitores consultando a cada ~25 s
são ~3.200 pedidos/s. Um computador doméstico satura antes disso, então o
teste mede a CDN numa taxa menor (comece com 300, suba até onde a sua máquina
aguentar) e confere o que garante a escala: **zero erros**, tempo de resposta
baixo, arquivo comprimido e a maioria das respostas em 304 (sem reenviar o
conteúdo). O limite de capacidade da CDN da DigitalOcean não é publicado.
