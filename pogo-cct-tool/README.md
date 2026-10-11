# 포켓몬 GO 슈퍼리그 CCT 계산기

내 포켓몬과 상대 포켓몬을 고르면 차징기를 몇 번째 일반기술 직후에 눌러야 하는지 바로 나온다.

## 여는 법

`index.html` 을 브라우저로 열면 끝이다. 빌드도 서버도 필요 없다.

데이터를 `fetch()` 가 아니라 `<script src="data/data.js">` 로 읽는 이유가 여기 있다 —
`file://` 로 열면 `fetch()` 는 CORS에 막힌다. 데이터 형식을 바꿀 일이 있어도 이 제약은 지킬 것.

## 데이터 갱신

```bash
# 1. 수집기를 먼저 돌린다 (각 폴더에서)
python ../pogo-image-fetcher/scripts/fetch_assets.py
python ../pogo-move-fetcher/scripts/fetch_moves.py

# 2. 둘을 합쳐 이 도구의 데이터로 만든다
python scripts/build_data.py
```

`build_data.py` 는 두 수집기의 결과를 `speciesId` ↔ `id` 로 조인해 `data/data.js` 를 만들고
스프라이트를 `images/` 로 복사한다. 폴더가 자체 완결이라 통째로 옮기거나 공유해도 동작한다.

## CCT 계산식

내 일반기술을 **k회** 쓴 직후에 차징을 누른다. 그때까지 흐른 턴은 `k × m` (m = 내 기술 턴).
상대 기술이 끝나기 **직전**에 눌러야 공짜 턴을 안 준다:

```
k × m  ≡  o − 1   (mod o)        o = 상대 기술 턴
```

`gcd(m, o)` 가 `o − 1` 을 나누지 못하면 해가 없다. 그때는 도달 가능한 가장 큰 나머지를 쓰고
모자란 만큼이 손해 턴이 된다 (예: 내 2턴 vs 상대 4턴 → 1턴 손해).

특수한 경우 두 가지:

- **상대가 1턴 기술** — 매 턴 끝나므로 언제 눌러도 같다. 에너지·CMP를 우선
- **서로 같은 턴** — 나머지가 늘 0이라 정렬이 불가능하다

이 식은 참고 치트시트의 5×5 = **25칸 전부와 대조해 검증**했다. 계산부를 고치면 그 25칸으로
회귀 확인할 것 (`app.js` 의 `cct()` / `cellText()`).

## 구조

```
index.html        화면
style.css
app.js            CCT 계산 + 검색 + 렌더링 (의존성 없음, 바닐라 JS)
data/data.js      window.POKEMON — 1,152종
images/*.webp     스프라이트 1,152장
scripts/build_data.py
```

## 데이터 출처

| 항목 | 출처 |
| --- | --- |
| 순위 · 기술 턴 수 · 추천 기술셋 | PvPoke |
| 스프라이트 · 한글 포켓몬명 | PoGoMate |
| 한글 기술명 | 포켓몬 GO 한국어 로케일 |

자세한 수집 방법은 `pogo-image-fetcher` 와 `pogo-move-fetcher` 의 README를 볼 것.

## 주의

상표 및 게임 이미지의 권리는 Niantic · The Pokémon Company에 있다. 개인 참고용으로만 쓸 것.
