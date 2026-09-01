/**
 * Which files off a phone this page can actually open.
 *
 * The measure page exists to be handed a photograph someone just took, and a
 * phone is careless with what it hands over: a clip copied over USB arrives
 * with no MIME type, an extension comes back upper case, and an iPhone still
 * shoots HEIC, which no Chromium build decodes. Each of those used to end at
 * the same unhelpful message, or at a loader that span until the watchdog
 * killed it, so each is pinned here.
 *
 *     node eval/phone_files.mjs
 */

import fs from 'fs';

const html = fs.readFileSync(
  new URL('../measure/index.html', import.meta.url), 'utf8');
const m = html.match(/function kindOf\(f\) \{[\s\S]*?\n\}/);
if (!m) { console.log('  kindOf not found'); process.exit(1); }
const kindOf = new Function('f', m[0] + '; return kindOf(f);');

// Every way a phone file has actually arrived: proper MIME, empty MIME after an
// MTP copy, uppercase extension, and the iPhone default nobody can decode.
const cases = [
  [{ name: '20260901_133557.mp4', type: 'video/mp4' },  'video'],
  [{ name: '20260901_133557.mp4', type: '' },           'video'],
  [{ name: 'IMG_4821.MOV',        type: '' },           'video'],
  [{ name: 'VID_20260901.3gp',    type: '' },           'video'],
  [{ name: 'clip.webm',           type: 'video/webm' }, 'video'],
  [{ name: 'stairs.jpg',          type: 'image/jpeg' }, 'image'],
  [{ name: 'STAIRS.JPG',          type: '' },           'image'],
  [{ name: 'shot.PNG',            type: '' },           'image'],
  [{ name: 'shot.webp',           type: 'image/webp' }, 'image'],
  [{ name: 'IMG_0001.HEIC',       type: '' },           'heic'],
  [{ name: 'IMG_0001.heic',       type: 'image/heic' }, 'heic'],
  [{ name: 'IMG_0001.jpg',        type: 'image/heif' }, 'heic'],
  [{ name: 'notes.pdf',           type: 'application/pdf' }, 'other'],
  [{ name: 'archive',             type: '' },           'other'],
];

let pass = 0;
for (const [f, want] of cases) {
  const got = kindOf(f);
  const ok = got === want;
  if (ok) pass++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${(f.name + ' [' + (f.type || 'no type') + ']').padEnd(38)} -> ${got}${ok ? '' : '  wanted ' + want}`);
}
console.log(`\n  ${pass} of ${cases.length} passed`);
process.exit(pass === cases.length ? 0 : 1);
