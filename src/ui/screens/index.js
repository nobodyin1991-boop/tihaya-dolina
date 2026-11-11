// Gameplay screens: the entry imported by src/ui/ui.js (`registerGameScreens`).
// Menu tabs: inventory, character, skills, crafting, journal, caravan.
// Contextual (opened through `ui:open` or ui.open): dialogue, shop, trade, train, storage, board, bounties,
// stable, guards, rest, caravan-result; `craft` is an alias that opens the crafting tab at a workshop.
import { registerInventoryScreen } from './inventory.js';
import { registerCharacterScreen } from './character.js';
import { registerSkillsScreen } from './skills.js';
import { registerCraftingScreen } from './crafting.js';
import { registerJournalScreen } from './journal.js';
import { registerCaravanScreen } from './caravan.js';
import { registerDialogueScreen } from './dialogue.js';
import { registerShopScreens } from './shop.js';
import { registerTrainScreen } from './train.js';
import { registerStorageScreen } from './storage.js';
import { registerBoardScreens } from './board.js';
import { registerServiceScreens } from './services.js';
import { registerCaravanResultScreen } from './caravan-result.js';
import { on } from '../../core/events.js';
import { PROFESSIONS } from '../../data/professions.js';

let aliasBound = false;

/**
 * Register every gameplay screen.
 * @param {object} ui  UI framework (src/ui/ui.js)
 * @param {object} g   engine object
 */
export function registerGameScreens(ui, g) {
  registerInventoryScreen(ui, g);
  registerCharacterScreen(ui, g);
  registerSkillsScreen(ui, g);
  registerCraftingScreen(ui, g);
  registerJournalScreen(ui, g);
  registerCaravanScreen(ui, g);
  registerDialogueScreen(ui, g);
  registerShopScreens(ui, g);
  registerTrainScreen(ui, g);
  registerStorageScreen(ui, g);
  registerBoardScreens(ui, g);
  registerServiceScreens(ui, g);
  registerCaravanResultScreen(ui, g);

  // CLAUDE.md lists `ui:open {screen:'craft', params:{profession?}}` — the crafting tab is registered as `crafting`
  if (!aliasBound) {
    aliasBound = true;
    on('ui:open', payload => {
      if (!payload || payload.screen !== 'craft') return;
      const profession = payload.params && payload.params.profession;
      ui.open('crafting', { atStation: PROFESSIONS[profession] ? [profession] : true, cityKey: payload.params && payload.params.cityKey });
    });
  }
}
