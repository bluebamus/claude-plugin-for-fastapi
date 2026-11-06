---
name: php-testing
description: PHP 테스트 작성 기준 — 단위(메서드 하나의 기능)·API(Feature)·통합(거시적 업무 목적, 단위 테스트 결과에 기대지 않음) 3계층, 계층별 기반 TestCase·setUp 픽스처·CI4 Fabricator(Factory)·Faker·createStub/createMock·SQLite·Fake Repository, 도메인별 테스트 파일, phpunit.xml.dist 의 커버리지 설정, docs/test-plan HTML 테스트 문서. 순수 PHP 와 CodeIgniter 4, CodeIgniter 3 레거시 보호 테스트를 다룬다. 보호 테스트·구현(TDD)·검증 단계에서 테스트를 만들거나 고칠 때, "phpunit", "테스트 작성", "Feature 테스트", "통합 테스트", "커버리지", "테스트 문서"를 다룰 때 반드시 쓴다.
---

# php-testing — 단위 · API · 통합

모든 개발 작업은 세 계층을 검토한다. 필요 없는 계층은 단계 보고서 「테스트 계층」 절에 이유를 적는다.

| 계층 | 폴더 | 무엇을 | CodeIgniter 4 | 순수 PHP |
|---|---|---|---|---|
| 단위 | `tests/unit/` | **메서드 하나의 기능**: Service 메서드 하나, Entity·값 객체·검증 규칙 하나 | `CIUnitTestCase`, Model·Repository 는 Fake 또는 `createStub` | `PHPUnit\Framework\TestCase` |
| API | `tests/feature/` (순수 PHP 는 `tests/api/`) | **엔드포인트 하나가 그 목적대로 동작하는가**: 요청→응답(상태 코드·JSON·검증 오류·인증) | `FeatureTestTrait` + `DatabaseTestTrait`(SQLite) | 앱 커널을 `Request` 객체로 직접 호출 |
| 통합 | `tests/database/` (또는 `tests/integration/`) | **거시적 업무 목적**(예: "신청 후 취소하면 재고 복원"): 컨트롤러→Service→Model→DB, 트랜잭션·제약·동시성 | `DatabaseTestTrait`(`$migrate`, `$refresh`), 요구사항의 DB | 실제 PDO(요구사항의 DB 또는 SQLite 파일) |

## 1. 계층 사이의 규칙

- **단위 테스트는 메서드 하나만 본다.** 이름이 대상과 기대 동작을 말한다: `testPlaceRejectsWhenStockShort`. 다른 클래스의 동작은 Fake·stub 으로 고정한다.
- **API·통합 테스트는 거시적 목적 하나를 끝까지 확인한다.** docblock 첫 줄에 그 목적을 쓴다.
- **API·통합 테스트는 단위 테스트의 결과를 고려하지 않는다.** 단위에서 확인했다고 확인을 생략하지 않고, 단위 테스트의 Fake·헬퍼·데이터를 가져다 쓰지 않으며, 실행 순서를 가정하지 않는다. 계층마다 자기 기반 TestCase·`setUp()` 으로 스스로 준비한다.
- 테스트끼리 상태를 공유하지 않는다(`$refresh = true`, 순수 PHP 는 `setUp()` 에서 새 PDO·스키마).

## 2. 테스트 파일 — 도메인별로 나눈다

한 파일에 몰아넣지 않는다. 계층 폴더 안에서 **도메인별 파일**, 도메인이 모호하면 **서비스 하나의 CRUD** 를 한 파일로, 어디에도 속하지 않는 독립 모듈(헬퍼·라이브러리)은 **모듈마다 별도 파일**.

```
tests/
  _support/
    UnitTestCase.php            # 단위 공통: Faker 고정(seed), Fake 생성 헬퍼
    FeatureTestCase.php         # API 공통: DatabaseTestTrait + FeatureTestTrait, SQLite
    Fakes/FakeSupplyRepository.php
    Fabricators/SupplyFabricator.php   # CI4 Fabricator(Factory) 정의
  unit/
    SupplyServiceTest.php       # 도메인: 소모품 — 메서드별
    RequestServiceTest.php      # 도메인: 신청
    PaginationTest.php          # 독립 모듈
  feature/
    SuppliesApiTest.php         # 도메인: 소모품 CRUD 엔드포인트
    RequestsApiTest.php
  database/
    RequestLifecycleTest.php    # 목적: 신청→취소 시 재고 복원
    ConcurrentRequestsTest.php  # 목적: 동시 신청에서 재고 음수 없음
```

## 3. 도구 — 언제 무엇을

| 도구 | 쓰는 곳 | 대중적인 형태 |
|---|---|---|
| Fixture | 모든 계층의 준비물 | `setUp()`, 계층별 기반 TestCase(`tests/_support`), CI4 `$seed`(Seeder) |
| Factory | 같은 종류 행을 조건만 바꿔 여러 개 만들 때 | CI4 `Fabricator`(`fake(SupplyModel::class, ['stock' => 0])`), 순수 PHP 는 작은 팩토리 메서드 |
| Faker | 의미 없는 값을 채울 때 | `fakerphp/faker`(CI4 appstarter 기본 포함), `Factory::create('ko_KR')` + `seed(1234)`. 검증 대상 값은 리터럴로 |
| stub | 의존 대상의 **반환값만** 정할 때 | `$this->createStub(Clock::class)` + `method('now')->willReturn(...)` |
| mock | **호출 여부·인자**가 확인 대상일 때 | `$this->createMock(CacheInterface::class)` + `expects($this->once())->method('delete')` — 남용하지 않음 |
| Fake Repository | Service 단위 테스트 | 배열로 동작하는 진짜 구현(`tests/_support/Fakes`), 인터페이스를 같이 구현 |
| SQLite | API 테스트, 실제 DB 가 필요 없는 통합 | `phpunit.xml.dist` 의 `database.tests.DBDriver=SQLite3`, `database=:memory:` |
| 실제 MySQL·Redis | 요구사항이 그 엔진을 명시한 통합 테스트 | 환경 변수(`TEST_DATABASE_URL` 등)로 `database.tests.*`, 없으면 `markTestSkipped('…없음')` 과 보고서에 사유 |

## 4. 테스트 하나의 형태와 docblock

- 준비 → 실행(한 번) → 확인. 여러 입력은 `#[DataProvider('cases')]`(PHPUnit 10+, provider 는 `public static`). 본문에 조건문·반복문·try 를 쓰지 않는다.
- **docblock 은 테스트 문서의 원본이다.** 첫 줄 = 목적(요구사항 ID), 이어서 `준비:`·`실행:`·`확인:` 줄.

```php
<?php
// tests/unit/RequestServiceTest.php — 메서드 하나: RequestService::place
declare(strict_types=1);

namespace Tests\Unit;

use Tests\Support\Fakes\FakeSupplyRepository;
use Tests\Support\UnitTestCase;

final class RequestServiceTest extends UnitTestCase
{
    /**
     * R-2: 재고보다 많이 신청하면 OutOfStock 을 낸다.
     * 준비: 재고 1개인 소모품을 가진 FakeSupplyRepository
     * 실행: place(수량 2)
     * 확인: OutOfStock 예외
     */
    public function testPlaceRejectsWhenStockShort(): void
    {
        $repo = new FakeSupplyRepository([new Supply(id: 1, name: '펜', stock: 1)]);

        $this->expectException(OutOfStock::class);

        (new RequestService($repo))->place(new PlaceRequest(supplyId: 1, quantity: 2));
    }
}
```

```php
<?php
// tests/feature/SuppliesApiTest.php (CodeIgniter 4)
final class SuppliesApiTest extends FeatureTestCase
{
    /**
     * R-1: 소모품을 등록하면 201 과 등록한 이름을 돌려준다.
     * 준비: 빈 DB(SQLite)
     * 실행: POST /supplies {name: 펜, stock: 10}
     * 확인: 201, 응답 name = 펜
     */
    public function testCreateSupplyReturns201(): void
    {
        $result = $this->withBodyFormat('json')->post('supplies', ['name' => '펜', 'unit' => '개', 'stock' => 10]);

        $result->assertStatus(201);
        $result->assertJSONFragment(['name' => '펜']);
    }
}
```

예제의 422 같은 상태 코드는 설계 문서에 정한 값을 테스트한다(`failValidationErrors()` 기본은 400). CSRF 필터가 켜진 라우트는 토큰을 넣거나 API 그룹을 CSRF 대상에서 빼는 설계를 따른다(php-security). 테스트만을 위해 필터를 끄지 않는다.

흐름 테스트(통합)는 한 메서드에 여러 요청·확인을 둘 수 있다. 단계마다 짧은 주석, 클래스·메서드 이름에 목적(`Lifecycle`, `Flow`).

## 5. phpunit.xml.dist — 테스트 스위트·커버리지 설정

```xml
<phpunit bootstrap="vendor/codeigniter4/framework/system/Test/bootstrap.php" colors="true" cacheDirectory="build/.phpunit.cache">
  <testsuites>
    <testsuite name="unit"><directory>tests/unit</directory></testsuite>
    <testsuite name="feature"><directory>tests/feature</directory></testsuite>
    <testsuite name="database"><directory>tests/database</directory></testsuite>
  </testsuites>
  <source>
    <include><directory suffix=".php">app</directory></include>
    <exclude><directory>app/Views</directory><directory>app/Config</directory></exclude>
  </source>
  <coverage>
    <report><clover outputFile="build/logs/clover.xml"/><text outputFile="php://stdout" showOnlySummary="true"/></report>
  </coverage>
  <php>
    <env name="database.tests.DBDriver" value="SQLite3"/>
    <env name="database.tests.database" value=":memory:"/>
  </php>
</phpunit>
```

- 커버리지에는 드라이버(`pcov` 권장, 또는 Xdebug `XDEBUG_MODE=coverage`)가 필요하다. 커버리지를 만들 때는 `php vendor/bin/phpunit --coverage-clover build/logs/clover.xml`, 빠른 확인은 `--no-coverage`.
- `.gitignore` 에 `build/`.

## 6. 테스트 문서 — docs/test-plan

```
php vendor/bin/phpunit --coverage-clover build/logs/clover.xml
node "${CLAUDE_PLUGIN_ROOT}/scripts/test-plan.js" build      # docs/test-plan/index.html
```

맨 위 「한눈에 보기」(계층별 파일·테스트 수, 전체 커버리지) → 커버리지 표 → 파일별(도메인) → 전체 목록 → 테스트별 상세(목적·준비·실행·확인·실행 명령). 요약 항목을 누르면 상세로 이동한다. 완료 확인(`test-plan.js check`)은 문서에 빠진 테스트·남은 테스트·커버리지 없음을 실패로 본다.

## 7. 원자성·멱등 테스트 (외부 자원·DB 쓰기가 있을 때)

`stage-pilot:infra-resilience` §6·§8 의 필수 테스트: 중간 실패 롤백(`dontSeeInDatabase`), 같은 `Idempotency-Key` 재요청, 커밋 뒤 캐시 무효화, 경쟁 갱신(실제 DB). 메서드 이름에 `Rollback`·`Idempotent`(또는 docblock 에 롤백·멱등).

```php
/**
 * R-4: 같은 Idempotency-Key 로 다시 보내면 저장된 응답을 그대로 돌려준다(멱등).
 * 준비: 재고 5개인 소모품
 * 실행: 같은 키로 POST /requests 두 번
 * 확인: 두 응답 본문이 같음
 */
public function testCreateRequestIdempotentReplay(): void
{
    $req = $this->withHeaders(['Idempotency-Key' => 'k-1'])->withBodyFormat('json');
    $first = $req->post('requests', ['supply_id' => 1, 'quantity' => 1]);

    $second = $req->post('requests', ['supply_id' => 1, 'quantity' => 1]);

    $this->assertSame($first->getJSON(), $second->getJSON());
}
```

## 8. 레거시(보호 테스트)

- 바꾸기 전에 현재 출력(JSON·HTML 일부·DB 상태)을 그대로 기대값으로 고정. 이상해 보여도 "버그 후보"로 기록.
- CodeIgniter 3: 공식 테스트 도구가 없으므로 `tests/bootstrap.php` 에서 CI 를 부팅하고 컨트롤러 메서드 출력을 `ob_start()` 로 잡아 비교하거나, 로컬 내장 서버(`php -S`)로 HTTP 특성화 테스트. 기존 테스트 구조가 있으면 그것을 따른다. 새 테스트는 도메인별 파일로.

## 9. 단계 보고서의 「테스트 계층」 절

```
## 테스트 계층
| 계층 | 파일(도메인) | 개수 | 비고 |
| 단위 | tests/unit/RequestServiceTest.php | 6 | 메서드별 |
| API | tests/feature/RequestsApiTest.php | 8 | |
| 통합 | tests/database/RequestLifecycleTest.php | 2 | 신청→취소 재고 복원 |
실행: php vendor/bin/phpunit → OK (16 tests), 커버리지 88% (clover)
문서: docs/test-plan/index.html (test-plan.js check 통과)
```
