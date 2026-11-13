# Contributing

**English** · [한국어](#한국어)

Bug reports and ideas are welcome in [Issues](https://github.com/phy-ce/Manifold/issues). For a change to the code or data, open a pull request; by contributing you agree it is released under the project's [GPL v3 or later](LICENSE).

## Running it

Requires Node.js 22.

```sh
npm install
npm run dev
```

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check and build |
| `npm test` | Game rule and translation tests |
| `npm run check:data` | Check the recipe data |

Pushing to `main` runs the data check, tests and build on GitHub Actions and deploys to GitHub Pages.

## Where things are

TypeScript and Vite; the game rules are kept apart from the screen, so they are tested without a browser.

| Path | What |
|---|---|
| `data/` | Materials, machines, recipes, ores, biomes. Most new content needs only these. |
| `src/engine/` | Game rules, one module per concern (creatures, gathering, inventory, machines, lines, saves) |
| `src/ui/` | The screen, one module per window or bar |
| `src/ui/theme.ts` | Sizes; colours are theme tokens in `src/style.css` |
| `src/i18n.ts`, `data/lang/` | Languages and the English text |
| `DESIGN.md`, `docs/design/` | Design rules and notes |

Recipes are designed by hand after real industrial processes.

---

## 한국어

버그나 아이디어는 [Issues](https://github.com/phy-ce/Manifold/issues)에 남겨 주세요. 코드나 데이터를 고치려면 풀 리퀘스트를 보내 주세요. 기여한 내용은 프로젝트와 같은 [GPL v3 이상](LICENSE)으로 공개됩니다.

### 실행하기

Node.js 22가 필요합니다.

```sh
npm install
npm run dev
```

| 명령어 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사와 빌드 |
| `npm test` | 게임 규칙과 번역 테스트 |
| `npm run check:data` | 레시피 데이터 검사 |

`main`에 push하면 GitHub Actions가 데이터 검사, 테스트, 빌드를 거쳐 GitHub Pages에 배포합니다.

### 구조

TypeScript와 Vite를 쓰고, 게임 규칙은 화면 코드와 분리되어 있어서 브라우저 없이 테스트할 수 있습니다.

| 경로 | 내용 |
|---|---|
| `data/` | 재료, 기계, 레시피, 광석, 바이옴 데이터. 새 콘텐츠는 대부분 여기만 고치면 됩니다 |
| `src/engine/` | 게임 규칙. 생물, 채집, 인벤토리, 기계, 라인, 세이브 등 기능별 모듈 |
| `src/ui/` | 화면. 창이나 바 하나에 모듈 하나 |
| `src/ui/theme.ts` | 크기 기준값. 색은 `src/style.css`의 테마 토큰 |
| `src/i18n.ts`, `data/lang/` | 언어와 영어 번역 |
| `DESIGN.md`, `docs/design/` | 설계 기준과 세부 문서 |

레시피는 실제 산업 공정을 바탕으로 직접 설계했습니다.
