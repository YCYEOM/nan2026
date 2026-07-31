// 엔트리. 시작 시 씬 선택 메뉴 → 고른 게임을 하네스에 얹음. Esc로 메뉴 복귀.
// 새 게임 추가: GAMES 배열에 한 줄. 모드가 여럿인 게임은 하위 메뉴를 MenuScene 으로 재사용.
import { Harness } from "./core/harness";
import { MenuScene, GameEntry } from "./scenes/menu";
import { PowerScene } from "./scenes/power";
import { RhythmScene } from "./scenes/rhythm";
import { MimicryScene } from "./scenes/mimicry";
import { PushScene } from "./scenes/pushluck";
import { ZeroScene } from "./scenes/zerosum";
import { CornerScene } from "./scenes/corner";
import { DodgeScene } from "./scenes/dodge";

// 리듬 하위 메뉴. 모드가 늘면 여기 한 줄.
const RHYTHM_MODES: GameEntry[] = [
  { name: "팀전 (협동)", desc: "공유 콤보·생명 + 동시 비트 · 한 명 미스면 전원 손해", make: (h) => new RhythmScene(h, "team") },
  { name: "개인전 (대결)", desc: "각자 적중률로 승부 · 동시 비트 없음", make: (h) => new RhythmScene(h, "solo") },
];

const GAMES: GameEntry[] = [
  { name: "전력망", desc: "협동 + 트롤 · 2인 핫시트 · 공유 전력을 나눠 도시에 급전", make: (h) => new PowerScene(h) },
  {
    name: "리듬 릴레이",
    desc: "박자에 맞춰 번갈아 · 팀전 / 개인전 선택",
    make: (h) => new MenuScene(
      h, RHYTHM_MODES,
      (i) => h.setScene(RHYTHM_MODES[i].make(h)),
      "리듬 릴레이 — 모드 선택",
      "숫자키 또는 클릭으로 선택 · Esc로 뒤로",
    ),
  },
  { name: "사라지는 선", desc: "모방 · 2인 순차 · 원본을 보고 그리면 그 선이 사라진다", make: (h) => new MimicryScene(h) },
  { name: "떠넘기기", desc: "주사위 · 2인 대결 · 터지기 전에 상대에게 밀어넣는다", make: (h) => new PushScene(h) },
  { name: "제로섬", desc: "영토 · 2인 대결 · 내가 얻은 칸은 반드시 네가 잃은 칸이다", make: (h) => new ZeroScene(h) },
  { name: "코너킥", desc: "축구 · 2인 협동 · 한 명은 올리고 한 명은 낙하점을 잡는다", make: (h) => new CornerScene(h) },
  { name: "총알피하기", desc: "탄막 · 2인 협동 · 내 색 총알은 내가 몸으로 막는다", make: (h) => new DodgeScene(h) },
];

const canvas = document.getElementById("game") as HTMLCanvasElement;
const h = new Harness(canvas);

function showMenu() {
  h.setScene(new MenuScene(h, GAMES, (i) => h.setScene(GAMES[i].make(h))));
}
showMenu();
h.start();

// Esc로 언제든 최상위 메뉴 복귀 (하위 메뉴에서는 "뒤로"가 된다)
window.addEventListener("keydown", (e) => { if (e.code === "Escape") showMenu(); });

const hud = document.getElementById("hud")!;
setInterval(() => { hud.innerHTML = h.current?.hud?.() ?? ""; }, 100);
