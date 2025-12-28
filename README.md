# Dragonbane Arcane Expansion (Refactored)

This module provides compendiums for:
- Cantrips (Items of type `spell`)
- Spells (Items of type `spell`)
- Items / Artifacts / Grimoires (Items)
- Journals (Mishaps & Corruption, Fracture, Grimoires)
- Macros (Cast Spell helper)

## Install on The Forge (Manifest URL)
1. Create a GitHub repo and upload this module folder (or publish a Release).
2. Set `module.json` fields:
   - `manifest`: raw URL to `module.json`
   - `download`: URL to the released zip
3. In Forge Bazaar: **Install From Manifest** and paste the `manifest` URL.

## Using the Casting Helper
Run macro: **DBAE – Cast Spell (WP + Roll)** with a token selected.
It deducts WP if it can find a WP field on your actor sheet, rolls damage/healing if the spell description includes dice, and posts a chat card.

> Note: Full automation (target HP application, system-native casting buttons) depends on the Dragonbane Foundry system schema. This module uses safe heuristics and will warn when it cannot auto-update a field.
