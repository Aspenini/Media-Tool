export interface BuiltinIcon {
  id: string;
  label: string;
  svg: string;
}

function svg(body: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">${body}</svg>`;
}

export const BUILTIN_ICONS: BuiltinIcon[] = [
  {
    id: "star",
    label: "Star",
    svg: svg(`
      <defs>
        <radialGradient id="sg" cx="35%" cy="30%">
          <stop offset="0%" stop-color="#fff6c2"/>
          <stop offset="45%" stop-color="#ffd24a"/>
          <stop offset="100%" stop-color="#e08a12"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="56" rx="16" ry="4" fill="#000" opacity=".22"/>
      <path fill="url(#sg)" stroke="#8a4b00" stroke-width="1.5" stroke-linejoin="round"
        d="M32 6l7.2 14.8 16.3 2.4-11.8 11.5 2.8 16.2L32 43.2 17.5 51l2.8-16.2L8.5 23.2l16.3-2.4z"/>
      <path fill="#fff" opacity=".55" d="M32 12l3.2 7.2 2-8.6z"/>
    `),
  },
  {
    id: "coin",
    label: "Coin",
    svg: svg(`
      <defs>
        <radialGradient id="cg" cx="35%" cy="30%">
          <stop offset="0%" stop-color="#fff3a8"/>
          <stop offset="60%" stop-color="#ffcc33"/>
          <stop offset="100%" stop-color="#c47a00"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="56" rx="14" ry="3.5" fill="#000" opacity=".2"/>
      <ellipse cx="32" cy="32" rx="20" ry="20" fill="url(#cg)" stroke="#8a4b00" stroke-width="2"/>
      <ellipse cx="32" cy="32" rx="13" ry="13" fill="none" stroke="#fff2a0" stroke-width="2.2"/>
      <path d="M30 22h5c3 0 5 2.2 5 5.2 0 2.4-1.4 4-3.6 4.8L41 42h-6.2l-4-9.2H30V42h-5V22h5zm0 6.2h2.4c1.3 0 2.1-.7 2.1-1.8S33.7 24.7 32.4 24.7H30z" fill="#8a4b00"/>
    `),
  },
  {
    id: "heart",
    label: "Heart",
    svg: svg(`
      <defs>
        <radialGradient id="hg" cx="35%" cy="30%">
          <stop offset="0%" stop-color="#ffd0d8"/>
          <stop offset="50%" stop-color="#ff4d6d"/>
          <stop offset="100%" stop-color="#b0123a"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="56" rx="14" ry="3.5" fill="#000" opacity=".2"/>
      <path fill="url(#hg)" stroke="#7a102c" stroke-width="1.6"
        d="M32 50s-18-11.4-18-23.2C14 18 20.2 13 26.4 13c3.8 0 5.6 1.8 5.6 1.8S34 13 37.8 13C44 13 50 18 50 26.8 50 38.6 32 50 32 50z"/>
      <ellipse cx="24" cy="24" rx="5" ry="3.2" fill="#fff" opacity=".5" transform="rotate(-20 24 24)"/>
    `),
  },
  {
    id: "spark",
    label: "Spark",
    svg: svg(`
      <defs>
        <radialGradient id="spg" cx="40%" cy="30%">
          <stop offset="0%" stop-color="#fff7d2"/>
          <stop offset="55%" stop-color="#ffd56a"/>
          <stop offset="100%" stop-color="#f08a1a"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="14" ry="3.2" fill="#000" opacity=".2"/>
      <path fill="url(#spg)" stroke="#9a4e00" stroke-width="1.4" stroke-linejoin="round"
        d="M32 5l5 13 14-2-9 11 12 8-15 1 1 15-8-12-8 12 1-15-15-1 12-8-9-11 14 2z"/>
      <circle cx="32" cy="30" r="8.5" fill="#ffe9a0"/>
      <circle cx="29" cy="28.5" r="1.5" fill="#3a2208"/>
      <circle cx="35.5" cy="28.5" r="1.5" fill="#3a2208"/>
      <path d="M29 33.2c2 2 4.8 2 7 0" fill="none" stroke="#3a2208" stroke-width="1.3" stroke-linecap="round"/>
    `),
  },
  {
    id: "shroom",
    label: "Shroom",
    svg: svg(`
      <defs>
        <radialGradient id="mg" cx="40%" cy="25%">
          <stop offset="0%" stop-color="#ff8a8a"/>
          <stop offset="70%" stop-color="#e12626"/>
          <stop offset="100%" stop-color="#8e0d0d"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="13" ry="3" fill="#000" opacity=".2"/>
      <ellipse cx="32" cy="46" rx="10" ry="11" fill="#f3e2c8" stroke="#7a5a38" stroke-width="1.3"/>
      <path fill="url(#mg)" stroke="#7a1010" stroke-width="1.4"
        d="M12 34c0-13 9-24 20-24s20 11 20 24c0 4-8 6-20 6S12 38 12 34z"/>
      <circle cx="22" cy="28" r="4.2" fill="#fff"/>
      <circle cx="34" cy="22" r="3.4" fill="#fff"/>
      <circle cx="44" cy="30" r="3.6" fill="#fff"/>
      <ellipse cx="28.5" cy="45" rx="1.3" ry="1.7" fill="#3a2208"/>
      <ellipse cx="35.5" cy="45" rx="1.3" ry="1.7" fill="#3a2208"/>
      <path d="M28 49c2 1.6 6 1.6 8 0" fill="none" stroke="#3a2208" stroke-width="1.1" stroke-linecap="round"/>
    `),
  },
  {
    id: "fire",
    label: "Fire",
    svg: svg(`
      <defs>
        <linearGradient id="fg" x1="50%" y1="0%" x2="50%" y2="100%">
          <stop offset="0%" stop-color="#fff3a0"/>
          <stop offset="40%" stop-color="#ff9a1f"/>
          <stop offset="100%" stop-color="#e22b00"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#fg)" stroke="#8a1800" stroke-width="1.3"
        d="M32 8s4 10-2 16c8-2 14 6 14 16 0 10-7 18-16 18s-16-8-16-18c0-9 6-14 10-20 0 6 4 8 6 8 0-8 4-14 4-20z"/>
      <path fill="#fff2b0" d="M32 34c-2 3-1 8 2 10-6 0-9-6-8-12 3 1 5 1 6 2z"/>
    `),
  },
  {
    id: "bolt",
    label: "Bolt",
    svg: svg(`
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff7a8"/>
          <stop offset="55%" stop-color="#ffe14a"/>
          <stop offset="100%" stop-color="#f0a000"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#bg)" stroke="#8a5a00" stroke-width="1.5" stroke-linejoin="round"
        d="M38 6L16 34h14l-6 24 26-32H36z"/>
    `),
  },
  {
    id: "gem",
    label: "Gem",
    svg: svg(`
      <defs>
        <linearGradient id="gg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#e7d6ff"/>
          <stop offset="45%" stop-color="#b46bff"/>
          <stop offset="100%" stop-color="#5b1aa8"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#gg)" stroke="#3b0d70" stroke-width="1.5" stroke-linejoin="round"
        d="M32 8l16 16-16 32L16 24z"/>
      <path fill="#fff" opacity=".45" d="M32 12l8 12h-8z"/>
      <path fill="#4a1480" opacity=".35" d="M32 24h16L32 56z"/>
    `),
  },
  {
    id: "moon",
    label: "Moon",
    svg: svg(`
      <defs>
        <radialGradient id="lg" cx="40%" cy="30%">
          <stop offset="0%" stop-color="#fff6d2"/>
          <stop offset="70%" stop-color="#f0d48a"/>
          <stop offset="100%" stop-color="#c9a04a"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="13" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#lg)" stroke="#8a6a20" stroke-width="1.4"
        d="M40 12a20 20 0 1 0 8 28 16 16 0 1 1-8-28z"/>
    `),
  },
  {
    id: "planet",
    label: "Planet",
    svg: svg(`
      <defs>
        <radialGradient id="pg" cx="35%" cy="30%">
          <stop offset="0%" stop-color="#9be7ff"/>
          <stop offset="55%" stop-color="#2f7bff"/>
          <stop offset="100%" stop-color="#163a9a"/>
        </radialGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="14" ry="3" fill="#000" opacity=".2"/>
      <circle cx="32" cy="32" r="16" fill="url(#pg)" stroke="#102860" stroke-width="1.4"/>
      <ellipse cx="32" cy="32" rx="24" ry="6" fill="none" stroke="#ffd36a" stroke-width="3" transform="rotate(-18 32 32)"/>
      <ellipse cx="32" cy="32" rx="24" ry="6" fill="none" stroke="#fff" stroke-width="1" opacity=".4" transform="rotate(-18 32 32)"/>
      <circle cx="26" cy="26" r="3" fill="#fff" opacity=".35"/>
    `),
  },
  {
    id: "leaf",
    label: "Leaf",
    svg: svg(`
      <defs>
        <linearGradient id="ng" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#d8ff9a"/>
          <stop offset="55%" stop-color="#5dcc3a"/>
          <stop offset="100%" stop-color="#1f7a18"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#ng)" stroke="#145014" stroke-width="1.4"
        d="M12 44c18-28 34-30 40-30-2 22-14 36-40 36 6-8 8-14 0-6z"/>
      <path d="M18 42c12-10 22-22 30-28" fill="none" stroke="#145014" stroke-width="1.4"/>
    `),
  },
  {
    id: "boom",
    label: "Boom",
    svg: svg(`
      <ellipse cx="32" cy="57" rx="13" ry="3" fill="#000" opacity=".2"/>
      <path fill="#ffb020" stroke="#8a3a00" stroke-width="1.3" stroke-linejoin="round"
        d="M32 6l6 12 14-4-4 14 12 6-14 4 4 14-14-6-6 12-4-14-14 4 6-14-12-6 14-4z"/>
      <path fill="#ffef8a" d="M32 18l3.5 7 8-2-2.5 8 7 3.5-8 2 2 8-7-3.5-3.5 7-2.5-8-8 2 3.5-8-7-3.5 8-2z"/>
    `),
  },
  {
    id: "skull",
    label: "Skull",
    svg: svg(`
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="#f2efe6" stroke="#3a3a3a" stroke-width="1.4"
        d="M16 28c0-10 7-18 16-18s16 8 16 18c0 6-3 10-6 12v8H22v-8c-3-2-6-6-6-12z"/>
      <ellipse cx="25.5" cy="30" rx="4.2" ry="5" fill="#1c1c1c"/>
      <ellipse cx="38.5" cy="30" rx="4.2" ry="5" fill="#1c1c1c"/>
      <path d="M32 36l3 6h-6z" fill="#1c1c1c"/>
      <path d="M24 48h3v3h-3zm5 0h3v3h-3zm5 0h3v3h-3z" fill="#1c1c1c"/>
    `),
  },
  {
    id: "crown",
    label: "Crown",
    svg: svg(`
      <defs>
        <linearGradient id="kg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#fff3a8"/>
          <stop offset="50%" stop-color="#ffd24a"/>
          <stop offset="100%" stop-color="#c47a00"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="14" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#kg)" stroke="#8a4b00" stroke-width="1.5" stroke-linejoin="round"
        d="M10 44l6-22 10 12 6-18 6 18 10-12 6 22z"/>
      <rect x="10" y="44" width="44" height="8" rx="2" fill="url(#kg)" stroke="#8a4b00" stroke-width="1.5"/>
      <circle cx="16" cy="22" r="3.2" fill="#ff5b7a"/>
      <circle cx="32" cy="14" r="3.6" fill="#5b8cff"/>
      <circle cx="48" cy="22" r="3.2" fill="#3ad07a"/>
    `),
  },
  {
    id: "flower",
    label: "Flower",
    svg: svg(`
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <g fill="#ff5a4a" stroke="#8a1810" stroke-width="1.1">
        <circle cx="32" cy="18" r="8"/>
        <circle cx="18" cy="28" r="8"/>
        <circle cx="46" cy="28" r="8"/>
        <circle cx="22" cy="44" r="8"/>
        <circle cx="42" cy="44" r="8"/>
      </g>
      <circle cx="32" cy="32" r="8" fill="#ffe14a" stroke="#8a5a00" stroke-width="1.3"/>
      <circle cx="32" cy="32" r="3.2" fill="#c47a00"/>
    `),
  },
  {
    id: "ice",
    label: "Ice",
    svg: svg(`
      <defs>
        <linearGradient id="ig" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="55%" stop-color="#9fe8ff"/>
          <stop offset="100%" stop-color="#2f8ad8"/>
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="57" rx="12" ry="3" fill="#000" opacity=".2"/>
      <path fill="url(#ig)" stroke="#1a5a90" stroke-width="1.4" stroke-linejoin="round"
        d="M32 6l8 14 16 2-8 14 4 16-20-8-20 8 4-16-8-14 16-2z"/>
      <path fill="#fff" opacity=".5" d="M32 12l4 8 2-10z"/>
    `),
  },
];

/** Rasterize an inline SVG into a decoded image the canvas can draw synchronously. */
export async function loadSvgImage(svg: string): Promise<{ src: string; image: HTMLImageElement }> {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.decoding = "async";
  image.src = src;
  await image.decode();
  return { src, image };
}
