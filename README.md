# pogo-side-pjt

**GO배틀리그 가이드** — 포켓몬 GO 슈퍼·하이퍼·마스터리그와 시즌 컵을 위한 CCT·CMP 계산기, 배틀 시뮬레이터, 시즌 일정, 그리고 그 데이터를 모으는 수집기들.

**CCT** = Charged move Count Timing. 상대 일반기술의 마지막 턴에 차징기를 입력해
상대에게 주는 ‘공짜 턴’을 최소화하는 기술이다. 1턴 = 0.5초.

## 구성

| 폴더 | 하는 일 |
| --- | --- |
| [`pogo-cct-tool`](pogo-cct-tool/) | **CCT 계산기** — 포켓몬 둘을 고르면 차징 타이밍이 나온다 |
| [`pogo-image-fetcher`](pogo-image-fetcher/) | 모든 리그·컵 포켓몬 1,583종의 스프라이트와 한글 포켓몬명 수집 |
| [`pogo-move-fetcher`](pogo-move-fetcher/) | 리그·컵 목록, 포맷별 순위·추천 기술셋, 일반기술 턴 수, 한글 기술·컵 이름 수집 |

수집기 둘은 서로 독립이고, 계산기가 둘의 결과를 합쳐 쓴다.
종 ID(`speciesId` ↔ `id`)가 전부 일치해서 그냥 붙는다.

## 리그·컵과 시즌

슈퍼·하이퍼·마스터리그와 메가 버전, 리틀컵 같은 시즌 컵을 모두 같은 "포맷"으로 다룬다.
사이드바의 리그·컵 선택기로 고르면 모든 페이지의 순위·CP 상한·추천 기술이 그 포맷 기준으로 바뀐다.
고른 포맷은 주소(`?f=ultra`)와 브라우저에 남는다. 예전 `?league=` 주소도 그대로 열린다.

- `data/data.js` — 모든 리그·컵의 종 정보 (순위 없음)
- `data/formats/index.js` — 포맷 목록과 한글 이름 · `data/formats/<key>.js` — 그 포맷의 순위·추천 기술·기본 개체값
- `data/seasons.js` — **직접 관리하는** GO배틀리그 시즌 주차별 일정. 사이드바 "지금 열린 리그"와 `season.html`이 쓴다.
  처음 오는 사람은 이번 주 열린 포맷으로 연다

### 시즌이 바뀌거나 새 컵이 열릴 때

1. 포켓몬 GO 한국어 공지(`pokemongo.com/ko/news/...`)를 보고 `data/seasons.js`에 새 시즌을 적는다.
   한 주를 한 줄로, 시각은 공지의 태평양 시간 ISO(`13:00:00-07:00`, 서머타임이 끝나면 `-08:00`), 이름은 공지 표기
2. PvPoke에 아직 없는 컵은 `fetch_moves.py`의 `EXTRA_FORMATS`에 `(컵id, CP)`를 더한다. 컵 id는 PvPoke 주소의 이름
3. `python pogo-cct-tool/scripts/update_all.py` — 일정에 있는데 순위가 없는 컵은 경고로 나온다
4. `node tests/season.test.js && node tests/formats.test.js && node tests/battle-engine.test.js`

순위가 아직 없는 컵은 화면에 "순위 준비 중"으로 나오고, PvPoke에 올라온 뒤 3번을 다시 돌리면 들어간다.
등록된 시즌이 모두 끝나면 사이드바에 "다음 시즌 일정이 아직 등록되지 않았습니다"가 뜬다.

## 써보기

저장소 루트의 `index.html` 을 브라우저로 열면 끝이다. 빌드도 서버도 설치도 필요 없다.
순수 HTML/CSS/JS이고 의존성이 없다.

## 배틀 시뮬레이터

`battle.html`에서 고른 리그·컵의 배틀을 계산한다. CP 상한이 없는 마스터 계열은 15/15/15가 기본이다.

- **Single**: 포켓몬, IV, 기술, 실드, 능력치 단계를 설정한 1대1 자동 전투
- **Multi**: 한 포켓몬을 현재 리그 상위 메타와 일괄 비교
- **Matrix**: 두 포켓몬 그룹의 모든 조합을 레이팅 표로 비교하고 CSV로 내보내기
- 턴 타임라인, 실드 0~2개 조합표, CMP, CCT, 브레이크포인트·벌크포인트 분석
- URL에 리그·포켓몬·기술·실드·직접 입력 IV를 저장해 공유 가능

계산은 1턴 0.5초, 에너지 최대 100, 자속 ×1.2, 포켓몬 GO 타입 배율,
그림자 공격 ×1.2·방어 ÷1.2를 적용한다. 확률 버프는 고정 시드로 재현한다.
PvPoke의 기능과 공개 데이터를 검증 기준으로 삼았지만 엔진과 화면은 독립 구현이므로,
동시 행동과 자동 베이팅 판단이 PvPoke 결과와 일부 다를 수 있다.

엔진 회귀 검사는 Node.js가 있을 때 다음처럼 실행한다.

```bash
node tests/battle-engine.test.js
node tests/season.test.js
node tests/formats.test.js
```

## 데이터 갱신

```bash
python pogo-cct-tool/scripts/update_all.py          # 아래 셋을 순서대로 + 요약
```

```bash
python pogo-image-fetcher/scripts/fetch_assets.py   # 모든 리그·컵 종의 스프라이트·한글명
python pogo-move-fetcher/scripts/fetch_moves.py     # 포맷 목록·포맷별 순위·기술셋·기술 턴 수
python pogo-cct-tool/scripts/build_data.py          # data.js + 포맷별 순위 파일 + 시즌 일정 대조
python pogo-cct-tool/scripts/build_moves.py         # 기술표 데이터
```

Python 3.9+ 표준 라이브러리만 쓴다. 설치할 패키지가 없다.

리그·컵(포맷) 목록은 PvPoke `gamemaster.json`의 `formats`를 자동으로 따라간다. 기본 3리그는 항상 넣고,
커뮤니티 대회(Battle Frontier 등)·사용자 정의·순위 비공개 포맷은 뺀다. 시즌 일정에는 있지만 PvPoke에 아직 없는 컵은
`fetch_moves.py`의 `EXTRA_FORMATS`나 `--extra 컵:CP`로 넣으면 순위 파일이 올라온 뒤부터 들어간다.
한글 컵 이름은 게임 로케일의 공식 표기를 쓰고, 없으면 공식 단어로 조합하며, 그것도 안 되면 영문으로 두고 경고한다
(`FORMAT_NAME_KO`에 직접 적으면 우선한다). 결과는 `pogo-move-fetcher/data/formats.json`.
순위 숫자는 PvPoke 사이트와 같다 (이미지가 없는 종 자리는 비어 있을 수 있다).

메가 진화·원시회귀 폼은 메가 버전 포맷에만 나온다. 그 포맷에서는 PvPoke 기본 개체값을 프리셋으로 쓴다.
전투 중 CP 보정은 계산에 반영하지 않는다.

## CCT 계산식

내 일반기술을 **k회** 쓴 직후 차징을 누른다. 그때까지 흐른 턴은 `k × m`.
상대 기술이 끝나기 **직전**에 눌러야 공짜 턴을 안 준다:

```
k × m  ≡  o − 1   (mod o)
```

`m` = 내 일반기술 턴 수, `o` = 상대 일반기술 턴 수.
`gcd(m, o)` 가 `o − 1` 을 나누지 못하면 해가 없고, 도달 가능한 가장 큰 나머지를 쓰면서
모자란 만큼이 손해 턴이 된다.

| 내 \ 상대 | 1턴 | 2턴 | 3턴 | 4턴 | 5턴 |
| --- | --- | --- | --- | --- | --- |
| **1턴** | 자유 | 1·3·5·7 | 2·5·8·11 | 3·7·11·15 | 4·9·14·19 |
| **2턴** | 자유 | 정렬 불가 | 1·4·7·10 | 1·3·5·7 (1턴 손해) | 2·7·12·17 |
| **3턴** | 자유 | 1·3·5·7 | 정렬 불가 | 1·5·9·13 | 3·8·13·18 |
| **4턴** | 자유 | 매번 동일 (1턴 손해) | 2·5·8·11 | 정렬 불가 | 1·6·11·16 |
| **5턴** | 자유 | 1·3·5·7 | 1·4·7·10 | 3·7·11·15 | 정렬 불가 |

상대가 1턴 기술이면 매 턴 끝나므로 CCT 이득이 없고, 서로 턴이 같으면 정렬이 불가능하다.

## 데이터 출처

| 항목 | 출처 |
| --- | --- |
| 순위 · 기술 턴 수 · 추천 기술셋 | [PvPoke](https://github.com/pvpoke/pvpoke) |
| 스프라이트 · 한글 포켓몬명 | [PoGoMate](https://pogomate.com) |
| 한글 기술명 · 컵 이름 | [PokeMiners](https://github.com/PokeMiners) 포켓몬 GO 한국어 로케일 |
| 시즌 일정 · 출전 조건 | 포켓몬 GO 공식 공지 (직접 옮겨 적음) |

순위는 PvPoke가 정본이다. PoGoMate도 자체 순위를 내지만 둘이 다르다
(상위 300 집합이 16종 차이). PoGoMate 순위는 `pogomateRank` 에 참고용으로 남겨 둔다.

## 권리

포켓몬 · 기술명 · 이미지의 권리는 Niantic, Inc. 및 The Pokémon Company에 있습니다.
이 저장소는 비공식 개인 참고용 자료이며 어떤 식으로도 제휴 관계가 없습니다.
