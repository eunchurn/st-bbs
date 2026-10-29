// 새소식(what's new) 창. 이야기 2.4 공개 글(황태욱, 1990)을 간추려 옮겼다. 원문은 아래 출처에 있다.
const SOURCE = "https://ktsmemo.cafe24.com/s/OldFiles/651";

const FEATURES = [
  "조합형 사설 비비에스에서 그림 글자가 깨지던 문제를 고쳤습니다.",
  "그림 한글을 안에 넣었습니다. 도깨비·NKP 같은 바깥 한글 없이 VGA, EGA, 허큘리스에서 돌아갑니다.",
  "바깥 파일을 이야기 안에서 열어 볼 수 있습니다.",
  "약속 시간을 알려 줍니다.",
  "전화가 연결된 시간을 보여 줍니다. 전화 요금을 아끼시라고요.",
  "글자 찍는 부분을 기계어로 고쳐 더 빨라졌습니다.",
  "이야기 마당(채팅): 위·아래 화살표로 앞서 쓴 글을 고쳐 다시 보냅니다.",
  "기능을 늘리고도 크기를 줄여 플로피 디스크에서도 빨리 뜹니다.",
  "전화 걸기: 돌려 가며 걸기, 전화번호부를 여러 개 만들어 저장하고 불러오기.",
  "글꼴은 한글 세 가지, 영문 여섯 가지. 한글 편집기 '바다'도 같이 올립니다.",
];

const KEYS: [string, string][] = [
  ["F9 / F10", "영문 / 한글 글꼴 바꾸기"],
  ["Alt-C", "이야기 마당(채팅 모드)"],
  ["Alt-L", "갈무리 시작/마침"],
  ["Alt-P", "블랙홀 대기 - 3중 화음 음악"],
  ["Alt-X", "이야기 빠져나가기"],
  ["Ctrl-F9", "전화 끊음"],
];

export function News({ onClose }: { onClose: () => void }) {
  return (
    <div className="news" role="dialog" aria-label="새소식">
      <div className="title">
        새소식 - 이야기 2.4
        <button type="button" onClick={onClose} aria-label="닫기">
          ×
        </button>
      </div>
      <div className="news-body">
        <p className="hl">통신 풀그림 '이야기'</p>
        <p>
          애쓴 사람: 황태욱, 정재흠, 이종우, 이영상
          <br />
          어디서: 하늘소(경북대학교) &nbsp; 왜: 통신 문화의 발전을 바라며
        </p>
        <p className="hl">o 새로워진 점</p>
        <ol>
          {FEATURES.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ol>
        <p className="hl">o 지름 글쇠</p>
        <table>
          <tbody>
            {KEYS.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{v}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hl">o 이 재현판에서는</p>
        <p>
          엔터: 전화 걸기 &nbsp; Shift+엔터: 소리 없이 &nbsp; Alt+Enter: 전체 화면 &nbsp; F1: 새소식
        </p>
        <p className="src">
          1990년 하늘소 황태욱(damul) 님의 공개 글을 간추렸습니다. 원문:{" "}
          <a href={SOURCE} target="_blank" rel="noreferrer">
            ktsmemo.cafe24.com
          </a>
        </p>
      </div>
      <div className="news-foot">ESC·F1: 닫기</div>
    </div>
  );
}
