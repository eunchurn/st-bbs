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

- 웹: Vercel 프로젝트 `st-bbs`(팀 sophonz, Root Directory `apps/web`). master에 푸시하면 배포된다. `NEXT_PUBLIC_BBS_URL=wss://bbs.sophonz.ai/ws`.
- 서버: `apps/server`나 `k8s/`가 바뀌어 master에 푸시되면 `.github/workflows/server.yml`이 테스트하고, `ghcr.io/eunchurn/st-bbs-server:<sha>`를 amd64·arm64로 올린 뒤 `k8s/`를 그 sha로 클러스터에 적용한다(ns `st-bbs`, `bbs.sophonz.ai`). 다시 배포하려면 Actions에서 server를 수동 실행한다. `k8s/kustomization.yaml`의 `newTag`는 CI가 덮어쓰므로 손으로 `kubectl apply -k k8s`를 하면 예전 이미지로 돌아간다.
- 배포 계정과 Namespace: `infra/oci-inobs/k8s/st-bbs-deployer`. 그 토큰의 kubeconfig가 저장소 시크릿 `KUBE_CONFIG`다. 토큰을 폐기하려면 Secret `st-bbs-deployer-token`을 지우고 다시 apply한 뒤 시크릿을 새로 넣는다.

SQLite라서 레플리카는 1개(`Recreate`)이고 데이터는 PVC `st-bbs-data`(`openebs-lvm`)의 `/data/bbs.db`에 있다. Vercel 프로덕션 도메인을 바꾸면 `deployment.yaml`의 `ALLOWED_ORIGINS`도 바꾼다.
