# WONJUN Journal

사진과 짧은 기록을 중심으로 만든 Astro 정적 블로그입니다. GitHub Pages에 배포되며, 콘텐츠는 MDX 파일로 관리합니다.

## Local development

```bash
npm install
npm run dev
npm run check
npm run build
```

`npm run build`는 Astro 정적 빌드 뒤 Pagefind 검색 인덱스까지 생성합니다.

## Write a post

`src/content/posts/YYYY-MM-DD-slug.mdx`를 만들고 아래처럼 작성합니다.

```mdx
---
title: Morning notes
description: A short description for cards and search.
date: 2026-09-25
category: LIFE # DEV | ENGLISH | BJJ | DIVE | DISTILL | LIFE
postType: journal # moment | journal | gallery | feature
cover: /images/journal/morning.jpg
coverAlt: A clear description of the image
tags: [notes]
featured: false
draft: false
---

본문을 여기에 작성합니다.
```

`postType`은 Astro MDX의 예약 필드인 `layout`과 충돌하지 않도록 분리한 콘텐츠 유형 필드입니다. `public/images/` 아래에 이미지를 저장하고 `/images/...` 경로로 참조합니다. 커버와 본문 이미지에는 의미 있는 `alt`를 작성합니다.

## Structure

- `src/content/posts/`: 게시물과 frontmatter
- `src/content.config.ts`: 콘텐츠 스키마와 카테고리 유효성 검사
- `src/layouts/`: 공통 프레임과 글 레이아웃
- `src/components/`: 카드와 앞으로 확장할 MDX 구성 요소
- `public/images/`: 로컬 이미지
- `.github/workflows/deploy.yml`: GitHub Pages 배포

## Deployment and expansion

`master` 또는 `main`에 push하면 Actions가 검사, 빌드, Pagefind 인덱싱, Pages 배포를 실행합니다. GitHub Pages의 Source를 **GitHub Actions**로 설정해야 합니다. 커스텀 도메인은 `public/CNAME` 파일을 추가해 연결합니다.

현재는 로컬 이미지를 사용합니다. 이미지가 많아지면 frontmatter의 URL만 Cloudinary 또는 R2 URL로 교체하는 방식으로 외부 스토리지로 옮길 수 있습니다. 편집 UI가 필요해지면 Decap CMS나 Git 기반 CMS를 추가해 같은 MDX 구조를 그대로 유지할 수 있습니다.
