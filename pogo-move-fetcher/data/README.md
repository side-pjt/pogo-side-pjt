# 포켓몬 GO PvP 기술 데이터

CCT 계산용. 핵심은 **일반기술의 턴 수** — 1턴 = 0.5초다.

## 수집 방법

```bash
python scripts/fetch_moves.py
```

파일 몇 개만 받으면 끝나므로 매번 전체를 새로 받는다. 갱신이 필요하면 그냥 다시 실행하면 된다.

## 출처

| 항목 | 출처 |
| --- | --- |
| 기술 제원 (턴·위력·에너지) | PvPoke `gamemaster.json` |
| 추천 기술셋·사용률 | PvPoke `rankings-1500.json` (슈퍼리그) |
| 한글 기술명 | PokeMiners 포켓몬 GO 한국어 로케일 |

**순위 기준은 PvPoke다.** PoGoMate도 자체 순위를 내지만 둘이 다르다 (상위 300 집합이 16종 차이).
PoGoMate는 스프라이트와 한글 포켓몬명만 담당한다 — `pogo-image-fetcher` 쪽.

## 구조

```
data/
  moves.json          기술 352종
  pokemon_moves.json  1,152종의 기술셋
  fast_moves.csv      일반기술 98종 턴별 요약 (Excel에서 바로 열림)
```

### moves.json

```json
{
 "moveId": "SHADOW_CLAW",
 "name": "Shadow Claw",
 "nameKo": "섀도클로",
 "nameDisplay": "섀도클로",
 "type": "ghost",
 "kind": "fast",
 "turns": 2,
 "seconds": 1.0,
 "power": 6,
 "energyGain": 8,
 "energy": null
}
```

`turns` 와 `seconds` 는 일반기술에만 있다 (`kind: "fast"`). 차징기는 `null`.

`nameKo` 가 `null` 인 기술이 14종 있다 — Dive, Gigaton Hammer, Plasma Fists 등으로,
**게임 한국어 로케일에 아직 없는 신규 기술**이다. 이름을 지어내지 않고 비워 뒀으니,
화면에 찍을 때는 영문명으로 대체되는 `nameDisplay` 를 쓰면 된다.
일반기술 98종은 전부 한글명이 있다.

### pokemon_moves.json

```json
{
 "speciesId": "altaria",
 "speciesName": "Altaria",
 "rank": 2,
 "score": 92.5,
 "recommended": { "fast": "DRAGON_BREATH", "charged": ["SKY_ATTACK", "MOONBLAST"] },
 "fastMoves": [
  { "moveId": "DRAGON_BREATH", "nameKo": "용의숨결", "turns": 1, "share": 0.93 },
  { "moveId": "PECK",          "nameKo": "쪼기",     "turns": 2, "share": 0.07 }
 ]
}
```

`fastMoves` 는 상대가 실제로 들고 나올 수 있는 일반기술을 사용률 순으로 전부 담는다.
추천 기술 하나만 보면 안 된다 — 상대 기술이 뭐냐에 따라 CCT 타이밍이 통째로 바뀐다.

## pogo-image-fetcher와 붙이기

`speciesId` ↔ `id` 로 **1,152종 전부 일치**한다. 순위도 양쪽 다 PvPoke 기준이라 일치한다.

```python
img = json.load(open('../pogo-image-fetcher/assets/manifest.json', encoding='utf-8'))['pokemon']
mov = json.load(open('data/pokemon_moves.json', encoding='utf-8'))['pokemon']
by_id = {r['id']: r for r in img}
for m in mov:
    sprite = by_id[m['speciesId']]['file']
```

## 검증값

참고 치트시트와 12/12 일치를 확인한 값들.

| 턴 | 기술 |
| --- | --- |
| 1턴 | 용의숨결 · 모래뿌리기 · 록온 · 벌레먹기 |
| 2턴 | 섀도클로 · 요정의바람 · 머드샷 · 독침 · 사이코커터 · 눈싸라기 |
| 4턴 | 볼트체인지 |
| 5턴 | 불태우기 |

턴 분포: 1턴 12종 · 2턴 34종 · 3턴 46종 · 4턴 5종 · 5턴 1종

## 주의

기술명과 게임 데이터의 권리는 Niantic · The Pokémon Company에 있다.
PvPoke 데이터는 해당 프로젝트 라이선스를 따른다. 개인 참고용 자료 제작에만 사용할 것.
