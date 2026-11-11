// Routes world events into the pure logic. Quests are the single entry point: they also feed the board and bounties,
// and the caravan module delivers its own caravan:* events to the same handler.
export { handleWorldEvent } from '../sim/quests.js';
