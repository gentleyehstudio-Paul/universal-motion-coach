// Collectible "台灣蛙類圖鑑卡" artwork, drawn from code. Card text lives in config/game.json.
import { drawFrogSide, fr } from './art.js';

const W = 300, H = 420;
const FONT = 'system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';

function rrect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

function wrap(c, text, x, y, maxW, lh) {
  let line = '', yy = y;
  for (const ch of text) {
    const t = line + ch;
    if (c.measureText(t).width > maxW && line) { c.fillText(line, x, yy); line = ch; yy += lh; } else line = t;
  }
  if (line) c.fillText(line, x, yy);
  return yy;
}

export function drawCard(card, { locked = false, total = 2, lockHint = '' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = W * 2; cv.height = H * 2;
  const c = cv.getContext('2d');
  c.scale(2, 2);
  const gold = card.rarity === 'SR';
  const edge = gold ? ['#ffe27a', '#d9962b'] : ['#bfe9ff', '#5aa6d6'];

  // frame
  const g = c.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, edge[0]); g.addColorStop(1, edge[1]);
  rrect(c, 0, 0, W, H, 18); c.fillStyle = g; c.fill();
  rrect(c, 6, 6, W - 12, H - 12, 13); c.fillStyle = '#fbf6e8'; c.fill();

  // header
  c.fillStyle = '#3b3a35'; c.font = `800 13px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'middle';
  c.fillText(`No.${String(card.no).padStart(2, '0')}`, 20, 26);
  c.textAlign = 'right';
  rrect(c, W - 56, 14, 38, 20, 10); c.fillStyle = gold ? '#d9962b' : '#4d93c7'; c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.font = `900 12px ${FONT}`;
  c.fillText(card.rarity, W - 37, 25);

  // art window
  c.save();
  rrect(c, 16, 44, W - 32, 190, 10); c.clip();
  const ag = c.createLinearGradient(0, 44, 0, 234);
  ag.addColorStop(0, locked ? '#2b2f3a' : card.bg[0]); ag.addColorStop(1, locked ? '#454b5a' : card.bg[1]);
  c.fillStyle = ag; c.fillRect(16, 44, W - 32, 190);
  if (!locked) {
    // leaves
    for (let i = 0; i < 14; i++) {
      const x = 16 + ((i * 53) % (W - 32)), y = 44 + ((i * 37) % 120);
      c.save(); c.translate(x, y); c.rotate(((i * 37) % 90) * Math.PI / 180);
      c.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.04})`; c.beginPath(); c.ellipse(0, 0, 22, 8, 0, 0, Math.PI * 2); c.fill(); c.restore();
    }
    // branch
    fr(c, 16, 190, W - 32, 14, '#6b4a2f'); fr(c, 16, 190, W - 32, 3, '#8a6240');
    fr(c, 200, 176, 60, 8, '#6b4a2f'); fr(c, 250, 160, 14, 20, '#4b9a3d'); fr(c, 262, 150, 10, 14, '#58a850');
    c.imageSmoothingEnabled = false;
    drawFrogSide(c, 142, 192, 5, { palette: { g: card.colors[0], g2: card.colors[1], g3: card.colors[0], b: card.colors[2] } });
    // sparkles
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (const [sx, sy] of [[48, 70], [250, 86], [212, 60], [76, 150]]) { c.fillRect(sx, sy - 4, 2, 10); c.fillRect(sx - 4, sy, 10, 2); }
  } else {
    drawFrogSide(c, 142, 192, 5, { palette: { g: '#161922', g2: '#161922', g3: '#161922', b: '#161922' } });
    c.fillStyle = '#9aa3b8'; c.font = `900 42px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('?', W / 2, 110);
  }
  c.restore();
  c.strokeStyle = 'rgba(0,0,0,0.25)'; c.lineWidth = 2; rrect(c, 16, 44, W - 32, 190, 10); c.stroke();

  // text
  c.textAlign = 'left'; c.textBaseline = 'alphabetic';
  if (locked) {
    c.fillStyle = '#3b3a35'; c.font = `900 22px ${FONT}`; c.fillText('？？？', 20, 268);
    c.fillStyle = '#7a7568'; c.font = `500 13px ${FONT}`;
    wrap(c, lockHint || '完成關卡即可解鎖這張圖鑑卡。', 20, 298, W - 40, 20);
  } else {
    c.fillStyle = '#26241f'; c.font = `900 26px ${FONT}`; c.fillText(card.name, 20, 270);
    c.fillStyle = '#6a6558'; c.font = `italic 500 12px ${FONT}`; c.fillText(card.sci, 20, 290);
    c.font = `800 11px ${FONT}`;
    const tw = c.measureText(card.tag).width + 16;
    rrect(c, W - 20 - tw, 252, tw, 22, 11); c.fillStyle = '#2f9e4a'; c.fill();
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(card.tag, W - 20 - tw / 2, 267);
    c.textAlign = 'left'; c.fillStyle = '#4a463b'; c.font = `500 12.5px ${FONT}`;
    wrap(c, card.fact, 20, 316, W - 40, 18);
  }
  c.fillStyle = '#9a9484'; c.font = `700 10px ${FONT}`; c.textAlign = 'center';
  c.fillText(`樹蛙進城 ・ 台灣蛙類圖鑑  ${card.no} / ${total}`, W / 2, H - 16);
  return cv;
}
