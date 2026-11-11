// Game clock and weather. Slice `time`. Pure.
// One game day lasts DAY_REAL_SECONDS of real time. Weather changes once per day-part
// (night / morning / day / evening) by a small deterministic state machine.
import { registerSlice, ok, fail } from './state.js';
import { emit } from '../core/events.js';
import { hash2 } from '../core/noise.js';

/** Real seconds in one game day (36 minutes). */
export const DAY_REAL_SECONDS = 36 * 60;
/** Game hours per real second. */
export const HOURS_PER_SECOND = 24 / DAY_REAL_SECONDS;

export const NIGHT_START = 21;
export const NIGHT_END = 5;

export const WEATHERS = ['clear', 'cloudy', 'rain', 'fog', 'storm'];
export const WEATHER_NAMES = { clear: 'Ясно', cloudy: 'Пасмурно', rain: 'Дождь', fog: 'Туман', storm: 'Гроза' };

/** Day-parts: index = floor(hour / 6). */
export const DAY_PARTS = ['night', 'morning', 'day', 'evening'];
export const DAY_PART_NAMES = { night: 'ночь', morning: 'утро', day: 'день', evening: 'вечер' };

/** Transition weights: WEATHER_FLOW[from] = [[to, weight]…]. */
const WEATHER_FLOW = {
  clear: [['clear', 6], ['cloudy', 3], ['fog', 1]],
  cloudy: [['clear', 3], ['cloudy', 3], ['rain', 3], ['fog', 1]],
  rain: [['cloudy', 4], ['rain', 3], ['storm', 1], ['clear', 1]],
  fog: [['clear', 4], ['cloudy', 3], ['fog', 1]],
  storm: [['rain', 4], ['cloudy', 3]],
};

registerSlice('time', {
  init: () => ({ day: 1, hour: 8, weather: 'clear', seed: 7919 }),
  migrate(time) {
    if (!Number.isFinite(time.day) || !Number.isFinite(time.hour)) throw new Error('Повреждены часы мира');
    if (!WEATHERS.includes(time.weather)) time.weather = 'clear';
    time.seed ??= 7919;
    return time;
  },
});

const partIndex = hour => Math.floor(hour / 6) % 4;

/** Name of the current day-part: 'night' | 'morning' | 'day' | 'evening'. */
export const dayPart = state => DAY_PARTS[partIndex(state.time.hour)];

/** True between NIGHT_START and NIGHT_END. */
export function isNight(state) {
  const hour = state.time.hour;
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export const isRaining = state => state.time.weather === 'rain' || state.time.weather === 'storm';

function nextWeather(time, part) {
  const roll = hash2(time.day, part, time.seed);
  const flow = WEATHER_FLOW[time.weather];
  const total = flow.reduce((sum, [, weight]) => sum + weight, 0);
  let acc = 0;
  for (const [to, weight] of flow) {
    acc += weight / total;
    if (roll < acc) return to;
  }
  return flow[0][0];
}

function changeWeather(state, part) {
  const before = state.time.weather;
  state.time.weather = nextWeather(state.time, part);
  if (state.time.weather !== before) emit('time:weather', { weather: state.time.weather });
}

/** Move the clock forward by game hours, crossing day-part and day boundaries. Returns days passed. */
function advanceHours(state, hours) {
  const time = state.time;
  let daysPassed = 0;
  let left = hours;
  while (left > 1e-9) {
    const toBoundary = (Math.floor(time.hour / 6) + 1) * 6 - time.hour;
    const step = Math.min(left, toBoundary);
    time.hour += step;
    left -= step;
    if (step < toBoundary) break;
    if (time.hour >= 24) {
      time.hour -= 24;
      time.day += 1;
      daysPassed += 1;
      emit('time:newday', { day: time.day });
    }
    changeWeather(state, partIndex(time.hour));
  }
  return daysPassed;
}

/**
 * Advance the clock by `dt` real seconds. Emits `time:newday {day}` on the bus when midnight passes;
 * the engine must forward that to `handleWorldEvent` (see sim/quests.js).
 * @returns {{newDay: boolean, day: number}}
 */
export function tickTime(state, dt) {
  const days = advanceHours(state, dt * HOURS_PER_SECOND);
  return { newDay: days > 0, day: state.time.day };
}

/** Skip time until the next occurrence of `hour` (rest at an inn). */
export function sleepUntil(state, hour) {
  if (!(hour >= 0 && hour < 24)) return fail('Нет такого часа');
  let delta = hour - state.time.hour;
  if (delta <= 0.01) delta += 24;
  const days = advanceHours(state, delta);
  state.time.hour = hour;
  return ok({ hoursSlept: delta, newDay: days > 0, day: state.time.day });
}

/** "День 3, 14:05". */
export function formatTime(state) {
  const { day, hour } = state.time;
  const whole = Math.floor(hour);
  const minutes = Math.floor((hour - whole) * 60);
  return `День ${day}, ${String(whole).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/** {day, hour, part, partName, night, weather, weatherName, text} for the HUD. */
export function timeView(state) {
  const part = dayPart(state);
  return {
    day: state.time.day, hour: state.time.hour, part, partName: DAY_PART_NAMES[part],
    night: isNight(state), weather: state.time.weather, weatherName: WEATHER_NAMES[state.time.weather],
    text: formatTime(state),
  };
}
