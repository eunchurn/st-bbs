// 이야기 5.3 첫 화면의 사무실 그림과 알림 상자. 둘 다 에뮬레이터로 띄운 진짜 이야기 화면(640x480)에서 떼어 왔다.
// 만드는 법은 st-iyagi 저장소 tools/scene.ts. 터미널 창 뒤에 깔린다.

export function Scene() {
  return <div className="scene" aria-hidden />;
}

// 이야기 첫 화면의 알림 상자. 얼굴 둘레의 그림(전화·원판·물음표·편지·막대)이 돈다: 5.3 화면의 다섯 장면을 이어 붙인 그림을 넘긴다.
// 5초 뒤나 누르면 닫힌다(닫는 일은 terminal.tsx가 한다).
export function Splash({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="splash" onClick={onClose} aria-label="이야기 다섯째 고개, 세째 마당. 셈틀통신 이야기 5.3, (저) 큰사람">
      <span className="splash-anim" />
    </button>
  );
}

// 이야기 5.3의 전화 거는 상자. 남은 시간을 세고, "기다리고 있습니다."가 깜빡인다. 아무 글쇠나 누르면 바로 잇고, ESC는 그만둔다.
export function Dialing({ left, phone }: { left: number; phone: string }) {
  return (
    <div className="dialing" role="status" aria-label={`전화를 걸고 있습니다. 남은 시간 ${left}초`}>
      <div className="dialing-title">전화를 걸고 있습니다. 아무 글쇠나 누르면 바로 잇습니다..</div>
      <div className="dialing-body">
        <div>
          거는 곳 : 하이텔 &nbsp;[서울]<span className="wait">기다리고 있습니다.</span>
        </div>
        <div>전화번호 : {phone}</div>
        <div>
          남은시간 :&nbsp;<b>{String(left).padStart(2)}</b>&nbsp;초<span className="esc">[ESC]를 누르면 그만 둡니다</span>
        </div>
      </div>
    </div>
  );
}
