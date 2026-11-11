// Imports every module that registers a state slice or item catalog, so createState()/hydrateState()
// always see the complete set. Import this once before creating or loading a state.
import '../data/items-catalog.js';
import '../data/quest-items.js';
import './player.js';
import './inventory.js';
import './worldstate.js';
import './time.js';
import './reputation.js';
import './progression.js';
import './crafting.js';
import './gathering.js';
import './consumables.js';
import './economy.js';
import './storage.js';
import './quests.js';
import './board.js';
import './caravan.js';
import './dialogue.js';
