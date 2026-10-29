"use client";

import { useRef, useState } from "react";
import { BINDINGS } from "./keys";

// 이야기 도움말 창: 검은 글판에 상자 제목, 아래에 이동 단추. TAB/~TAB은 다음/앞 항목.
const SECTIONS: { title: string; body: string[] }[] = [
  {
    title: "도움말 보기 <F1>",
    body: [
      "쓰다가 궁금한 것이 있을 때 이 도움말을 부르면 됩니다. 처음 쓰는 분뿐 아니라 자주 쓰는 분도 평소에 잘 안 쓰는 글쇠는 잊어버리기 쉽습니다. 그럴 때 <F1>을 누르세요.",
      "TAB은 다음 항목, ~TAB은 앞 항목입니다. ▲▼와 PgUp·PgDn으로 글을 올리고 내립니다. ESC나 <F1>을 다시 누르면 닫힙니다.",
    ],
  },
  {
    title: "전화 걸기",
    body: [
      "전화번호부에서 하이텔을 고르고 엔터를 누르거나, ☎ 단추를 누르거나, 줄을 두 번 누르면 01410으로 전화를 겁니다. Shift+엔터는 소리 없이 겁니다.",
      "전화를 거는 동안 아무 글쇠나 누르면 기다리지 않고 바로 연결합니다. 끊으려면 Ctrl-F9, 끊고 전화번호부로 가려면 Alt-X입니다.",
    ],
  },
  {
    title: "하이텔 쓰기",
    body: [
      "처음 왔으면 이용자ID에 hitel을 넣어 가입합니다. 실명이나 연락처는 묻지 않습니다.",
      "메뉴는 번호로 고릅니다. 'go 이름'은 어디서나 바로 갑니다(go plaza, go club, go small, go data, go chat, go memo). T는 처음 화면, P는 이전, X는 접속 종료입니다.",
    ],
  },
  {
    title: "게시판",
    body: [
      "번호를 넣으면 글을 읽습니다. W는 쓰기, N·B는 다음·앞 쪽입니다. 글을 읽다가 V를 누르면 추천합니다.",
      "글은 200행까지 쓸 수 있습니다. 다 쓰면 /s 로 저장하고, /a 로 취소합니다. 동호회 게시판은 가입한 회원만 씁니다.",
    ],
  },
  {
    title: "대화실",
    body: [
      "대화실 분류에서 방 번호를 고르면 들어갑니다. /W는 참가자 보기, /Q는 나가기입니다.",
      "25분이 지나면 잠시 쉬어 가라고 알려 드립니다.",
    ],
  },
];

const BUTTONS: [string, string][] = [
  ["PgUp", "blue"], ["PgDn", "blue"], ["TAB", "red"], ["~TAB", "red"], ["Home", "cyan"], ["End", "green"],
  ["F1", "brown"], ["@F1", "brown"], ["CR", "gray"], ["Mem", "gray"], ["Page", "lgreen"], ["Num", "lgreen"],
];

export function Help({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const text = useRef<HTMLDivElement>(null);
  const last = SECTIONS.length; // 마지막 항목은 지름 글쇠 표
  const go = (n: number) => {
    setI((n + last + 1) % (last + 1));
    text.current?.scrollTo(0, 0);
  };
  const scroll = (dy: number) => text.current?.scrollBy(0, dy * (text.current.clientHeight - 20));
  const press: Record<string, () => void> = {
    PgUp: () => scroll(-1),
    PgDn: () => scroll(1),
    TAB: () => go(i + 1),
    "~TAB": () => go(i - 1),
    Home: () => go(0),
    End: () => go(last),
    F1: onClose,
  };
  const sec = SECTIONS[i];
  return (
    <div className="help" role="dialog" aria-label="도움말">
      <div className="help-text" ref={text}>
        <div className="help-title">{sec ? sec.title : "지름 글쇠"}</div>
        {sec ? (
          sec.body.map((p) => <p key={p}>{p}</p>)
        ) : (
          <table>
            <tbody>
              {BINDINGS.map((b) => (
                <tr key={b.keys}>
                  <td>{b.keys}</td>
                  <td>{b.label}</td>
                </tr>
              ))}
              <tr>
                <td>Shift-Enter</td>
                <td>전화번호부에서 소리 없이 걸기</td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
      <div className="help-keys">
        <div className="arrows">
          <button type="button" onClick={() => text.current?.scrollBy(0, -24)} aria-label="위로">
            ▲
          </button>
          <button type="button" onClick={() => text.current?.scrollBy(0, 24)} aria-label="아래로">
            ▼
          </button>
        </div>
        <div className="grid">
          {BUTTONS.map(([k, c]) => (
            <button type="button" key={k} className={c} onClick={press[k]} disabled={!press[k]}>
              {k}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
