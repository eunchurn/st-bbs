// 이야기 5.0 전화번호부. 지금은 하이텔 하나만 있다. 아래 단추들은 생김새만 옮겼다(☎는 걸고, 설명 H는 새소식).
const ENTRIES = [{ name: "하이텔", place: "[서울]", phone: "01410", line: "14400-N-8-1[7]" }];
const ROWS = 10;
const KEYS = [
  ["읽기", "R"], ["순서", "S"], ["청소", "A"], ["고침", "E"],
  ["저장", "W"], ["찾기", "F"], ["반전", "V"], ["설명", "H"],
  ["삽입", "I"], ["지움", "D"], ["옮김", "M"], ["멈춤", "T"],
];

export function Directory({ onDial, onHelp }: { onDial: (sound: boolean) => void; onHelp: () => void }) {
  return (
    <div className="dir" role="dialog" aria-label="전화번호부">
      <div className="dir-head">
        <span>이 름 [ 곳 ]</span>
        <span>전 화 번 호 <i className="tel">☎</i></span>
        <span>선 택 사 항</span>
      </div>
      <ol className="dir-list">
        {Array.from({ length: ROWS }, (_, i) => {
          const e = ENTRIES[i];
          return (
            <li key={i} className={i === 0 ? "sel" : ""} onDoubleClick={e ? () => onDial(true) : undefined}>
              <b>{i + 1}</b>
              <span>{e ? `${e.name}  ${e.place}` : ""}</span>
              <span>{e?.phone}</span>
              <span>{e?.line}</span>
            </li>
          );
        })}
      </ol>
      <div className="dir-keys">
        <div className="nav">
          {["▲", "PgUp", "Home", "∨", "▼", "PgDn", "End"].map((k) => (
            <span key={k}>{k}</span>
          ))}
          <button type="button" onClick={() => onDial(true)} aria-label="전화 걸기">
            <i className="tel">☎</i>
          </button>
        </div>
        <div className="cmd">
          {KEYS.map(([label, key]) =>
            key === "H" ? (
              <button type="button" key={key} onClick={onHelp}>
                {label} <em>{key}</em>
              </button>
            ) : (
              <span key={key}>
                {label} <em>{key}</em>
              </span>
            ),
          )}
        </div>
      </div>
      <div className="dir-foot">엔터·<i className="tel">☎</i>·두 번 누르기: 걸기 &nbsp; Shift+엔터: 소리 없이</div>
    </div>
  );
}
