// Confere que os JSON de exemplo seguem o contrato e que os schemas daqui são
// cópia idêntica dos do backend (quando o backend está clonado ao lado).
//
// Só o JSON Schema roda aqui. As conferências que o schema não expressa
// (stats batendo com os itens, limite de frases) moram no backend, que é
// quem gera o arquivo — duplicá-las em JS seria uma segunda lógica para
// manter igual à primeira.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));

// strictRequired desligado: ele reclama de `required` dentro de if/then mesmo
// quando a propriedade está declarada no mesmo objeto — falso positivo do Ajv.
const ajv = new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
addFormats(ajv);
const validators = {
  timeline: ajv.compile(readJson(join(root, "schemas/timeline.schema.json"))),
  ads: ajv.compile(readJson(join(root, "schemas/ads.schema.json"))),
};

const targets = [
  ...["public/timeline.json", "public/ads.json"],
  ...readdirSync(join(root, "tests/fixtures")).map((f) => `tests/fixtures/${f}`),
];

let failed = false;
for (const rel of targets) {
  const kind = rel.split("/").pop().startsWith("ads") ? "ads" : "timeline";
  const validate = validators[kind];
  if (validate(readJson(join(root, rel)))) {
    console.log(`OK       ${rel}`);
  } else {
    failed = true;
    console.log(`INVÁLIDO ${rel}`);
    for (const e of validate.errors) console.log(`   - ${e.instancePath || "(raiz)"} ${e.message}`);
  }
}

const backendSchemas = join(root, "..", "fact-checking-backend", "schemas");
if (existsSync(backendSchemas)) {
  for (const name of ["timeline.schema.json", "ads.schema.json"]) {
    const here = readFileSync(join(root, "schemas", name), "utf8");
    const there = readFileSync(join(backendSchemas, name), "utf8");
    if (here === there) {
      console.log(`IDÊNTICO schemas/${name}`);
    } else {
      failed = true;
      console.log(`DIVERGE  schemas/${name} — copie do backend: cp ../fact-checking-backend/schemas/*.json schemas/`);
    }
  }
} else {
  console.log("(backend não está clonado ao lado; comparação de schemas pulada)");
}

process.exit(failed ? 1 : 0);
