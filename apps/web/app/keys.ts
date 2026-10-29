// 지름 글쇠 표. terminal.tsx가 이 표로 글쇠를 받고, 도움말 창이 같은 표를 보여 준다.
export type Action = "help" | "news" | "hangup" | "quit" | "fullscreen" | "close";

export const BINDINGS: { keys: string; label: string; action: Action; match: (e: KeyboardEvent) => boolean }[] = [
  { keys: "F1", label: "도움말 보기", action: "help", match: (e) => e.key === "F1" },
  { keys: "F2", label: "새소식 보기", action: "news", match: (e) => e.key === "F2" },
  { keys: "Ctrl-F9", label: "전화 끊음", action: "hangup", match: (e) => e.ctrlKey && e.key === "F9" },
  // 맥에서는 Alt-X가 다른 글자를 만들므로 글쇠 위치(code)로 본다
  { keys: "Alt-X", label: "끝내기 (전화 끊고 전화번호부로)", action: "quit", match: (e) => e.altKey && e.code === "KeyX" },
  { keys: "Alt-Enter", label: "전체 화면", action: "fullscreen", match: (e) => e.altKey && e.key === "Enter" },
  { keys: "ESC", label: "도움말·새소식 창 닫기", action: "close", match: (e) => e.key === "Escape" },
];

export function actionOf(e: KeyboardEvent): Action | undefined {
  return BINDINGS.find((b) => b.match(e))?.action;
}
