# Mermaid 도식 가이드

템플릿은 Mermaid 11.4.1을 쓴다. 원문은 `<script type="text/x-mermaid">` 안에 그대로 쓰므로 HTML 이스케이프(`&lt;` 등)를 하지 않는다. 테마는 템플릿이 정하므로 `%%{init: ...}%%`로 테마를 덮어쓰지 않는다.

## 목차
1. 도식 블록 형식
2. 장별 패턴 (1·3·4·5·6·8·9·10장)
3. 렌더링을 깨뜨리는 함정
4. 읽히는 도식을 위한 규칙

## 1. 도식 블록 형식

```html
<figure class="diagram">
  <script type="text/x-mermaid">
flowchart LR
  A["bbs/board.py"] --> B["service/board"]
  </script>
  <figcaption>무엇을 보여 주는지 한 문장. 근거: <code>bbs/board.py:120</code>, <code>service/board/create_post.py:40</code></figcaption>
</figure>
```

- 블록 하나에 도식 하나. 캡션은 반드시 둔다 — 검사 스크립트가 확인한다.
- 원문 안에 `</script>`를 쓰지 않는다(문서가 깨진다).

## 2. 장별 패턴

### 1장 시스템 컨텍스트 — `flowchart LR`
사람·외부 시스템·이 시스템·저장소를 4~8개 노드로. 이 시스템은 `subgraph`로 묶는다.

```
flowchart LR
  user(["사용자 브라우저"]) -->|HTTP| app
  admin(["관리자"]) -->|/admin| app
  subgraph app["myapp (FastAPI 단일 앱)"]
    web["화면 라우터<br/>Jinja 템플릿"]
    api["REST API /api/v1"]
  end
  app --> db[("MySQL / SQLite")]
  app --> mail["SMTP"]
```

### 3장 레이어·모듈 의존도 — `flowchart TB`
레이어는 `subgraph`, 화살표는 import 방향. 규칙을 어기는 의존(예: 라우터가 DB 직접 접근)은 `classDef`로 강조한다.

```
flowchart TB
  subgraph L1["진입"]
    R["bbs/*.py 화면 라우터"]
    A["api/v1/routers"]
  end
  subgraph L2["서비스"]
    S["service/board"]
  end
  subgraph L3["공용·DB"]
    LIB["lib/board_lib.py"]
    DB[("core/database.py")]
  end
  R --> S --> LIB --> DB
  A --> S
  R -.->|직접 세션| DB
  classDef warn stroke:#c23b3b,stroke-width:2px
  class R warn
```

### 4장 요청 시퀀스 — `sequenceDiagram`
흐름 하나에 하나. 참여자는 실제 계층(미들웨어·라우터·서비스·lib·DB). 커밋 위치는 `Note`로 드러낸다. 분기는 `alt`, 반복은 `loop`.

```
sequenceDiagram
  autonumber
  participant B as 브라우저
  participant M as main_middleware
  participant V as bbs/board.py write_update
  participant S as CreatePostService
  participant D as DB 세션
  B->>M: POST /board/write_update/free
  M->>D: 로그인 회원 조회
  M->>V: request.state.login_member
  V->>S: validate_write_level, save_write
  S->>D: INSERT write_free
  Note over S,D: commit #1 (service/board/create_post.py:88)
  alt 회원이면
    S->>D: 포인트 적립 + commit #2
  end
  V-->>B: 303 Redirect /board/free/{wr_id}
```

### 5장 데이터 모델 — `erDiagram`
핵심 테이블 5~10개만. 컬럼은 키와 흐름에 나오는 것만.

```
erDiagram
  MEMBER ||--o{ POINT : earns
  BOARD ||--o{ WRITE : contains
  MEMBER ||--o{ WRITE : writes
  MEMBER {
    string mb_id PK
    int mb_level
  }
  WRITE {
    int wr_id PK
    string bo_table FK
    string mb_id FK
  }
```

### 6장 상태 전이 — `stateDiagram-v2`
```
stateDiagram-v2
  [*] --> Pending
  Pending --> Paid: 결제 승인
  Paid --> Shipped: 출고
  Paid --> Cancelled: 취소 (환불)
  Shipped --> [*]
```

### 8장 트랜잭션·세션 경계 — `sequenceDiagram` 또는 `flowchart`
"누가 언제 commit하는가"가 핵심. 커밋 지점마다 `Note`를 달고, 중간 실패 시 무엇이 남는지 캡션에 적는다. async 안의 동기 호출은 `flowchart`에서 `classDef warn`으로 표시한다.

### 9장 위험 지도 — `quadrantChart` (선택)
좌표는 0~1. 점 이름은 짧게.

```
quadrantChart
  title 위험도와 변경 빈도
  x-axis 변경 드묾 --> 변경 잦음
  y-axis 위험 낮음 --> 위험 높음
  quadrant-1 먼저 테스트
  quadrant-2 감시
  quadrant-3 보류
  quadrant-4 정리 후보
  게시글 작성: [0.8, 0.85]
  자동로그인: [0.3, 0.9]
  설문: [0.2, 0.2]
```

### 10장 학습 경로 — `journey` 또는 `timeline` (선택)
```
timeline
  title 첫 주 학습 경로
  1일차 : 2장 실행 : 3장 구조
  2일차 : 4장 대표 흐름 2개 : 실습 1
  3일차 : 5·8장 데이터와 경계 : 실습 2
```

## 3. 렌더링을 깨뜨리는 함정

| 증상 | 원인 | 고치는 법 |
|---|---|---|
| flowchart 전체가 안 그려짐 | 노드 id를 소문자 `end`로 씀 | id를 `End`, `done` 등으로 |
| 괄호·슬래시·콜론이 든 라벨에서 오류 | 따옴표 없는 라벨 | `A["app/main.py: create_app()"]`처럼 큰따옴표로 감쌈 |
| 라벨 안 큰따옴표 | 라벨 문자열 종료 | `#quot;` 사용 |
| sequenceDiagram 메시지가 잘림 | 메시지에 `;` 사용(문장 구분자) | 쉼표나 `/`로 대체 |
| `alt`/`loop` 이후 오류 | `end` 누락 | 블록마다 `end` 짝 맞춤 |
| `subgraph` 이후 오류 | `end` 누락 | 검사 스크립트가 짝을 셈 |
| erDiagram 오류 | 컬럼 타입·이름에 공백, 관계 기호 오타 | 타입·이름은 한 단어, 관계는 `\|\|--o{` 형식 |
| 줄바꿈이 문자 그대로 나옴 | `\n` 사용 | 라벨 안에서 `<br/>` |
| 한글 라벨이 깨짐 | 따옴표 없이 특수문자와 섞임 | 한글 라벨은 큰따옴표로 감쌈 |

## 4. 읽히는 도식을 위한 규칙

- 노드 15개를 넘으면 나눈다. 큰 도식 하나보다 질문 하나에 답하는 작은 도식 여럿이 낫다.
- 노드 이름은 코드에 있는 이름을 그대로 쓴다(검색해서 찾을 수 있게).
- 도식이 보여 주는 결론을 캡션 첫 문장에 쓴다. 예: "화면 글쓰기는 커밋이 세 번 일어난다 — 중간 실패 시 글만 남을 수 있다."
- 같은 문서 안에서 같은 계층은 같은 이름·같은 색(classDef)으로 그린다.
