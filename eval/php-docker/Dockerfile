# 로컬에 PHP 가 없는 Windows 에서 CodeIgniter 4 를 실행·테스트하기 위한 이미지(공식 이미지만 사용).
# MySQL(mysqli·pdo_mysql)·Redis(phpredis) 확장, 커버리지 드라이버 pcov 포함.
# 빌드(WSL): docker build -t sp-php:8.3 <이 폴더>
FROM php:8.3-cli
RUN apt-get update \
 && apt-get install -y --no-install-recommends libicu-dev libzip-dev unzip git \
 && docker-php-ext-install intl zip mysqli pdo_mysql \
 && pecl install redis pcov && docker-php-ext-enable redis pcov \
 && rm -rf /var/lib/apt/lists/*
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
