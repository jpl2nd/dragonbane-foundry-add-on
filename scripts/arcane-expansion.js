// Dragonbane Arcane Expansion
// GM convenience: auto-import module macros into the world the first time.
Hooks.once("ready", async () => {
  if (!game.user.isGM) return;

  const moduleId = "dragonbane-arcane-expansion";
  const packKey = `${moduleId}.macros`;
  const pack = game.packs.get(packKey);
  if (!pack) return;

  const desired = [
    "DBAE – Import to Expanded Dragonbane Folders",
    "DBAE – Cleanup Imported DBAE Content"
  ];

  for (const name of desired) {
    const exists = game.macros.find(m => m.name === name);
    if (exists) continue;

    const idx = await pack.getIndex({fields:["name"]});
    const entry = idx.find(e => e.name === name);
    if (!entry) continue;

    const doc = await pack.getDocument(entry._id);
    const data = doc.toObject();
    delete data._id;
    await Macro.create(data);
    console.log(`DBAE | Imported macro into world: ${name}`);
  }
});
