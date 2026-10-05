# Training Journal 작성

기존 Astro content collection, `/posts/[...slug]`, `Post` 레이아웃과 Pretendard·청회색 토큰을 유지한다. 새 의존성과 클라이언트 JavaScript는 없다. 기존 블로그에 다크 모드가 없어 별도 테마를 추가하지 않았다.

`src/content/posts/2026-10-05-training-journal.md`를 복사하고 제목·설명·날짜·`training` 내용을 수정한다. Markdown 본문을 추가하면 기록 아래에 이어서 출력된다. MDX에도 동일한 frontmatter를 사용할 수 있다. 샘플은 실제 수련 사실이 아닌 검증용 데이터다.

제목은 `YYYY.MM.DD 수련 기록` 형식을 사용한다. 예: `2026.10.05 수련 기록`.

필요 없는 필드와 섹션은 삭제한다. 빈 배열과 빈 객체는 해당 섹션을 생성하지 않는다. 빈 문자열은 검증 오류이며 작성자가 수정해야 한다. 컨디션 0, 중량 0은 유효한 기록으로 표시한다. severity와 score는 0~10, rounds는 양의 정수로 빌드 시 검증된다.

스파링 총 라운드는 `sparringRounds`로 지정한다. 없으면 모든 스파링 레코드에 `rounds`가 있을 때만 합산한다. 상대별 메모 수를 라운드 수로 추정하지 않는다.

`src/lib/training.ts`의 schema와 추론된 `TrainingEntry`, `BodyIssue`, `BodyArea`가 데이터 계약이다. `TrainingJournal`은 섹션 렌더링, `Sequence`는 줄바꿈 가능한 순서 목록, `BodyMap`은 좌표 기반 SVG 표시를 담당한다.

BodyMap의 side는 본인 기준이다. 앞면에서 오른쪽은 화면 왼쪽, 뒷면에서 오른쪽은 화면 오른쪽이다. `upperBack`, `lowerBack`, `calf`는 뒷면에 나타나며 나머지는 앞면에 나타난다. 중앙 지정 또는 좌우 생략 시 중앙 표시된다. 지도 번호와 항상 보이는 증상 목록을 연결하고, 강도는 숫자·링 두께·투명도로 표현한다. SVG는 정적이며 hover가 필요 없다.

상단에는 훈련 요약·웨이트·유산소·몸 상태를 모으고, 하단에는 수업 기록·기술·스파링·소감·회고를 배치한다. `classNotes`와 `reflection`은 여러 줄의 자유로운 글을 받는 선택 필드다. 메모의 줄바꿈을 유지하며 기록이 없으면 섹션을 출력하지 않는다.

제목과 본문은 동일한 읽기 폭에 맞춘다. 제목 32~45px, 본문 섹션 제목 22~24px, 기술·상대 소제목 19px, 본문 16~17px로 계층을 구분한다. 반복 날짜와 작은 영문 메모 라벨을 없애 읽기 시작점을 줄였다.

모바일은 지도 아래 증상 목록과 두 줄의 운동 데이터를 사용한다. 40rem 이상은 지도 옆 목록과 좌우 정렬 운동 데이터를 사용한다. Sequence와 요약은 wrap되며 고정 높이는 없다.

벤치마킹: [Linear BJJ](https://www.linearbjj.com/use-cases/bjj-training-journal)의 기술·라운드·느낀 점 기록, [Hevy](https://www.hevyapp.com/features/track-workouts/)의 수치 중심 운동 기록, [SVG body highlighter](https://github.com/HichamELBSI/react-native-body-highlighter)의 부위·좌우 구분을 참고했다. 외부 라이브러리를 설치하거나 그래픽 코드를 복사하지 않았다. 인체는 직접 그린 SVG로 어깨·허리·팔다리 비율과 앞뒤 윤곽을 표현한다.

전체·최소 예시 기록은 실제 수련 사실이 아니므로 모두 draft로 보관한다. 개발 서버의 `/training-preview/`에서 전체·최소·긴 한국어 메모·10개 스파링을 검수한다. 프로덕션 빌드에서는 검수 경로가 404를 반환하며 예시 글은 목록·검색·RSS에 포함되지 않는다. 실제 기록을 작성한 뒤 해당 글만 draft를 해제한다.

실행: `npm ci`, `npm run check`, `npm run build`, `npm run dev`.
