// HUD: world nameplates and speech bubbles, projected from world space with g.project.
// Consumes: g.labels() [{id,x,y,z,text,sub,kind,hp,hostile,level,dist,targeted}], g.project(x,y,z,out), event bark {id,name,text,x,y,z}.
import { on } from '../../core/events.js';
import { el, setText, setClass } from '../kit.js';
import { difficultyClass } from '../markers.js';

/** Distance (m) at which a label of each kind starts to appear. */
const RANGE = { npc: 22, mob: 30, node: 11, chest: 12, corpse: 9, wagon: 40, obstacle: 26 };
const SUB_RANGE = 9;
const MAX_LABELS = 40;
const BARK_SECONDS = 4.5;
const MAX_BARKS = 4;

export function createLabels(g, ui, layer) {
  const box = el('div.labels');
  const barkBox = el('div.barks');
  layer.append(box, barkBox);

  const out = { x: 0, y: 0, visible: false };
  const nodes = new Map();
  const free = [];
  let stamp = 0;

  function acquire(id) {
    let node = free.pop();
    if (!node) {
      const level = el('span.label-level.t-num');
      const text = el('span.label-text');
      const sub = el('div.label-sub');
      const hpFill = el('i');
      const hp = el('div.label-hp', null, hpFill);
      node = el('div.label', null, [el('div.label-name', null, [level, text]), sub, hp]);
      Object.assign(node, { level, text, sub, hp, hpFill });
      box.append(node);
    }
    node.hidden = false;
    node._kind = '';
    node._x = NaN;
    node._y = NaN;
    node._o = -1;
    node._hp = -1;
    node._lvl = '';
    nodes.set(id, node);
    return node;
  }

  function place(node, x, y) {
    const px = Math.round(x);
    const py = Math.round(y);
    if (node._x !== px || node._y !== py) {
      node._x = px;
      node._y = py;
      node.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -100%)`;
    }
  }

  function updateLabel(label, heroLevel) {
    const range = RANGE[label.kind] || 14;
    const dist = label.dist || 0;
    if (dist > range && !label.targeted) return;
    g.project(label.x, label.y, label.z, out);
    if (!out.visible) return;
    const node = nodes.get(label.id) || acquire(label.id);
    node._stamp = stamp;
    place(node, out.x, out.y);

    if (node._kind !== label.kind) {
      node._kind = label.kind;
      node.className = `label k-${label.kind}`;
      node._c_hostile = undefined;
      node._c_targeted = undefined;
      node._c_hurt = undefined;
    }
    setClass(node, 'hostile', !!label.hostile);
    setClass(node, 'targeted', !!label.targeted);
    setText(node.text, label.text || '');
    const showSub = !!label.sub && (dist < SUB_RANGE || label.targeted);
    setText(node.sub, showSub ? label.sub : '');
    const showLevel = label.kind === 'mob' && label.level;
    setText(node.level, showLevel ? label.level : '');
    if (showLevel) {
      const cls = difficultyClass(label.level, heroLevel);
      if (node._lvl !== cls) {
        node._lvl = cls;
        node.level.className = `label-level t-num ${cls}`;
      }
    }
    const hurt = label.hp !== null && label.hp !== undefined && (label.hp < 0.999 || label.targeted) && label.kind !== 'node';
    setClass(node, 'hurt', hurt);
    if (hurt) {
      const hp = Math.round(Math.max(0, Math.min(1, label.hp)) * 50) / 50;
      if (node._hp !== hp) {
        node._hp = hp;
        node.hpFill.style.transform = `scaleX(${hp})`;
      }
    }
    const fade = label.targeted ? 1 : Math.max(0, Math.min(1, (range - dist) / (range * 0.3)));
    const opacity = Math.round(fade * 10) / 10;
    if (node._o !== opacity) {
      node._o = opacity;
      node.style.opacity = String(opacity);
    }
  }

  // —— barks ——
  const barks = [];

  on('bark', payload => {
    if (!payload || !payload.text) return;
    const existing = barks.findIndex(b => b.id === payload.id);
    if (existing >= 0) removeBark(existing);
    while (barks.length >= MAX_BARKS) removeBark(0);
    const node = el('div.bark', null, [
      payload.name ? el('div.bark-name', { text: payload.name }) : null,
      el('div.bark-text', { text: payload.text }),
    ]);
    barkBox.append(node);
    const seconds = Math.max(BARK_SECONDS, Math.min(9, payload.text.length * 0.07));
    barks.push({ id: payload.id, x: payload.x, y: payload.y, z: payload.z, t: seconds, node, px: NaN, py: NaN });
  });

  function removeBark(index) {
    const bark = barks[index];
    barks.splice(index, 1);
    bark.node.classList.add('out');
    setTimeout(() => bark.node.remove(), 300);
  }

  function updateBarks(dt) {
    const list = barks.length ? g.labels() || [] : null;
    for (let i = barks.length - 1; i >= 0; i--) {
      const bark = barks[i];
      bark.t -= dt;
      if (bark.t <= 0) {
        removeBark(i);
        continue;
      }
      // follow the speaker when it is among the labels
      for (let k = 0; k < list.length; k++) {
        if (list[k].id === bark.id) {
          bark.x = list[k].x;
          bark.y = list[k].y;
          bark.z = list[k].z;
          break;
        }
      }
      g.project(bark.x, bark.y + 0.35, bark.z, out);
      setClass(bark.node, 'offscreen', !out.visible);
      if (!out.visible) continue;
      const px = Math.round(out.x);
      const py = Math.round(out.y);
      if (px !== bark.px || py !== bark.py) {
        bark.px = px;
        bark.py = py;
        bark.node.style.transform = `translate3d(${px}px, ${py}px, 0) translate(-50%, -100%)`;
      }
    }
  }

  function update(dt) {
    stamp++;
    const list = g.labels() || [];
    const heroLevel = g.hero.level || 1;
    const count = Math.min(list.length, MAX_LABELS);
    for (let i = 0; i < count; i++) updateLabel(list[i], heroLevel);
    for (const [id, node] of nodes) {
      if (node._stamp !== stamp) {
        node.hidden = true;
        nodes.delete(id);
        free.push(node);
      }
    }
    updateBarks(dt);
  }

  return { update };
}
