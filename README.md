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

필터 없는 홈에서만 흰색 베라크루즈 일러스트가 화면 테두리를 주행합니다. 헤더와 푸터는 물리 공간 밖에 두고 본문은 가운데에서 스크롤합니다. 모바일은 작은 차체와 완만한 사각 경로를 사용하고 차량 버튼의 실제 터치 높이는 최소 44px로 유지합니다. 390×844 기준 v13보다 경로가 12.8% 길고 위아래 직선 구간이 각각 약 131px입니다.

| 입력 | 동작 |
| --- | --- |
| 차량 클릭/탭 | 기본 → 낮게 → 높게 차고 전환 |
| 차량 또는 부스트 더블탭 | 킥플립 |
| 공중으로 끌어 놓기 | 흡착 해제 → 중력 낙하 → 공중 추진 보정 → 바닥 접지 |
| 부스트를 누르고 놓기 | 200ms 미만 일반 부스트, 풀차지에서만 다음 코너의 램프 점프 |
| 부스트 위로 쓸기 / 아래 방향키 | 노말·스포츠·오프로드·머드 선택 |
| 차량에 초점 후 K / B | 킥플립 / 일반 부스트 |
| 부스트에 초점 후 Space / Enter | 누른 시간만큼 충전 후 놓아서 발사 |
| Escape | 설정 닫기 또는 충전 취소 |

환경 패널이나 메뉴를 열어도 주행합니다. 정차·에어 홉·앞쪽 낮추기 버튼은 없습니다. 동작 줄이기 설정에서는 이동·회전·급가속을 생략하며 차고와 환경 조작은 유지합니다.

공중의 중력은 모든 모드와 스킬에서 9.81m/s²입니다. 질량은 이전 기준의 2배이며 중력을 바꾸지 않고 필요한 보정력을 늘립니다. 벽 주행은 흡착 제약으로 유지합니다. 공중에서는 발사·회전·벽 회피·착지 제어가 실제 가속도에 필요한 힘을 계산하고, 그 힘과 토크에 비례해 공기를 분출합니다. 무게 중심과 앞뒤 하중은 연출을 위한 근사치이며 실차 측정값이 아닙니다.

킥플립의 공기 분출 순서는 다음과 같습니다.

1. 0–0.14초: 출발 벽 방향으로 밀어내는 도약 분사와 대각 회전 시동.
2. 회전 전반: 가까운 쪽 하부와 반대쪽 루프의 앞뒤 노즐이 회전 가속. 각 대각 쌍은 같은 크기의 반대 힘으로 순양력을 추가하지 않습니다.
3. 중간: 회전 관성을 유지하는 짧은 저토크 구간. 90°/270°에서 양력이나 벽 회피가 필요하면 측면 트림 노즐이 분사하고, 깊이 방향의 회전 분사는 짧게 퍼지는 분무로 보입니다.
4. 회전 후반: 대각 쌍을 뒤집어 역분사하고 회전을 제동합니다. 같은 물리 노즐의 명령은 합성해 한 방향으로만 분사합니다.
5. 하강: 전후 하중·자세·속도·벽까지의 정지 거리에 따라 공중에서 비대칭 보정. 압력이 크면 차량을 가릴 정도의 연무가 생깁니다.
6. 접지: 순양력을 끊고 짧게 중력으로 떨어진 뒤 에어서스가 압축·반동·재압축하며 잔진동을 감쇠합니다. 연무는 접지 후 빠르게 걷혀 서스펜션 움직임을 볼 수 있습니다.

램프는 출발 자세를 이어 받아 필요한 360° 방향으로 정렬하고 같은 공중 보정·접지를 사용합니다. 던지기와 드래그 취소는 남은 관성으로 낙하하며, 접근하는 네 벽 각각에 맞는 분사를 사용합니다. 희미한 미세 보정은 힘에 따라 연속적으로 사라져 닫힌 밸브처럼 보이는 노즐에서 큰 흰 불빛이 남지 않게 합니다.

차체는 원래 측면 에셋과 닫힌 캔버스 메쉬를 사용하고 노즐·바퀴·에어스프링은 같은 투영계를 공유합니다. 공중에서는 바퀴가 최대 길이로 늘어지며 차체와 바퀴의 질량 중심을 보존합니다. 배기는 화면 밖 128px까지 여유를 둔 별도 캔버스에 그리며 입자 수는 모바일 300개/데스크톱 480개, 비트맵은 최대 4M픽셀로 제한합니다.

현재 모듈은 car-dynamics, car-route, car-ride, car-thrusters, car-projection, car-mesh, car-exhaust입니다. car-motion과 car-physics의 기존 API는 캐시된 이전 클라이언트를 위해 유지합니다. 현재 모듈과 엔트리의 캐시 버전은 20261017-14입니다.

검증: npm run test:car의 44개 검사에 2,880회 킥플립, 20,480개 코너 프레임, 17,568개 혼합 분사 자세, 네 모드×8구간×3스킬의 96개 비행이 포함됩니다. scripts의 로컬 전용 QA 페이지로 실제 입력, 앞뒤/상하/측면 분사 정렬, 73개 회전 프레임, 착지 시퀀스, 320×568부터 1920×1080까지의 홈 메뉴 간섭을 검수합니다. public에 복사한 QA HTML은 배포 전에 반드시 제거합니다. 실제 iOS Safari/Android 기기 검증은 이 Chromium 뷰포트 검증에 포함되지 않습니다.

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

