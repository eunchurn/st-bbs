# st-bbs

Go PC90s(PC통신 재현 프로젝트)의 웹 BBS. 계획은 `go_pc90s_proposal.pptx`.

- `apps/web`: Next.js + xterm.js. 접속 연출(다이얼·모뎀음)과 터미널 화면. Vercel에 배포.
- `apps/server`: Bun WebSocket 서버 + SQLite. 메뉴, 가입, 게시판, 대화실. 클러스터에 배포.

브라우저가 줄 편집을 하고 엔터를 치면 한 줄을 서버로 보낸다. 서버는 화면 텍스트와 다음 프롬프트를 JSON으로 돌려준다.

## 개발

```sh
bun install
bun run dev        # 웹 :3000, 서버 :8023
bun run test
bun run typecheck
bun run build
```

## 환경 변수

| 위치 | 변수 | 기본값 |
|---|---|---|
| web | `NEXT_PUBLIC_BBS_URL` | `ws://localhost:8023/ws` |
| server | `PORT` | `8023` |
| server | `DB_PATH` | `bbs.db` |
| server | `ALLOWED_ORIGINS` | `http://localhost:3000` (쉼표로 여러 개) |

## 배포

- 웹: Vercel 프로젝트의 Root Directory를 `apps/web`으로 두고 `NEXT_PUBLIC_BBS_URL=wss://<서버 호스트>/ws`를 넣는다.
- 서버: `docker build -t st-bbs-server apps/server`. SQLite라서 레플리카는 1개, `/data`에 볼륨을 붙인다. `ALLOWED_ORIGINS`에 Vercel 도메인을 넣는다. 헬스체크는 `GET /healthz`.
