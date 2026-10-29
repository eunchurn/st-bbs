// 이야기 5.3 첫 화면의 사무실 그림과 알림 상자. 둘 다 에뮬레이터로 띄운 진짜 이야기 화면(640x480)에서 떼어 왔다.
// 만드는 법은 st-iyagi 저장소 tools/scene.ts. 터미널 창 뒤에 깔린다.

export function Scene() {
  return <div className="scene" aria-hidden />;
}

// 이야기 첫 화면의 알림 상자. 5초 뒤나 누르면 닫힌다(닫는 일은 terminal.tsx가 한다).
export function Splash({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="splash" onClick={onClose} aria-label="이야기 다섯째 고개, 세째 마당. 셈틀통신 이야기 5.3, (저) 큰사람">
      <img src="/iyagi/splash.png" alt="" width={320} height={168} />
    </button>
  );
}
