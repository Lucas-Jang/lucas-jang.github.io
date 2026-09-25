---
title: '[블로그 개편기 - 7] 기능 추가보다 엄격한 QA와 배포를 완료 조건으로 삼기'
description: '브라우저 검증, 접근성, 성능, CI/CD까지 블로그 품질의 일부로 본 마지막 단계.'
date: 2026-09-26
category: DEV
postType: journal
featured: false
tags: [블로그-개편기, QA, CI-CD, GitHub-Pages, 성능, 접근성]
---

개발 초기의 개선 기준은 “전보다 예뻐졌는가”였다. 후반부에는 4px의 어색한 간격, breakpoint 직전의 메뉴 위치, 화면을 지나치게 차지하는 이미지, 실제로 열리지 않는 링크도 수정 대상이 됐다.

기능이 동작하는 것은 완료의 최소 조건일 뿐이었다.

## 실제 브라우저에서 반복하기

코드를 읽고 괜찮아 보인다고 판단하지 않고 다음 흐름을 반복했다.

```text
Analyze → Implement → Render → Inspect → Refine → Verify
```

문제를 분석하고 수정한 뒤 실제 브라우저에서 렌더링한다. 스크린샷과 화면으로 확인하고, 다시 조정한 뒤 회귀가 없는지 검증한다. Chrome 하나에서 끝내지 않고 Edge, Safari, Firefox와 iOS, Android, Samsung Internet에서 달라질 수 있는 viewport, sticky 위치, 메뉴 overlay, 글꼴과 이미지 크기도 고려했다.

## 품질을 여러 방향에서 보기

마지막 QA는 사실상 Design Audit, Frontend QA, Content QA를 합친 작업이었다.

![시리즈명과 순서가 반영된 게시물을 연도별로 확인하는 아카이브](/images/posts/blog-development-series/03-archive.png)

*배포 뒤 회귀를 확인하는 아카이브. 날짜, 제목, 카테고리가 실제 공개 콘텐츠 기준으로 정렬된다.*

- Visual: 타이포그래피, 여백, 크기, 정렬, 이미지 리듬
- UX: 내비게이션, 검색, 글 탐색, 터치 상호작용
- Responsive: 320px~2560px와 breakpoint 경계
- Content: 실제 제목, 이미지, 링크, 표, 긴 문장
- Accessibility: 키보드, focus, 대비, alt, touch target
- Performance: LCP, CLS, INP와 이미지 로딩
- Engineering: Astro check, build, Pagefind, routing, 배포 workflow

## 배포까지 끝나야 완료다

정적 사이트라도 빌드가 성공하는 것과 공개되는 것은 다르다. 실제로 GitHub 인증 문제로 push가 멈추거나, Actions에서 build가 실패하고 deploy job이 실행되지 않은 적이 있었다.

현재는 코드 검사, Astro build, Pagefind 색인 생성, GitHub Pages 배포가 이어지는 구조를 유지한다. 검색, RSS, sitemap, 404, MDX 렌더링, 아카이브와 base path도 배포 환경에서 확인해야 한다.

## 앞으로도 남길 질문

이 프로젝트의 방향은 “무엇을 더 넣을까?”에서 “무엇이 본질을 방해하고 있는가?”로 바뀌었다.

새 기능이나 디자인을 더할 때는 먼저 묻는다.

> 이것이 Lucas Jang의 기록을 더 잘 보여 주는가, 아니면 UI 자체를 더 눈에 띄게 만드는가?

후자라면 추가하지 않는 편이 현재 철학에 가깝다. 새 콘텐츠 형식도 바로 만들지 않고 Moment, Journal, Gallery, Feature 안에서 해결할 수 있는지 먼저 본다.

블로그의 강점은 기능의 수가 아니라 적은 규칙으로 다양한 삶의 기록을 수용하는 구조에 있다.

<nav class="series-nav" aria-label="블로그 개편기 글 이동">
  <a class="previous" href="/posts/2026-09-26-blog-dev-06-content-qa/"><span>이전 글</span><strong>6편 · 실제 콘텐츠 QA</strong></a>
  <a class="next" href="/posts/2026-09-26-blog-dev-01-visual-journal/"><span>처음부터</span><strong>1편 · 삶의 기록으로 재정의</strong></a>
</nav>
