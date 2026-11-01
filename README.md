# Jekyll themes for jonghyeon.me

테마별 사용자화와 재현 가능한 배포를 관리합니다.

## 테마 버전

| 테마 | 버전 |
| --- | --- |
| Basically Basic | 1.4.5 |
| Chirpy | v7.6.0 |
| Contrast | v4.8 |
| Garden | a8df83d (기본 브랜치) |
| GitBook | a7d8769 (기본 브랜치) |
| Minimal Mistakes | 4.28.1 |

정확한 소스 커밋은 `themes.lock.json`에 고정합니다. 버전 갱신 시 이 파일을 수정합니다.

## 공통 요소

`common/`은 모든 테마에 복사되며 공통 head include를 통해 로드됩니다.

- [graph-embedded-renderer](https://github.com/ShapeLayer/graph-embedded-renderer): `window.GraphRenderer`로 제공
- [textip](https://github.com/ShapeLayer/textip): `window.mathTooltips`로 제공. MathJax 시작 전 설정하며 `\tooltip{수식}{설명}` 등을 지원

두 라이브러리는 `vendor/graph-embedded-renderer`와 `vendor/textip`의 Git 서브모듈로 관리합니다.
처음 체크아웃할 때 `git clone --recurse-submodules`를 사용하거나, 기존 체크아웃에서 `git submodule update --init --recursive`를 실행합니다.
서브모듈의 고정 커밋을 변경한 뒤 공통 자산을 다시 빌드하고 변경을 함께 커밋합니다.
`npm ci && npm run build`로 브라우저용 JS/CSS를 생성합니다. 라이선스는 `common/assets/licenses/`에 포함합니다.

게시물에서 그래프를 만드는 예:

```html
<div id="graph"></div>
<script>
document.addEventListener('DOMContentLoaded', () => {
  new GraphRenderer(document.getElementById('graph'), {
    variables: [{ id: 'x', domain: [-5, 5] }, { id: 'y', domain: [-5, 5] }],
    graphs: [{ id: 'example', x: 'x', y: 'y', functions: [{ id: 'square', fn: x => x * x }] }]
  });
});
</script>
```

## 배포

Git, Node.js/npm, Python 3이 필요합니다. Jekyll 사이트 자체 빌드에는 각 테마가 요구하는 Ruby/Bundler가 별도로 필요합니다.

1. 변경을 검증하고 커밋·푸시합니다.
2. `sh deploy.sh`를 실행합니다.

모든 테마 조립 및 Chirpy 프론트엔드 빌드 성공 후 기존 `deploy` 브랜치 위에 배포 커밋을 만들고 푸시합니다. 원격 브랜치를 삭제하거나 강제 푸시하지 않습니다. 현재 체크아웃은 유지됩니다.

개별 테마는 `sh deploy_<theme>.sh`로 조립할 수 있습니다. `<theme>_override/`가 해당 테마 사용자화이며 `common/`이 마지막에 적용됩니다.
