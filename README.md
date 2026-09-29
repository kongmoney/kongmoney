# KongMoney v5.8.0 PATCH

기준: v5.7.0 적용 후 덮어쓰기용 패치.

## 변경사항
- D1 `monthly_summary` 테이블 추가
- 월정산 결과를 D1 캐시로 저장
- 대시보드 월 조회 시 월정산 계산을 매번 다시 하지 않고 D1 캐시에서 즉시 조회
- 지출 추가/수정/삭제 시 변경 월부터 12월까지 CE 이월 체인을 포함해 필요한 구간만 재계산
- 대출 수정/초기화 시 변경 월부터 12월까지 필요한 구간만 재계산
- 최초 1회 월정산 H열 수고비와 SETTINGS 기본값을 읽어 2026년 12개월 캐시 생성
- 시트 동기화 시 D1 지출 + D1 대출 + D1 월정산 캐시를 Google Sheet에 백업
- `/api/d1-status`에 `monthlySummaryCount` 추가

## 패치 파일
- functions/api/_lib/d1.js
- functions/api/_lib/summary-store.js (신규)
- functions/api/_lib/settlement.js
- functions/api/dashboard.js
- functions/api/expenses.js
- functions/api/loan.js
- functions/api/sheet-sync.js
- functions/api/d1-status.js
- VERSION.txt
- README.md

## 배포/커밋 내역
<!-- AUTO_DEPLOY_HISTORY -->
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
