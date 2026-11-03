# Checklist — fastapi-guards

## main — 2026-11-03
- [x] 요청을 design-baseline §2 에 기록(REQ-001), 판별 계획 ADR-002
- [x] S·A·B·C·D·E 반영, 단계 연결, 문서·버전
- [x] (F-001~F-027) 회귀 테스트 + 구현 전 실패 확인
- [x] 결정적 게이트 그린(테스트·매니페스트 검증)
- [x] 요구사항 회귀 0 — C-1(기존 확인 판정 불변)·C-2(미설치 건너뜀)·C-3(로컬 전용)
- [x] run-log·residual-risk 갱신

## php — 2026-11-03
- [x] main 커밋 cherry-pick(충돌 6파일 — php 고유 내용 유지) + PHP 항목(B: CodeIgniter 마이그레이션 검사·spark 차단·CI4 왕복, C: php -l, stage-map 조건·Serena 문구)
- [x] php 판 테스트·독립 검수(F-028~F-032, F-028·F-032 는 main 에도)
- [x] C-4: 원격 main·php 만, 로컬 = 원격 (push 후 동기화로 확인)
