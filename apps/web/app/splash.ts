// 이야기 5.0 첫 화면을 흉내 낸 사무실 그림. 반 칸 블록(▀)으로 80x48 점을 80x24 칸에 그린다.
// 색 번호는 ANSI 16색(0 검정, 2 초록, 3 갈색, 4 파랑, 7 회색, 8 진회색, 10 밝은 초록, 12 밝은 파랑, 15 흰색).

const W = 80;
const H = 48;

type Rect = [x0: number, y0: number, x1: number, y1: number, color: number];

const RECTS: Rect[] = [
  [0, 0, W, 30, 12], // 벽
  [0, 30, W, H, 4], // 바닥
  // 오른쪽 캐비닛
  [60, 2, W, 40, 7],
  [60, 40, W, 41, 8],
  [64, 9, 79, 27, 0], // 열린 선반
  [64, 18, 79, 19, 8],
  [68, 11, 70, 18, 4], // 바인더
  [70, 11, 72, 18, 12],
  [72, 12, 74, 18, 2],
  [63, 2, 64, 40, 8],
  [79, 2, 80, 40, 8],
  // 책상
  [0, 29, 58, 33, 15],
  [0, 33, 58, 35, 7],
  [54, 35, 57, 44, 7],
  // 컴퓨터: 본체, 모니터, 화면, 받침
  [4, 23, 26, 29, 7],
  [6, 25, 14, 26, 8],
  [6, 6, 24, 21, 7],
  [8, 8, 22, 19, 0],
  [12, 21, 18, 23, 8],
  // 자판과 쥐
  [2, 30, 28, 32, 8],
  [32, 31, 36, 32, 7],
  // 노트북(동시작업)
  [40, 16, 54, 28, 7],
  [42, 18, 52, 26, 0],
  [38, 28, 56, 30, 8],
  // 연필꽂이
  [32, 24, 35, 29, 4],
  [33, 20, 34, 24, 3],
  // 화분
  [70, 37, 77, 44, 8],
];

// 잎은 타원 안에 점을 듬성듬성 찍는다
function leaf(x: number, y: number) {
  const dx = (x - 73) / 8;
  const dy = (y - 31) / 7;
  if (dx * dx + dy * dy > 1 || (x * 7 + y * 3) % 5 === 0) return -1;
  return (x + y) % 3 === 0 ? 10 : 2;
}

function pixels() {
  const grid = Array.from({ length: H }, () => new Array<number>(W).fill(0));
  for (const [x0, y0, x1, y1, c] of RECTS)
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) grid[y][x] = c;
  for (let y = 22; y < 39; y++)
    for (let x = 64; x < W; x++) {
      const c = leaf(x, y);
      if (c >= 0) grid[y][x] = c;
    }
  return grid;
}

const fg = (c: number) => (c < 8 ? 30 + c : 82 + c);
const bg = (c: number) => (c < 8 ? 40 + c : 92 + c);

// 그림 위에 얹는 글자: [줄, 칸, SGR, 글]
const TEXT: [number, number, string, string][] = [
  [2, 25, "1;93;44", "셈틀통신 이야기 5.0  -  하이텔 재현판"],
  [8, 11, "1;93;40", "이야기5.0"],
  [9, 11, "1;91;40", "connected"],
  [11, 45, "1;91;40", "이야기"],
  [12, 44, "1;93;40", "동시작업"],
];

export function splash() {
  const g = pixels();
  let out = "\x1b[2J\x1b[H";
  for (let row = 0; row < H / 2; row++) {
    out += `\x1b[${row + 1};1H`;
    for (let x = 0; x < W; x++) out += `\x1b[${fg(g[row * 2][x])};${bg(g[row * 2 + 1][x])}m▀`;
  }
  for (const [row, col, sgr, s] of TEXT) out += `\x1b[${row};${col}H\x1b[0;${sgr}m${s}`;
  return out + "\x1b[0m";
}

// 바닥(아래 석 줄)에 쓰는 글. 모뎀 명령과 안내가 여기 나온다.
export function floor(lines: string[]) {
  return lines.map((l, i) => `\x1b[${22 + i};1H\x1b[0;1;37;44m\x1b[2K${l}`).join("") + "\x1b[0m";
}
