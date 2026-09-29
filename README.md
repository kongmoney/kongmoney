# kongmoney · 콩머니

Cloudflare Pages + Google Sheets + GitHub 기반 공동 가계부입니다.

## 현재 구성

- 사용자 화면: `/`
- 관리자 화면: `/admin.html`
- Google Sheets 실데이터 조회/지출 추가/대출내역 수정
- SH / JH / CE 정산
- 지출 분담방식: 3인 공동 / JH + SH / JH + CE / SH + JH
- CE 자동이체 및 차액 이월 (2025-01·02: 300,000원 / 2025-03 이후: 400,000원)
- 관리자 ZIP 업로드 → GitHub 커밋 → Cloudflare Pages 자동 배포
- 관리자 페이지에서 최신 GitHub 커밋 / Cloudflare Pages 배포 상태 조회

## 관리자 배포 방식

관리자 페이지에서 전체 소스 ZIP을 선택하면 압축을 브라우저에서 풀고, 서버 API가 GitHub Git Data API를 이용해 업로드 파일을 한 번의 커밋으로 반영합니다.

- ZIP에 포함된 파일: 추가 또는 덮어쓰기
- ZIP에 없는 기존 파일: 유지
- `README.md`: 기존 배포 이력을 보존하면서 새 커밋 내역 자동 추가
- GitHub `main` 커밋 후 Cloudflare Pages Git 연동이 자동 배포
- 관리자 화면에서 새 커밋 SHA와 Pages 배포 성공/실패를 확인

## Cloudflare Variables / Secrets

기존 Google Sheets 연결 값은 그대로 유지합니다.

### Google Sheets

- `GOOGLE_SHEET_ID`
- `GOOGLE_CLIENT_EMAIL`
- `GOOGLE_PRIVATE_KEY` (Secret)

### 관리자 / GitHub

- `ADMIN_KEY` (Secret) — 관리자 화면 인증용 임의 문자열
- `GITHUB_TOKEN` (Secret) — `kongmoney` 저장소 Contents write 권한
- `GITHUB_OWNER` — 기본값 `kongmoney`
- `GITHUB_REPO` — 기본값 `kongmoney`
- `GITHUB_BRANCH` — 기본값 `main`

### Cloudflare 배포 상태 조회

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (Secret) — Cloudflare Pages 조회 권한
- `CLOUDFLARE_PROJECT_NAME` — 기본값 `kongmoney`

> 토큰이나 비밀키는 GitHub 소스에 넣지 않고 Cloudflare Variables and Secrets에서만 관리합니다.

## 배포/커밋 내역
<!-- AUTO_DEPLOY_HISTORY -->
- 2026-09-29 21:07 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 — GitHub REST API User-Agent 403 수정, GitHub owner 기본값 kongmoney로 정정
- 2026-09-29 — 관리자 ZIP 배포 / GitHub 커밋 / Cloudflare 배포 상태 확인 기능 추가, 사용자 닉네임 SH·JH·CE로 변경
