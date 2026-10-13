---
name: pogo-cct-tool
description: 포켓몬 GO PvP(모든 리그·컵) CCT·CMP·배틀 계산기 웹 도구를 고치거나 데이터를 갱신한다. CCT/CMP 계산식을 수정할 때, 화면·검색·표를 손볼 때, 페이지를 추가할 때, 수집기를 돌린 뒤 도구 데이터를 다시 만들 때 사용한다. 트리거 "CCT 계산기", "CMP 계산기", "차징 타이밍", "개체값", "도구 갱신", "data.js 다시 만들어", "리그 추가", "컵 추가", "시즌 일정".
---
> **위치 안내** — GitHub Pages 배포를 위해 웹 파일(`index.html`·`*.js`·`style.css`·`data/`·`images/`)은 **저장소 루트**로 옮겼다. 이 폴더에는 `scripts/build_data.py`와 문서만 남는다. 아래 경로는 루트 기준으로 읽을 것. 빌드는 저장소 루트에서 `python pogo-cct-tool/scripts/build_data.py`.

# GO배틀리그 가이드 (포켓몬 GO PvP 계산기 모음)

페이지 다섯. 전부 같은 껍데기와 `common.js` 를 공유한다.

| 페이지 | 스크립트 | 내용 |
| --- | --- | --- |
| `index.html` | `app.js` | CCT 차징 타이밍 |
| `cmp.html` | `cmp.js` | CMP 차징 우선권 |
| `ivs.html` | `ivs.js` | 개체값 가이드 (초보자용) |
| `team.html` | `team.js` | 팀 조합 유형 (초보자용) |
| `types.html` | `types.js` | 타입 상성 (초보자용) |
| `battle.html` | `battle.js` (+ `battle-core.js`·`battle-engine.js`) | 배틀 시뮬레이터 Single·Multi·Matrix |
| `moves.html` | `moves.js` | 기술표 |
| `season.html` | `season-page.js` | 시즌 일정 — 이번 주·다음 주 리그·컵, 주차별 표 |

정적 HTML/CSS/JS. **빌드 도구도 프레임워크도 쓰지 않는다** — `index.html` 을 그냥 열면 돈다.

## 절대 깨면 안 되는 제약 둘

**1. 데이터는 `<script src="data/data.js">` 로 읽는다. `fetch()` 로 바꾸지 말 것.**
`file://` 로 열면 `fetch()` 는 CORS에 막혀 페이지가 통째로 죽는다. `data.js` 는
`window.POKEMON` / `window.CPM` 전역 할당이다.

**2. 전역 이름을 두 파일에서 선언하지 말 것.**
`common.js` + `app.js`(또는 `cmp.js`)는 전역 렉시컬 스코프를 공유하는 일반 스크립트다.
같은 이름을 양쪽에서 선언하면 `SyntaxError: Identifier has already been declared` 로
**해당 스크립트 전체가 실행되지 않는다.** 실제로 `byRank` 를 양쪽에 두는 바람에
CCT 페이지가 통째로 빈 화면이 됐다.

더 나쁜 건 진단이다. `file://` 에서는 이 에러가 `Script error. @ :0` 으로만 보인다
(교차출처 취급). 원인을 보려면 스크립트를 페이지에 **인라인**해서 띄워야 한다.
`render` 처럼 서로 다른 페이지에만 쓰이는 이름은 겹쳐도 된다 — 같이 로드되지 않으니까.

중복 검사:

```bash
python -c "
import re,collections
d=collections.defaultdict(list)
for f in ['common.js','app.js','cmp.js']:
    for line in open(f,encoding='utf-8'):
        m=re.match(r'(?:const|let|var|function)\s+([A-Za-z_\$][\w\$]*)', line)
        if m: d[m.group(1)].append(f)
print({k:v for k,v in d.items() if len(set(v))>1})
"
```

## 포맷(리그·컵)과 시즌 — 페이지 뼈대

모든 페이지가 슈퍼리그 전용이 아니라 **지금 고른 포맷** 기준이다. 스크립트 순서가 곧 의존 관계다:

```html
<script src="data/data.js"></script>            <!-- POKEMON(모든 종, 순위 없음)·CPM·TYPES -->
<script src="data/formats/index.js"></script>   <!-- FORMATS: key·cup·cp·ko -->
<script src="data/seasons.js"></script>         <!-- SEASONS (직접 관리) -->
<script src="season.js"></script>               <!-- Season.at() — 지금 열린 포맷 -->
<script src="format.js"></script>               <!-- Format: ?f= → ?league= → localStorage → 이번 주 → great -->
<script src="data/moves.js"></script>           <!-- 필요한 페이지만. common.js 보다 앞 -->
<script src="common.js"></script>               <!-- DATA·FORMAT·FORMAT_DATA·rankText·search -->
<script src="페이지.js"></script>
```

- `format.js` 가 고른 포맷의 `data/formats/<key>.js` 를 **`document.write` 로** 넣는다. 그래야
  `common.js` 전에 실행되고 `file://` 에서도 돈다. 비동기 로딩으로 바꾸지 말 것 (제약 1과 같은 이유)
- `common.js` 의 `DATA` 는 지금 포맷 순위에 있는 종만, 순위 순. `p.rank` 는 PvPoke 순위 숫자라
  빈자리가 있을 수 있어서 `byRank(r)` 는 위치(`DATA[r-1]`)로 찾는다
- 추천 기술은 `common.js` 가 `MOVESETS[id][2]`·`[3]` 과 `p.fast` 순서를 포맷 기준으로 바꿔 끼운다
- CP 상한은 `BattleCore.league()` 가 포맷 목록에서 찾는다. 인자를 안 주면 지금 포맷. CP 10000 = 상한 없음(15/15/15)
- 포맷을 바꾸면 `Format.go(key)` 로 페이지를 다시 연다 — 순위·개체값 계산이 전부 포맷에 묶여 있다
- 본문에서 포맷 이름·CP 를 보여 줄 자리는 `<em class="fmt" data-format="name|cap">` — `format.js` 가 채운다
- `common.js` 전역에 `FORMAT`·`FORMAT_DATA`·`FORMAT_RANKS`·`FORMAT_SETS` 가 늘었다. 제약 2(이름 중복) 검사 대상

시즌 일정 `data/seasons.js` 는 `scripts/sync_season.py` 가 공식 공지에서 새 시즌을 더한다 (매일 GitHub Actions
`update-data.yml`). 이미 있는 시즌은 고치지 않으니 손으로 다듬어도 된다. 한 주 한 줄, 태평양 시간 ISO, 공지의 한글 표기.
`build_data.py`·`fetch_moves.py`·`sync_season.py` 가 그 줄을 정규식으로 읽으니 형식을 지킬 것.
공지 파싱은 `python tests/sync_season_test.py`.
판정 경계·겹친 주는 `node tests/season.test.js`.

## 데이터 갱신

```bash
python pogo-cct-tool/scripts/update_all.py    # 수집기 둘 + build_data + build_moves, 끝에 확인할 경고 요약
```

`build_data.py` 는 `speciesId` ↔ `id` 로 조인한다. `data/formats/` 의 사라진 포맷 파일과
`images/` 의 고아 파일은 자동 정리된다. `data/seasons.js` 는 건드리지 않는다.
`images/` 의 고아 파일은 자동 정리된다.

## CCT 계산식 — 고치기 전에 읽을 것

```
k × m  ≡  o − 1   (mod o)
```

- `k` = 내 일반기술 사용 횟수 (답)
- `m` = 내 일반기술 턴 수, `o` = 상대 일반기술 턴 수
- 상대 기술이 **끝나기 직전**에 눌러야 공짜 턴을 안 준다

`gcd(m, o)` 가 `o − 1` 을 나누지 못하면 해가 없다. 도달 가능한 가장 큰 나머지
(`target = (o-1) - ((o-1) % g)`)를 쓰고 모자란 만큼이 `loss` 턴이다.

특수 분기 두 가지:

| 조건 | 결과 |
| --- | --- |
| `o === 1` | 자유 — 상대 기술이 매 턴 끝나 CCT 이득이 없다 |
| `m === o` | 정렬상 불가 — 나머지가 늘 0이라 절대 못 맞춘다 |
| 해가 연속(`everyK`) | 매번 동일 — 최선이어도 `loss`턴 손해 (예: 내 4턴 vs 상대 2턴) |

### 회귀 확인 — 25칸 대조

식을 고쳤으면 **반드시** 5×5 전부를 확인할 것. 참고 치트시트와 대조해 검증된 정답이다.

| 내\상대 | 1턴 | 2턴 | 3턴 | 4턴 | 5턴 |
| --- | --- | --- | --- | --- | --- |
| **1턴** | 자유 | 1·3·5·7 | 2·5·8·11 | 3·7·11·15 | 4·9·14·19 |
| **2턴** | 자유 | 정렬상 불가 | 1·4·7·10 | 1·3·5·7 (1턴 손해) | 2·7·12·17 |
| **3턴** | 자유 | 1·3·5·7 | 정렬상 불가 | 1·5·9·13 | 3·8·13·18 |
| **4턴** | 자유 | 매번 동일 (1턴 손해) | 2·5·8·11 | 정렬상 불가 | 1·6·11·16 |
| **5턴** | 자유 | 1·3·5·7 | 1·4·7·10 | 3·7·11·15 | 정렬상 불가 |

```bash
node -e "
const fs=require('fs'),vm=require('vm');
const ctx={window:{},console};vm.createContext(ctx);
vm.runInContext(fs.readFileSync('data/data.js','utf8'),ctx);
const src=fs.readFileSync('app.js','utf8');
vm.runInContext(src.slice(0,src.indexOf('const DATA =')).replace(\"'use strict';\",'')
  + '\nthis.cellText=cellText;',ctx);
for(let m=1;m<=5;m++)console.log(m, [1,2,3,4,5].map(o=>ctx.cellText(m,o).main).join(' | '));
"
```

## 브라우저로 확인하는 법

Chrome 헤드리스로 스크린샷을 찍는다.

```bash
URL=$(python -c "import pathlib;print(pathlib.Path('index.html').resolve().as_uri())")
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu \
  --hide-scrollbars --virtual-time-budget=8000 --window-size=1100,1900 \
  --screenshot=shot.png "$URL"
```

함정 두 가지, 둘 다 실제로 밟았다:

1. **헤드리스 Chrome은 창 너비를 최소 500px로 강제한다.** `--window-size=390` 을 줘도
   `clientWidth` 는 500이고, 스크린샷만 390으로 잘려 나온다. 레이아웃이 깨진 게 아니라
   캡처 아티팩트다. 넘침 여부는 `documentElement.scrollWidth > clientWidth` 로 판정할 것
2. **`--dump-dom` 은 스크립트 완료 전에 덤프한다.** JS 실행 결과를 보려면 화면에 그려서
   스크린샷을 찍어야 한다

상호작용까지 보려면 `index.html` 사본에 구동 스크립트를 끼워 넣고 찍은 뒤 사본을 지운다
(검색창에 `input` 이벤트 → 첫 결과에 `mousedown`). 테스트 코드를 `index.html` 에 남기지 말 것.

> Bash 도구의 heredoc이 백슬래시를 먹을 때가 있다. 주입 스크립트에 `\n` 같은 이스케이프를
> 쓰면 JS 문법 오류로 조용히 죽는다. 구분자는 `' | '` 처럼 백슬래시 없는 걸 쓸 것.

## 레이아웃 주의

**`min-width: 0` 을 지우지 말 것.** 그리드·플렉스 아이템은 기본 `min-width: auto` 라서
안에 넓은 요소가 있으면 칸을 밀어내 페이지 전체가 가로로 넘친다. 세 군데가 필요하다:

```css
.shell > *                            { min-width: 0 }  /* 사이드바 + 본문 */
main > *, .pickers > *, .table-scroll { min-width: 0 }  /* 넓은 표 */
@media (max-width: 860px) { .nav      { min-width: 0 } }/* 가로 네비 */
```

이 함정을 세 번 밟았다. 증상은 매번 같다 — 좁은 화면에서 페이지가 가로로 넘치고
좌우가 잘린다. `documentElement.scrollWidth > clientWidth` 로 확인할 것.
넘치는 요소를 찾으려면 모든 요소의 `getBoundingClientRect().right` 를 뷰포트 폭과 비교하면 된다.

`[hidden] { display: none !important }` 도 필요하다. `.chosen { display: flex }` 가
`hidden` 속성을 이겨서, 없으면 선택 전에도 빈 박스가 보인다.

## CMP 계산 — 고치기 전에 읽을 것

```
공격 실수치 = (종족값공격 + 공격개체값) x CPM(레벨)
CP         = floor(공격 x sqrt(방어) x sqrt(HP) / 10)
```

1,152종 전부 PvPoke 수치와 대조해 검증한 식이다. CMP는 **공격 실수치만** 비교한다
(PvPoke `Battle.js`: `if(poke.stats.atk > opponent.stats.atk) priority++`).

| 사실 | 근거 |
| --- | --- |
| 그림자는 CMP에 영향 없음 | `shadowAtkMult` 는 데미지 계산에서만 곱해진다 (`Pokemon.js`) |
| 동점이면 양쪽 다 우선권 없음 | 위 조건이 `>` 라 같으면 아무도 못 얻는다 |

**개체값만 보고 판단하면 틀린다.** CP 1500 상한 때문에 개체값에 따라 레벨이 같이 움직인다.
레지스틸이 반례다:

```
공격 개체값 15 → Lv22.5 (CP 상한에 걸림) → 공격 100.12
공격 개체값 14 → Lv23.0                  → 공격 100.58   ← 더 높다
```

그래서 '공격 최대' 프리셋은 `atkIV=15` 로 가정하지 말고 **4,096조합을 전수 탐색**해야 한다.
`bestBuild()` 는 CP가 레벨에 단조증가인 점을 이용해 상한을 넘는 순간 끊는다.

PvPoke gamemaster의 `defaultIVs.cp1500` 은 **1등 개체가 아니다** (스탯곱이 더 낮다).
1등 개체가 필요하면 직접 계산할 것 — `presets()` 가 그렇게 한다.

## 레이아웃 뼈대

두 페이지 모두 같은 껍데기를 쓴다. 페이지를 추가하면 이 구조를 복사하고
`.sidebar .nav` 에 링크 한 줄만 더하면 된다.

```html
<div class="shell">
  <aside class="sidebar"> 브랜드 + .nav + 안내 </aside>
  <div class="content"> header.top + main.wrap + footer </div>
</div>
```

`.shell` 은 `224px | 1fr` 그리드이고 860px 아래에서 가로 상단바로 접힌다.
사이드바는 `position: sticky; height: 100vh` 라 스크롤해도 남는다.
현재 페이지 표시는 `common.js` 의 `markNav()` 가 파일명으로 `aria-current` 를 붙인다 —
링크 `href` 는 `index.html` 처럼 **파일명 그대로** 적을 것 (`./index.html` 은 매칭 안 된다).

## 타입 상성 데이터

`window.TYPES` = `{ order, ko, chart, mult }`. `chart[공격][방어]` 가 배율이다.

출처는 PvPoke `DamageCalculator.js` 의 `getTypeTraits` — 방어 타입별 약점·저항·무효를
**이름으로** 적어 둬서 배열 순서를 추측할 필요가 없다. 공식 GAME_MASTER 의
`attackScalar` 는 18칸 배열인데 라벨이 없어 순서를 가정해야 하므로 정본으로 쓰지 않는다.
단 **324칸 전부 대조해 두 소스가 일치**하는 것은 확인했고, 그래서 표시용 표준 순서
(`order`)도 그 가정이 맞다고 보고 쓴다.

주의할 점:

- 포켓몬 GO에는 **완전 무효가 없다.** 본편 ×0 조합도 ×0.390625다
- 배수가 본편과 다르다 (×1.6 / ×0.625, 본편은 ×2 / ×0.5)
- 두 타입이면 곱해진다 — 이중 약점 ×2.56, 이중 저항 ×0.39
- 한글 타입명은 `pogo-move-fetcher` 가 `data/types.json` 으로 내보낸다
  (게임 한국어 로케일의 `pokemon_type_*`)

## 구조

```
index.html        CCT 페이지 (정적 뼈대만, 로직 없음)
cmp.html          CMP 페이지
style.css         두 페이지 공용
common.js         DATA/CPM, 검색, 콤보박스, 네비 — 두 페이지 공용
app.js            CCT 계산과 화면
cmp.js            CMP 계산과 화면
data/data.js      window.POKEMON (종족값 base 포함) + window.CPM
images/*.webp     1,152장, 9.4MB
scripts/build_data.py
```

페이지를 더 추가하려면 `common.js` 를 재사용하고, 전역 이름 중복만 조심하면 된다.
