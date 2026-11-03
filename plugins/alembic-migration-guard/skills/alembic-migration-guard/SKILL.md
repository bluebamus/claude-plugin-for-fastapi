---
name: alembic-migration-guard
description: Alembic 마이그레이션을 만들거나 고칠 때, autogenerate 결과를 검토할 때, 스키마 변경을 커밋하기 전에 쓴다. 이름 변경이 drop+add 로 생성돼 데이터가 사라지는 경우, drop_table·drop_column, NOT NULL 추가에 기본값이 없는 경우, 비어 있는 downgrade 를 찾고, 로컬 DB 에서 upgrade→downgrade→upgrade 왕복을 확인한다. "마이그레이션", "alembic", "스키마 변경", "컬럼 추가·삭제·이름 변경"이 나오면 쓴다.
---

# alembic-migration-guard

스크립트 위치는 이 스킬의 기본 폴더 기준 `../../scripts/guard.js` 다. 프로젝트 루트에서 실행한다.

## 1. 정적 검사 — 모든 리비전

```
node "<플러그인>/scripts/guard.js" scan [마이그레이션 폴더]
```

폴더를 안 주면 `alembic.ini` 의 `script_location`(경로·`%(here)s`·패키지 형식 `myapp.db:migrations`)/versions, `alembic/versions`, `migrations/versions` 순으로 찾는다. 찾은 것마다 `파일:줄 [코드] 설명`, 하나라도 있으면 종료 코드 1. `op.*` 와 `with op.batch_alter_table(...) as <별칭>:` 안의 `<별칭>.*` 를 모두 본다.

`--changed` 를 붙이면 git 기준으로 바뀌었거나 새로 생긴 리비전만 본다(git 이 아니거나 커밋이 없으면 전체). 기준은 `--since <커밋>`, 없으면 HEAD. stage-pilot 완료 확인은 `--since {base}`(트랙 시작 커밋)로 돌려, 작업 중 커밋한 리비전도 놓치지 않고 이미 적용된 옛 리비전은 단계를 막지 않게 한다. 전체 이력 점검은 `--changed` 없이 따로 돌려 보고만 한다.

| 코드 | 뜻 | 고치는 법 |
|---|---|---|
| `rename-suspect` | 같은 테이블에 drop_column + add_column — autogenerate 는 이름 변경을 이렇게 만든다 | `op.alter_column(t, old, new_column_name=new)` |
| `destructive` | drop_table·drop_column | 의도했으면 그 줄 끝에 `# guard: destructive-ok <이유>`(백업·이관 근거) |
| `not-null-no-default` | NOT NULL 컬럼 추가·변경에 `server_default` 없음 | 기본값을 주거나 아래 expand–contract 로 나눈다 |
| `no-downgrade` | downgrade 가 비었거나 `pass` 뿐 | 되돌리는 코드를 쓰거나, 되돌릴 수 없으면 `# guard: irreversible <이유>` |

표시(`guard:`)는 사람이 판단했다는 기록이다. 검사를 통과시키려고 Claude 가 스스로 붙이지 않는다 — 사용자에게 이유를 확인한 뒤 붙인다.

## 2. 왕복 테스트 — 로컬 DB 에서만

```
DATABASE_URL=sqlite:///./guard.db node "<플러그인>/scripts/guard.js" roundtrip
```

`alembic upgrade head → downgrade -1 → upgrade head`. 아래 3절과 같은 판정으로 대상 후보가 모두 로컬일 때만 실행하고, 아니면 종료 코드 2(`env.py` 가 ini 만 읽으면 `DATABASE_URL=` 은 소용없다 — ini 를 로컬 주소로 둔 설정 파일을 쓴다). SQLite 는 ALTER 제약(batch mode)이 달라 운영 DB(Postgres·MySQL)와 결과가 다를 수 있다 — 운영과 같은 엔진을 로컬(docker 등)로 띄워 쓰는 것이 정확하다.

## 3. 원격 DB 차단 후크 (자동)

Bash 에서 `alembic upgrade|downgrade|stamp` 를 실행하려 하면, 실제 대상은 `env.py` 가 정하므로 주소 하나를 골라 믿지 않고 **`env.py` 가 읽는 출처의 후보 주소를 모두** 모은다. 후보가 모두 로컬(sqlite, localhost·127.0.0.1·::1 — `?host=`·`?hostaddr=` 까지 로컬, `?service=` 는 로컬 아님)이면 통과, 하나라도 원격이면 거부, 후보가 없거나 모르면 사용자 확인을 요청한다.

후보가 늘면 판정은 거부·확인 쪽으로만 바뀌므로, 확실하지 않은 출처도 후보에 넣는다.

- 명령 문자열에 나타난 DB 주소(`postgresql://`·`mysql://`·`sqlite://` 등)는 변수 이름·대입 형식(`env`·`export`·`set`·`$env:`)과 상관없이 언제나 후보
- 주소 같은 이름(`…URL`·`…URI`·`…DSN`)의 변수에 DB 주소가 아닌 값(`$PROD`·`%X%`)을 넣으면 모름
- `env.py` 가 이름으로 읽는 환경 변수(`os.environ["X"]`·`os.getenv("X")`)마다 그 값(후크 환경·`.env`·명령 안 대입)이 후보. 값이 하나도 안 보이는 이름이 있거나, 명령 안에서 DB 주소가 아닌 값(`$PROD`·`$(…)`·`%X%`)을 대입하면 모름
- `env.py` 가 `settings` 객체를 쓰거나, 이름 없이 환경을 읽거나, 계산한 값을 `set_main_option` 하면 무엇을 읽는지 알 수 없어 모름 — 흔한 FastAPI 구성은 매번 확인 요청이 된다
- 설정 파일 주소는 `env.py` 가 ini 로 엔진을 만들 때(`engine_from_config`·`get_main_option("sqlalchemy.url")`, 직접 `create_engine(` 없음)만 후보: 쓰기 명령 조각마다 `-c`/`--config` 파일(없으면 `alembic.ini`)의 `[alembic]` 섹션(`-n`/`--name` 으로 바꾼 섹션) `sqlalchemy.url`. `alembic init` 자리표시자 `driver://…` 는 제외, 고른 섹션이 없으면 모름. 환경 변수도 ini 도 쓰지 않는 `env.py`(앱 설정 모듈 등)는 모름
- `env.py` 를 못 찾으면 `DATABASE_URL`(후크 환경·`.env`)과 설정 파일 주소를 모두 후보로. `-x` 로 값을 넘기면 모름
- 명령 안에서 폴더를 옮기면(`cd`·`pushd`·`Set-Location`, `uv run --directory`·`--project`) 다른 프로젝트 설정이 쓰이므로 모름
- 모름이어도 명령에 원격 주소가 보이면 거부
- 다른 머신·클러스터에서 실행(`ssh`·`kubectl`·`oc`·`heroku`·`fly`·`gcloud`·`aws`·`az`)하면 거부, 컨테이너·VM 안 실행(`docker`·`podman`·`nerdctl`·`vagrant`)은 확인 요청

이 판정은 `env.py` 를 정적으로 읽는 추정이다. 통과는 "보이는 근거가 모두 로컬"이라는 뜻이지 보장이 아니다 — 운영 DB 보호의 마지막 선은 운영 자격 증명을 개발 환경에 두지 않는 것이다.

후크는 명령 문자열과 자기 환경만 본다 — 셸 프로필·direnv·스크립트 파일 안에서 정한 값은 보지 못한다.

## 4. 무중단 변경(expand–contract) 체크리스트

1. expand: 새 컬럼을 nullable(또는 기본값)로 추가, 앱이 옛·새 컬럼 모두에 쓰게 배포
2. backfill: 기존 행을 채우는 데이터 마이그레이션(큰 테이블은 나눠서)
3. 읽기를 새 컬럼으로 전환해 배포
4. contract: NOT NULL 로 바꾸고 옛 컬럼 삭제(`destructive-ok` 표시와 근거)
