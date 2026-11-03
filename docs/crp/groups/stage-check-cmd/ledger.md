# Ledger — stage-check-cmd (결함 원장)

| ID | Severity | 위반 계약 조항 | 결정 | Status | 근거 | 비고 |
|---|---|---|---|---|---|---|
| F-001 | MED | INV-2 증거 무효 — `{work}`='x & exit 0' 은 치환돼도 셸이 0 을 돌려줘 테스트가 항상 통과 | Fix | Fixed | stage.test.js `치환하지 않는다` — work='abc', 치환 복원 시 실패 확인 | 독립 검수 Round 1 |
| F-002 | LOW | 실패 이유 표시 — 시간 초과가 마지막 출력 줄에 가려짐(cmd·test 공통) | Fix | Fixed | stage.js procWhy, 테스트 `시간 초과` — 문구 제거 시 실패 확인 | 형제 버그(test 확인) 함께 수정 |
