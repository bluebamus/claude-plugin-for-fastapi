# Design Baseline — fastapi-guards (가드 플러그인과 stage-pilot 연결)

## 0. 질의 수준
- [x] **간략** — 사용자가 계획 수립부터 두 브랜치 커밋·푸시까지 일괄 요청. 선택일: 2026-11-03

## 1. 목적 / 배경
확장 플러그인 검토(7개 후보)의 결론 — 새 플러그인 3개 + stage-pilot 보강 — 을 main(FastAPI판)과
php(main + PHP 지원) 각각에 맞게 반영한다. 선행 기반은 그룹 `stage-check-cmd`(cmd·if 확인).

## 2. 요구사항 레지스터
| Req-ID | 날짜 | 요청(원문 요약) | 도출된 요구사항 | 상태 | 연결 |
|---|---|---|---|---|---|
| REQ-001 | 2026-11-03 | "main 과 php 각각 별도로 고려해 반영 계획 수립·반영·테스트·검수 후 각 브랜치에 커밋 푸시, 두 브랜치만 로컬·원격에 존재, 모든 브랜치 최신" | (a) 판별 계획표(아래 ADR-002) (b) main: S·A·B·C·D·E (c) php: main 전체 + PHP 항목(B·C 의 PHP 확장) (d) 각 판 테스트·독립 검수 (e) main·php 만, 로컬=원격 | Active | ADR-001~004, C-1~4 |

## 3. 설계 결정 기록
| ADR-ID | 날짜 | 결정 | 근거 | 상태 |
|---|---|---|---|---|
| ADR-001 | 2026-11-03 | cmd 토큰은 신뢰 값만: `{python}`(프로젝트 인터프리터), `{plugin:이름}`(installed_plugins.json 설치 경로, 미설치면 건너뜀). `{work}` 금지 | stage-check-cmd ADR-001 유지. 가드는 선택 설치라 없을 때 단계를 막지 않음 | Accepted |
| ADR-002 | 2026-11-03 | 판별 반영: main = S(토큰)·A(api-contract-guard)·B(alembic-migration-guard)·C(fastapi-quality-gates: ruff)·D(perf.js)·E(훅 timeout 15s). php = main 전부 + B 에 CodeIgniter 마이그레이션 검사·`php spark migrate` 차단, C 에 `php -l`. A 의 PHP 판은 만들지 않음 | php 판은 같은 4트랙을 FastAPI·PHP 가 공유하므로 FastAPI 가드는 `if` 로 FastAPI 프로젝트에서만 돈다. CodeIgniter 는 응답 스키마가 없어 라우트 파일 git diff 이상을 얻지 못함 | Accepted |
| ADR-003 | 2026-11-03 | 보류: observability·deploy·authz 패턴 템플릿, 턴 종료 pyright(pyright-lsp 중복), pip-audit·trivy(외부 전송), 마이그레이션 왕복을 완료 확인에 넣는 것(로컬 DB 필수가 되므로 run 항목으로만) | 로컬 전용 원칙, 레거시 소음, 범위 | Accepted |
| ADR-004 | 2026-11-03 | `1c54db7`(사용자 커밋, 훅 timeout 5→15s, 로컬 php 에만 있던 미푸시 커밋)을 두 판에 반영 | 범용 Windows 수정. php 를 main 의 상위 집합으로 유지 | Accepted |

## 4. 불가침 제약
- C-1: 기존 check 판정 불변(stage-check-cmd C-1).
- C-2: 가드가 미설치여도 어떤 단계도 막히지 않는다.
- C-3: 판정·후크는 외부로 아무것도 보내지 않는다(로컬 전용 원칙).
- C-4: 원격 브랜치는 main·php 만. 로컬 main·php 는 원격과 같은 커밋.

## 5. 변경 이력
- v0.1 (2026-11-03): 최초 작성.
