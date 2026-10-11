---
name: pogo-moves
description: 포켓몬 GO PvP 기술 데이터(일반기술 턴 수, 추천 기술셋, 한글 기술명)를 PvPoke와 게임 한국어 로케일에서 수집한다. CCT 계산에 필요한 '몇 턴 기술인지'를 구할 때, 기술 데이터를 갱신할 때, 기술 한글명이 필요할 때 사용한다. 트리거: "기술 데이터", "턴 수", "일반기술", "추천 기술셋", "CCT 계산", "pvpoke".
---

# 포켓몬 GO PvP 기술 데이터 수집

CCT(Charged move Count Timing)의 전부는 **일반기술이 몇 턴짜리인가**다. 1턴 = 0.5초.

## 실행

```bash
python scripts/fetch_moves.py
```

출력은 항상 저장소의 `data/` 로 간다 (실행 위치와 무관). 파일 4개만 받으면 끝나서
매번 전체를 새로 받는다 — 증분 처리가 필요 없다.

## 데이터 출처

| 항목 | 출처 |
| --- | --- |
| 기술 제원 (턴·위력·에너지) | PvPoke `gamemaster.json` |
| 포켓몬별 추천 기술셋·사용률 | PvPoke `rankings/all/overall/rankings-1500.json` |
| 한글 기술명·타입명 | PokeMiners 포켓몬 GO 한국어 로케일 (공식 인게임 표기) |

## 순위 기준은 PvPoke다

PoGoMate도 자체 슈퍼리그 순위를 내지만 **둘이 서로 다르다** — 상위 300 집합이 16종 차이 나고,
개별 순위도 어긋난다 (예: 따라큐 PvPoke 5위 / PoGoMate 6위). PvPoke를 정본으로 삼는다.

PoGoMate는 스프라이트와 한글 포켓몬명만 담당한다 (`pogo-image-fetcher`).
두 소스의 종 ID는 **1,152종 전부 일치**하므로 `speciesId` ↔ `id` 로 그냥 붙는다.

범위를 좁히지 않고 1,152종 전부 받는다. 이미지와 달리 기술 데이터는 파일 몇 개로 끝나서
범위를 줄여도 비용이 같다.

## 한글 기술명을 얻는 법

PvPoke는 영문뿐이라 게임 로케일과 **영문 기술명으로 조인**한다.
PokeMiners 로케일은 `[키, 값, 키, 값, …]` 평면 배열이고 `move_name_NNNN` 키를 쓴다.

GAME_MASTER(19MB)의 숫자 ID를 거치는 방법도 있지만 더 무겁고 적중률도 낮다 (79 vs 81).
영문명 조인을 쓸 것.

처리 규칙 세 가지:

1. **정규화 후 직접 매칭** — 소문자·영숫자만 남겨 비교
2. **괄호형 분해** — `Weather Ball (Fire)` → `웨더볼` + 한글 타입명 → `웨더볼 (불꽃)`.
   잠재파워 16종과 웨더볼 5종이 여기 해당한다. 타입명도 로케일(`pokemon_type_*`)에서 가져온다
3. **종 전용기 예외** — `Hydro Pump Blastoise` → `Hydro Pump` (`NAME_FIXES`)

결과: 기술 352종 중 338종. **일반기술은 98/98 전부** 한글명이 있다.

못 찾는 14종(Dive, Gigaton Hammer, Plasma Fists, Beak Blast 등)은 **게임 로케일에 실제로
없다** — PvPoke가 먼저 반영한 신규 기술이다. 이름을 지어내지 말 것. `nameKo` 는 `null` 로
두고 `nameDisplay` 가 영문명으로 대체한다.

## 출력물

```
data/
  moves.json          기술 352종 — moveId, nameKo, nameDisplay, type, kind, turns, seconds, power, energy
  pokemon_moves.json  1,152종 — rank, score, recommended{fast,charged}, fastMoves[{moveId,nameKo,turns,share}]
  fast_moves.csv      일반기술 98종 턴별 요약 (표 작업용)
```

`fastMoves` 는 **상대가 실제로 들고 나올 수 있는 일반기술 전부**를 사용률(`share`) 순으로 담는다.
추천 기술 하나만 보면 안 되는 이유: 상대 기술이 뭐냐에 따라 CCT 타이밍이 통째로 바뀐다.

## 검증값

참고 치트시트와 대조해 12/12 일치를 확인한 값들. 로직을 고친 뒤 이걸로 회귀 확인할 것.

| 턴 | 기술 |
| --- | --- |
| 1턴 (0.5초) | 용의숨결 · 모래뿌리기 · 록온 · 벌레먹기 |
| 2턴 (1.0초) | 섀도클로 · 요정의바람 · 머드샷 · 독침 · 사이코커터 · 눈싸라기 |
| 4턴 (2.0초) | 볼트체인지 |
| 5턴 (2.5초) | 불태우기 |

일반기술 98종 턴 분포: 1턴 12 · 2턴 34 · 3턴 46 · 4턴 5 · 5턴 1

## 출처가 바뀌면

PvPoke 저장소 경로나 로케일 배열 구조가 바뀌면 조용히 빈 결과가 아니라 예외로 터진다.
`build_korean_names()` 의 적중 수가 눈에 띄게 떨어지면 로케일 키 접두사(`move_name_`)부터 확인할 것.

## 권리

기술명과 게임 데이터의 권리는 Niantic · The Pokémon Company에 있다. PvPoke 데이터는 해당 프로젝트 라이선스를 따른다.
