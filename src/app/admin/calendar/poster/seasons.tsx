import type { JSX } from 'react'

/**
 * （2026-09-18 に oominami-calendar の features/poster/seasons.tsx から無変更で移植）
 * ポスター（A4印刷）用の月別テーマ。
 * 各月の「ムード・風物詩」に合わせた配色と、ヘッダー帯に敷く風景SVG（Scene）を持つ。
 * Scene は viewBox="0 0 900 300" 前提で、上部に風物詩モチーフ・下部は淡色にフェードして
 * タイトル文字（濃色）が読めるようにしている。すべて自前SVG（外部アセット不要＝印刷安定）。
 */
export interface Season {
  month: number // 1-12
  kicker: string // 和名＋候（例「葉月 ・ 晩夏のころ」）
  phrase: string // その月のひとことムード
  page: { from: string; to: string } // ページ全体の背景グラデ
  band: { from: string; to: string } // ヘッダー帯の空グラデ（下は淡色）
  ink: string // タイトル文字色
  accent: string // 見出し・曜日帯・年月のアクセント
  weekdayBg: string // 曜日ヘッダー背景の淡色
  Scene: () => JSX.Element
}

/* ---------- 汎用モチーフ ---------- */

function Blossom({
  cx,
  cy,
  r,
  fill,
  center = '#ffd98a',
  rot = 0,
}: {
  cx: number
  cy: number
  r: number
  fill: string
  center?: string
  rot?: number
}) {
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx={0}
          cy={-r * 0.62}
          rx={r * 0.5}
          ry={r * 0.82}
          fill={fill}
          transform={`rotate(${a})`}
        />
      ))}
      <circle r={r * 0.32} fill={center} />
    </g>
  )
}

function Spark({ cx, cy, r, fill }: { cx: number; cy: number; r: number; fill: string }) {
  return (
    <path
      d={`M${cx} ${cy - r} L${cx + r * 0.22} ${cy - r * 0.22} L${cx + r} ${cy} L${cx + r * 0.22} ${cy + r * 0.22} L${cx} ${cy + r} L${cx - r * 0.22} ${cy + r * 0.22} L${cx - r} ${cy} L${cx - r * 0.22} ${cy - r * 0.22} Z`}
      fill={fill}
    />
  )
}

function Snowflake({ cx, cy, r, stroke }: { cx: number; cy: number; r: number; stroke: string }) {
  return (
    <g transform={`translate(${cx} ${cy})`} stroke={stroke} strokeWidth={2} strokeLinecap="round">
      {[0, 60, 120].map((a) => (
        <line key={a} x1={-r} y1={0} x2={r} y2={0} transform={`rotate(${a})`} />
      ))}
      {[0, 60, 120, 180, 240, 300].map((a) => (
        <g key={a} transform={`rotate(${a})`}>
          <line x1={r * 0.55} y1={0} x2={r * 0.78} y2={-r * 0.28} />
          <line x1={r * 0.55} y1={0} x2={r * 0.78} y2={r * 0.28} />
        </g>
      ))}
    </g>
  )
}

function MapleLeaf({
  cx,
  cy,
  s,
  fill,
  rot = 0,
}: {
  cx: number
  cy: number
  s: number
  fill: string
  rot?: number
}) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s}) rotate(${rot})`} fill={fill}>
      <path d="M0,-13 L3.4,-4.5 L11,-7 L6,1 L13,7 L4,6.2 L4.6,14 L0,8.5 L-4.6,14 L-4,6.2 L-13,7 L-6,1 L-11,-7 L-3.4,-4.5 Z" />
      <rect x={-0.7} y={7} width={1.4} height={7} fill={fill} />
    </g>
  )
}

function GinkgoLeaf({
  cx,
  cy,
  s,
  fill,
  rot = 0,
}: {
  cx: number
  cy: number
  s: number
  fill: string
  rot?: number
}) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s}) rotate(${rot})`} fill={fill}>
      <path d="M0,7 C-11,3 -9,-9 -1.5,-11 L0,-9.5 L1.5,-11 C9,-9 11,3 0,7 Z" />
      <line x1={0} y1={7} x2={0} y2={13} stroke={fill} strokeWidth={1.3} />
    </g>
  )
}

function Lantern({ cx, cy, s, fill }: { cx: number; cy: number; s: number; fill: string }) {
  return (
    <g transform={`translate(${cx} ${cy}) scale(${s})`}>
      <rect x={-4} y={-14} width={8} height={3} rx={1} fill="#5a4632" />
      <rect x={-4} y={11} width={8} height={3} rx={1} fill="#5a4632" />
      <path
        d="M-11,0 C-11,-9 11,-9 11,0 C11,9 -11,9 -11,0 Z"
        fill={fill}
        stroke="#8a1f1f"
        strokeWidth={1}
      />
      <line x1={-9} y1={-4.5} x2={9} y2={-4.5} stroke="#8a1f1f" strokeWidth={0.8} />
      <line x1={-9} y1={4.5} x2={9} y2={4.5} stroke="#8a1f1f" strokeWidth={0.8} />
    </g>
  )
}

function Cloud({ x, y, s, fill }: { x: number; y: number; s: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
      <ellipse cx={0} cy={0} rx={26} ry={11} />
      <ellipse cx={20} cy={-5} rx={18} ry={10} />
      <ellipse cx={-20} cy={-3} rx={16} ry={9} />
    </g>
  )
}

/* ---------- 各月のシーン ---------- */

// 1月 正月：初日の出・門松・松竹梅
function JanScene() {
  const komatsu = (x: number) => (
    <g transform={`translate(${x} 210)`}>
      <path d="M-16,60 L16,60 L12,10 L-12,10 Z" fill="#4a3b2a" />
      <rect x={-18} y={8} width={36} height={8} rx={2} fill="#b5852f" />
      {[-7, 0, 7].map((dx, i) => (
        <g key={dx}>
          <rect x={dx - 3} y={-40 - i * 6} width={6} height={54 + i * 6} rx={3} fill="#7fae55" />
          <path
            d={`M${dx - 3},${-40 - i * 6} L${dx + 3},${-40 - i * 6} L${dx},${-52 - i * 6} Z`}
            fill="#5f8f3f"
          />
        </g>
      ))}
    </g>
  )
  return (
    <g>
      <rect width={900} height={300} fill="url(#janSky)" />
      <circle cx={620} cy={120} r={72} fill="#f0503a" opacity={0.92} />
      <circle cx={620} cy={120} r={98} fill="#f8b24a" opacity={0.18} />
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${180 + i * 60},${70 + i * 22} q40,-16 90,0 q-30,10 -90,0`}
          fill="#f6cf7a"
          opacity={0.5}
        />
      ))}
      {komatsu(150)}
      {komatsu(760)}
      <Blossom cx={330} cy={90} r={17} fill="#f4a0b8" />
      <Blossom cx={390} cy={135} r={13} fill="#ffffff" center="#f6b73c" />
      <Blossom cx={300} cy={150} r={11} fill="#e8556f" />
      <rect y={210} width={900} height={90} fill="url(#janFade)" />
    </g>
  )
}

// 2月 節分・梅：紅白梅
function FebScene() {
  const branch = (x: number, y: number, flip: number) => (
    <g transform={`translate(${x} ${y}) scale(${flip} 1)`}>
      <path
        d="M0,120 C20,80 10,50 40,20 M40,20 C55,10 80,14 96,2 M20,70 C40,66 56,50 70,52"
        stroke="#6d5138"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      <Blossom cx={40} cy={20} r={13} fill="#e8556f" />
      <Blossom cx={96} cy={2} r={11} fill="#ffffff" center="#f2a83c" />
      <Blossom cx={70} cy={52} r={12} fill="#f8a9c0" />
      <Blossom cx={16} cy={78} r={10} fill="#ffffff" center="#f2a83c" />
    </g>
  )
  return (
    <g>
      <rect width={900} height={300} fill="url(#febSky)" />
      {branch(70, 60, 1)}
      {branch(830, 60, -1)}
      <Blossom cx={300} cy={70} r={9} fill="#f4a7bf" />
      <Blossom cx={520} cy={55} r={8} fill="#ffffff" center="#f2a83c" />
      <Blossom cx={620} cy={95} r={9} fill="#ef7d9a" />
      {/* 豆まきの豆 */}
      {[[360, 175], [430, 200], [500, 185], [560, 205]].map(([x, y], i) => (
        <ellipse key={i} cx={x} cy={y} rx={4.5} ry={3} fill="#d8a24a" opacity={0.8} />
      ))}
      <rect y={205} width={900} height={95} fill="url(#febFade)" />
    </g>
  )
}

// 3月 ひな祭り・桜：桃色と菱餅
function MarScene() {
  return (
    <g>
      <rect width={900} height={300} fill="url(#marSky)" />
      {/* 桜の枝 */}
      <path
        d="M-10,40 C120,60 180,20 320,44 M120,52 C150,30 190,26 210,8"
        stroke="#7a5a44"
        strokeWidth={4}
        fill="none"
        strokeLinecap="round"
      />
      {[[60, 46], [130, 40], [200, 26], [270, 44], [330, 34]].map(([x, y], i) => (
        <Blossom key={i} cx={x} cy={y} r={13 - (i % 2) * 2} fill="#f7b8ce" center="#f4d06a" />
      ))}
      {/* 雛人形（内裏雛） */}
      <g transform="translate(700 150)">
        <rect x={-70} y={44} width={150} height={16} rx={4} fill="#b23a3a" />
        <g transform="translate(-30 0)">
          <path d="M-22,44 C-22,4 22,4 22,44 Z" fill="#3b4a86" />
          <circle cx={0} cy={2} r={13} fill="#f4e3c8" />
          <path d="M-13,2 A13,13 0 0 1 13,2 Z" fill="#2b2b2b" />
        </g>
        <g transform="translate(30 0)">
          <path d="M-22,44 C-22,4 22,4 22,44 Z" fill="#d05a7a" />
          <circle cx={0} cy={2} r={13} fill="#f4e3c8" />
          <path d="M-13,2 A13,13 0 0 1 13,2 Z" fill="#2b2b2b" />
          <path d="M-3,-11 h6 v-9 h-6 Z" fill="#e6b83c" />
        </g>
      </g>
      {/* 菱餅 */}
      <g transform="translate(420 170)">
        {['#e58aa6', '#ffffff', '#a9cf7a'].map((c, i) => (
          <rect
            key={c}
            x={-26}
            y={i * 12}
            width={52}
            height={12}
            transform="skewX(-18)"
            fill={c}
            stroke="#cfa9b6"
            strokeWidth={0.6}
          />
        ))}
      </g>
      <Blossom cx={520} cy={70} r={9} fill="#f9c6d8" center="#f4d06a" />
      <Blossom cx={600} cy={50} r={8} fill="#f6aec6" center="#f4d06a" />
      <rect y={205} width={900} height={95} fill="url(#marFade)" />
    </g>
  )
}

// 4月 桜満開：花吹雪
function AprScene() {
  const petals = Array.from({ length: 26 }, (_, i) => ({
    x: (i * 137) % 900,
    y: (i * 61) % 190,
    r: 6 + (i % 3) * 2,
    rot: (i * 47) % 360,
  }))
  return (
    <g>
      <rect width={900} height={300} fill="url(#aprSky)" />
      {/* 桜の大枝 */}
      <path
        d="M-10,70 C160,110 260,40 470,70 C640,94 760,44 910,70"
        stroke="#835c46"
        strokeWidth={6}
        fill="none"
        strokeLinecap="round"
      />
      {Array.from({ length: 11 }, (_, i) => (
        <Blossom
          key={i}
          cx={40 + i * 82}
          cy={62 + ((i % 2) * 18 - 9)}
          r={15}
          fill="#f8bcd0"
          center="#f6d873"
        />
      ))}
      {petals.map((p, i) => (
        <ellipse
          key={i}
          cx={p.x}
          cy={p.y + 40}
          rx={p.r * 0.5}
          ry={p.r}
          fill="#f9cfdd"
          opacity={0.85}
          transform={`rotate(${p.rot} ${p.x} ${p.y + 40})`}
        />
      ))}
      <rect y={200} width={900} height={100} fill="url(#aprFade)" />
    </g>
  )
}

// 5月 こどもの日：鯉のぼり・新緑
function MayScene() {
  const koi = (x: number, y: number, fill: string, scale: number) => (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0,0 C40,-24 130,-24 175,0 C130,24 40,24 0,0 Z" fill={fill} />
      <path d="M0,0 L-30,-20 L-30,20 Z" fill={fill} opacity={0.85} />
      <circle cx={150} cy={-4} r={9} fill="#fff" />
      <circle cx={152} cy={-4} r={4.5} fill="#333" />
      {[40, 70, 100, 128].map((sx) => (
        <path
          key={sx}
          d={`M${sx},-18 A20,20 0 0 1 ${sx},18`}
          fill="none"
          stroke="#ffffff"
          strokeWidth={3}
          opacity={0.7}
        />
      ))}
    </g>
  )
  return (
    <g>
      <rect width={900} height={300} fill="url(#maySky)" />
      <Cloud x={180} y={60} s={1} fill="#ffffff" />
      <Cloud x={720} y={90} s={0.8} fill="#ffffff" />
      {/* ポール */}
      <line x1={70} y1={0} x2={70} y2={230} stroke="#8a7a5a" strokeWidth={5} />
      <circle cx={70} cy={8} r={9} fill="#e6b83c" />
      {koi(90, 40, '#333a44', 0.62)}
      {koi(90, 100, '#e0563f', 0.55)}
      {koi(90, 152, '#3f86c0', 0.48)}
      {/* 藤 */}
      <g transform="translate(760 0)">
        {[0, 40, 80].map((dx) => (
          <g key={dx} transform={`translate(${dx} 0)`}>
            {Array.from({ length: 6 }, (_, j) => (
              <circle
                key={j}
                cx={0}
                cy={30 + j * 15}
                r={9 - j}
                fill={j % 2 ? '#9a7bc8' : '#b79bde'}
                opacity={0.9}
              />
            ))}
          </g>
        ))}
      </g>
      <rect y={205} width={900} height={95} fill="url(#mayFade)" />
    </g>
  )
}

// 6月 梅雨・紫陽花：傘・雨・かたつむり
function JunScene() {
  const hydrangea = (x: number, y: number, base: string) => (
    <g transform={`translate(${x} ${y})`}>
      {[[0, 0], [16, 6], [-16, 6], [8, 20], [-8, 20], [0, 12]].map(([dx, dy], i) => (
        <g key={i} transform={`translate(${dx} ${dy})`}>
          {[0, 90, 180, 270].map((a) => (
            <ellipse
              key={a}
              cx={0}
              cy={-6}
              rx={4.5}
              ry={6}
              fill={i % 2 ? base : '#8fb3e6'}
              transform={`rotate(${a})`}
            />
          ))}
          <circle r={2.2} fill="#f4e08a" />
        </g>
      ))}
      <path d="M0,26 C-6,40 -4,52 0,64" stroke="#5f8f4f" strokeWidth={3} fill="none" />
    </g>
  )
  return (
    <g>
      <rect width={900} height={300} fill="url(#junSky)" />
      {/* 雨 */}
      {Array.from({ length: 40 }, (_, i) => (
        <line
          key={i}
          x1={(i * 97) % 900}
          y1={(i * 53) % 150}
          x2={(i * 97) % 900 - 8}
          y2={((i * 53) % 150) + 22}
          stroke="#9ab8d8"
          strokeWidth={2}
          opacity={0.5}
        />
      ))}
      {hydrangea(120, 150, '#7f8fd8')}
      {hydrangea(210, 175, '#9a7bc8')}
      {hydrangea(60, 185, '#6fa0d8')}
      {/* 傘 */}
      <g transform="translate(700 140)">
        <path d="M-70,0 A70,70 0 0 1 70,0 Z" fill="#d0506a" />
        {[-46, -23, 0, 23, 46].map((x) => (
          <path key={x} d={`M${x},0 A70,70 0 0 1 ${x + 23},0`} fill="none" stroke="#fff" strokeWidth={1.6} opacity={0.6} />
        ))}
        <line x1={0} y1={0} x2={0} y2={64} stroke="#5a4632" strokeWidth={3.5} />
        <path d="M0,64 C0,74 -12,74 -12,66" fill="none" stroke="#5a4632" strokeWidth={3.5} />
      </g>
      {/* かたつむり */}
      <g transform="translate(470 205)">
        <path d="M0,0 C-30,0 -30,-24 -8,-24 C6,-24 6,-8 -4,-8 C-10,-8 -10,-16 -4,-16" fill="none" stroke="#8a6a4a" strokeWidth={4} />
        <path d="M0,0 C10,0 22,-2 30,-10" stroke="#a5cf7a" strokeWidth={7} fill="none" strokeLinecap="round" />
        <line x1={30} y1={-10} x2={34} y2={-18} stroke="#a5cf7a" strokeWidth={2.5} />
      </g>
      <rect y={205} width={900} height={95} fill="url(#junFade)" />
    </g>
  )
}

// 7月 七夕：天の川・笹・短冊
function JulScene() {
  const stars = Array.from({ length: 60 }, (_, i) => ({
    x: (i * 89) % 900,
    y: (i * 37) % 190,
    r: 1 + (i % 3),
  }))
  const tanzaku = ['#e0563f', '#3f86c0', '#e6b83c', '#4aa06a', '#c05a9a']
  return (
    <g>
      <rect width={900} height={300} fill="url(#julSky)" />
      {/* 天の川 */}
      <path d="M0,40 C300,90 600,90 900,150 L900,110 C600,50 300,50 0,10 Z" fill="#ffffff" opacity={0.12} />
      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.85} />
      ))}
      <Spark cx={250} cy={70} r={9} fill="#fff4c2" />
      <Spark cx={640} cy={110} r={11} fill="#fff4c2" />
      {/* 笹 */}
      <g transform="translate(120 0)">
        <path d="M0,230 C-6,150 6,90 0,0" stroke="#4f8f3f" strokeWidth={4} fill="none" />
        {[30, 70, 110, 150, 190].map((y, i) => (
          <g key={y}>
            <path d={`M0,${y} C-26,${y - 8} -34,${y - 24} -40,${y - 40}`} stroke="#5f9f4f" strokeWidth={3} fill="none" />
            <path d={`M0,${y} C26,${y - 8} 34,${y - 24} 40,${y - 40}`} stroke="#5f9f4f" strokeWidth={3} fill="none" />
            <rect x={i % 2 ? 8 : -22} y={y} width={14} height={22} rx={2} fill={tanzaku[i % tanzaku.length]} />
          </g>
        ))}
      </g>
      <rect y={210} width={900} height={90} fill="url(#julFade)" />
    </g>
  )
}

// 8月 夏祭り：花火・提灯・ひまわり
function AugScene() {
  const firework = (cx: number, cy: number, color: string, r: number) => (
    <g>
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI * 2) / 16
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(a) * r}
            y2={cy + Math.sin(a) * r}
            stroke={color}
            strokeWidth={2}
            opacity={0.85}
          />
        )
      })}
      {Array.from({ length: 16 }, (_, i) => {
        const a = (i * Math.PI * 2) / 16
        return <circle key={i} cx={cx + Math.cos(a) * r} cy={cy + Math.sin(a) * r} r={2.4} fill={color} />
      })}
    </g>
  )
  const sunflower = (x: number, y: number, s: number) => (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      {Array.from({ length: 14 }, (_, i) => (
        <ellipse
          key={i}
          cx={0}
          cy={-20}
          rx={6}
          ry={13}
          fill="#f2b32e"
          transform={`rotate(${(i * 360) / 14})`}
        />
      ))}
      <circle r={12} fill="#7a4a22" />
      <line x1={0} y1={12} x2={0} y2={70} stroke="#4f8f3f" strokeWidth={5} />
    </g>
  )
  return (
    <g>
      <rect width={900} height={300} fill="url(#augSky)" />
      {firework(250, 90, '#ffd24a', 58)}
      {firework(560, 70, '#ff7aa8', 46)}
      {firework(700, 130, '#7ad0ff', 40)}
      <Lantern cx={110} cy={70} s={1.5} fill="#d83a3a" />
      <Lantern cx={820} cy={90} s={1.3} fill="#e0673a" />
      {sunflower(430, 150, 1.1)}
      {sunflower(500, 168, 0.85)}
      <rect y={210} width={900} height={90} fill="url(#augFade)" />
    </g>
  )
}

// 9月 月見：満月・すすき・うさぎ・団子
function SepScene() {
  return (
    <g>
      <rect width={900} height={300} fill="url(#sepSky)" />
      <circle cx={640} cy={110} r={68} fill="#f6e7a8" />
      <circle cx={618} cy={92} r={9} fill="#e9d488" opacity={0.7} />
      <circle cx={662} cy={126} r={12} fill="#e9d488" opacity={0.6} />
      <circle cx={648} cy={100} r={6} fill="#e9d488" opacity={0.6} />
      {/* すすき */}
      {[80, 130, 175, 220, 40].map((x, i) => (
        <g key={x}>
          <path d={`M${x},230 C${x - 8},150 ${x + 6},90 ${x - 4},${40 + (i % 3) * 10}`} stroke="#c8a86a" strokeWidth={3} fill="none" />
          {Array.from({ length: 7 }, (_, j) => (
            <line
              key={j}
              x1={x - 4 + (i % 2 ? 2 : -2)}
              y1={50 + j * 8}
              x2={x - 4 + (i % 2 ? 18 : -18)}
              y2={40 + j * 8}
              stroke="#d8bd82"
              strokeWidth={2}
            />
          ))}
        </g>
      ))}
      {/* 団子 */}
      <g transform="translate(470 175)">
        <rect x={-30} y={26} width={60} height={16} rx={3} fill="#7a5a3a" />
        {[[-18, 10], [0, 4], [18, 10]].map(([dx, dy], i) => (
          <circle key={i} cx={dx} cy={dy} r={11} fill="#f4efe2" stroke="#e0d6bf" />
        ))}
        {[[-9, 7], [9, 7]].map(([dx, dy], i) => (
          <circle key={i} cx={dx} cy={dy - 8} r={11} fill="#f4efe2" stroke="#e0d6bf" />
        ))}
      </g>
      {/* うさぎ */}
      <g transform="translate(760 180)" fill="#f4f0ea">
        <ellipse cx={0} cy={0} rx={22} ry={16} />
        <circle cx={20} cy={-6} r={10} />
        <ellipse cx={16} cy={-22} rx={4} ry={12} transform="rotate(-12 16 -22)" />
        <ellipse cx={24} cy={-22} rx={4} ry={12} transform="rotate(6 24 -22)" />
        <circle cx={24} cy={-6} r={2} fill="#c85a6a" />
      </g>
      <rect y={210} width={900} height={90} fill="url(#sepFade)" />
    </g>
  )
}

// 10月 紅葉・ハロウィン：かぼちゃ・紅葉
function OctScene() {
  return (
    <g>
      <rect width={900} height={300} fill="url(#octSky)" />
      {Array.from({ length: 16 }, (_, i) => (
        <MapleLeaf
          key={i}
          cx={(i * 113) % 900}
          cy={((i * 67) % 150) + 20}
          s={1 + (i % 3) * 0.4}
          fill={['#d8562a', '#e6893a', '#c0392b', '#e0a43a'][i % 4]}
          rot={(i * 53) % 360}
        />
      ))}
      {/* かぼちゃ（ジャックオランタン） */}
      <g transform="translate(700 165)">
        <ellipse cx={0} cy={0} rx={54} ry={44} fill="#e57a24" />
        <ellipse cx={-24} cy={0} rx={20} ry={44} fill="#d86a1c" opacity={0.6} />
        <ellipse cx={24} cy={0} rx={20} ry={44} fill="#d86a1c" opacity={0.6} />
        <rect x={-5} y={-52} width={10} height={16} rx={3} fill="#5f7f3a" />
        <path d="M-26,-8 L-10,-2 L-26,4 Z" fill="#5a2a12" />
        <path d="M26,-8 L10,-2 L26,4 Z" fill="#5a2a12" />
        <path d="M-30,18 Q0,40 30,18 Q20,26 10,20 Q0,28 -10,20 Q-20,26 -30,18 Z" fill="#5a2a12" />
      </g>
      {/* どんぐり */}
      {[[300, 175], [360, 195]].map(([x, y], i) => (
        <g key={i} transform={`translate(${x} ${y})`}>
          <ellipse cx={0} cy={4} rx={7} ry={10} fill="#b5793a" />
          <path d="M-8,-2 A8,6 0 0 1 8,-2 Z" fill="#6d4a24" />
          <line x1={0} y1={-8} x2={0} y2={-13} stroke="#6d4a24" strokeWidth={2} />
        </g>
      ))}
      <rect y={205} width={900} height={95} fill="url(#octFade)" />
    </g>
  )
}

// 11月 晩秋：紅葉・銀杏の舞い
function NovScene() {
  return (
    <g>
      <rect width={900} height={300} fill="url(#novSky)" />
      {/* 山並み */}
      <path d="M0,200 L150,120 L280,190 L430,110 L600,195 L760,130 L900,200 L900,300 L0,300 Z" fill="#d98a4a" opacity={0.28} />
      {Array.from({ length: 20 }, (_, i) =>
        i % 2 ? (
          <GinkgoLeaf
            key={i}
            cx={(i * 97) % 900}
            cy={((i * 71) % 160) + 10}
            s={1 + (i % 3) * 0.4}
            fill="#e6b422"
            rot={(i * 61) % 360}
          />
        ) : (
          <MapleLeaf
            key={i}
            cx={(i * 97) % 900}
            cy={((i * 71) % 160) + 10}
            s={1 + (i % 3) * 0.4}
            fill={['#c0392b', '#d8562a', '#b5451f'][i % 3]}
            rot={(i * 61) % 360}
          />
        ),
      )}
      <rect y={200} width={900} height={100} fill="url(#novFade)" />
    </g>
  )
}

// 12月 冬・クリスマス：雪・ヒイラギ・ツリー・雪だるま
function DecScene() {
  return (
    <g>
      <rect width={900} height={300} fill="url(#decSky)" />
      {Array.from({ length: 26 }, (_, i) => (
        <circle
          key={i}
          cx={(i * 127) % 900}
          cy={(i * 71) % 200}
          r={2 + (i % 3)}
          fill="#ffffff"
          opacity={0.85}
        />
      ))}
      <Snowflake cx={200} cy={70} r={16} stroke="#cfe3f2" />
      <Snowflake cx={470} cy={50} r={12} stroke="#cfe3f2" />
      <Snowflake cx={640} cy={100} r={18} stroke="#cfe3f2" />
      {/* ツリー */}
      <g transform="translate(95 22) scale(0.86)">
        <polygon points="0,0 34,60 -34,60" fill="#3f8f5a" />
        <polygon points="0,36 44,110 -44,110" fill="#357f4f" />
        <polygon points="0,80 52,160 -52,160" fill="#2f7047" />
        <rect x={-8} y={160} width={16} height={18} fill="#6d4a24" />
        <Spark cx={0} cy={-6} r={11} fill="#f4d24a" />
        {[[-20, 70], [24, 96], [-30, 120], [18, 140], [0, 50]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill={['#e0563f', '#e6b83c', '#5a9ad8'][i % 3]} />
        ))}
      </g>
      {/* ヒイラギ */}
      <g transform="translate(760 80)">
        {[0, 120, 240].map((a) => (
          <path
            key={a}
            d="M0,-4 C10,-14 24,-10 20,4 C24,10 14,18 6,12 C10,20 -2,24 -4,14 C-12,20 -22,10 -14,2 C-22,-6 -12,-16 -2,-10 Z"
            fill="#2f7047"
            transform={`rotate(${a}) translate(0 -14)`}
          />
        ))}
        {[[-6, 0], [6, 2], [0, 8]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={5} fill="#d83a3a" />
        ))}
      </g>
      {/* 雪だるま */}
      <g transform="translate(470 175)">
        <circle cx={0} cy={20} r={26} fill="#fbfdff" stroke="#dceaf5" />
        <circle cx={0} cy={-18} r={18} fill="#fbfdff" stroke="#dceaf5" />
        <path d="M-16,-34 h32 v6 h-32 Z" fill="#d83a3a" />
        <rect x={-9} y={-52} width={18} height={18} fill="#333a44" />
        {[[-6, -20], [6, -20]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={2} fill="#333" />
        ))}
        <path d="M0,-16 L14,-12" stroke="#e6893a" strokeWidth={3} strokeLinecap="round" />
      </g>
      <rect y={205} width={900} height={95} fill="url(#decFade)" />
    </g>
  )
}

/* ---------- グラデーション定義（各Sceneが参照） ---------- */
export function SceneDefs() {
  const fade = (id: string, color: string) => (
    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={color} stopOpacity={0} />
      <stop offset="100%" stopColor={color} stopOpacity={1} />
    </linearGradient>
  )
  const sky = (id: string, from: string, to: string) => (
    <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stopColor={from} />
      <stop offset="100%" stopColor={to} />
    </linearGradient>
  )
  return (
    <defs>
      {sky('janSky', '#fce9d0', '#fff7ec')}
      {fade('janFade', '#fff7ec')}
      {sky('febSky', '#fbe4ec', '#fff3f6')}
      {fade('febFade', '#fff3f6')}
      {sky('marSky', '#fbe1ee', '#fff4f8')}
      {fade('marFade', '#fff4f8')}
      {sky('aprSky', '#fce6f0', '#f6faef')}
      {fade('aprFade', '#f9fbf3')}
      {sky('maySky', '#d7eefb', '#f0faf1')}
      {fade('mayFade', '#f0faf1')}
      {sky('junSky', '#dbe6f4', '#eef3fb')}
      {fade('junFade', '#eef3fb')}
      {sky('julSky', '#2a2f61', '#e9e7fb')}
      {fade('julFade', '#eceafb')}
      {sky('augSky', '#243a6b', '#fdf1de')}
      {fade('augFade', '#fdf3e3')}
      {sky('sepSky', '#33305f', '#f3ede0')}
      {fade('sepFade', '#f5efe3')}
      {sky('octSky', '#fbe6cf', '#fdf1e2')}
      {fade('octFade', '#fdf1e2')}
      {sky('novSky', '#fbe3cc', '#fdeede')}
      {fade('novFade', '#fdeede')}
      {sky('decSky', '#dbe8f5', '#eef5fb')}
      {fade('decFade', '#eef5fb')}
    </defs>
  )
}

/* ---------- テーマ一覧 ---------- */
export const SEASONS: Season[] = [
  {
    month: 1,
    kicker: '睦月 ・ 初春のころ',
    phrase: '謹んで新年のごあいさつを申し上げます',
    page: { from: '#fff9f1', to: '#fdeeda' },
    band: { from: '#fce9d0', to: '#fff7ec' },
    ink: '#8a1f1f',
    accent: '#c0392b',
    weekdayBg: '#fbeada',
    Scene: JanScene,
  },
  {
    month: 2,
    kicker: '如月 ・ 梅のころ',
    phrase: '梅のつぼみに春の気配',
    page: { from: '#fff6f9', to: '#ffe8ef' },
    band: { from: '#fbe4ec', to: '#fff3f6' },
    ink: '#a83458',
    accent: '#e05175',
    weekdayBg: '#fce3ec',
    Scene: FebScene,
  },
  {
    month: 3,
    kicker: '弥生 ・ 桃の節句',
    phrase: 'ひと足ずつ、春めいて',
    page: { from: '#fff6fb', to: '#ffe9f2' },
    band: { from: '#fbe1ee', to: '#fff4f8' },
    ink: '#b23a6a',
    accent: '#e0648f',
    weekdayBg: '#fce1ee',
    Scene: MarScene,
  },
  {
    month: 4,
    kicker: '卯月 ・ 桜のころ',
    phrase: '花咲き、新たな季節のはじまり',
    page: { from: '#fdf5f9', to: '#f2f8ec' },
    band: { from: '#fce6f0', to: '#f6faef' },
    ink: '#c25580',
    accent: '#e884a8',
    weekdayBg: '#f7e6ef',
    Scene: AprScene,
  },
  {
    month: 5,
    kicker: '皐月 ・ 薫風のころ',
    phrase: '風かおる五月晴れ',
    page: { from: '#f2fbff', to: '#eefaf1' },
    band: { from: '#d7eefb', to: '#f0faf1' },
    ink: '#1f6f8b',
    accent: '#2a9ac0',
    weekdayBg: '#e2f2ec',
    Scene: MayScene,
  },
  {
    month: 6,
    kicker: '水無月 ・ 梅雨のころ',
    phrase: '雨に映える紫陽花の候',
    page: { from: '#f5f8ff', to: '#eaf1fb' },
    band: { from: '#dbe6f4', to: '#eef3fb' },
    ink: '#3f4f9a',
    accent: '#6a7fd8',
    weekdayBg: '#e6ecf8',
    Scene: JunScene,
  },
  {
    month: 7,
    kicker: '文月 ・ 七夕のころ',
    phrase: '星に願いを、夏のはじまり',
    page: { from: '#f3f2ff', to: '#ece9fb' },
    band: { from: '#2a2f61', to: '#e9e7fb' },
    ink: '#3a3f86',
    accent: '#5560c0',
    weekdayBg: '#e8e6f8',
    Scene: JulScene,
  },
  {
    month: 8,
    kicker: '葉月 ・ 盛夏のころ',
    phrase: '夏まつり、いざ宵の街へ',
    page: { from: '#fff8ee', to: '#fdeede' },
    band: { from: '#243a6b', to: '#fdf1de' },
    ink: '#c25a1f',
    accent: '#e0763a',
    weekdayBg: '#fbeada',
    Scene: AugScene,
  },
  {
    month: 9,
    kicker: '長月 ・ 月見のころ',
    phrase: '仲秋の名月を愛でて',
    page: { from: '#faf6ef', to: '#f2ebdc' },
    band: { from: '#33305f', to: '#f3ede0' },
    ink: '#8a6a2a',
    accent: '#b58a3a',
    weekdayBg: '#f2ecdc',
    Scene: SepScene,
  },
  {
    month: 10,
    kicker: '神無月 ・ 紅葉のころ',
    phrase: '街いろづく実りの秋',
    page: { from: '#fff6ea', to: '#fbead6' },
    band: { from: '#fbe6cf', to: '#fdf1e2' },
    ink: '#b5501f',
    accent: '#e0662a',
    weekdayBg: '#fbe6d2',
    Scene: OctScene,
  },
  {
    month: 11,
    kicker: '霜月 ・ 晩秋のころ',
    phrase: '錦秋のしずけさ',
    page: { from: '#fff3e6', to: '#fbe6d2' },
    band: { from: '#fbe3cc', to: '#fdeede' },
    ink: '#a8461f',
    accent: '#cf5a2a',
    weekdayBg: '#fbe1cd',
    Scene: NovScene,
  },
  {
    month: 12,
    kicker: '師走 ・ 聖夜のころ',
    phrase: '今年もありがとうございました',
    page: { from: '#f4faff', to: '#eaf2f9' },
    band: { from: '#dbe8f5', to: '#eef5fb' },
    ink: '#2f6f7d',
    accent: '#c0392b',
    weekdayBg: '#e4eef7',
    Scene: DecScene,
  },
]

export function seasonOf(month: number): Season {
  return SEASONS[(((month - 1) % 12) + 12) % 12]
}
