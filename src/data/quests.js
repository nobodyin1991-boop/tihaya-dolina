// Quest catalog. Pure data (the definitions live in quests-main*.js and quests-side*.js).
//
// Quest schema:
//   { id, title, category:'main'|'side', act?, cityKey, giver: npcId, turnIn?: npcId (default = giver),
//     requires?: { quests:[id…], stage?, rep?:[cityKey, min], level?, flag?, notFlag? },
//     auto?: true          — starts by itself as soon as `requires` hold (no offer dialogue)
//     autoComplete?: true  — finishes by itself when the last stage is done (no turn-in)
//     desc, stages: [{ text, objectives:[objective…], onDone?:[effect…] }],
//     readyText?, rewards?: { coins, xp, rep:{cityKey:n}, items:{itemId:n} },
//     onStart?:[effect…], onComplete?:[effect…], takeOnDone?:[questItemId…],
//     talk?: { ask, offer, accept, remind, done } — lines used by sim/dialogue.js for the giver / turn-in npc }
//
// Objective types (every objective has `text` for the journal):
//   kill {creatureId|family, count, poiId?, regionId?} · gather {itemId, count} · craft {itemId?|recipeId?, count}
//   collect {itemId, count} (kept) · deliver {itemId, count} (taken at turn-in; last stage only)
//   talk {npcId, topic?, reply?, topicIf?} · visit {poiId|cityKey|regionId} · clearPoi {poiId} · chest {poiId}
//   caravan {event:'manifest-full'|'launched'|'arrived'|'event-cleared', leg?, guild?, eventId?}
//   trade {profit} · level {level} · rep {cityKey, value} · flag {flag | any:[…]}
import { MAIN_PART_ONE } from './quests-main.js';
import { MAIN_PART_TWO } from './quests-main2.js';
import { SIDE_VALLEY_FORD } from './quests-side.js';
import { SIDE_HARBOR_POI } from './quests-side2.js';
import './quest-items.js';

/** All quests in story order. */
export const QUEST_LIST = [...MAIN_PART_ONE, ...MAIN_PART_TWO, ...SIDE_VALLEY_FORD, ...SIDE_HARBOR_POI];

/** Quests by id. */
export const QUESTS = Object.fromEntries(QUEST_LIST.map(quest => [quest.id, quest]));

if (Object.keys(QUESTS).length !== QUEST_LIST.length) throw new Error('Duplicate quest id');

export const MAIN_QUESTS = QUEST_LIST.filter(quest => quest.category === 'main');
export const SIDE_QUESTS = QUEST_LIST.filter(quest => quest.category === 'side');
