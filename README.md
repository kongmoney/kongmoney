# kongmoney · 콩머니

Cloudflare Pages + Google Sheets + GitHub 기반 공동 가계부입니다.

## 현재 구성

- 사용자 화면: `/`
- 관리자 화면: `/admin.html`
- Google Sheets 실데이터 조회/지출 추가/대출내역 수정
- SH / JH / CE 정산
- 지출 분담방식: 3인 공동 / JH + SH / JH + CE / SH + JH
- CE 자동이체 및 차액 이월 (2026-01·02: 300,000원 / 2026-03 이후: 400,000원)
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

## v5.2.2 - 지출 조회 범위 수정
- 신규 지출 저장 후 시트에는 반영되지만 화면 목록에 보이지 않는 문제 수정
- `지출내역` 조회 범위를 A3:I2000 → A3:I5000으로 확장
- 저장 시 빈 행 탐색 범위와 조회 범위를 동일하게 맞춤

### v5.2.3 UI/UX 수정
- 지출 저장 직후 전체 대시보드 재조회 대신 신규 지출 행만 즉시 목록 반영
- 합계/정산값은 백그라운드에서 조용히 재계산
- 메인 캐릭터의 겹쳐 보이던 기호 제거 및 단순 얼굴로 정리
- 모바일 메인 히어로를 짧고 컴팩트한 2열 구조로 축소
- 모든 메인 dialog 팝업에 바깥 영역 클릭 닫기 공통 적용

- 2026-09-29 21:xx KST — v5.2.4 — 월 선택 유지(localStorage), 저장 직후/새로고침 후 지출목록 유지 보강, 메인 마스코트 고양이 얼굴로 수정

- 2026-09-29 21:xx KST — v5.2.5 — 신규 지출/대출 월값 RAW 저장, 기존 날짜형 월값 복원 조회, 10월 데이터/대출 0원 문제 수정, 고양이 마스코트 재디자인

- 2026-09-29 — v5.2.6 — 지출 카드 삭제 버튼 추가, 삭제 시 Google Sheet 지출내역 A:I 동시 삭제(값 비우기), 삭제 후 월 합계/정산 즉시 재조회

- 2026-09-29 — v5.2.7 — 지출 추가/삭제·대출 수정 시 월정산 A:P 자동 재계산/저장. CE 자동이체 연도 정정: 2026-01/02 300,000원, 2026-03 이후 400,000원으로 시트까지 동기화.

- 2026-09-29 — v5.2.8 — CE 자동이체 기준 연도를 2026년으로 정정. 최초 로드 시 월정산 자동 재동기화를 1회 실행하여 기존 2026년 1·2월 N열도 300,000원으로 바로 보정.

- 2026-09-29 — v5.3.0 — 기준연도 2026-01~12로 정정. 대출내역/월정산의 2025-11·12 제외 및 초기 동기화 시 정리, 2026-01 이월 0원 시작, CE 자동이체 2026-01·02 30만원 / 03~12 40만원 적용. 대출금 변동추이 모달(잔액 라인차트·월별 원금/이자/금리/잔액 표) 추가.

- 2026-09-29 — v5.3.1 — 월별 대출 입력 초기화 추가. 원금/이자는 빈칸=0원, 잔액 빈칸은 전월잔액-원금 자동계산. 초기화 시 전월 잔액/금리를 승계하고 월정산·대출금 변동추이를 다시 동기화.

- 2026-09-29 — v5.3.2 — 지출 추가/삭제 속도 최적화: Google OAuth 토큰 캐시, 월정산 백그라운드 동기화, 저장마다 월정산 전체 clear 제거, 삭제 즉시 UI 반영

- 2026-09-29 — v5.3.3 — 대출 상환후 잔액 글자 크기 보정, 조회 월 클릭형 1~12월 바로가기 패널 추가

## v5.4.0 · 2026-09-29
- 반복지출 템플릿: SETTINGS D:J에 저장, 이번 달 빠른 등록 지원
- 월별 비교: 생활비 및 SH/JH/CE 최종 부담액 전월 대비 표시
- 지출 수정: 지출 카드 클릭 → 수정 → Google Sheet 해당 행 즉시 갱신
- 월별 메모: SETTINGS L:M에 월별 메모 저장
- 월 마감: SETTINGS N열에 상태 저장, 마감된 달의 지출 추가/수정/삭제 및 대출 수정 잠금
- 기존 지출/대출/월정산/CE 자동이체/관리자 ZIP 배포 기능 유지

### v5.4.1
- 반복지출 저장 실패 수정: SETTINGS 우측 확장 열(D:J) 대신 C3:D3 단일 JSON 저장소 사용
- 월별 메모/마감도 SETTINGS C4:D4 단일 JSON 저장소로 이동
- 엑셀→Google Sheets 변환 시 열 개수가 적어도 동작하도록 기존 A:D 범위 안에서만 저장
- 반복지출 식별자를 sheetRow 대신 고유 ID로 변경


## v5.4.2
- Cloudflare Pages Functions build 오류 수정: `parseMonthMetaRows` export 복구
- 월 메모/마감 조회 범위를 새 저장구조 `SETTINGS!C4:D4`로 통일
- 반복지출 `SETTINGS!C3:D3` JSON 저장방식 유지
- 구형 월 메타 행 형식도 읽을 수 있도록 호환 처리

- 2026-09-29 — v5.4.3 — 반복지출 저장을 SETTINGS 빈 셀에서 숨김 APP_DATA 시트로 이전, 레거시 데이터 자동 마이그레이션, 저장 후 재조회 검증 추가.

## 배포/커밋 내역
<!-- AUTO_DEPLOY_HISTORY -->
- 2026-09-29 23:50 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 25개 파일 업로드
- 2026-09-29 23:36 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 25개 파일 업로드
- 2026-09-29 23:29 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 25개 파일 업로드
- 2026-09-29 23:18 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 25개 파일 업로드
- 2026-09-29 23:05 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 22개 파일 업로드
- 2026-09-29 22:56 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 22개 파일 업로드
- 2026-09-29 22:50 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 22개 파일 업로드
- 2026-09-29 22:42 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 22개 파일 업로드
- 2026-09-29 21:48 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 20개 파일 업로드
- 2026-09-29 21:39 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 19개 파일 업로드
- 2026-09-29 21:35 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:31 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:26 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:22 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:17 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:13 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 21:07 KST — chore: kongmoney ZIP deploy 09-29-21:07 — 18개 파일 업로드
- 2026-09-29 — GitHub REST API User-Agent 403 수정, GitHub owner 기본값 kongmoney로 정정
- 2026-09-29 — 관리자 ZIP 배포 / GitHub 커밋 / Cloudflare 배포 상태 확인 기능 추가, 사용자 닉네임 SH·JH·CE로 변경
