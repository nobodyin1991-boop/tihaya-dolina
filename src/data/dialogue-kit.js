// Tiny helpers for writing dialogue profiles. Pure.

/**
 * A reply option inside a custom branch.
 * @param text     what the player says
 * @param effects  effects applied when chosen (may be null)
 * @param reply    what the npc answers (omit to return to the root)
 * @param options  further options under the reply (default: a single "back" option)
 * @param need     condition shown as a disabled option when not met (e.g. {coins: 150})
 */
export const opt = (text, effects = null, reply = null, options = null, need = null) => ({ text, effects, reply, options, need });

/** A conditional root option that opens a custom branch. */
export const choice = (text, cond, reply, options = null) => ({ text, if: cond, reply, options });
