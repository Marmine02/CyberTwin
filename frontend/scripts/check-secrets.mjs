// Fails if the production bundle contains anything that looks like an API key or AI env var.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const dist = new URL("../dist", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const patterns = [
  /sk-ant-[A-Za-z0-9_-]{10,}/, /sk-[A-Za-z0-9]{20,}/, /AIza[0-9A-Za-z_-]{30,}/, /xox[abp]-[A-Za-z0-9-]{10,}/,
  /AI_API_KEY/, /ANTHROPIC_API_KEY/, /OPENAI_API_KEY/, /x-api-key/i,
];
const extra = (process.env.AI_API_KEY ?? "").trim();
const hits = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(js|css|html|map|json|svg)$/.test(name)) {
      const text = readFileSync(p, "utf8");
      for (const re of patterns) if (re.test(text)) hits.push(`${p}: ${re}`);
      if (extra.length >= 8 && text.includes(extra)) hits.push(`${p}: contains the configured AI_API_KEY value`);
    }
  }
}
walk(dist);
if (hits.length) {
  console.error("Secret-like strings found in the frontend bundle:\n" + hits.join("\n"));
  process.exit(1);
}
console.log(`check-secrets: scanned ${dist}, no key patterns found`);
