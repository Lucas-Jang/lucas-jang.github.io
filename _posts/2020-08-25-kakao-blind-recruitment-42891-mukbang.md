---
title: "[2019 카카오 코테] 🥘 무지의 먹방 라이브 (C++, 효율성 최고 15.37ms)"
layout: post
date: 2020-08-21
image: https://programmers.co.kr/assets/bi-symbol-light-49a242793b7a8b540cfc3489b918e3bb2a6724f1641572c14c575265d7aeea38.png
headerImage: True
tag:
- CodingTest
- Algorithm
category: blog
author: lucas-jang
description: PROGRAMERS 42891 해설
---

![ViewCount](https://views.whatilearened.today/views/github/<user>/<repo>.svg)

---

**CATEGORY** : 브루트포스, 구현

**DIFFICULTY** : LEVEL 4

**LANGUAGE** : C++

**LINK** : [PROGRAMMERS 무지의 먹방 라이브](https://programmers.co.kr/learn/courses/30/lessons/42891){: target="_blank"}

---
## 왜 효율성이 좋았을까?

시간 복잡도는 다른 제출들에 비해 많이 낮은 편인 것 같다. 코드를 비교해봤을 때 아마 다음과 같은 이유에서일 것 같다.
 1. 정렬횟수 : 이 문제에서 정렬할 때 시간복잡도가 가장 높다. 정렬을 두 번 사용한 코드들은 두 배정도 시간 차이가 난다.
 2. 자료구조 :  `vector<pair<int,int>>`  를 사용한 코드들도 정렬할 때 .second도 비교를 하여 시간 차이가 난다. ( 1번보다는 적게 났다.)
**물론 문제에서 요구하는 효율성만 통과시키면 된다.** 이렇게 분석해본 이유는 진짜 "왜 빠르지?" 하는 호기심과 어느 부분에서 복잡도 차이가 발생하는지 분석해두면 후에 다른 문제 풀이를 할 때에도 분석하기 쉬워질 것이라 생각했기 때문이다. [^1]

## 1. 어떤 문제인가?
여러 종류의 음식을 1초마다 돌아가며 먹을 때 특정 시간에 몇 번째 음식을 먹고 있는지 판단하는 [문제](https://programmers.co.kr/learn/courses/30/lessons/42891)이다. 브루트포스로 시간만큼 루프를 돌면 정말 간단한 문제이지만 조건을 보면 그렇지 않다.  배열의 길이는 최대 20만, 시간의 최대는 2x10^13으로 정수 범위를 넘어간다. 좀 더 효율적으로 어떻게 루프를 돌아야 할지 생각해야 하는  문제이다.

## 2. 접근 방식은?
보통 문제에서 테스트케이스로 주는 것을 직접 해보는 것으로 감을 잡는데 너무 짧은 배열이라 감이 잘 안왔다.
[ 5, 0 , 3, 3, 1], K = 9 의 테스트 케이스를 만들어 접근했다. 
다음과 같은 사실을 알 수 있었다.

1. `(최솟값의 크기 X  배열의 길이)시간`  만큼 같은 루프를 돌 수 있다.
2. 동일한 최솟값을 `여러개` 가진다면 남은 음식 종류의 수는 `그 개수`만큼 차감된다.
3. 1번이 끝나면` K시간에서 1번 시간만큼 차감` 한다.
4. 만약 차감된 시간이 `음수라고 예상` 되면 그 전에 멈춘다.
5. 4번에서 멈춘 후에 남은 배열을 `배열의 길이`로 나누어 나머지값을 얻는다.
6. 남아있는 음식들에 대하여 5의 나머지값만큼 배열을 순회한다.

테스트케이스로 생각해보면 다음과 같다.

![42891_1](..\assets\images\42891_1.jpg)

- 변수 

> 이전 최솟값 : prMn
>
> 현재 최솟값 : mn
>
> 최솟값을 가지는 음식수 : cntMn
>
> 남은 음식수 : foodLeft
>
> 남은 시간 : K

- 자료구조

> 오름차순으로 정렬된 배열을 저장할 vector<int>

추가적으로 루프를 진행하면서 **배열의 남은 음식이 있는지 없는지를 판단하는 방법** 은 `현재 최솟값 - 이전 최솟값` 보다 작은값은 남아있지 않다고 판단했다. 따라서 이전 최솟값을 유지해주어야 한다.  위의 예시에서 [4,0,2,2,0] 의 배열과 같이 직접 이전 최솟값을 빼는 것이 아니라 이전 최솟값보다 높은 값만을 취급한다.

## 4. 코드

```c++
#include<iostream>
#include <string>
#include <vector>
#include<algorithm>
using namespace std;

int solution(vector<int> food_times, long long k) {
	// 값, 인덱스 저장
	vector<int> v;
	for (int i = 0; i < food_times.size(); i++) {
		v.push_back(food_times[i]);
	}
	// 오름차순 정렬
	sort(v.begin(), v.end());
	int foodLeft = food_times.size();	// 남은 음식
	int cntMn = 0;	// 최솟값을 가지는 음식종류 수
	int mn = v[0];	// 현재 최솟값
	int prMn = 0;	// 이전 최솟값
	int it = 0;	// 정렬된 벡터 순회하는 인덱스
	while (1) {
		if (foodLeft <= 0) {
			return -1;
		}
		if (it < v.size() && v[it] == mn) {
			it++;
			cntMn++;
			continue;
		} 
		if (k - 1ll* foodLeft * (mn - prMn)>= 0) {
			k -= 1ll * foodLeft * (mn - prMn);	// 시간 차감
			foodLeft -= cntMn; // 남은 음식 종류수
		}
		else {
			// mn보다 큰 k번째 원소 찾기
			k %= foodLeft; int i;
			for (i = 0; k >= 0; i=(i+1)%food_times.size()) {
				if (food_times[i] <= prMn) continue;
				k--;
			}
			i = i == 0 ? food_times.size() : i;	// 조심 포인트
			return i;
		}
		cntMn = 0;	
		prMn = mn; // 이전 최솟값 갱신
		mn = v[it];	// 최솟값 갱신
	}
	return -1;
}
```

구현 단계에서 생각해주어야 할 부분이 있었다. return 해야할 i가 배열의 마지막을 가리키는 인덱스라면 `i=(i+1)%food_times.size()` 식에 따라 0값을 가지게 된다. 이 부분만 처리해주면 올바른 값을 return할 수 있다.

결과는 다음과 같았다.

![42891_2](..\assets\images\42891_2.jpg)

## 변수가 많을 때 헷갈리지 말자.

정리하면서 느끼는 것인데, 표를 만들어 정리해보면 생각 정리가 잘 된다. 실전에서도 변수가 많다면 표를 그려보는 것이 좋을 것 같다.


---
[^1]: 기초적인 우선순위큐의 삽입, 삭제 시간복잡도를 생각하지 않고 풀다 데인적이 있어서 그럴지도 모르겠다..ㅎㅎ; 바보

