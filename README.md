# Modpack Simulator

기술모드팩의 공정 설계 재미만 남긴 글자 기반 공장 게임입니다. 광맥을 찾아 캐고, 노드 그래프로 공정을 연결해 첫 증기기관을 납품하는 S1까지 플레이할 수 있습니다.

## 플레이

https://phy-ce.github.io/Modpacksimulator/

`main`에 push하면 GitHub Actions가 데이터 검사, 테스트, 빌드를 거쳐 위 주소에 배포합니다.

## 실행

```sh
npm install
npm run dev
```

## 명령어

| 명령어 | 내용 |
|---|---|
| `npm run dev` | 개발 서버 실행 |
| `npm run build` | 타입 검사와 빌드 |
| `npm test` | 게임 규칙 테스트 |
| `npm run check:data` | 레시피 데이터 검사 |

## 구조

| 경로 | 내용 |
|---|---|
| `data/` | 재료, 기계, 레시피, 광석 데이터 |
| `src/engine/` | 게임 규칙, 화면과 분리됨 |
| `src/ui/` | 화면 |
| `src/ui/theme.ts` | 크기 기준값 |
| `DESIGN.md` | 전체 설계 기준과 문서 목록 |
| `docs/design/` | 세부 설계 문서 |

## 라이선스

MIT
