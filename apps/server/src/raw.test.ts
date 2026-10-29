import { expect, test } from "bun:test";
import { openDb } from "./db";
import { decodeText, encode, rawSession, sgr } from "./raw";

const euc = decodeText;

test("완성형으로 바꾸고 줄 글자는 ASCII로 바꾼다", () => {
  expect([...encode("가A")]).toEqual([0xb0, 0xa1, 0x41]);
  expect(euc(encode("─┌│▄"))).toBe("-+|_");
});

test("되돌리기 색 코드는 회색 글씨 파란 바탕으로 풀어 쓴다", () => {
  expect(sgr("\x1b[0;30;47mA\x1b[0mB\x1b[mC\x1b[1;36m")).toBe("\x1b[0;37;44;30;47mA\x1b[0;37;44mB\x1b[0;37;44mC\x1b[1;36m");
});

test("모뎀 접속: 첫 화면이 나오고, 한글 두 바이트와 지우기를 받아 엔터에 한 줄로 넘긴다", async () => {
  let out = "";
  const r = rawSession(openDb(":memory:"), (b) => (out += euc(b)), () => {});
  expect(out).toContain("이용자ID");
  const typed = (s: string) => r.input(new Uint8Array([...s].flatMap((c) => (c < "\x80" ? [c.charCodeAt(0)] : [...encode(c)]))));
  typed("hitel\r");
  await Bun.sleep(10);
  expect(out).toContain("사용할 ID");
  out = "";
  typed("가나\b\x1b[A다");
  expect(out).toBe("가나\b\b  \b\b다"); // 메아리: 지우기는 한글 폭(2칸)만큼, 방향키는 버린다
  r.end();
});
