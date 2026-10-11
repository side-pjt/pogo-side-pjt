# 포켓몬 GO 슈퍼리그 포켓몬 이미지 에셋

CCT 치트시트·도구 제작용 스프라이트 모음.

**순위는 PvPoke 기준**이다 (PoGoMate 순위와 다르며 참고용으로 `pogomateRank` 에 남겨 둔다).
기술 데이터는 `pogo-move-fetcher` 쪽에 있고 `id` ↔ `speciesId` 로 1,152종 전부 붙는다.

## 수집 방법

```bash
python scripts/fetch_assets.py              # 슈퍼리그 랭크 보유 전체 1,152종 (기본값)
python scripts/fetch_assets.py --top 300    # 상위 N종만
python scripts/fetch_assets.py --force      # 전체 다시 내려받기
```

이미 받은 파일은 건너뛰므로 재실행이 저렴하다. 랭킹이 갱신되면 그냥 다시 실행하면 된다.

## 출처

| 항목 | 출처 |
| --- | --- |
| **순위 (정본)** | PvPoke `rankings-1500.json` |
| 이름 · dex · 타입 · 폼 | `pogomate.com/battles/great-league` 의 Next.js RSC 페이로드 |
| 스프라이트 이미지 | `cdn.pogomate.com/pokemon/` (페이지 JS 번들의 해시 매핑에서 추출) |

PokeMiners 저장소도 검토했지만 따라큐·윽우지 등 여러 종의 스프라이트가 누락돼 있어
PoGoMate 자체 CDN을 사용했다. 참고한 치트시트 이미지와 동일한 스프라이트 세트다.

## 구조

```
assets/
  pokemon/*.webp      1,152장 — 파일명이 곧 식별자
  manifest.json       전체 메타데이터
  index.csv           표 작업용 (Excel에서 바로 열림)
```

### 파일명 규칙

`<영문id>_<한글전체이름>.webp` — 양쪽 모두 폼과 그림자를 담는다.

```
altaria_파비코리.webp                              파비코리
altaria_shadow_그림자파비코리.webp                 그림자 파비코리
ninetales_alolan_알로라나인테일.webp               알로라 나인테일
ninetales_alolan_shadow_그림자알로라나인테일.webp  그림자 알로라 나인테일
aegislash_shield_킬가르도실드폼.webp               킬가르도 (실드폼)
gastrodon_서쪽바다트리토돈.webp                    서쪽바다 트리토돈
```

영문 id는 PoGoMate의 `id`를 그대로 쓴다 — `manifest.json`과 이어지는 안정적인 키다.

한글 쪽은 원본 데이터의 `nameKo`가 종(種) 이름뿐이라(알로라 나인테일도 그냥 `나인테일`)
PoGoMate의 표시명 로직을 이식해 폼·그림자를 붙인 전체 이름을 만든다. 공백과 괄호가 살아 있는
정식 표기는 `manifest.json`의 `displayKo`에 따로 있으니 표에 찍을 때는 그쪽을 쓰면 된다.

전체 1,152종 중 374종이 그림자다. 포켓몬 GO는 그림자를 별도 이미지가 아니라 인게임 오버레이로
표현하므로 그림자 파일의 픽셀은 일반 폼과 같다 (1,152개 파일, 고유 이미지 764장).
그림자 여부는 파일명 접미사와 `manifest.json`의 `isShadow`로 구분한다.

### manifest.json

```json
{
 "source": "https://pogomate.com/battles/great-league",
 "league": "great",
 "top": 1152,
 "count": 1152,
 "pokemon": [
  {
   "rank": 7,
   "pogomateRank": 9,
   "id": "altaria_shadow",
   "name": "Altaria",
   "nameKo": "파비코리",
   "displayKo": "그림자 파비코리",
   "nameJa": "チルタリス",
   "dex": 334,
   "isShadow": true,
   "form": null,
   "types": ["dragon", "flying"],
   "level": 29,
   "file": "pokemon/altaria_shadow_그림자파비코리.webp",
   "spriteKey": "pm334.icon.png",
   "url": "https://cdn.pogomate.com/pokemon/pm334.icon.<hash>.webp"
  }
 ]
}
```

`level` 은 슈퍼리그 기준 추천 레벨, `form` 은 알로라/가라르 등 지역 폼 (없으면 `null`).

## 주의

이미지와 포켓몬 명칭의 권리는 각 권리자(Niantic · The Pokémon Company)에게 있다.
개인 참고용 자료 제작에만 사용할 것.
