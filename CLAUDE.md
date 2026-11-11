# Тихая долина — архитектура и контракты

Одиночная 3D action-RPG в духе «Готики 2»: живой мир, три города, торговое кольцо караванов.
Игрок готовит припасы, снаряжает караван и лично ведёт его в следующий город, отбиваясь от разбойников и чудовищ.
Весь текст в игре — на русском. Сюжетные ограничения: **нет магии, колдовства, религии, межрасовых и межнациональных конфликтов** (чудовища — это звери и твари природы, «способности» — техника, медицина, механика).

## Запуск
- `npm start` — Electron (принудительно дискретная видеокарта, см. `electron/main.cjs`).
- `npm run web` — статический сервер, http://127.0.0.1:5180 (для отладки в браузере).
- `npm test` — `node --test tests/*.test.mjs` (все тесты чистой логики).

## Технологии и жёсткие правила
- Чистые ES-модули, **без сборки и без TypeScript**. three.js r170 через importmap: `import * as THREE from 'three'`, аддоны — `three/addons/...` (доступны `postprocessing/*`, `shaders/*`, `utils/BufferGeometryUtils.js`; другие аддоны нужно сначала скопировать из `node_modules/three/examples/jsm` в `vendor/three-addons`).
- Оси: **+x восток, +z юг, +y вверх**, единицы — метры. `yaw` — поворот вокруг y, `yaw=0` смотрит на +z; направление = `(sin yaw, cos yaw)`.
- Никаких внешних загрузок в рантайме (шрифты, текстуры, модели). Всё процедурное либо лежит в `assets/`.
- Код читаемый: нормальные имена, по одной инструкции на строку, JSDoc у экспортов. Файл ≤ ~600 строк — иначе делить.
- `src/sim/**`, `src/data/**`, `src/core/noise.js`, `src/core/events.js`, `src/world/terrain.js`, `src/world/collision.js`, `src/world/*-layout.js` — **чистые** (без DOM и без three), работают в Node и покрыты тестами.
- Действия симуляции возвращают `ok({...})` / `fail('Причина по-русски')` из `sim/state.js`, ничего не знают про DOM. UI показывает `reason`.
- Стабильные id (предметы, существа, квесты, npc) нельзя переименовывать — они в сохранениях.

## Структура
```
electron/main.cjs        оболочка, флаги GPU
index.html, styles/      разметка и стили UI
src/core/                events.js (шина), noise.js (шум, RNG, lerp/clamp/smoothstep), save.js
src/data/                статические каталоги (world-map.js, items.js, recipes.js, classes.js, creatures.js, …)
src/sim/                 чистая логика: state.js, player.js, inventory.js, …
src/world/               terrain.js (высоты/регионы/дороги), collision.js, materials.js, geo.js, рендер мира
src/entities/            модели и поведение героя, NPC, существ, каравана
src/ui/                  HUD и экраны
src/audio/               музыка и звуки
tests/                   *.test.mjs
```

## Уже готовое ядро (читать перед работой, не переписывать без нужды)
- `src/data/world-map.js` — `WORLD` (half=3000), `CITIES` (3 города: key `valley` / `ford` / `harbor`), `NPC_ROLES` (18 ролей именных NPC в каждом городе, `npcId = '${city.key}:${role}'`), `LEGS` (3 этапа каравана: 0 valley→ford, 1 ford→harbor, 2 harbor→valley), `SIDE_ROADS`, `RIVER`, `REGIONS` (24 именованных региона с biome и level), `POIS` (точки интереса: лагеря разбойников, руины, рудники, хутора, логова).
- `src/world/terrain.js` — `heightAt(x,z)` (≈3 мкс на вызов — строить чанки порциями, не всё в одном кадре), `walkHeightAt` (с настилом мостов), `normalAt`, `slopeAt`, `regionAt`, `regionBlend(x,z,n)`, `levelAt`, `roadAt(x,z,maxDist)` → `{dist, road, leg, s, y}`, `ROADS` (сэмплы каждые 5 м: `road.path.samples[i] = {x,z,y,s}`, `road.halfWidth`, `road.kind`), `BRIDGES`, `RIVER_SAMPLES` (`v` = уровень воды), `riverAt`, `waterSurfaceAt`, `waterDepthAt`, `isSea`, `cityAt`, `poiAt`, `isSafeZone`, `legPoint(leg,s)`, `legLength(leg)`, `inBounds`. У каждого POI после импорта terrain.js есть `poi.y`.
  Вода: глобальная плоскость моря на `y=0` (всё ниже нуля — вода: море на юго-востоке, озеро, болотные окна) + река с собственным уровнем.
- `src/world/collision.js` — `createColliders()` → `addCircle(x,z,r,{top,tag})`, `addBox(x,z,hw,hd,rot,{top,tag})`, `remove(id)`, `resolve(x,z,radius,feetY)`, `blocked`, `segmentBlocked`, `rayDistance`. Один общий экземпляр передаётся всем строителям мира через `ctx.colliders`.
- `src/world/materials.js` — `PALETTE`, общие материалы (`vertexMat`, `vertexMatFlat`, `metalMat`, `clothMat`, `foliageMat`, `glowMat`, `nightGlowMat`, `solidMat`), `shared.uTime / uWind / uNight`, `applyWind`.
- `src/world/geo.js` — `paint`, `place`, `merge`, `box`, `cyl`, `sphere`, `gable`, `setAttr`, `disposeTree`. **Паттерн моделей:** примитивы красятся вершинным цветом и сливаются в одну геометрию → одна модель = 1–3 draw call на общих материалах.
- `src/core/events.js` — `on/off/emit`. `src/sim/state.js` — `registerSlice`, `createState`, `hydrateState`, `ok`, `fail`.
- `src/sim/player.js` — срез `player` (`name, classId, xp, level, hp, coins, x, z, yaw`), `grantXp`, `addCoins`, `spendCoins`, `xpProgress`, `MAX_LEVEL=20`.
- `src/sim/inventory.js` — срез `inv` (`items{id:count}`, `equip{slot:id}`, `extraSlots`), `addItem` (возвращает сколько реально добавлено), `removeItem`, `countItem`, `hasItems`, `removeItems`, `canAddItems`, `freeSlots`, `EQUIP_SLOTS`.

## Состояние и события
Состояние — один JSON-объект из срезов. Модуль-владелец регистрирует срез (`registerSlice(name,{init,migrate})`) и экспортирует функции `fn(state, …)`.
Мировые события движок публикует в шину, а в логику передаёт явным вызовом `handleWorldEvent(state, type, payload)` тех модулей, которым это нужно (квесты, караван, репутация). Типы мировых событий:
`world:kill {creatureId, level, x, z, poiId|null, boss:bool}` · `world:gather {nodeType, itemId, count}` · `world:talk {npcId}` · `world:enter {cityKey|null, poiId|null, regionId}` · `world:poi-cleared {poiId}` · `world:chest {poiId}` · `craft:done {recipeId, itemId, count}` · `trade:buy|trade:sell {cityKey, itemId, count, total}` · `time:newday {day}`.
События для UI (публикует тот, кто меняет состояние): `toast {text, kind:'info'|'good'|'warn'|'bad'}`, `log {text}`, `inv:changed`, `coins:changed`, `equip:changed`, `player:xp`, `player:levelup`, `quest:started|updated|completed {id}`, `caravan:*`, `rep:changed {cityKey, value}`.

## Стиль «Янтарь и сумрак»
- Мир: стилизованный «живописный» low-poly. Приглушённая землистая палитра, тёплый янтарный свет солнца и фонарей, холодные сине-зелёные тени, густая атмосферная дымка. Формы крупные и читаемые, силуэты выразительные, цвет — через вершинные цвета с градиентом (тёмный низ → светлый верх) вместо текстур.
- Города различаются: `timber` (фахверк, солома, частокол), `stone` (серый камень, сланец, горняцкие краны), `harbor` (светлый песчаник, янтарная черепица, причалы, мачты).
- UI в духе The Elder Scrolls Online: тёмные полупрозрачные панели, тонкие золотые линии, заголовки `Cormorant Garamond` капителью с разрядкой, текст `Jost`; компас-лента сверху, минимальный HUD, полноэкранное меню с вкладками-категориями, список слева — детали справа, подсказки клавиш внизу.

## Бюджет производительности (цель: 120+ к/с на RTX-классе, 60 к/с на встроенной графике в «низком»)
- ≤ ~350 draw call в кадре, ≤ ~1.5 млн треугольников. Повторяющееся — `InstancedMesh`; уникальное статичное — слитая геометрия.
- Никаких аллокаций в покадровых циклах (переиспользовать векторы), никаких `new Material` на объект.
- Мир строится вокруг игрока чанками, порциями по времени (≤ 4 мс работы на кадр), с выгрузкой и `dispose`.
- Источники света: солнце/луна (одна каскадная/следящая карта теней) + полусфера; точечные огни — пул ≤ 8 ближайших к игроку, остальные «светятся» материалом.
- Настройка качества `settings.quality` ∈ `low|medium|high|ultra` влияет на дальность, тени, плотность травы, постобработку.

## Каталоги id, общие для модулей
**Классы:** `warrior` (двуручный меч), `guardian` (меч+щит), `scientist` (полевой прибор-излучатель), `duelist` (парные клинки), `archer` (лук), `medic` (инструменты, дротики), `engineer` (арбалет-болтомёт + механический спутник).
**Профессии:** `apothecary, smith, carpenter, leatherworker, farmer, tailor, mason`.
**Существа** (id → архетип модели):
- quadruped: `rabbit, deer, sheep, goat, fox, badger, boar, wolf, lynx, bear, alpha_wolf, frost_wolf, thorn_boar, elk, shadow_cat`
- lizard: `lizard, stoneback` (панцирный), `ridge_drake` (крупный кряжевый ящер), `marsh_lurker` (болотный топляк)
- spider: `giant_spider, spiderling`
- humanoid: `bandit_thug, bandit_archer, bandit_brute, bandit_scout, bandit_looter, deserter, deserter_crossbow, bandit_chief_kosoy, bandit_chief_sotnik, bandit_chief_raven, guard, merc`
**Иконки предметов** (`item.icon`): `herb, flower, ore, coal, ingot, wood, plank, beam, hide, leather, grain, flour, bread, meal, meat, potion, salve, bandage, kit, fiber, cloth, thread, stone, block, sword, greatsword, dagger, blades, bow, crossbow, device, shield, armor, helmet, gloves, boots, cloak, bag, tool, note, key, coin, gem, amber, crate, barrel, fur, fish, salt, wine, spice, trophy, arrow, part`.
**Редкость** (`item.rarity`): `common, fine, rare, epic, legendary` (цвета: серо-бежевый, зелёный, синий, фиолетовый, янтарный).

## Владение файлами
Каждый модуль пишет только свои файлы; общее ядро (раздел «Уже готовое ядро») менять только аддитивно и совместимо.

## Реестр предметов
`src/data/items.js` — `ITEMS`, `registerItems(map)`, `item(id)`, `itemName(id)`; схема предмета описана в шапке файла. Каталоги регистрируют предметы при импорте.
**Все id предметов старого прототипа сохраняются** (сырьё: `herb, rareHerb, mountainHerb, moonHerb, ore, richOre, copperOre, coal, cobaltOre, mithrilOre, wood, hardwood, ancientWood, ironwood, hide, fineHide, thickHide, pristineHide, wheat, rye, saffron, flax, silkFiber, starFlax, stone, granite, marble, basalt, meat, resin, seed`; полуфабрикаты и изделия: `salve, bandage, tannin, glue, antidote, tonic, concentrate, fieldkit, lunarExtract, lunarElixir, ingot, fastener, steel, cobaltSteel, mithril, plank, handle, beam, ironBeam, arrow, leather, strap, reinforcedLeather, elderLeather, flour, flatbread, bread, stew, ration, grainMeal, trailMeal, feast, spicedMeal, guildFeast, cloth, thread, canvas, starCloth, cutStone, mortar, stoneBlock, milestone, foundation, basaltBlock, waystone, fieldnote`).
**Узлы ресурсов** (`nodeType` = id добываемого сырья): `herb, rareHerb, mountainHerb, moonHerb, ore, richOre, copperOre, coal, cobaltOre, mithrilOre, wood, hardwood, ancientWood, ironwood, wheat, rye, saffron, flax, silkFiber, starFlax, stone, granite, marble, basalt`.
**Торговые товары** (`type:'trade'`, покупаются дёшево в одном городе и продаются дорого в другом, грузятся в телегу как «попутный груз»): `honey, cheese, grainSack, lumberBale` (дёшево в valley) · `oreCrate, coalSack, toolCrate, salt` (дёшево в ford) · `amber, wine, spice, fishBarrel, silk, pearls` (дёшево в harbor) · `furBale` (скупка у охотников).

## Контракт UI ↔ движок
Движок — `createGame({canvas, settings})` в `src/game/game.js` — возвращает объект `g`. UI — `createUI(g)` в `src/ui/ui.js` — читает `g` и слушает шину; **UI никогда не меняет состояние напрямую**, только через функции `src/sim/**` и методы `g`.
Каждый кадр движок публикует `emit('frame', dt)` — HUD обновляется по нему (без собственных rAF).

**Поля и методы `g`:**
- `g.phase` ∈ `'title'|'loading'|'playing'|'dead'`; `g.paused`; `g.setPaused(bool)` — открыт полноэкранный экран: симуляция стоит, курсор свободен; `g.state` (срезы сима), `g.settings` (+ `settings.set(key, value)`), `g.fps`, `g.view.gpuName`, `g.view.info()` → `{calls, triangles}`.
- `g.newGame({name, classId})`, `g.continueGame()`, `g.hasSave()`, `g.save()`, `g.exportSave()` → string, `g.importSave(text)` (бросает Error с русским текстом), `g.quitToTitle()`, `g.setQuality(name)`.
- `g.input.caption(action)` → подпись клавиши («E», «ЛКМ»); `g.input.onAction((action, pressed) => …)` — действия `inventory, character, skills, journal, map, crafting, caravan, menu` открывают/закрывают экраны (см. `src/core/input.js`).
- `g.hero` — `{x, y, z, yaw, level, hp, maxHp, stamina, maxStamina, alive, mounted, statuses:[{type, t, total}], target}`; `target` — `null` или `{id, name, level, hp, maxHp, elite, boss, kind, team, statuses}`.
- `g.heroCtl.inCombat()`; `g.heroCtl.hotbar()` → `[{slot:1..5, abilityId, name, icon, rank, cooldown, cooldownTotal, usable, lockedReason|null, staminaCost}]`; `g.heroCtl.quickSlots()` → `[{slot:1..4, itemId|null, count, cooldown, cooldownTotal}]`; `g.heroCtl.setQuickSlot(slot, itemId|null)`; `g.heroCtl.useAbility(slot)`; `g.heroCtl.useItem(itemId)`; `g.heroCtl.stats()` → производные характеристики.
- `g.zone` — `{region, city, poi, safe}` (объекты из world-map или null).
- `g.prompt` — `null | {key, text, sub?}` (подсказка взаимодействия); `g.interaction.channel` — `null | {text, progress:0..1}` (сбор, ремонт, расчистка).
- `g.cameraRig.yaw` — курс камеры для компаса (`0` = взгляд на юг/+z, растёт против часовой стрелки при взгляде сверху; направление взгляда `(sin yaw, cos yaw)`).
- `g.markers()` → `[{id, kind:'city'|'poi'|'quest'|'caravan'|'ambush'|'obstacle', x, z, label, discovered}]` — для компаса и карты.
- `g.labels()` → массив мировых подписей рядом с героем: `[{id, x, y, z, text, sub, kind:'npc'|'mob'|'node'|'chest'|'corpse'|'wagon'|'obstacle', hp:0..1|null, hostile, level, dist, targeted}]` (массив и объекты переиспользуются между кадрами); `g.project(x, y, z, out)` → `out = {x, y, visible}` в CSS-пикселях.
- `g.caravanRun.active()`, `g.caravanRun.hud()` → `null | {legName, progress:0..1, hp, maxHp, status, cargoLeft, cargoTotal, guards:[{name, hp, maxHp, alive}], distance /*до телеги, м*/}`.
- `g.travelTo(cityKey)` — перевозка между открытыми городами (вызывает экран конюха).

**События шины для UI:** `toast {text, kind}` · `log {text}` · `bark {id, name, text, x, y, z}` · `zone:entered {title, sub, kind}` · `world:discovered {id, name}` · `map:revealed` · `player:xp {amount}` · `player:levelup {level}` · `coins:changed` · `inv:changed` · `equip:changed` · `quest:started|updated|completed {id}` · `caravan:*` · `rep:changed` · `hero:damaged {amount, crit}` · `hero:died {reason}` · `hero:respawned` · `loot:gained {coins, items:{id:n}, source}` · `game:loading` · `game:started` · `settings:changed {key, value}` · `ui:open {screen, params}` (движок или диалог просит открыть экран: `dialogue {npcId}`, `shop {cityKey, role}`, `trade {cityKey}`, `craft {profession?}`, `train {cityKey, role}`, `caravan`, `storage`, `board {cityKey}`, `bounties {cityKey}`, `stable {cityKey}`, `guards {cityKey}`, `rest {cityKey}`) · `ui:close`.

**Каркас UI (`src/ui/ui.js`):** менеджер экранов `ui.registerScreen({id, title, action?, tab?:{order, icon}, pauses:true, create(g, ui) → {el, onOpen?(params), onClose?(), update?(dt)}})`, `ui.open(id, params)`, `ui.close()`, `ui.toggle(id)`, `ui.isOpen(id?)`; экраны с `tab` образуют главное меню (вкладки сверху, как в TESO). Общие компоненты — `src/ui/kit.js` (`el(tag, props, children)`, списки, вкладки, тултипы, слот предмета, кнопки, модальное подтверждение, полосы) и `src/ui/icons.js` (`icon(key)` → SVG для словаря иконок предметов и служебных глифов).
