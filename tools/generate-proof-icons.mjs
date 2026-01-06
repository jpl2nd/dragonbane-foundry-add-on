#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function readNdjson(filePath) {
  const txt = fs.readFileSync(filePath, "utf8");
  return txt
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function writeNdjson(filePath, docs) {
  const out = docs.map((d) => JSON.stringify(d)).join("\n") + "\n";
  fs.writeFileSync(filePath, out, "utf8");
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function findDocByName(docs, name) {
  return docs.find((d) => d?.name === name);
}

async function generateImagePng({ prompt, size = "1024x1024" }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) die("Missing OPENAI_API_KEY env var.");

  // Using direct fetch to OpenAI Images generation endpoint.
  // If your environment blocks fetch, install node-fetch and import it.
const res = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-image-1",
      prompt,
      size,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Images API error ${res.status}: ${text}`);
  }

  const json = await res.json();

  // Typical response: { data: [{ b64_json: "..." }] }
  const b64 = json?.data?.[0]?.b64_json;
  if (!b64) throw new Error("No b64_json returned from images API.");
  return Buffer.from(b64, "base64");
}

const PROOF_SPELLS = [
  "Animal Whispers",
  "Beast Sense",
  "Acid Splash",
  "Barkskin",
  "Aid",
  "Cause Fear",
  "Bane",
  "Null Step",
  "Chill of Nothing",
  "Chronomage: Delay Harm",
];

const PROOF_ITEMS = [
  "Weapon of the Adept",
  "Flamebound Weapon",
  "Robe of the Arcanist",
  "Cloak of Warding",
  "Grimoire of Practical Evocations",
];

function buildSpellPrompt(name, school, rank) {
  const s = school || "General";
  const r = (rank ?? 0);
  return [
    "High-fantasy painted icon illustration.",
    `Spell: ${name}. Representing ${s} magic, rank ${r}.`,
    "Depict one evocative magical moment/object that implies the spell.",
    "Centered composition, readable silhouette, strong contrast.",
    "No text, no letters, no numbers, no borders, no frames.",
    "Simple background (vignette/gradient ok).",
    "1024x1024.",
  ].join(" ");
}

function buildItemPrompt(name) {
  return [
    "High-fantasy painted icon illustration.",
    `Item: ${name}. Depict the item clearly as a single object.`,
    "Add magical glow/details if appropriate.",
    "Centered composition, readable silhouette, strong contrast.",
    "No text, no letters, no numbers, no borders, no frames.",
    "Simple background (vignette/gradient ok).",
    "1024x1024.",
  ].join(" ");
}

(async () => {
  const repoRoot = process.cwd();

  const moduleJsonPath = path.join(repoRoot, "module.json");
  if (!fs.existsSync(moduleJsonPath)) die("module.json not found in current directory.");
  const moduleJson = JSON.parse(fs.readFileSync(moduleJsonPath, "utf8"));
  const moduleId = moduleJson.id;
  if (!moduleId) die("module.json missing id");

  const packsDir = path.join(repoRoot, "packs");
  const spellsPath = path.join(packsDir, "spells.db");
  const cantripsPath = path.join(packsDir, "cantrips.db");
  const itemsPath = path.join(packsDir, "items.db");

  if (!fs.existsSync(spellsPath)) die("packs/spells.db not found.");
  if (!fs.existsSync(cantripsPath)) die("packs/cantrips.db not found.");
  if (!fs.existsSync(itemsPath)) die("packs/items.db not found.");

  const spells = readNdjson(spellsPath);
  const cantrips = readNdjson(cantripsPath);
  const items = readNdjson(itemsPath);

  const outSpellDir = path.join(repoRoot, "icons", "generated", "spells");
  const outItemDir = path.join(repoRoot, "icons", "generated", "items");
  fs.mkdirSync(outSpellDir, { recursive: true });
  fs.mkdirSync(outItemDir, { recursive: true });

  const updates = [];

  // Spells: search both spells & cantrips packs
  for (const name of PROOF_SPELLS) {
    let doc = findDocByName(spells, name);
    let pack = "spells.db";
    if (!doc) {
      doc = findDocByName(cantrips, name);
      pack = "cantrips.db";
    }
    if (!doc) {
      console.warn(`WARN: Spell not found in spells/cantrips packs: "${name}"`);
      continue;
    }

    const school = doc?.system?.school ?? "General";
    const rank = doc?.system?.rank ?? 0;

    const slug = slugify(name);
    const fileRel = `icons/generated/spells/${slug}.png`;
    const fileAbs = path.join(repoRoot, fileRel);

    const prompt = buildSpellPrompt(name, school, rank);
    console.log(`Generating spell icon: ${name} -> ${fileRel}`);

    const png = await generateImagePng({ prompt, size: "1024x1024" });
    fs.writeFileSync(fileAbs, png);

    doc.img = `modules/${moduleId}/${fileRel}`;

    updates.push({ kind: "spell", pack, name, img: doc.img });
    await sleep(450);
  }

  // Items
  for (const name of PROOF_ITEMS) {
    const doc = findDocByName(items, name);
    if (!doc) {
      console.warn(`WARN: Item not found in items pack: "${name}"`);
      continue;
    }

    const slug = slugify(name);
    const fileRel = `icons/generated/items/${slug}.png`;
    const fileAbs = path.join(repoRoot, fileRel);

    const prompt = buildItemPrompt(name);
    console.log(`Generating item icon: ${name} -> ${fileRel}`);

    const png = await generateImagePng({ prompt, size: "1024x1024" });
    fs.writeFileSync(fileAbs, png);

    doc.img = `modules/${moduleId}/${fileRel}`;

    updates.push({ kind: "item", pack: "items.db", name, img: doc.img });
    await sleep(450);
  }

  // Write back packs
  writeNdjson(spellsPath, spells);
  writeNdjson(cantripsPath, cantrips);
  writeNdjson(itemsPath, items);

  console.log("\nUpdated docs:");
  console.table(updates);

  console.log("\nDone. Commit the new icons/ and updated packs/*.db");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
