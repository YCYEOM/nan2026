import { defineConfig } from "vite";

// GitHub Pages 는 프로젝트 저장소를 `사용자이름.github.io/저장소이름/` 하위 경로에 올린다.
// 기본값(`base: "/"`)이면 번들 경로가 `/assets/...` 로 나가 404 가 된다.
//
// 상대 경로(`./`)를 쓰면 하위 경로든 루트든 커스텀 도메인이든 전부 동작하고
// dev server 도 그대로다 — 저장소 이름을 하드코딩하는 것보다 낫다.
// 이 게임은 라우터가 없는 캔버스 한 장이라 상대 경로로 충분하다.
export default defineConfig({
  base: "./",
});
