import { techniques, type V, type Pose } from "./bjj-poses";

export type Pair = { a: Pose; b: Pose };
export type Clip = { korean: string; frames: (Pair & { t: number })[] };
export const standing = techniques.double.frames[0];
const guard = techniques.triangle.frames[0];
const point = (a: V, b: V, t: number): V =>
    a.map((v, i) => v + (b[i] - v) * t) as V;
export function blend(a: Pose, b: Pose, t: number): Pose {
    const limbs = (k: "hands" | "feet" | "knees" | "elbows") =>
        [point(a[k][0], b[k][0], t), point(a[k][1], b[k][1], t)] as [V, V];
    return {
        h: point(a.h, b.h, t),
        u: point(a.u, b.u, t),
        f: point(a.f, b.f, t),
        hands: limbs("hands"),
        feet: limbs("feet"),
        knees: limbs("knees"),
        elbows: limbs("elbows"),
    };
}
export function shift(p: Pose, x: number, y = 0): Pose {
    const move = (v: V): V => [v[0] + x, v[1] + y, v[2]];
    const both = (vs: [V, V]): [V, V] => [move(vs[0]), move(vs[1])];
    return {
        ...p,
        h: move(p.h),
        hands: both(p.hands),
        feet: both(p.feet),
        elbows: both(p.elbows),
        knees: both(p.knees),
    };
}
const sit: Pose = {
    ...shift(standing.a, 0.16),
    h: [-0.69, 0.3, 0],
    u: [-0.32, 0.94, 0],
    hands: [
        [-1.05, 0.1, -0.3],
        [-0.25, 0.79, 0.2],
    ],
    elbows: [
        [-0.99, 0.5, -0.24],
        [-0.61, 0.68, 0.3],
    ],
    feet: [
        [-0.68, 0.08, -0.3],
        [0.05, 0.08, 0.28],
    ],
    knees: [
        [-0.47, 0.54, -0.35],
        [-0.27, 0.24, 0.3],
    ],
};
const lift: Pose = {
    ...sit,
    h: [-0.78, 0.55, 0],
    knees: [
        [-0.62, 0.56, -0.3],
        [-0.83, 0.29, 0.25],
    ],
    feet: [
        [-0.52, 0.08, -0.28],
        [-1.16, 0.14, 0.24],
    ],
};
const sprawl: Pose = {
    ...standing.b,
    h: [0.72, 0.54, 0],
    u: [-0.84, 0.53, 0],
    feet: [
        [1.52, 0.08, 0.27],
        [1.64, 0.1, -0.2],
    ],
    knees: [
        [1.18, 0.29, 0.34],
        [1.15, 0.36, -0.26],
    ],
    hands: [
        [-0.24, 0.62, 0.21],
        [-0.3, 0.58, -0.25],
    ],
    elbows: [
        [-0.05, 0.81, 0.28],
        [0.05, 0.83, -0.3],
    ],
};
const sequence = (korean: string, pairs: Pair[]): Clip => ({
    korean,
    frames: pairs.map((p, i) => ({ ...p, t: i / (pairs.length - 1) })),
});
const originalClips: Clip[] = [
    ...Object.values(techniques),
    sequence("가드 풀", [
        standing,
        {
            a: { ...sit, feet: [sit.feet[0], [0.42, 0.84, 0.19]] },
            b: standing.b,
        },
        guard,
    ]),
    sequence("스프롤", [
        standing,
        techniques.double.frames[2],
        { a: techniques.double.frames[2].a, b: sprawl },
    ]),
    sequence("테크니컬 스탠드업", [
        { a: sit, b: standing.b },
        { a: lift, b: standing.b },
        { a: shift(standing.a, -0.3), b: standing.b },
    ]),
];

// Place an existing stance on the mat, rotating its grips and footwork with it.
// Local adjustments below are absolute contact points in the same world space.
function place(source: Pose, hip: V, turn = 0): Pose {
    const cos = Math.cos(turn),
        sin = Math.sin(turn);
    const rotate = ([x, y, z]: V): V => [
        x * cos - z * sin,
        y,
        x * sin + z * cos,
    ];
    const position = (v: V): V => {
        const offset = rotate([
            v[0] - source.h[0],
            v[1] - source.h[1],
            v[2] - source.h[2],
        ]);
        return [
            hip[0] + offset[0],
            Math.max(0.08, hip[1] + offset[1]),
            hip[2] + offset[2],
        ];
    };
    const pair = ([left, right]: [V, V]): [V, V] => [
        position(left),
        position(right),
    ];
    return {
        h: hip,
        u: rotate(source.u),
        f: rotate(source.f),
        hands: pair(source.hands),
        elbows: pair(source.elbows),
        knees: pair(source.knees),
        feet: pair(source.feet),
    };
}
const mount = techniques.armbar.frames[0];
const back = techniques.bow.frames[0];
const flat = mount.b;
const shot = techniques.double.frames[2].a;
const top = techniques.double.frames.at(-1)!.a;
const low = guard.b;
const grounded = (pose: Pose, changes: Partial<Pose>): Pose => ({
    ...pose,
    ...changes,
});
const pair = (a: Pose, b: Pose): Pair => ({ a, b });
const roll: Pose = {
    ...flat,
    h: [0.48, 0.4, -0.28],
    u: [-0.68, 0.23, -0.69],
    feet: [
        [0.98, 0.5, -0.3],
        [0.94, 0.68, 0.18],
    ],
    hands: [
        [0.0, 0.47, -0.42],
        [0.36, 0.14, -0.68],
    ],
};
const side = place(top, [-0.1, 0.56, 0.5], -1.75);
const pin = pair(side, flat);
const mounted = pair(mount.a, flat);
const knees = place(low, [0.3, 0.54, 0]);
const turtle: Pose = {
    ...knees,
    u: [-0.88, 0.46, 0],
    hands: [
        [-0.39, 0.13, 0.27],
        [-0.44, 0.14, -0.28],
    ],
};
const leaning: Pose = {
    ...standing.b,
    h: [0.48, 0.91, 0],
    u: [-0.56, 0.83, 0],
    hands: [
        [-0.17, 1.06, 0.27],
        [-0.1, 1.21, -0.2],
    ],
};
const collar = pair(
    grounded(standing.a, {
        hands: [
            [0.05, 1.48, -0.1],
            [0.17, 1.17, 0.2],
        ],
    }),
    leaning,
);
const gripLeg = grounded(shot, {
    h: [-0.16, 0.66, 0.24],
    hands: [
        [0.42, 0.61, 0.22],
        [0.51, 0.58, 0.15],
    ],
});
const oneLeg = grounded(standing.b, {
    feet: [
        [0.9, 0.08, -0.25],
        [0.3, 0.63, 0.3],
    ],
    knees: [
        [0.63, 0.55, -0.29],
        [0.32, 0.86, 0.24],
    ],
});
const seated = place(sit, [-0.47, 0.32, 0.02]);
const seatedGuard = pair(seated, knees);
const openGuard = pair(standing.b, guard.a);
const passReady = place(standing.b, [0.68, 0.81, 0.05]);
const pants = grounded(passReady, {
    u: [-0.5, 0.86, 0],
    hands: [
        [0.2, 0.75, -0.28],
        [0.24, 0.73, 0.3],
    ],
});
const legPin = grounded(guard.a, {
    feet: [
        [0.48, 0.32, -0.4],
        [0.59, 0.39, -0.57],
    ],
    knees: [
        [0.07, 0.49, -0.38],
        [0.13, 0.62, -0.51],
    ],
});
const across = place(low, [0.24, 0.52, 0.66], -0.85);
const belly: Pose = {
    ...place(low, [-0.07, 0.78, 0.36], -0.8),
    u: [-0.1, 0.99, 0.06],
    knees: [
        [-0.04, 0.46, 0.02],
        [0.32, 0.55, 0.66],
    ],
    feet: [
        [0.46, 0.16, 0.1],
        [0.67, 0.08, 0.87],
    ],
    hands: [
        [-0.43, 0.53, -0.12],
        [0.35, 0.45, 0.1],
    ],
};
const planted: Pose = {
    ...flat,
    feet: [
        [0.55, 0.08, -0.3],
        [0.57, 0.08, 0.32],
    ],
    knees: [
        [0.49, 0.61, -0.25],
        [0.5, 0.61, 0.3],
    ],
};
const arch: Pose = { ...planted, h: [0.23, 0.6, 0.06], u: [-0.91, -0.4, -0.1] };
const shrimp: Pose = {
    ...planted,
    h: [-0.45, 0.26, -0.34],
    u: [-0.79, 0.16, 0.58],
    hands: [
        [-0.18, 0.73, 0.28],
        [0.11, 0.52, 0.15],
    ],
    knees: [
        [-0.24, 0.64, -0.08],
        [0.1, 0.46, 0.07],
    ],
};
const frameSide = grounded(flat, {
    hands: [
        [-0.37, 0.69, 0.28],
        [-0.06, 0.53, 0.38],
    ],
});
const caughtArm = grounded(flat, {
    hands: [
        [-0.46, 0.7, 0.11],
        [-0.47, 0.69, 0.16],
    ],
});
const scissor: Pose = {
    ...guard.a,
    h: [-0.47, 0.27, 0.2],
    knees: [
        [-0.1, 0.85, 0.18],
        [-0.05, 0.17, -0.3],
    ],
    feet: [
        [0.4, 0.64, -0.19],
        [0.56, 0.11, -0.37],
    ],
    hands: [
        [0.07, 0.95, 0.12],
        [0.01, 0.85, -0.23],
    ],
};
const hook: Pose = {
    ...seated,
    h: [-0.4, 0.32, 0.03],
    u: [0.26, 0.96, 0],
    knees: [
        [-0.1, 0.6, -0.33],
        [-0.12, 0.59, 0.3],
    ],
    feet: [
        [0.37, 0.29, -0.13],
        [0.39, 0.3, 0.15],
    ],
    hands: [
        [0.27, 0.86, 0.35],
        [0.18, 0.99, -0.25],
    ],
};

const additions: Clip[] = [
    sequence("싱글렉 테이크다운", [
        standing,
        pair(gripLeg, oneLeg),
        pair(
            grounded(gripLeg, {
                h: [0.05, 0.83, 0.25],
                hands: [
                    [0.23, 0.82, 0.29],
                    [0.28, 0.81, 0.2],
                ],
            }),
            grounded(oneLeg, {
                h: [0.63, 0.89, -0.12],
                u: [0.55, 0.81, -0.15],
                feet: [
                    [0.89, 0.08, -0.32],
                    [0.24, 0.82, 0.24],
                ],
            }),
        ),
        pair(top, roll),
    ]),
    sequence("앵클 픽", [
        collar,
        pair(
            grounded(shot, {
                hands: [
                    [0.12, 1.38, 0.04],
                    [0.39, 0.17, 0.19],
                ],
            }),
            leaning,
        ),
        pair(
            grounded(shot, {
                hands: [
                    [0.43, 1.02, 0.02],
                    [0.15, 0.39, 0.18],
                ],
            }),
            grounded(oneLeg, {
                u: [0.66, 0.74, 0],
                feet: [
                    [0.9, 0.08, -0.25],
                    [0.15, 0.39, 0.18],
                ],
            }),
        ),
        pair(top, roll),
    ]),
    sequence("스냅다운", [
        collar,
        pair(
            grounded(standing.a, {
                h: [-0.69, 0.77, 0.02],
                hands: [
                    [-0.06, 1.02, 0.07],
                    [-0.1, 1.05, -0.19],
                ],
            }),
            grounded(leaning, { h: [0.47, 0.74, 0], u: [-0.87, 0.48, 0] }),
        ),
        pair(
            grounded(place(low, [-0.61, 0.59, 0.21], Math.PI), {
                hands: [
                    [-0.25, 0.71, 0.06],
                    [-0.31, 0.67, -0.15],
                ],
            }),
            turtle,
        ),
    ]),
    sequence("암 드래그", [
        standing,
        collar,
        pair(
            grounded(place(standing.a, [-0.08, 0.83, 0.59]), {
                hands: [
                    [-0.08, 1.09, 0.31],
                    [-0.27, 1.14, 0.35],
                ],
            }),
            grounded(leaning, {
                hands: [
                    [-0.26, 1.13, 0.34],
                    [0.06, 1.15, -0.2],
                ],
            }),
        ),
        pair(
            grounded(place(standing.a, [0.79, 0.87, 0.45], Math.PI), {
                hands: [
                    [0.41, 0.92, 0.18],
                    [0.37, 0.94, 0.21],
                ],
            }),
            leaning,
        ),
    ]),
    sequence("발목 받치기", [
        standing,
        collar,
        pair(
            grounded(standing.a, {
                feet: [
                    [-0.85, 0.08, -0.28],
                    [0.4, 0.15, 0.18],
                ],
                hands: [
                    [0.12, 1.42, 0.02],
                    [-0.06, 1.22, 0.29],
                ],
            }),
            grounded(leaning, {
                h: [0.36, 0.92, -0.03],
                u: [-0.67, 0.7, -0.22],
                feet: [
                    [0.95, 0.3, -0.29],
                    [0.4, 0.14, 0.19],
                ],
            }),
        ),
        pair(place(low, [-0.42, 0.63, 0.39], Math.PI), roll),
    ]),
    sequence("시저 스윕", [
        guard,
        pair(scissor, knees),
        pair(
            grounded(scissor, {
                feet: [
                    [0.52, 0.91, -0.36],
                    [0.02, 0.11, -0.62],
                ],
            }),
            grounded(roll, { h: [0.31, 0.64, -0.26] }),
        ),
        mounted,
    ]),
    sequence("힙 범프 스윕", [
        guard,
        seatedGuard,
        pair(
            grounded(seated, {
                h: [-0.06, 0.69, 0.24],
                u: [0.66, 0.73, -0.14],
                hands: [
                    [-0.65, 0.12, 0.44],
                    [0.22, 0.9, -0.29],
                ],
                feet: [
                    [-0.2, 0.09, 0.42],
                    [-0.21, 0.1, -0.33],
                ],
            }),
            grounded(knees, { u: [0.44, 0.88, -0.16] }),
        ),
        pair(place(mount.a, [0.17, 0.67, 0.16]), roll),
        mounted,
    ]),
    sequence("버터플라이 스윕", [
        seatedGuard,
        pair(hook, grounded(knees, { u: [-0.62, 0.76, 0] })),
        pair(
            grounded(hook, {
                h: [-0.41, 0.3, 0.25],
                u: [-0.68, 0.38, 0.59],
                feet: [
                    [0.47, 0.86, -0.19],
                    [0.14, 0.23, 0.26],
                ],
            }),
            grounded(roll, {
                h: [0.23, 0.81, -0.18],
                feet: [
                    [0.79, 0.89, -0.36],
                    [0.94, 0.5, 0.11],
                ],
            }),
        ),
        pin,
    ]),
    sequence("트라이포드 스윕", [
        pair(guard.a, standing.b),
        pair(
            grounded(guard.a, {
                hands: [
                    [0.39, 0.14, 0.16],
                    [-0.17, 0.75, -0.2],
                ],
                feet: [
                    [0.65, 0.9, 0.1],
                    [0.86, 0.18, -0.22],
                ],
            }),
            standing.b,
        ),
        pair(
            grounded(guard.a, {
                feet: [
                    [0.83, 0.83, 0.08],
                    [0.54, 0.33, -0.21],
                ],
            }),
            grounded(oneLeg, { u: [0.78, 0.62, 0] }),
        ),
        pair(seated, place(flat, [0.76, 0.26, -0.12], Math.PI)),
    ]),
    sequence("토레안도 패스", [
        openGuard,
        pair(pants, guard.a),
        pair(
            grounded(across, {
                hands: [
                    [0.13, 0.46, -0.3],
                    [0.18, 0.44, -0.36],
                ],
            }),
            legPin,
        ),
        pin,
    ]),
    sequence("니 컷 패스", [
        pair(low, guard.a),
        pair(
            grounded(low, {
                h: [0.3, 0.67, 0.22],
                knees: [
                    [-0.02, 0.53, 0.15],
                    [0.58, 0.16, -0.18],
                ],
                feet: [
                    [0.42, 0.13, 0.46],
                    [0.94, 0.08, -0.25],
                ],
            }),
            guard.a,
        ),
        pair(
            grounded(across, {
                knees: [
                    [-0.47, 0.13, 0.43],
                    [0.53, 0.18, 0.32],
                ],
                feet: [
                    [0.07, 0.12, 0.71],
                    [0.91, 0.12, 0.51],
                ],
            }),
            legPin,
        ),
        pin,
    ]),
    sequence("레그 드래그 패스", [
        openGuard,
        pair(
            grounded(pants, {
                hands: [
                    [0.45, 0.65, 0.27],
                    [0.13, 0.7, 0.32],
                ],
            }),
            guard.a,
        ),
        pair(
            grounded(low, {
                h: [0.42, 0.65, -0.41],
                hands: [
                    [0.42, 0.65, -0.21],
                    [0.05, 0.52, -0.19],
                ],
            }),
            grounded(legPin, {
                knees: [
                    [0.06, 0.61, -0.2],
                    [0.05, 0.7, -0.29],
                ],
                feet: [
                    [0.46, 0.61, -0.24],
                    [0.65, 0.68, -0.4],
                ],
            }),
        ),
        pair(place(side, [-0.09, 0.55, -0.52], Math.PI), flat),
    ]),
    sequence("브리지 앤 롤", [
        pair(caughtArm, mount.a),
        pair(grounded(planted, { hands: caughtArm.hands }), mount.a),
        pair(
            grounded(arch, { hands: caughtArm.hands }),
            grounded(mount.a, {
                h: [-0.04, 0.88, 0.17],
                u: [-0.54, 0.65, 0.51],
            }),
        ),
        pair(
            place(low, [0.14, 0.6, 0.22]),
            place(guard.a, [-0.32, 0.25, -0.15]),
        ),
    ]),
    sequence("엘보 니 이스케이프", [
        pair(planted, mount.a),
        pair(shrimp, grounded(mount.a, { h: [0.1, 0.66, 0.22] })),
        pair(
            grounded(shrimp, {
                knees: [
                    [-0.02, 0.61, 0.19],
                    [-0.21, 0.41, -0.24],
                ],
                feet: [
                    [0.36, 0.16, 0.37],
                    [0.29, 0.1, -0.29],
                ],
            }),
            knees,
        ),
        guard,
    ]),
    sequence("사이드 가드 리커버리", [
        pair(frameSide, side),
        pair(arch, grounded(side, { h: [-0.06, 0.7, 0.56] })),
        pair(shrimp, place(side, [0.14, 0.55, 0.52])),
        pair(scissor, knees),
        guard,
    ]),
    sequence("니 온 벨리", [
        pin,
        pair(
            grounded(side, { h: [-0.02, 0.66, 0.52], hands: belly.hands }),
            flat,
        ),
        pair(belly, flat),
    ]),
    sequence("니 슬라이드 마운트", [
        pin,
        pair(belly, flat),
        pair(
            grounded(belly, {
                h: [0.02, 0.73, 0.12],
                knees: [
                    [-0.09, 0.39, -0.27],
                    [0.23, 0.15, 0.44],
                ],
                feet: [
                    [0.38, 0.41, 0.07],
                    [0.66, 0.09, 0.48],
                ],
            }),
            flat,
        ),
        mounted,
    ]),
    sequence("리어 네이키드 초크", [
        back,
        pair(
            grounded(back.a, {
                hands: [
                    [0.29, 1.09, -0.12],
                    [0.19, 0.77, 0.2],
                ],
            }),
            back.b,
        ),
        pair(
            grounded(back.a, {
                h: [-0.32, 0.35, 0.16],
                u: [-0.22, 0.91, 0.35],
                hands: [
                    [-0.15, 1.02, -0.08],
                    [-0.23, 1.1, 0.24],
                ],
                elbows: [
                    [0.19, 0.9, 0.32],
                    [-0.27, 1.04, -0.18],
                ],
            }),
            grounded(back.b, {
                h: [0.14, 0.39, 0.11],
                u: [-0.32, 0.9, 0.26],
                hands: [
                    [0.14, 0.95, 0.3],
                    [0.02, 0.96, 0.1],
                ],
            }),
        ),
    ]),
];
export const clips: Clip[] = [...originalClips, ...additions];

const ease = (t: number) => t * t * (3 - 2 * t);
export function sampleClip(clip: Clip, phase: number): Pair {
    const frames = clip.frames;
    if (phase <= frames[0].t) return frames[0];
    const index = frames.findIndex((frame) => frame.t >= phase);
    if (index < 0) return frames[frames.length - 1];
    const start = frames[index - 1],
        end = frames[index];
    const amount = ease((phase - start.t) / (end.t - start.t));
    return pair(blend(start.a, end.a, amount), blend(start.b, end.b, amount));
}
