import timing from './bjj-triangle-timing.json';
export function triangleSourceTime(time:number){
  const i=Math.max(0,timing.findIndex(([t])=>time<t)-1);
  const [a,b]=time>=22?timing.slice(-2):timing.slice(i,i+2);
  return a[1]+(b[1]-a[1])*(time-a[0])/(b[0]-a[0]);
}
export const triangleClip={
  duration:22,
  description:'양 손목 제어 → 바깥 팔 밀어내기 → 한 팔 포획 → 뒤통수·무릎 제어 → 골반 각도 · 삼각 잠금.',
  phases:[
    [0,'가드 · 양 손목 제어'],[2,'바깥 팔 밀어내기'],[3,'골반을 들어 다리 넘기기'],[4,'목 위로 다리 올리기'],
    [6,'왼손으로 손목 유지 · 오른손을 뒤통수로 이동'],[9,'뒤통수 제어 · 한 팔만 안쪽에 유지'],
    [10,'손목 그립을 놓고 왼손을 무릎으로 이동'],[12,'골반을 돌려 각도 만들기'],
    [14,'무릎 바깥쪽 제어 · 오른손을 빼고 다리 접기'],[16,'발목 잠금 · 오른손을 뒤통수로 복귀'],[17,'뒤통수·무릎 제어 · 삼각 잠금'],
  ] as const,
};
export function trianglePhase(time:number){return [...triangleClip.phases].reverse().find(([t])=>triangleSourceTime(time)>=t)?.[1]??triangleClip.phases[0][1];}
