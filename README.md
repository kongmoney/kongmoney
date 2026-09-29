# kongmoney v5.9.0 PATCH

2025/2026 다중연도 기반 패치.

- 조회 월 팝업에 2025 / 2026 연도 전환 버튼 추가
- 선택 연도 기준 1~12월 바로가기 유지
- 이전/다음 달 이동은 2025-01 ~ 2026-12 범위에서 연도 경계를 넘어 이동
- D1 지출/대출/월메모/월마감 API를 2025/2026 공통 지원
- monthly_summary를 연도별 12개월 캐시로 분리
- 각 연도 1월 carryIn은 항상 0에서 독립 시작
- 1월 전월 비교는 전년도 12월과 연결하지 않음
- 2026-01/02 CE 자동이체 30만원 규칙 유지, 그 외 지원 월은 40만원
- 대출금 변동추이는 현재 선택 연도만 조회

이 ZIP은 전체 배포본이 아니라 수정/신규 파일만 포함한 패치입니다.

## 배포/커밋 내역
<!-- AUTO_DEPLOY_HISTORY -->
- 2026-09-30 03:11 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 13개 파일 업로드
- 2026-09-30 02:56 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 10개 파일 업로드
- 2026-09-30 02:29 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 12개 파일 업로드
- 2026-09-30 02:20 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 11개 파일 업로드
- 2026-09-30 02:09 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 29개 파일 업로드
- 2026-09-30 00:14 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 28개 파일 업로드
- 2026-09-30 00:05 KST — chore: kongmoney ZIP deploy 09-29-22:42 — 27개 파일 업로드
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
