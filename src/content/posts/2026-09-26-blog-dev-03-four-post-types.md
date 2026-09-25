---
title: '[블로그 개편기 - 3] 가볍게 쓰고 깊게 확장하는 네 가지 게시물 타입'
description: 'Moment, Journal, Gallery, Feature로 작성 부담과 표현력을 함께 해결한 콘텐츠 모델.'
date: 2026-09-26
category: DEV
postType: journal
featured: false
tags: [블로그-개편기, Astro, MDX, 콘텐츠모델, 블로그]
---

사진 중심의 에디토리얼 블로그를 오래 운영하려면 두 가지 상반된 요구를 함께 풀어야 했다. 짧은 기록은 가볍게 올릴 수 있어야 하고, 마음먹고 만든 글은 평범한 템플릿의 한계를 넘어야 한다.

모든 게시물을 같은 형식에 넣는 대신 네 가지 타입을 만들었다.

## Moment

사진 한두 장과 짧은 문장으로 끝나는 기록이다. 완성된 에세이가 아니어도 발행할 수 있게 작성 부담을 가장 낮췄다. 순간을 붙잡는 것이 목적이므로 복잡한 구성은 필요 없다.

## Journal

일반적인 블로그 글의 기본값이다. 제목, 표지 이미지, 본문이 자연스럽게 이어진다. 개발 기록이나 공부 노트처럼 설명의 흐름이 중요한 콘텐츠가 여기에 해당한다.

![제목, 해시태그, 표지 이미지, 본문으로 이어지는 Journal 게시물 화면](/images/posts/blog-development-series/06-post-desktop.png)

*이 연재에도 사용하는 Journal 타입. 공통 구조를 유지하면서 Markdown 본문을 자연스럽게 읽게 한다.*

## Gallery

사진 자체가 이야기의 중심일 때 사용한다. 프리다이빙, 여행, 주짓수 세미나처럼 이미지의 순서와 호흡이 중요한 게시물에 맞다. 글은 사진을 설명하지만 사진을 밀어내지 않는다.

## Feature

큰 이미지, 이미지 그리드, 인용, 영상처럼 에디토리얼 컴포넌트를 적극적으로 사용하는 형식이다. 모든 글을 Feature로 만들 필요는 없지만, 표현이 필요할 때 시스템이 발목을 잡지 않게 한다.

이 구조의 핵심은 타입의 수가 아니다. **매번 예쁘게 만들 필요는 없지만, 원하면 아주 깊게 만들 수 있다**는 운영 방식이다.

## 타입을 데이터로 남기기

저장소에서는 각 글의 frontmatter에 `postType`을 기록한다.

```yaml
category: DEV
postType: journal
featured: false
tags: [Astro, MDX, 콘텐츠모델]
```

Astro MDX의 `layout` 필드와 충돌하지 않도록 콘텐츠 유형은 `postType`이라는 별도 이름을 사용했다. 가능한 값은 `moment | journal | gallery | feature`로 제한한다. 덕분에 템플릿은 타입을 보고 필요한 레이아웃을 선택할 수 있고, 작성자는 매번 CSS를 직접 만질 필요가 없다.

Feature에서는 `FullBleedImage`, `ImageGrid`, `PullQuote`, `Caption` 같은 컴포넌트를 쓸 수 있다. 평범한 글은 Markdown만으로 끝내고, 필요한 글만 MDX의 표현력을 꺼내 쓰는 방식이다.

콘텐츠 모델을 먼저 정하니 홈 화면의 변주도 무작위 장식이 아니라 데이터에 근거할 수 있게 됐다. 다음 글에서는 이 모델을 받치기 위해 Astro, TypeScript, MDX, GitHub Pages를 선택한 이유를 다룬다.

<nav class="series-nav" aria-label="블로그 개편기 글 이동">
  <a class="previous" href="/posts/2026-09-26-blog-dev-02-editorial-home/"><span>이전 글</span><strong>2편 · 에디토리얼 편집면</strong></a>
  <a class="next" href="/posts/2026-09-26-blog-dev-04-astro-mdx-architecture/"><span>다음 글</span><strong>4편 · Astro와 MDX 운영 구조</strong></a>
</nav>
