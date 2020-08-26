---
title: "[프로그래머스 42888] 오픈채팅방(2019 카카오 블라인드 채용)"
layout: post
date: 2020-08-21
image: https://programmers.co.kr/assets/bi-symbol-light-49a242793b7a8b540cfc3489b918e3bb2a6724f1641572c14c575265d7aeea38.png
headerImage: True
tag:
- CodingTest
- Algorithm
category: blog
author: lucas-jang
description: PROGRAMERS 42888 해설
---

![ViewCount](https://views.whatilearened.today/views/github/<user>/<repo>.svg)

---

**CATEGORY** : 문자열 처리, 해싱

**DIFFICULTY** : LEVEL 2

**LANGUAGE** : C++

**LINK** : [PROGRAMMERS 오픈채팅방](https://programmers.co.kr/learn/courses/30/lessons/42888){: target="_blank"}

**Comment**

> 처음에 map 라이브러리를 사용하였지만unordered_map을 사용하여 시간복잡도를 줄였다. 또 "Enter", "Leave", "Change"와 같은 문자열을 그대로 비교하는 것이 아니라 앞글자만 비교하여 시간 소모를 더 줄였다.
>
> map과 unordered_map의 차이에 대한 설명은 [여기로](https://kamang-it.tistory.com/entry/mapunorderedmapC%EC%97%90%EC%84%9C-map%EB%94%95%EC%85%94%EB%84%88%EB%A6%ACdictionary-%EC%97%B0%EA%B4%80%EB%B0%B0%EC%97%B4associate-array%ED%95%B4%EC%8B%9C%EB%A7%B5hash-map%EC%82%AC%EC%9A%A9%ED%95%98%EA%B8%B0map%EA%B3%BC-unorderedmap-%EA%B7%B8%EB%A6%AC%EA%B3%A0-%EC%B0%A8%EC%9D%B4%EC%A0%90){: target="_blank"}
>
> map으로의 저장은 '입장'과 '변경'일 때만 일어나고, answer로의 저장은 '입장', '퇴장'일 때만 일어나는 것을 알 수 있다.
>
> Python으로 짜면 훨씬 [짧다](https://json1995.tistory.com/entry/Python%ED%94%84%EB%A1%9C%EA%B7%B8%EB%9E%98%EB%A8%B8%EC%8A%A4Level-2-%EC%98%A4%ED%94%88%EC%B1%84%ED%8C%85%EB%B0%A9){: target="_blank"}.

---

```c++
#include<iostream>
#include <string>
#include <vector>
#include <unordered_map>
using namespace std;

void Tokenize(const string& s, vector<string>& tok) {
	string pt = "";
	for (char c : s) {
		if (c != ' ') {
			pt += c;
		}else {
			tok.push_back(pt);
			pt.clear();
		}
	}
	tok.push_back(pt);
}
vector<string> solution(vector<string> record) {
	vector<string> answer;
	unordered_map<string, string> mp;
	vector<string> tok;
	// 1. 맵 업데이트
	for (string s : record) {
		Tokenize(s, tok);
		if (tok[0][0] == 'E') {
			mp[tok[1]] = tok[2];
			answer.push_back(tok[1]);
		}
		else if (tok[0][0] == 'C') {
			mp[tok[1]] = tok[2];
		}
		else {
			answer.push_back(tok[1]);
		}
		tok.clear();
	}
	// 2. 문자열 형식에 맞게 answer 갱신
	int i = 0;
	for (string s : record) {
		if (s[0] == 'E') {
			answer[i] = mp[answer[i]] + "님이 들어왔습니다.";
			i++;
		}
		else if (s[0] == 'L') {
			answer[i] = mp[answer[i]] + "님이 나갔습니다.";
			i++;
		}
	}
	return answer;
}
```

