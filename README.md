# Jekyll GitBook Theme for jonghyeon.me

테마 사용자화와 업데이트 마이그레이션을 쉽게 하기 위한 테마 리포지토리

## Requirements

- git
- node.js (jekyll-chirpy theme)

## 마이그레이션

```
sh deploy.sh
```

- `deploy_chirpy.sh`: Chirpy 테마를 `v7.5.0` 기준으로 배포
- `chirpy_override/postdeploy.sh`: 프론트엔드 빌드 후 `bundle update`로 Ruby 의존성 최신화

## 테마 사용자화 정의

`deploy.sh` 파일에 사용자화 내용 정의
