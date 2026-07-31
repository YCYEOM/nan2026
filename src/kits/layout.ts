// 캔버스 세로 배치 계산. 겹침 판정을 한 곳에 모은다.
//
// `fillText(text, x, y)` 의 `y` 는 **글자 아래쪽 기준선(baseline)** 이다.
// 글자는 그 위로 뻗으므로 baseline 만 보고 쌓으면 반드시 겹친다 —
// 이 저장소에서 세 번 같은 실수를 했고 전부 "계산으로 배치하고 화면은 안 봤다"로 끝났다.

/** 글자가 실제로 차지하는 세로 구간. 한글·라틴 혼합 기준 근사(위 0.8배, 아래 0.2배). */
export function textBand(baseline: number, size: number) {
  return { top: baseline - size * 0.8, bottom: baseline + size * 0.2 };
}

export interface Band { top: number; bottom: number }

/** 두 구간이 겹치는가. 맞닿는 것(끝점 일치)은 겹침이 아니다. */
export const overlaps = (a: Band, b: Band) => a.top < b.bottom && b.top < a.bottom;

/** 구간들이 서로 안 겹치고 전부 [0, height] 안에 있는가. 겹치는 쌍과 벗어난 것을 돌려준다. */
export function checkStack(bands: (Band & { name: string })[], height: number) {
  const clashes: string[] = [];
  for (let i = 0; i < bands.length; i++) {
    if (bands[i].top < 0 || bands[i].bottom > height) clashes.push(`${bands[i].name} 이 화면 밖 (${bands[i].top.toFixed(1)}~${bands[i].bottom.toFixed(1)})`);
    for (let j = i + 1; j < bands.length; j++)
      if (overlaps(bands[i], bands[j])) clashes.push(`${bands[i].name} ↔ ${bands[j].name}`);
  }
  return clashes;
}
