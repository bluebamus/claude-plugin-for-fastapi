---
name: php-testing
description: PHP 테스트 작성 기준 — PHPUnit 단위 테스트, API(HTTP) 테스트, DB 통합 테스트의 3계층과 같은 환경 유지, 테스트 하나에 동작 하나. 순수 PHP 와 CodeIgniter 4(CIUnitTestCase·FeatureTestTrait·DatabaseTestTrait), CodeIgniter 3 레거시 보호 테스트를 다룬다. 보호 테스트·구현(TDD)·검증 단계에서 테스트를 만들거나 고칠 때, "phpunit", "테스트 작성", "Feature 테스트", "통합 테스트"를 다룰 때 반드시 쓴다.
---

# php-testing — 단위 · API · 통합

모든 개발 작업은 세 계층을 검토한다. 필요 없는 계층은 단계 보고서 「테스트 계층」 절에 이유를 적는다.

| 계층 | 폴더 | 대상 | CodeIgniter 4 | 순수 PHP |
|---|---|---|---|---|
| 단위 | `tests/unit/` | Service 규칙, Entity·값 객체, 검증 규칙 | `CIUnitTestCase`, Model 은 가짜 객체(`createMock`) | `PHPUnit\Framework\TestCase` |
| API | `tests/feature/` (순수 PHP 는 `tests/api/`) | 엔드포인트 하나의 요청→응답(상태 코드·JSON·검증 오류·인증) | `FeatureTestTrait` + `DatabaseTestTrait` | 앱 커널을 직접 호출하거나 내장 서버 대신 `Request` 객체로 핸들러 실행 |
| 통합 | `tests/database/` (또는 `tests/integration/`) | Model·Repository 와 실제 DB, 트랜잭션·제약, 여러 엔드포인트 흐름 | `DatabaseTestTrait`(`$migrate = true`, `$refresh = true`) | SQLite 메모리 PDO + 스키마 |

## 같은 환경 유지

- `composer require --dev phpunit/phpunit` 로만 넣고 `php vendor/bin/phpunit` 으로 돌린다. 설정은 `phpunit.xml.dist` 한 곳(테스트 스위트·부트스트랩·환경 변수).
- CI4: `phpunit.xml.dist` 에 테스트 DB 를 SQLite 메모리로:
  ```xml
  <env name="database.tests.DBDriver" value="SQLite3"/>
  <env name="database.tests.database" value=":memory:"/>
  ```
  `DatabaseTestTrait` 의 `$refresh = true` 로 테스트마다 마이그레이션을 다시 적용해 깨끗한 DB 에서 시작한다. 공통 데이터는 Seeder(`$seed`)로.
- 순수 PHP: `setUp()` 에서 메모리 SQLite PDO 와 스키마를 만들고, 테스트끼리 상태를 공유하지 않는다.
- 시간·난수·외부 HTTP 는 주입한 의존성을 가짜로 바꿔 고정. 네트워크에 나가는 테스트는 없다.

## 테스트 하나에 동작 하나 (단위·API)

- 메서드 이름이 확인하는 동작 하나를 말한다: `testCreateItemReturns201`, `testCreateItemRejectsNegativePrice`.
- 준비 → 실행(한 번) → 확인. 확인은 그 동작의 결과만.
- 여러 입력은 `#[DataProvider('invalidPrices')]`(PHPUnit 10+, `use PHPUnit\Framework\Attributes\DataProvider;`, provider 는 `public static function`) — 반복문으로 몰아넣지 않는다.
- 본문에 조건문·반복문·try 를 쓰지 않는다. 준비 코드는 `setUp()`·작은 팩토리 메서드로.
- 요구사항 ID 를 docblock 에: `/** R-2: 가격이 음수면 422. */`

```php
<?php
// tests/feature/ItemsTest.php (CodeIgniter 4)
declare(strict_types=1);

namespace Tests\Feature;

use CodeIgniter\Test\CIUnitTestCase;
use CodeIgniter\Test\DatabaseTestTrait;
use CodeIgniter\Test\FeatureTestTrait;

final class ItemsTest extends CIUnitTestCase
{
    use DatabaseTestTrait;
    use FeatureTestTrait;

    protected $migrate = true;
    protected $refresh = true;
    protected $namespace = null; // 앱 마이그레이션 전부

    /** R-1: 상품을 등록하면 201 과 id 를 돌려준다. */
    public function testCreateItemReturns201(): void
    {
        $result = $this->withBodyFormat('json')->post('items', ['name' => 'pen', 'price' => 1000]);

        $result->assertStatus(201);
        $result->assertJSONFragment(['name' => 'pen']);
    }

    /** R-2: 가격이 음수면 422. */
    public function testCreateItemRejectsNegativePrice(): void
    {
        $result = $this->withBodyFormat('json')->post('items', ['name' => 'pen', 'price' => -1]);

        $result->assertStatus(422);
    }
}
```

예제의 422 는 컨트롤러가 `$this->fail($errors, 422)` 로 응답할 때다(`failValidationErrors()` 기본은 400). 설계 문서에 정한 상태 코드를 테스트한다.

CSRF 필터가 켜진 라우트는 테스트에서 토큰을 넣거나, API 그룹을 CSRF 대상에서 빼는 설계를 따른다(php-security). 테스트만을 위해 필터를 끄지 않는다.

## 흐름 테스트(예외)

여러 기능을 잇는 **API 흐름 테스트와 통합 테스트는** 한 메서드에 여러 요청·확인을 둘 수 있다(예: 대여 → 반납 → 목록). 대신 `tests/database/`(또는 integration)에 두고 이름에 `Flow`, 단계마다 짧은 주석.

## 레거시(보호 테스트)

- 바꾸기 전에 현재 출력(JSON·HTML 일부·DB 상태)을 그대로 기대값으로 고정. 이상해 보여도 "버그 후보"로 기록.
- CodeIgniter 3: 공식 테스트 도구가 없으므로 `tests/bootstrap.php` 에서 CI 를 부팅하고 컨트롤러 메서드 출력을 `ob_start()` 로 잡아 비교하거나, 로컬 내장 서버(`php -S`)로 HTTP 특성화 테스트. 기존 테스트 구조가 있으면 그것을 따른다.

## 단계 보고서의 「테스트 계층」 절

```
## 테스트 계층
| 계층 | 파일 | 개수 | 비고 |
| 단위 | tests/unit/ItemServiceTest.php | 4 | |
| API | tests/feature/ItemsTest.php | 6 | |
| 통합 | tests/database/ItemFlowTest.php | 1 | 등록→조회→삭제 흐름 |
실행: php vendor/bin/phpunit → OK (11 tests, 25 assertions)
```
