#!/usr/bin/env node
/**
 * Generate 256x256 fantasy icons (NO TEXT) for Foundry .db packs (files only),
 * save PNGs into icons/generated/{spells|items}/, and update each doc.img path.
 *
 * Prompting strategy:
 * - Spells:
 *   "fantasy spell concept art, single spell icon on parchment background, magical spell: <Name>"
 * - Physical items (weapons/armor/cloak/etc):
 *   "fantasy <type> concept art, single <type> on parchment background, <Name>"
 *
 * Usage (repo root):
 *   node tools/generate-icons-db.mjs
 *
 * Env vars:
 *   SD_API=http://192.168.1.174:7860
 *   LIMIT=10
 *   OVERWRITE=0|1
 *   DRYRUN=0|1
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const REPO_ROOT = path.resolve(__dirname, "..");
const PACKS_DIR = path.join(REPO_ROOT, "packs");

const SD_API = process.env.SD_API ?? "http://192.168.1.174:7860";
const LIMIT = process.env.LIMIT ? Number(process.env.LIMIT) : Infinity;
const OVERWRITE = (process.env.OVERWRITE ?? "0") === "1";
const DRYRUN = (process.env.DRYRUN ?? "0") === "1";

function exists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true; } catch { return false; }
}
function ensureDir(p) {
  if (!exists(p)) fs.mkdirSync(p, { recursive: true });
}
function readJsonFile(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}
function getModuleId() {
  const moduleJsonPath = path.join(REPO_ROOT, "module.json");
  if (!exists(moduleJsonPath)) {
    console.warn("WARNING: module.json not found; defaulting moduleId='module'");
    return "module";
  }
  const mj = readJsonFile(moduleJsonPath);
  return mj.id ?? mj.name ?? "module";
}
function sanitizeFileName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 120);
}
function shortHash(input) {
  return crypto.createHash("sha1").update(String(input)).digest("hex").slice(0, 8);
}
function isSpell(doc) {
  return String(doc?.type ?? "").toLowerCase() === "spell";
}
function isLikelyDoc(doc) {
  return doc && typeof doc === "object" && typeof doc.name === "string" && doc.name.trim().length > 0;
}

/**
 * Best-effort item category detection (from name and type).
 * You asked for prompts based on the "type of item it is".
 * This is heuristic but works well for Foundry packs when item `type` isn't granular.
 */
function detectItemCategory(doc) {
  const n = String(doc?.name ?? "").toLowerCase();
  const t = String(doc?.type ?? "").toLowerCase();

  // If Foundry/Dragonbane schema uses specific item subtypes, honor them
  if (t && t !== "spell") {
    // Common subtypes could be: weapon, armor, shield, equipment, item, etc.
    if (["weapon", "armor", "shield", "cloak", "robe", "boots", "helm", "helmet", "ring", "amulet", "staff", "wand"].includes(t)) {
      return t;
    }
  }

  // Name-based heuristics
  if (/sword|blade|dagger|axe|hammer|mace|spear|bow|crossbow|flail|halberd/.test(n)) return "weapon";
  if (/shield|buckler/.test(n)) return "shield";
  if (/armor|breastplate|cuirass|chainmail|mail|plate|hauberk/.test(n)) return "armor";
  if (/helm|helmet|hood/.test(n)) return "helmet";
  if (/cloak|cape|mantle/.test(n)) return "cloak";
  if (/robe|vestment|tunic/.test(n)) return "robe";
  if (/boots|shoes|greaves/.test(n)) return "boots";
  if (/gloves|gauntlets/.test(n)) return "gloves";
  if (/ring/.test(n)) return "ring";
  if (/amulet|pendant|necklace/.test(n)) return "amulet";
  if (/staff/.test(n)) return "staff";
  if (/wand/.test(n)) return "wand";
  if (/tome|grimoire|book/.test(n)) return "book";
  if (/scroll/.test(n)) return "scroll";
  if (/potion|elixir|vial/.test(n)) return "potion";

  return "item";
}

function buildPrompt(doc) {
  const name = doc.name.trim();

  // You said: for spells use exactly this structure.
  if (isSpell(doc)) {
    return [
      "fantasy spell concept art",
      "single spell icon on parchment background",
      `magical spell: ${name}`,
      "clean composition, centered subject",
      "NO TEXT, no letters, no numbers, no watermark, no logo"
    ].join(", ");
  }

  // For physical items:
  const cat = detectItemCategory(doc);
  const label = cat === "item" ? "item" : cat;

  return [
    `fantasy ${label} concept art`,
    `single ${label} on parchment background`,
    name,
    "clean composition, centered subject",
    "NO TEXT, no letters, no numbers, no watermark, no logo"
  ].join(", ");
}

function stableIconFileName(doc) {
  const base = sanitizeFileName(doc.name || "icon");
  const suffix = shortHash(doc._id ?? doc.name ?? crypto.randomUUID());
  return base ? `${base}-${suffix}.png` : `${suffix}.png`;
}

function foundryImgPath(moduleId, kind, fileName) {
  const rel = path.posix.join("icons", "generated", kind, fileName);
  return `modules/${moduleId}/${rel}`;
}

function localIconPath(kind, fileName) {
  return path.join(REPO_ROOT, "icons", "generated", kind, fileName);
}

async function generateWithA1111(prompt) {
  const payload = {
    prompt,
    negative_prompt: [
      "text", "letters", "numbers", "watermark", "logo", "signature", "caption",
      "frame", "border", "UI", "interface",
      "badge", "medallion", "coin", "token", "emblem",
      "symmetry", "kaleidoscope",
      "lowres", "blurry", "deformed", "oversaturated"
    ].join(", "),
    width: 256,
    height: 256,
    steps: 30,
    cfg_scale: 5,
    // Use a widely-available sampler name. If you know you have SDE Karras, switch it back.
    sampler_name: "DPM++ SDE"
  };

  const r = await fetch(`${SD_API}/sdapi/v1/txt2img`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!r.ok) throw new Error(`A1111 error ${r.status}: ${await r.text()}`);
  const j = await r.json();
  const b64 = j?.images?.[0];
  if (!b64) throw new Error("A1111 returned no images.");

  const clean = b64.includes(",") ? b64.split(",", 1)[1] : b64;
  return Buffer.from(clean, "base64");
}

function listPackFiles() {
  if (!exists(PACKS_DIR)) throw new Error(`packs/ not found at: ${PACKS_DIR}`);

  return fs.readdirSync(PACKS_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".db"))
    .map((e) => path.join(PACKS_DIR, e.name))
    .sort((a, b) => a.localeCompare(b));
}

function loadPackDocs(packFilePath) {
  const raw = fs.readFileSync(packFilePath, "utf8").trim();
  if (!raw) return { docs: [], format: "ndjson" };

  if (raw.startsWith("[")) {
    const docs = JSON.parse(raw);
    if (!Array.isArray(docs)) throw new Error(`Expected array in ${packFilePath}`);
    return { docs, format: "array" };
  }

  const docs = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, idx) => {
      try { return JSON.parse(l); }
      catch (e) { throw new Error(`JSON parse failed in ${path.basename(packFilePath)} at line ${idx + 1}: ${e.message}`); }
    });

  return { docs, format: "ndjson" };
}

function savePackDocs(packFilePath, docs, format) {
  if (format === "array") {
    fs.writeFileSync(packFilePath, JSON.stringify(docs, null, 0) + "\n", "utf8");
    return;
  }
  fs.writeFileSync(packFilePath, docs.map((d) => JSON.stringify(d)).join("\n") + "\n", "utf8");
}

async function processPackFile(packFilePath, moduleId) {
  const { docs, format } = loadPackDocs(packFilePath);

  let processed = 0;
  let changed = 0;

  for (let i = 0; i < docs.length; i++) {
    if (processed >= LIMIT) break;

    const doc = docs[i];
    if (!isLikelyDoc(doc)) continue;

    const kind = isSpell(doc) ? "spells" : "items";

    const fileName = stableIconFileName(doc);
    const iconDiskPath = localIconPath(kind, fileName);
    const iconFoundryPath = foundryImgPath(moduleId, kind, fileName);

    ensureDir(path.dirname(iconDiskPath));

    const alreadyOk = (doc.img === iconFoundryPath) && exists(iconDiskPath);
    if (alreadyOk && !OVERWRITE) {
      processed++;
      continue;
    }

    const prompt = buildPrompt(doc);

    console.log(`\n[${kind}] ${doc.name}`);
    console.log(` pack: ${path.relative(REPO_ROOT, packFilePath)}`);
    console.log(` img : ${iconFoundryPath}`);
    console.log(` file: ${path.relative(REPO_ROOT, iconDiskPath)}`);
    console.log(` prompt: ${prompt}`);

    if (!DRYRUN) {
      const png = await generateWithA1111(prompt);
      fs.writeFileSync(iconDiskPath, png);

      doc.img = iconFoundryPath;
      docs[i] = doc;
      changed++;
    }

    processed++;
  }

  if (!DRYRUN && changed > 0) {
    savePackDocs(packFilePath, docs, format);
  }

  return { processed, changed, total: docs.length };
}

async function main() {
  const moduleId = getModuleId();

  console.log(`Module ID: ${moduleId}`);
  console.log(`SD_API: ${SD_API}`);
  console.log(`DRYRUN=${DRYRUN} OVERWRITE=${OVERWRITE} LIMIT=${LIMIT === Infinity ? "∞" : LIMIT}`);

  const packFiles = listPackFiles();
  console.log(`Found ${packFiles.length} pack(s) under ./packs`);

  let totalProcessed = 0;
  let totalChanged = 0;

  for (const pf of packFiles) {
    console.log(`\n=== Processing pack: ${path.relative(REPO_ROOT, pf)} ===`);
    const r = await processPackFile(pf, moduleId);
    console.log(`Pack done. processed=${r.processed} changed=${r.changed} docs=${r.total}`);
    totalProcessed += r.processed;
    totalChanged += r.changed;
  }

  console.log(`\nALL DONE. processed=${totalProcessed} changed=${totalChanged}`);
  if (DRYRUN) console.log("DRYRUN was enabled: no files or pack entries were written.");
}

main().catch((err) => {
  console.error("\nFAILED:", err?.stack ?? err);
  process.exit(1);
});
