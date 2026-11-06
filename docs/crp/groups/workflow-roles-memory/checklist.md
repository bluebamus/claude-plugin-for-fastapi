# Checklist — workflow-roles-memory

## Round 1 — 2026-11-06
- [x] 요청을 design-baseline §2 에 기록(REQ-001~008), 이전 요구(C-1 기존 check 동작)와 충돌 없음
- [x] main: pyright-lsp core 유지 확인, 단계별 역할·전문 스킬 4종·작업 메모리·에이전트 사용안
- [x] php: main 변경 이식, php-lsp, greenfield-php(순수 PHP·CodeIgniter 4), PHP 스킬 3종, 레거시 언어 짝
- [x] 플러그인 재검토 문서(main·php), 신뢰 기준(ADR-002) 충족분만 등록
- [x] 독립 검수 F-001~F-017 Fixed
- [x] 단위 테스트: main 98 / php 123 통과
- [x] 실전 평가: main 신규→고도화 18/18, php 신규 9 + 고도화 9 통과
- [x] main·php 직접 푸시 없음 — 작업 브랜치 + draft PR(C-2)

## Round 2~5 — 2026-11-06
- [x] REQ-009 외부 자원 수명주기·UoW·원자성·멱등성(infra-resilience), ifHas·testsHas 확인 — main 18/18, php 18/18(실제 MySQL·Redis)
- [x] REQ-010 설계 패턴 가이드(design-patterns): 목적·명세 → 규모 판정 → 패턴, 라우터는 Service 만·세션은 UoW 안, Builder·Abstract Factory 조건부 — main 18/18, php 18/18
- [x] REQ-011 테스트 규칙·docs/test-plan HTML·커버리지(test-plan.js), 도메인별 파일, 계층별 conftest(PHP: tests/_support) — main 18/18 ×2, php 18/18
- [x] 단위 테스트: main Node 113·Python 15, php Node 141·Python 15
- [x] main·php 직접 푸시 없음 — 작업 브랜치만
