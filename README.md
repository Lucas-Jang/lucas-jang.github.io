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

## Veracruz edge widget

공통 레이아웃에 흰색 베라크루즈 측면 일러스트를 표시합니다. 화면 가장자리의 둥근 경로를 따라 주행하며, 클릭·터치·펜·키보드로 조작합니다.

| 입력 | 동작 |
| --- | --- |
| 차량 클릭/탭 | 기본 → 낮게 → 높게 차고 전환 |
| 공중으로 끌어 놓기 | 흡착 해제 → 중력 낙하 → 추진 감속 → 바닥 착지 |
| 0.42초 이상 누른 뒤 놓기 | 에어서스 압축 후 에어 홉 |
| 차고의 ‘앞쪽 낮추기’ | 앞 서스펜션을 낮췄다가 자동 수평 회복 |
| 차량에 키보드 초점 후 K / R / H | 킥플립 / 램프 / 홉 |
| 부스트 버튼 / 차량에 키보드 초점 후 B | 2초간 후방 추진체 급가속 |
| 차량에 키보드 초점 후 ↑ / ↓ / Escape | 높게 / 낮게 / 정차(공중에서는 비상 추진 착지) |

‘차고’ 메뉴에서 노말·스포츠·오프로드·머드를 선택합니다. 각각 차고, 가속, 댐핑과 노면 표현이 바뀌며 머드에서는 휠 슬립도 표현합니다. 지구 중력은 환경과 관계없이 9.81 m/s²이며, 벽 주행은 흡착 제약으로 유지합니다. 공중에서 놓으면 실제 시간 간격으로 속도를 적분하고 제동 거리에 따라 착지 추진체를 자동 점화합니다. 연기는 최대 96개 입자로 제한하며 숨김·백그라운드에서는 정리합니다.

차체 양면, 지붕·보닛·하부, 타이어 두께를 CSS 3D로 구성하고 에어스프링으로 차체와 휠을 연결합니다. 정밀한 차량 3D 모델을 사용하는 방식은 아닙니다. 높이·환경·정차·표시 설정은 브라우저에 저장합니다. 동작 줄이기에서는 정차 상태로 시작하고 점프·회전·급가속을 생략합니다. 드래그 취소 시에는 자동 착지를, 공중에서 화면 크기가 바뀌면 변경된 바닥을 기준으로 착지를 계속합니다. 외부 탭에서는 안전한 자세로 정리합니다. 에어서스·흡착·추진체는 위젯의 커스텀 연출이며 실제 순정 차량 사양을 설명하지 않습니다.

`public/scripts/car-physics.mjs`는 중력·착지 추진·환경별 스프링을, `car-motion.mjs`는 공통 경로를 담당합니다. 기존 모듈 API는 이전 버전의 캐시된 방문자를 위해 유지합니다. `npm run test:car`로 검증하며 `roaming-car.js`는 표시와 입력을 담당합니다. Pointer Events와 메뉴·키보드를 함께 제공하고 터치 영역은 최소 44px로 구성합니다. 모바일 실기기·브라우저별 최종 검증은 별도로 필요합니다.

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
