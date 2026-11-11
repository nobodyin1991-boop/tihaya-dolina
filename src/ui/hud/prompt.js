// HUD: interaction prompt and channel bar (lower centre).
// Consumes: g.prompt {key, text, sub?}, g.interaction.channel {text, progress}.
import { el, setText, setClass } from '../kit.js';

export function createPrompt(g, ui, layer) {
  const key = el('span.key.prompt-key');
  const text = el('span.prompt-text');
  const sub = el('div.prompt-sub');
  const prompt = el('div.prompt', null, [el('div.prompt-main', null, [key, text]), sub]);
  const channelText = el('div.channel-text');
  const channelFill = el('i.channel-fill');
  const channel = el('div.channel', null, [channelText, el('div.channel-track', null, channelFill)]);
  layer.append(el('div.prompt-zone', null, [channel, prompt]));

  let lastProgress = -1;

  function update() {
    const ch = g.interaction ? g.interaction.channel : null;
    setClass(channel, 'show', !!ch);
    if (ch) {
      setText(channelText, ch.text || '');
      const progress = Math.round(Math.max(0, Math.min(1, ch.progress || 0)) * 400) / 400;
      if (progress !== lastProgress) {
        lastProgress = progress;
        channelFill.style.transform = `scaleX(${progress})`;
      }
    }
    const p = ch ? null : g.prompt;
    setClass(prompt, 'show', !!p);
    if (p) {
      const caption = (p.key && g.input.caption(p.key)) || p.key || g.input.caption('interact');
      setText(key, caption);
      setText(text, p.text || '');
      setText(sub, p.sub || '');
    }
  }

  return { update };
}
