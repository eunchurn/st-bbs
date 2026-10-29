// 이야기 5.0 첫 화면의 사무실: 벽과 바닥, 책상 위 컴퓨터와 노트북, 오른쪽 캐비닛과 화분.
// 터미널 창 뒤에 깔린다. 색은 VGA 16색.
const C = { black: "#000", blue: "#0000a8", lblue: "#5454fc", gray: "#a8a8a8", dark: "#545454", white: "#fcfcfc", green: "#00a800", lgreen: "#54fc54", yellow: "#fcfc54", red: "#fc5454", brown: "#a85400" };
const FONT = { fontFamily: "DungGeunMo, monospace" };

function Desk({ online }: { online: boolean }) {
  return (
    <svg className="desk-items" viewBox="0 0 320 200" aria-hidden>
      {/* 본체 */}
      <rect x="10" y="118" width="170" height="44" fill={C.gray} stroke={C.dark} strokeWidth="2" />
      <rect x="24" y="132" width="52" height="5" fill={C.dark} />
      <rect x="24" y="144" width="52" height="5" fill={C.dark} />
      <rect x="150" y="146" width="18" height="6" fill={C.green} />
      {/* 모니터 */}
      <rect x="80" y="108" width="30" height="10" fill={C.dark} />
      <rect x="30" y="4" width="130" height="106" rx="5" fill={C.gray} stroke={C.dark} strokeWidth="2" />
      <rect x="42" y="16" width="106" height="76" fill={C.black} />
      <text x="95" y="50" textAnchor="middle" fill={C.yellow} fontSize="17" style={FONT}>이야기5.0</text>
      <text x="95" y="74" textAnchor="middle" fill={C.red} fontSize="14" style={FONT}>{online ? "connected!" : "ready"}</text>
      {/* 자판, 쥐 */}
      <polygon points="0,178 186,178 194,196 0,196" fill={C.dark} />
      {Array.from({ length: 4 }, (_, r) => (
        <rect key={r} x={6 + r * 2} y={181 + r * 4} width={170} height="2" fill={C.gray} />
      ))}
      <path d="M215 186 C 214 170, 200 166, 196 150" stroke={C.dark} fill="none" />
      <ellipse cx="218" cy="189" rx="10" ry="6" fill={C.white} stroke={C.dark} />
      {/* 연필꽂이 */}
      <line x1="208" y1="130" x2="203" y2="112" stroke={C.yellow} strokeWidth="3" />
      <line x1="214" y1="130" x2="214" y2="108" stroke={C.brown} strokeWidth="3" />
      <line x1="220" y1="130" x2="226" y2="114" stroke={C.yellow} strokeWidth="3" />
      <rect x="200" y="128" width="26" height="34" fill={C.blue} stroke={C.dark} />
      {/* 노트북: 동시작업 */}
      <rect x="238" y="96" width="78" height="62" rx="3" fill={C.gray} stroke={C.dark} strokeWidth="2" />
      <rect x="246" y="104" width="62" height="46" fill={C.black} />
      <text x="277" y="124" textAnchor="middle" fill={C.red} fontSize="12" style={FONT}>이야기</text>
      <text x="277" y="142" textAnchor="middle" fill={C.yellow} fontSize="12" style={FONT}>동시작업</text>
      <polygon points="232,158 320,158 316,172 236,172" fill={C.dark} stroke={C.gray} />
    </svg>
  );
}

function Cabinet() {
  const leaves = [
    "M80 300 C 40 270, 20 240, 0 236 C 30 250, 50 270, 80 300",
    "M80 300 C 50 250, 50 220, 30 190 C 60 220, 70 250, 80 300",
    "M82 300 C 80 240, 90 210, 84 176 C 100 210, 96 250, 82 300",
    "M84 300 C 110 250, 130 230, 150 214 C 130 240, 110 270, 84 300",
    "M84 300 C 120 280, 150 270, 160 262 C 140 284, 110 296, 84 300",
    "M80 300 C 60 280, 30 280, 10 290 C 40 290, 60 294, 80 300",
  ];
  return (
    <svg className="cabinet" viewBox="0 0 160 400" preserveAspectRatio="xMaxYMax meet" aria-hidden>
      <rect x="20" y="0" width="140" height="350" fill={C.gray} />
      <rect x="20" y="0" width="14" height="350" fill={C.dark} />
      <line x1="96" y1="0" x2="96" y2="80" stroke={C.dark} strokeWidth="2" />
      <line x1="96" y1="215" x2="96" y2="350" stroke={C.dark} strokeWidth="2" />
      {/* 열린 선반과 바인더 */}
      <rect x="44" y="80" width="112" height="135" fill="#202020" />
      <rect x="44" y="145" width="112" height="5" fill={C.dark} />
      <rect x="70" y="96" width="16" height="48" fill={C.blue} />
      <rect x="88" y="96" width="16" height="48" fill={C.lblue} />
      <rect x="106" y="102" width="14" height="42" fill={C.green} />
      <rect x="20" y="350" width="140" height="10" fill={C.dark} />
      {/* 화분 */}
      <polygon points="58,300 108,300 102,360 64,360" fill={C.dark} stroke={C.gray} />
      {leaves.map((d, i) => (
        <path key={d} d={d} fill={i % 2 ? C.lgreen : C.green} stroke="#006000" strokeWidth="1" />
      ))}
    </svg>
  );
}

export function Scene({ online }: { online: boolean }) {
  return (
    <div className="scene" aria-hidden>
      <div className="credit">
        <div>셈틀통신 이야기 5.0</div>
        <div>(저) 하늘소 · 경북대학교 컴퓨터 동아리</div>
      </div>
      <div className="desk" />
      <Desk online={online} />
      <Cabinet />
    </div>
  );
}
