import sharp from 'sharp';
import { existsSync } from 'node:fs';

// Generated PNG is committed; this design helper is not required during deployment.
const sans = process.env.VOTE_SHARE_SANS_FONT || 'C:/Windows/Fonts/malgun.ttf';
const serif = process.env.VOTE_SHARE_SERIF_FONT || 'C:/Windows/Fonts/batang.ttc';
if (!existsSync(sans) || !existsSync(serif)) throw new Error('Set VOTE_SHARE_SANS_FONT and VOTE_SHARE_SERIF_FONT to installed Korean font files.');
const background = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#f6f1e8"/>
  <rect x="38" y="38" width="1124" height="554" rx="4" fill="none" stroke="#ddd0bb"/>
  <path d="M85 127H1115" stroke="#ddd0bb"/>
  <circle cx="1104" cy="90" r="5" fill="#a44e38"/>
  <g transform="translate(750 265) rotate(-7 170 90)">
    <rect x="5" y="13" width="330" height="210" rx="6" fill="#6e4d2e" opacity=".09"/>
    <rect width="330" height="210" rx="5" fill="#d4b792"/>
    <g transform="rotate(3 165 0)"><rect x="16" y="-79" width="298" height="240" fill="#fffaf0" stroke="#e4d7c2"/>
      <path d="M66-44H246M99-30H213" stroke="#d7c5a9" stroke-width="2"/>
      <path d="M83 0H236M68 16H253M96 32H225" stroke="#c9b18e" stroke-width="2"/>
    </g>
    <path d="M0 0 165 106 330 0V210H0Z" fill="#e4cfb2"/>
    <path d="M0 210 165 90 330 210Z" fill="#ead7bb"/>
    <circle cx="165" cy="111" r="31" fill="#a44e38" stroke="#c58059" stroke-width="4"/>
    <path d="m165 96 5 10 10 5-10 5-5 10-5-10-10-5 10-5Z" fill="#f4e4c9"/>
  </g>
</svg>`);
async function label(text, size, color, left, top, useSerif = false) {
  return { input: await sharp({text:{text:`<span foreground="${color}">${text}</span>`,font:`${useSerif ? 'Batang' : 'Malgun Gothic'} ${size}`,fontfile:useSerif ? serif : sans,rgba:true}}).png().toBuffer(),left,top };
}
await sharp(background).composite(await Promise.all([
  label('진단 회식 초대장',26,'#8c7659',85,77),
  label('안건은 회식.',65,'#39352d',85,170,true),
  label('진짜 이유는,',65,'#39352d',85,262,true),
  label('보고 싶어서.',65,'#a44e38',85,354,true),
  label('2026년 11월 · 11월 6일까지 답장해 주세요.',23,'#927d60',85,518),
  label('당신의 자리를 비워뒀어요.',22,'#927d60',755,518),
])).png().toFile('public/vote/share-invitation-v1.png');
console.log('Created 1200×630 invitation share image.');
