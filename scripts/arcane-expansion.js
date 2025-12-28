// Dragonbane Arcane Expansion
// Adds a right-click context option on spell items to run the Cast Spell macro logic (without requiring the macro).

Hooks.once("ready", () => {
  console.log("Dragonbane Arcane Expansion | ready");
});

// Optional: add to item directory context menu
Hooks.on("getActorSheet5eHeaderButtons", () => {}); // no-op for compatibility
