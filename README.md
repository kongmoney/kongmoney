# 공동 가계부 — Cloudflare Pages 기준본

## 기준 데이터
Google Sheet 탭 이름은 아래 4개를 그대로 사용합니다.
- `지출내역`
- `대출내역`
- `월정산`
- `SETTINGS`

## 포함 기능
- 월 이동
- 월 전체 지출 / 생활비 / 대출 요약
- 총무 / 구성원 A / 구성원 B 정산액
- 구성원 B 매월 400,000원 자동이체 및 전월/다음달 이월 표시
- 지출 목록 필터
- 지출 추가 API 뼈대
- 대출 현황
- Google Sheet 연결 전 mock 데이터 fallback

## Cloudflare Pages
`functions` 폴더는 Pages Functions의 파일 기반 라우팅을 사용합니다.
- `GET /api/health`
- `GET /api/dashboard?month=YYYY-MM`
- `POST /api/expenses`

## 필요한 Cloudflare Secrets
아래 값은 코드나 GitHub에 넣지 않습니다. Cloudflare 프로젝트의 Variables and Secrets에서 등록합니다.
- `GOOGLE_SHEET_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_PRIVATE_KEY`

Google Sheet 자체는 서비스 계정 이메일에 편집 권한으로 공유해야 합니다.

## 이번 기준본에 의도적으로 포함하지 않은 것
- `wrangler.toml`, `wrangler.json`, `.env` 등 배포/환경 설정 파일
- 실제 서비스 계정 키
- 로그인/회원가입
- 지출 수정/삭제
- 대출 입력/수정

이 기준본에서 기능을 하나씩 추가하는 방식으로 진행합니다.
