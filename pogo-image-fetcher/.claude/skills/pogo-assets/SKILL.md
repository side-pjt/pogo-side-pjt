---
name: pogo-assets
description: 포켓몬 GO 슈퍼리그(Great League) 랭킹 포켓몬의 스프라이트 이미지와 메타데이터를 PoGoMate에서 수집한다. CCT 치트시트나 표에 쓸 포켓몬 아이콘이 필요할 때, 랭킹이 갱신돼 에셋을 다시 받아야 할 때, 수집 범위를 바꾸고 싶을 때 사용한다. 트리거: "에셋 가져와", "스프라이트 받아", "랭킹 갱신", "포켓몬 아이콘", "pogomate".
---

# 포켓몬 GO 슈퍼리그 에셋 수집

## 실행

```bash
python scripts/fetch_assets.py              # 슈퍼리그 랭크 보유 전체 1,152종 (기본값)
python scripts/fetch_assets.py --top 300    # 상위 N종만
python scripts/fetch_assets.py --force      # 전체 다시 내려받기
```

출력은 항상 저장소의 `assets/` 로 간다 (실행 위치와 무관). 이미 받은 파일은 건너뛰므로
재실행이 저렴하다. 랭킹이 바뀌면 그냥 다시 실행하면 되고, 범위에서 빠진 옛 파일은 자동 정리된다.

## 데이터 출처와 수집 원리

이름·폼·스프라이트는 전부 `https://pogomate.com/battles/great-league` 한 페이지에서 나온다
(공개 API는 없다). **순위만 PvPoke에서 따로 받는다.**

**0. 순위 — PvPoke가 정본**

`rankings/all/overall/rankings-1500.json` 의 배열 순서가 곧 순위다.
PoGoMate도 자체 `greatRank` 를 내지만 **둘이 서로 다르다** — 상위 300 집합이 16종 차이 나고
개별 순위도 어긋난다 (따라큐 PvPoke 5위 / PoGoMate 6위). PoGoMate 순위는 참고용으로
`pogomateRank` 에 남겨 둔다. 종 ID는 1,152종 전부 일치해서 두 소스가 그대로 붙는다.

**1. 이름·폼 데이터 — Next.js RSC 플라이트 페이로드**

페이지 HTML에 `self.__next_f.push([1,"…"])` 조각이 흩어져 있다. 이 조각들의 JSON 문자열을
순서대로 이어붙이면 하나의 플라이트 페이로드가 되고, 그 안에 `"pokemonList":[…]` 가 들어 있다.
배열 끝은 정규식으로 못 찾으므로 문자열 리터럴을 인식하는 괄호 매칭으로 잘라낸다.

항목당 `id`, `name`, `nameKo`, `nameJa`, `dex`, `types`, `isShadow`, `imageForm`,
`greatRank`, `greatLevel` 등이 들어 있다. 전체 1,582종 중 슈퍼리그 랭크 보유는 약 1,152종.

단 `nameKo` 는 종 이름뿐이고 폼·그림자가 빠져 있다 (아래 '한글 이름을 만드는 법' 참고).

**2. 스프라이트 이미지 — JS 번들의 해시 매핑**

이미지 URL은 콘텐츠 해시가 붙어 있어 추측할 수 없다 (`pm334.icon.<hash>.webp`).
페이지가 참조하는 `/_next/static/chunks/*.js` 를 훑어 `cdn.pogomate.com/pokemon/` 이
들어 있는 청크에서 매핑을 뽑는다:

```
"pm334.icon.png" : "https://cdn.pogomate.com/pokemon/pm334.icon.<hash>.webp"
```

약 2,421건. 키 형식은 `pm<dex>[.f<FORM>][.s].icon.png` 이고 `.s.` 는 이로치라 제외한다.

**3. 매칭**

포켓몬마다 `pm<dex>.f<imageForm>.icon.png` → `pm<dex>.icon.png` → 해당 dex의 아무 폼 순으로
후보를 만들어 매핑에 있는 첫 키를 쓴다. 1,152종 전부 해결된다.

## PokeMiners를 쓰지 않은 이유

`PokeMiners/pogo_assets` 저장소를 먼저 검토했으나 Addressable Assets에 dex 구멍이 많다.
**따라큐(778)·윽우지(845) 등 여러 종의 스프라이트가 아예 없었다**
(레거시 `Images/Pokemon/` 폴더도 7세대에서 끊겨 폴백이 안 된다).
PoGoMate CDN은 1,152종 전부를 커버하고, 참고한 치트시트와 동일한 스프라이트 세트다.

## 파일명 규칙

`<영문id>_<한글전체이름>.webp` — 양쪽 모두 폼과 그림자를 담는다.

```
altaria_파비코리.webp                              파비코리
altaria_shadow_그림자파비코리.webp                 그림자 파비코리
ninetales_alolan_알로라나인테일.webp               알로라 나인테일
ninetales_alolan_shadow_그림자알로라나인테일.webp  그림자 알로라 나인테일
aegislash_shield_킬가르도실드폼.webp               킬가르도 (실드폼)
gastrodon_서쪽바다트리토돈.webp                    서쪽바다 트리토돈
```

영문 id는 PoGoMate의 `id` 를 그대로 쓴다 — `manifest.json` 과 이어지는 안정적인 키다.

### 한글 이름을 만드는 법 — 중요

데이터의 `nameKo` 는 **종(種) 이름뿐이라 폼이 빠져 있다** (알로라 나인테일도 그냥 `나인테일`).
폼·그림자를 붙인 전체 이름은 번들의 `formatPokemonDisplayName` 로직을 그대로 이식해 만든다
(`korean_name()`). 라벨을 직접 지어내지 말고 반드시 번들에서 뽑아 쓸 것.

번들에 있는 테이블:

| 테이블 | 내용 |
| --- | --- |
| `ALOLA:{…}` 로 시작하는 폼 라벨표 | 폼 코드 → `{ko, en, ja, prefix?, restrictToDex?}` (약 151건) |
| `"669_RED":{…}` 로 시작하는 표 | `<dex>_<폼>` 종별 예외 (플라제스 꽃색, 노고고치 마디 등) |
| `o={"646_BLACK":"블랙 ", …}` | 소수의 하드 오버라이드 |
| `ko:{shadow:"그림자 ", mega:"메가 ", …}` | 그림자·메가 접두사 |

조합 규칙:

1. `prefix` 가 있으면 **앞에 붙인다** — `알로라 ` + `나인테일` → `알로라 나인테일`
2. 없으면 **괄호로 뒤에 붙인다** — `킬가르도` + `(실드폼)` → `킬가르도 (실드폼)`
3. `restrictToDex` 가 있으면 해당 dex일 때만 적용한다
4. 마지막에 그림자 접두사 — `그림자 ` + `알로라 나인테일`
5. 메가/거다이맥스는 폼 라벨을 붙이지 않는다 (접두사가 대신한다)

파일명에 쓸 때만 공백과 괄호를 제거한다. 공백이 살아 있는 정식 표기는 `manifest.json` 의
`displayKo` 에 따로 들어 있으니, 표에 찍을 때는 그쪽을 쓰면 된다.

## 그림자 처리 — 중요

전체 1,152종 중 **374종이 그림자**다. 포켓몬 GO는 그림자를 별도 이미지가 아니라 인게임
오버레이(보라 불꽃)로 표현하므로 **그림자 파일의 픽셀은 일반 폼과 완전히 같다.**
1,152개 파일이지만 고유 이미지는 764장이다.

그림자 여부는 파일명 접미사와 `manifest.json` 의 `isShadow` 로 구분한다.
표에서 시각적으로 구분하려면 불꽃 오버레이를 직접 합성하거나 테두리·배지로 표시해야 한다.

## 출력물

```
assets/
  pokemon/*.webp   스프라이트
  manifest.json    rank(PvPoke), pogomateRank, id, name, nameKo, displayKo, nameJa, dex, isShadow, form, types, level, file, url
  index.csv        표 작업용 (Excel에서 바로 열림, UTF-8 BOM)
```

## 사이트 구조가 바뀌면

스크립트가 `…를 찾지 못했습니다` 로 명시적으로 실패한다. 조용히 빈 결과를 내지 않는다. 그 경우:

1. 페이지를 받아 `self.__next_f` 조각이 아직 있는지, 키 이름이 `pokemonList` 그대로인지 확인
2. 청크에서 `cdn.pogomate.com` 경로 접두사가 `/pokemon/` 그대로인지 확인
3. 폼 라벨표의 앵커(`ALOLA:{`)가 살아 있는지 확인
4. `load_ranking()` / `load_sprite_map()` / `load_form_labels()` 의 정규식만 고치면 된다

## 권리

이미지와 포켓몬 명칭의 권리는 Niantic · The Pokémon Company에 있다. 개인 참고용 자료에만 쓸 것.
