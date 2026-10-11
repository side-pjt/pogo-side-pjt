---
name: pogo-cct-tool
description: 슈퍼리그 CCT 계산기 웹 도구를 고치거나 데이터를 갱신한다. CCT 계산식을 수정할 때, 화면·검색·표를 손볼 때, 수집기를 돌린 뒤 도구 데이터를 다시 만들 때 사용한다. 트리거 "CCT 계산기", "차징 타이밍", "도구 갱신", "data.js 다시 만들어".
---

# 슈퍼리그 CCT 계산기

정적 HTML/CSS/JS. **빌드 도구도 프레임워크도 쓰지 않는다** — `index.html` 을 그냥 열면 돈다.

## 절대 깨면 안 되는 제약

**데이터는 `<script src="data/data.js">` 로 읽는다. `fetch()` 로 바꾸지 말 것.**
`file://` 로 열면 `fetch()` 는 CORS에 막혀 페이지가 통째로 죽는다. `data.js` 는
`window.POKEMON = [...]` 전역 할당 한 줄이다.

## 데이터 갱신

```bash
python ../pogo-image-fetcher/scripts/fetch_assets.py   # 스프라이트·한글명
python ../pogo-move-fetcher/scripts/fetch_moves.py     # 기술 턴 수·기술셋
python scripts/build_data.py                           # 둘을 합쳐 data/data.js + images/
```

`build_data.py` 는 `speciesId` ↔ `id` 로 조인한다 (1,152종 전부 일치).
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

`main` 과 `.pickers` 가 그리드다. 그리드 아이템은 기본 `min-width: auto` 라서 안에 넓은
요소(`table.cct` 는 `min-width: 560px`)가 있으면 칸을 밀어내 페이지 전체가 가로로 넘친다.
`main > *, .pickers > *, .table-scroll { min-width: 0 }` 가 이걸 막는다 — 지우지 말 것.

`[hidden] { display: none !important }` 도 필요하다. `.chosen { display: flex }` 가
`hidden` 속성을 이겨서, 없으면 선택 전에도 빈 박스가 보인다.

## 구조

```
index.html        화면 (정적 뼈대만, 로직 없음)
style.css
app.js            CCT 계산 + 검색 + 렌더링. 의존성 0
data/data.js      window.POKEMON — 1,152종, 약 350KB
images/*.webp     1,152장, 9.4MB
scripts/build_data.py
```
