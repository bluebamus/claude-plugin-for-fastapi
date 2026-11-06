---
name: php-conventions
description: PHP 프로젝트(순수 PHP·CodeIgniter 4, 레거시 CodeIgniter 3)의 표준 구조·코드 스타일(PSR-1·4·12)·설계 패턴·composer 패키지 관리 기준. 설계·기술 선정·구현·리팩토링 단계에서 PHP 코드를 만들거나 고치기 전에, 그리고 "구조", "레이어", "패턴", "composer require", "PSR", "CodeIgniter 컨트롤러·모델·서비스"를 다룰 때 반드시 쓴다. PHP-FIG 표준과 CodeIgniter 공식 User Guide 의 형태를 따르고, 요구사항이 요구하지 않는 계층·추상화는 만들지 않는다.
---

# php-conventions — 구조·스타일·패턴·composer

목표: 처음 보는 PHP 개발자가 바로 읽을 수 있는 코드. **PHP-FIG 표준(PSR)과 CodeIgniter 공식 문서의 관례**를 기준으로 한다. 먼저 프로젝트 종류를 판별한다.

| 판별 | 근거 | 이 스킬의 절 |
|---|---|---|
| CodeIgniter 4 | `composer.json` 에 `codeigniter4/framework`, `app/Config/`, `spark` | 3 |
| CodeIgniter 3 (레거시) | `application/config/`, `system/core/CodeIgniter.php`, `CI_Controller` | 4 |
| 순수 PHP | 위 둘이 아님 | 2 |

## 1. 공통 — composer · 스타일

| 하려는 일 | 명령 |
|---|---|
| 새 CI4 프로젝트 | 빈 폴더면 `composer create-project codeigniter4/appstarter .`. 이미 `.git`·문서가 있으면 composer 가 거부하므로 `composer create-project codeigniter4/appstarter _ci4` → `_ci4` 내용을 루트로 옮김(`.gitignore` 는 합침) → `_ci4` 삭제 |
| 새 순수 PHP 프로젝트 | `composer init` 후 `"autoload": {"psr-4": {"App\\": "src/"}}`, `composer dump-autoload` |
| 실행 의존성 | `composer require <패키지>` (손으로 composer.json 고치지 않음) |
| 개발 의존성 | `composer require --dev phpunit/phpunit squizlabs/php_codesniffer` (CI4 appstarter 는 phpunit 포함) |
| 환경 맞추기 | `composer install` (CI: `composer install --no-interaction --prefer-dist`) |
| 테스트·스타일 | `php vendor/bin/phpunit`, `php vendor/bin/phpcs` |

- `composer.json`·`composer.lock` 커밋, `vendor/` 는 커밋하지 않는다. PHP 최소 버전은 `"require": {"php": "^8.1"}` 처럼 명시.
- 스타일은 **PSR-12**(PSR-1·PSR-4 포함). 프로젝트 루트 `phpcs.xml`:
  ```xml
  <?xml version="1.0"?>
  <ruleset name="project">
    <rule ref="PSR12"/>
    <config name="ignore_warnings_on_exit" value="1"/>  <!-- 경고(줄 길이 등)는 보고만, 오류만 실패 -->
    <file>app</file>      <!-- 순수 PHP 는 src -->
    <file>tests</file>
    <exclude-pattern>app/Config/*</exclude-pattern>
    <exclude-pattern>app/Views/*</exclude-pattern>
    <exclude-pattern>*/Database/Migrations/*</exclude-pattern>
  </ruleset>
  ```
  CI4 가 생성한 설정·뷰 파일은 프레임워크 형식을 따르므로 검사에서 뺀다.
- 새 파일은 `declare(strict_types=1);`, 모든 매개변수·반환에 타입. 클래스 하나에 파일 하나, 네임스페이스는 폴더와 일치(PSR-4).
- 이름: 클래스 `PascalCase`, 메서드·변수 `camelCase`, 상수 `UPPER_CASE`, DB 컬럼 `snake_case`.
- 전역 함수·`global`·정적 가변 상태 금지. 설정·비밀값은 `.env`(CI4 `env()`/Config, 순수 PHP `getenv`).

## 2. 순수 PHP — 구조와 패턴

```
public/index.php        # 유일한 진입점(front controller) — 라우팅만
src/Http/Controller/    # 요청 해석·응답(JSON)·상태 코드
src/Service/            # 비즈니스 규칙, 트랜잭션 경계(UoW: beginTransaction·commit·rollBack)
src/Dto/                # final readonly 요청·응답 DTO
src/Repository/         # PDO 쿼리만(prepared statement)
src/Domain/             # 값 객체·엔티티
config/                 # 설정 배열, .env 읽기
tests/unit/ tests/api/ tests/integration/
```

- 의존성은 생성자 주입. 작은 프로젝트는 `public/index.php` 에서 손으로 조립(컨테이너 라이브러리는 필요할 때만).
- DB 는 `PDO`(`ERRMODE_EXCEPTION`, `EMULATE_PREPARES=false`), 항상 바인드 파라미터. PDO·Redis 등 외부 자원은 `config/` 팩토리 한 곳에서 만들어 생성자로 넘긴다(→ infra-resilience §8).
- 라우팅 라이브러리가 필요하면 널리 쓰는 것(예: `nikic/fast-route`)을 고르고 기술 선정 문서에 근거를 적는다.

## 3. CodeIgniter 4 — 구조와 패턴

```
app/Config/Routes.php   # $routes->get('items', 'Items::index'); API 는 $routes->resource() 또는 group
app/Controllers/        # BaseController 상속, API 는 ResourceController / ResponseTrait
app/Services/           # (직접 만듦) 비즈니스 규칙·트랜잭션 — Config\Services 에 등록하거나 생성자에서 생성
app/Models/             # CodeIgniter\Model — $table, $allowedFields, $returnType(Entity), $validationRules
app/Entities/           # CodeIgniter\Entity\Entity — 캐스팅·접근자
app/Dto/                # (직접 만듦) final readonly 요청·응답 DTO
app/Filters/            # 인증·권한·CSRF·CORS (Config\Filters 에 등록)
app/Database/Migrations/ app/Database/Seeds/
tests/unit/ tests/feature/ tests/database/
```

| 패턴 | CI4 관용 형태 |
|---|---|
| 얇은 컨트롤러 | 입력 검증(`$this->validate()` 또는 Validation 서비스) → Service 호출 → `respond()`/`respondCreated()`/`failNotFound()` |
| Service layer | 규칙이 하나라도 있으면 `app/Services/XService.php`, `ConfigServices` 에서 연결·Model 을 생성자로 넘겨 조립, 컨트롤러는 Service 만 부름(→ design-patterns §9). 트랜잭션은 `$db->transException(true)->transStart()`… `transComplete()` |
| Unit of Work | DB 쓰기가 있으면 항상: Service 메서드 하나 = 트랜잭션 하나, 예외면 `transRollback()` 후 다시 던짐, 캐시 삭제·색인은 `transComplete()` 뒤(→ infra-resilience §8) |
| DTO | 항상: `final readonly class PlaceOrder` + `fromArray()` 에서 검증, 응답도 DTO(`OrderView`). 연관 배열을 계층 사이로 넘기지 않음 |
| 외부 자원 | `Config\Database` 그룹·`Config\Cache`(redis·memcached)·`Config\Services` 공유 인스턴스(phpredis·Elasticsearch), 값은 `.env` |
| Model | 쿼리는 Model·Query Builder 로. `$allowedFields` 로 대량 할당 제한, `$useTimestamps` |
| 횡단 관심사 | Filter(인증·권한·로깅). 컨트롤러마다 반복하지 않음 |
| 설정 | `.env` + `app/Config/*` , 코드에 상수로 박지 않음 |

금지: 컨트롤러에서 `$db->query()` 직접 사용, 뷰에서 쿼리, Model 에 HTTP 응답 로직, `$allowedFields` 없이 `insert($this->request->getPost())`.

## 4. CodeIgniter 3 (레거시 유지보수)

- 구조를 바꾸지 않는다. 새 코드는 같은 관례로: `application/controllers`(CI_Controller), `application/models`(CI_Model), `application/libraries`(규칙을 모을 곳).
- DB 는 Query Builder(`$this->db->where()->get()`) 또는 `query($sql, $binds)`. 문자열 이어 붙인 SQL 금지.
- 테스트 하네스가 없으면 보호 테스트는 PHPUnit + 부트스트랩으로 컨트롤러 출력·모델 결과를 고정(php-testing).
- CI4 로의 이전은 별도 작업(고도화 트랙)으로만.

## 5. 로컬에 PHP 가 없을 때 — Docker

PHP 를 설치하지 않은 PC 에서는 공식 이미지로 실행한다. 예: `docker run --rm -v "$PWD":/app -w /app composer:2 composer install`, 테스트는 `php:8.3-cli`(intl 확장 추가) 이미지에서 `php vendor/bin/phpunit`. 프로젝트에 `compose.yaml` 이 있으면 `docker compose run --rm app php vendor/bin/phpunit` 을 쓰고, stage-pilot 완료 확인에는 그 명령을 `set … --test "<명령>"` 으로 준다. 이 저장소의 `eval/php-docker/` 에 Windows(WSL Docker)용 `php`·`composer` 래퍼 예시가 있다.

## 6. 완료 전 확인

```
php vendor/bin/phpunit --no-coverage   # 커버리지 드라이버가 없어도 경고로 실패하지 않게
php vendor/bin/phpcs          # phpcs.xml 이 있을 때
php -l <바꾼 파일>              # 구문 확인(fastapi-quality-gates 가 편집 직후 자동 보고)
```

php-lsp(Intelephense)가 켜져 있으면 편집 중 타입·정의 오류를 바로 고친다.
