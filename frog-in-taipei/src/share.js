// Builds the shareable result picture (1080 x 1920, IG story / Threads / LINE friendly).
import { drawFrogSide, fr } from './art.js';

const FONT = 'system-ui, "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif';
const S = 1080, T = 1920;

export function makeShareImage({ score, title, subtitle, lines = [], url, cardName }) {
  const cv = document.createElement('canvas');
  cv.width = S; cv.height = T;
  const c = cv.getContext('2d');

  const g = c.createLinearGradient(0, 0, 0, T);
  g.addColorStop(0, '#123c33'); g.addColorStop(0.55, '#2f8a58'); g.addColorStop(1, '#16221f');
  c.fillStyle = g; c.fillRect(0, 0, S, T);

  // road strip with lane dashes and a few scooters / cars (pixel blocks)
  c.fillStyle = '#4a4f5c'; c.fillRect(0, 1320, S, 420);
  c.fillStyle = '#e9e6d8';
  for (let x = 20; x < S; x += 120) c.fillRect(x, 1528, 70, 8);
  c.fillStyle = '#f7c51e'; c.fillRect(120, 1380, 260, 110); c.fillStyle = '#ffd84a'; c.fillRect(170, 1395, 120, 80); c.fillStyle = '#2b3a55'; c.fillRect(300, 1395, 40, 80);
  c.fillStyle = '#4d94d8'; c.fillRect(520, 1580, 420, 120); c.fillStyle = '#d9ecf8'; c.fillRect(550, 1595, 320, 90);
  c.fillStyle = '#8c5be0'; c.beginPath(); c.arc(700, 1400, 30, 0, 7); c.fill(); c.fillStyle = '#3b4ac8'; c.fillRect(655, 1380, 60, 40); c.fillStyle = '#f6c8a0'; c.fillRect(600, 1375, 55, 50);

  c.textAlign = 'center'; c.textBaseline = 'alphabetic';
  c.fillStyle = '#fff'; c.font = `900 150px ${FONT}`;
  c.lineJoin = 'round'; c.lineWidth = 18; c.strokeStyle = '#123c33';
  c.strokeText('樹蛙進城', S / 2, 230); c.fillText('樹蛙進城', S / 2, 230);
  c.font = `800 50px ${FONT}`; c.fillStyle = '#c9f5d6'; c.fillText('Frog in Taipei', S / 2, 305);

  c.imageSmoothingEnabled = false;
  drawFrogSide(c, 470, 780, 24);
  // little helmet pedestal
  c.fillStyle = '#8c5be0'; c.beginPath(); c.ellipse(560, 800, 190, 52, 0, 0, 7); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(620, 770, 60, 16);

  c.fillStyle = 'rgba(0,0,0,0.38)'; roundRect(c, 90, 880, S - 180, 390, 44); c.fill();
  c.fillStyle = '#fff'; c.font = `800 52px ${FONT}`; c.fillText(title, S / 2, 962);
  c.fillStyle = '#ffe25a'; c.font = `900 190px ${FONT}`;
  const sw = c.measureText(String(score)).width;
  c.fillText(String(score), S / 2 - 24, 1130);
  c.fillStyle = '#c9f5d6'; c.font = `700 48px ${FONT}`; c.textAlign = 'left'; c.fillText('分', S / 2 - 24 + sw / 2 + 10, 1130); c.textAlign = 'center';
  c.fillStyle = '#fff'; c.font = `600 44px ${FONT}`;
  lines.slice(0, 2).forEach((t, i) => c.fillText(t, S / 2, 1195 + i * 56));

  if (cardName) {
    c.fillStyle = '#ffe25a'; roundRect(c, 250, 1760, S - 500, 74, 37); c.fill();
    c.fillStyle = '#26241f'; c.font = `900 40px ${FONT}`; c.fillText(`解鎖圖鑑卡・${cardName}`, S / 2, 1810);
  }
  c.fillStyle = '#fff'; c.font = `800 50px ${FONT}`; c.fillText('你也來挑戰！', S / 2, 1700 - (cardName ? 0 : 0));
  c.fillStyle = '#c9f5d6'; c.font = `700 42px ${FONT}`; c.fillText(url, S / 2, cardName ? 1880 : 1790);
  return cv;
}

function roundRect(c, x, y, w, h, r) {
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

export async function shareCanvas(cv, { text, filename = 'frog-in-taipei.png' }) {
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  const file = new File([blob], filename, { type: 'image/png' });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return 'cancelled';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return 'downloaded';
}
