import type { Pose, V } from "./bjj-poses";
import {
    sequence,
    place,
    pair,
    standing,
    guard,
    back,
    flat,
    shot,
    low,
    roll,
    side,
    pin,
    mounted,
    knees,
    turtle,
    leaning,
    collar,
    oneLeg,
    seated,
    pants,
    across,
    belly,
    planted,
    arch,
    shrimp,
    scissor,
    hook,
    legPin,
    passReady,
    top,
} from "./pixel-dojo-library";

// Pose landmarks keep a grip attached to its partner as that partner turns or falls.
const offset = (v: V, x: number, y: number, z: number): V => [v[0] + x, v[1] + y, v[2] + z];
function torso(p: Pose, height: number, sideOffset = 0): V {
    return [p.h[0] + p.u[0] * height, p.h[1] + p.u[1] * height, p.h[2] + p.u[2] * height + sideOffset];
}
const hands = (p: Pose, l: V, r: V): Pose => ({ ...p, hands: [l, r] });
const feet = (p: Pose, l: V, r: V): Pose => ({ ...p, feet: [l, r] });
const tilt = (p: Pose, u: V): Pose => ({ ...p, u });
const at = (p: Pose, x: number, y: number, z: number, yaw = 0) => place(p, [x, y, z], yaw);
const swap = ({ a, b }: { a: Pose; b: Pose }) => pair(b, a);
const white = standing.a,
    blue = standing.b;
const clincher = at(white, -0.19, 0.89, 0.19);
const clinched = at(blue, 0.26, 0.92, -0.08);
const clinch = pair(hands(clincher, torso(clinched, 0.51, -0.18), torso(clinched, 0.28, 0.18)), clinched);
const rear = at(white, 0.77, 0.87, 0.16, Math.PI);
const rearClinch = pair(hands(rear, torso(clinched, 0.13, -0.16), torso(clinched, 0.13, 0.16)), clinched);
const stagger = tilt(at(oneLeg, 0.42, 0.78, -0.19), [0.63, 0.73, -0.24]);
const fall = at(flat, 0.64, 0.26, -0.09, Math.PI);
const follow = at(top, 0.09, 0.55, 0.38);
const halfBottom = feet(at(guard.a, -0.27, 0.27, 0.09), [0.6, 0.3, 0.21], [0.64, 0.27, 0.3]);
const halfTop = at(low, 0.31, 0.57, 0.12);
const half = pair(halfBottom, halfTop);
const onElbow = hands(
    tilt(at(seated, -0.34, 0.33, 0.17), [-0.43, 0.84, 0.27]),
    torso(halfTop, 0.28, -0.12),
    [-0.53, 0.13, 0.35],
);
const underhook = hands(
    tilt(at(seated, -0.15, 0.39, 0.27), [0.56, 0.76, -0.23]),
    torso(halfTop, 0.42, -0.2),
    [0.11, 0.15, 0.39],
);
const dog = at(knees, -0.12, 0.59, 0.3, Math.PI);
const dogfight = pair(hands(dog, torso(halfTop, 0.36, -0.14), halfTop.knees[1]), halfTop);
const open = pair(guard.a, blue);
const pass = pair(pants, guard.a);
const butterfly = pair(hook, knees);
const shoulderStand = tilt(at(flat, -0.16, 0.65, -0.04), [-0.89, -0.41, 0.09]);
const stacked = feet(shoulderStand, [-0.42, 1.08, 0.33], [-0.38, 1.1, -0.32]);
const legRide = feet(at(guard.a, 0.05, 0.29, 0.06), [0.59, 0.89, 0.18], [0.36, 0.54, -0.21]);
const legX = pair(hands(legRide, blue.feet[1], blue.knees[1]), blue);
const lying = at(flat, 0.52, 0.26, -0.1, Math.PI);
const north = at(top, -1.0, 0.52, 0.03, 0.02);
const northSouth = pair(hands(north, torso(flat, 0.45, -0.22), torso(flat, 0.45, 0.22)), flat);
const ride = at(low, 0.46, 0.61, 0.54, -0.82);
const turtleRide = pair(hands(ride, torso(turtle, 0.45, -0.15), turtle.h), turtle);
const turned = tilt(at(flat, 0.07, 0.35, -0.11), [-0.91, 0.13, -0.35]);
const technical = feet(at(mounted.a, 0.05, 0.71, 0.24, -1.05), [-0.37, 0.09, -0.27], [0.52, 0.11, 0.48]);
const techMount = pair(technical, turned);

// Stand-up: inside position, entries, and throws use different blocks or load points.
const standingClips = [
    sequence("언더훅 펌멀링", [
        collar,
        pair(hands(clincher, torso(clinched, 0.16, -0.2), clinched.hands[0]), clinched),
        clinch,
        pair(
            hands(
                tilt(clincher, [0.28, 0.96, 0]),
                torso(clinched, 0.43, -0.26),
                torso(clinched, 0.42, 0.25),
            ),
            hands(clinched, torso(clincher, 0.49, 0.27), torso(clincher, 0.48, -0.25)),
        ),
    ]),
    sequence("덕 언더", [
        collar,
        pair(hands(at(shot, -0.29, 0.65, 0.31), leaning.elbows[0], leaning.hands[0]), leaning),
        pair(hands(at(white, 0.26, 0.68, 0.55, 1.8), leaning.h, leaning.elbows[0]), leaning),
        rearClinch,
    ]),
    sequence("오소토가리", [
        collar,
        clinch,
        pair(feet(clincher, [-0.05, 0.08, 0.53], [0.67, 0.57, -0.08]), clinched),
        pair(feet(tilt(clincher, [0.57, 0.81, 0]), [-0.05, 0.08, 0.53], [0.02, 0.66, -0.05]), stagger),
        pair(follow, fall),
    ]),
    sequence("오우치가리", [
        standing,
        clinch,
        pair(feet(at(clincher, 0.02, 0.84, 0.13), [-0.33, 0.08, 0.35], [0.59, 0.12, -0.25]), clinched),
        pair(
            feet(tilt(clincher, [0.61, 0.77, -0.1]), [-0.18, 0.08, 0.29], [0.86, 0.17, -0.44]),
            feet(stagger, [0.86, 0.23, -0.42], [0.42, 0.08, 0.34]),
        ),
        pair(at(low, 0.16, 0.58, 0.12), fall),
    ]),
    sequence("허리껴치기 · 오고시", [
        clinch,
        pair(hands(at(white, 0.01, 0.76, 0.05, Math.PI), clinched.hands[0], clinched.h), clinched),
        pair(
            tilt(at(white, 0.02, 0.82, 0.08, Math.PI), [-0.62, 0.74, 0.24]),
            tilt(at(clinched, 0.13, 1.04, -0.09), [-0.79, 0.39, -0.42]),
        ),
        pair(hands(at(white, -0.18, 0.78, 0.23, Math.PI), roll.hands[0], roll.elbows[0]), roll),
        pin,
    ]),
    sequence("리어 바디락 매트 리턴", [
        rearClinch,
        pair(hands(at(rear, 0.64, 0.64, 0.13), clinched.h, torso(clinched, 0.12, 0.16)), clinched),
        pair(
            hands(at(rear, 0.55, 0.93, 0.12), [0.3, 1.06, 0.15], [0.29, 1.04, -0.12]),
            at(clinched, 0.29, 1.12, -0.08, -0.46),
        ),
        pair(ride, turtle),
    ]),
    sequence("스미가에시", [
        collar,
        pair(hands(at(seated, -0.26, 0.36, 0.11), leaning.hands[0], torso(leaning, 0.4, -0.17)), leaning),
        pair(
            feet(guard.a, [0.4, 0.85, -0.15], [-0.06, 0.08, 0.36]),
            tilt(at(leaning, 0.06, 0.96, -0.23), [-0.89, -0.08, -0.43]),
        ),
        pair(at(knees, -0.3, 0.52, 0.13), at(roll, -0.62, 0.34, -0.23)),
        pin,
    ]),
    sequence("언더훅 니 탭", [
        clinch,
        pair(
            hands(
                tilt(at(clincher, -0.05, 0.7, 0.34), [0.52, 0.83, -0.17]),
                torso(clinched, 0.44, -0.2),
                clinched.knees[1],
            ),
            clinched,
        ),
        pair(hands(at(shot, 0.12, 0.59, 0.33), torso(stagger, 0.36, -0.16), stagger.knees[1]), stagger),
        pair(follow, fall),
    ]),
];

// Sweeps: the partner's supporting limb, loading hook, and landing are authored together.
const ankleCatch = hands(guard.a, blue.feet[0], blue.feet[1]);
const tipped = tilt(at(blue, 0.7, 0.64, -0.07), [0.89, 0.4, -0.15]);
const crossHooks = feet(at(guard.a, 0.14, 0.29, -0.03), [0.76, 0.7, -0.2], [0.81, 0.33, -0.27]);
const xGuard = pair(hands(crossHooks, blue.knees[1], blue.feet[1]), blue);
const wide = feet(at(blue, 0.65, 0.82, -0.06), [1.2, 0.08, -0.32], [0.19, 0.24, 0.27]);
const sweeps = [
    sequence("펜듈럼 스윕", [
        guard,
        pair(hands(guard.a, knees.hands[0], knees.knees[1]), knees),
        pair(
            feet(
                tilt(at(guard.a, -0.21, 0.36, 0.19), [-0.75, 0.12, 0.63]),
                [-0.57, 0.85, 0.68],
                [0.62, 0.91, -0.34],
            ),
            tilt(knees, [-0.45, 0.68, -0.57]),
        ),
        pair(at(mounted.a, 0.15, 0.67, -0.15), roll),
        mounted,
    ]),
    sequence("더블 앵클 스윕", [
        open,
        pair(ankleCatch, blue),
        pair(feet(ankleCatch, torso(blue, 0.04, -0.2), torso(blue, 0.04, 0.2)), tipped),
        pair(tilt(seated, [0.44, 0.9, 0]), lying),
        pair(at(low, 0.21, 0.59, 0.12), lying),
    ]),
    sequence("시클 스윕", [
        open,
        pair(hands(guard.a, blue.feet[1], blue.hands[0]), wide),
        pair(feet(at(guard.a, -0.17, 0.28, -0.23), [0.62, 0.78, 0.15], [1.03, 0.15, -0.3]), wide),
        pair(feet(scissor, [0.75, 0.72, 0.1], [0.47, 0.13, -0.42]), at(roll, 0.66, 0.39, -0.38)),
        pair(seated, at(flat, 0.64, 0.27, -0.32)),
    ]),
    sequence("싱글렉 X 스윕", [
        open,
        legX,
        pair(
            feet(
                tilt(at(legRide, 0.17, 0.49, 0.14), [-0.9, -0.22, 0.31]),
                [0.68, 0.93, 0.18],
                [0.38, 0.6, -0.21],
            ),
            wide,
        ),
        pair(hands(legRide, lying.feet[1], lying.knees[1]), lying),
    ]),
    sequence("X가드 스탠드업 스윕", [
        xGuard,
        pair(feet(crossHooks, [0.99, 0.69, -0.22], [1.03, 0.25, -0.32]), wide),
        pair(hands(at(seated, -0.1, 0.43, 0.14), wide.feet[1], [-0.48, 0.09, 0.35]), wide),
        pair(hands(at(white, -0.17, 0.86, 0.12), oneLeg.feet[1], oneLeg.knees[1]), stagger),
        pair(white, lying),
    ]),
    sequence("하프가드 올드스쿨 스윕", [
        half,
        pair(onElbow, halfTop),
        pair(underhook, halfTop),
        pair(hands(at(dog, 0.01, 0.47, 0.28), halfTop.feet[0], torso(halfTop, 0.34, -0.13)), halfTop),
        pair(at(top, 0.18, 0.51, 0.34), at(roll, 0.39, 0.3, -0.16)),
        pin,
    ]),
    sequence("도그파이트 롤언더 스윕", [
        dogfight,
        pair(
            hands(
                tilt(at(dog, -0.01, 0.4, 0.19), [0.43, 0.62, -0.63]),
                halfTop.knees[0],
                torso(halfTop, 0.39, -0.12),
            ),
            halfTop,
        ),
        pair(
            tilt(at(guard.a, 0.02, 0.32, -0.07), [-0.78, 0.28, 0.55]),
            tilt(at(halfTop, 0.13, 0.78, 0.06), [-0.66, 0.34, 0.66]),
        ),
        pair(at(top, 0.07, 0.54, -0.3), at(roll, 0.26, 0.34, 0.29)),
    ]),
    sequence("시티드 가드 레슬업", [
        pair(seated, blue),
        pair(hands(tilt(at(seated, -0.18, 0.35, 0.22), [0.5, 0.85, 0]), blue.knees[1], blue.feet[1]), blue),
        pair(hands(at(shot, -0.04, 0.56, 0.29), oneLeg.knees[1], oneLeg.feet[1]), oneLeg),
        pair(hands(at(white, 0.03, 0.84, 0.32), stagger.knees[1], stagger.feet[1]), stagger),
        pair(follow, fall),
    ]),
];

// Guard passing: keep the bottom player's leg frames visible through the clearance.
const folded = feet(
    tilt(at(guard.a, -0.29, 0.34, -0.19), [-0.87, 0.19, 0.44]),
    [0.09, 0.26, -0.49],
    [0.2, 0.3, -0.56],
);
const clasp = hands(at(low, 0.25, 0.57, 0.11), torso(hook, 0.06, -0.18), torso(hook, 0.07, 0.19));
const stretch = feet(
    tilt(at(low, 0.22, 0.88, 0.2), [-0.72, 0.62, -0.18]),
    [0.94, 0.08, -0.33],
    [0.83, 0.08, 0.44],
);
const farPin = pair(at(side, -0.12, 0.52, -0.49, Math.PI), turned);
const passes = [
    sequence("스탠딩 클로즈드 가드 열기", [
        swap(guard),
        pair(
            hands(at(passReady, 0.4, 0.75, 0), guard.a.hands[0], torso(guard.a, 0.31, 0.1)),
            feet(guard.a, [0.5, 0.79, 0.29], [0.49, 0.79, -0.24]),
        ),
        pair(
            hands(at(blue, 0.45, 0.96, 0.03), guard.a.hands[0], guard.a.knees[1]),
            feet(guard.a, [0.49, 0.9, -0.24], [0.44, 0.48, 0.31]),
        ),
        pair(pants, feet(guard.a, [0.51, 0.47, -0.37], [0.48, 0.27, 0.43])),
    ]),
    sequence("더블 언더 패스", [
        pass,
        pair(hands(at(low, 0.34, 0.48, 0.02), guard.a.knees[0], guard.a.knees[1]), guard.a),
        pair(
            hands(
                tilt(at(low, 0.02, 0.67, 0.06), [-0.71, 0.68, 0]),
                torso(stacked, 0.49, -0.18),
                torso(stacked, 0.48, 0.21),
            ),
            stacked,
        ),
        pair(at(across, -0.36, 0.52, 0.47), tilt(stacked, [-0.81, -0.3, -0.46])),
        pin,
    ]),
    sequence("오버 언더 패스", [
        pass,
        pair(hands(at(low, 0.21, 0.52, 0.23), guard.a.knees[0], torso(guard.a, 0.06, 0.2)), guard.a),
        pair(
            feet(
                tilt(at(top, 0.11, 0.47, 0.32), [-0.84, 0.24, -0.43]),
                [0.92, 0.1, 0.5],
                [0.71, 0.1, 0.74],
            ),
            feet(guard.a, [0.18, 0.87, -0.17], [0.54, 0.14, 0.41]),
        ),
        pair(at(side, -0.11, 0.49, 0.38), flat),
    ]),
    sequence("바디락 패스", [
        swap(butterfly),
        pair(clasp, hook),
        pair(
            feet(tilt(clasp, [-0.75, 0.63, -0.14]), [0.83, 0.1, -0.17], [0.59, 0.08, 0.66]),
            feet(hook, [0.26, 0.2, -0.18], [0.38, 0.15, 0.24]),
        ),
        pair(hands(at(across, -0.02, 0.47, 0.53), flat.h, torso(flat, 0.11, -0.19)), folded),
        pin,
    ]),
    sequence("롱 스텝 패스", [
        swap(half),
        pair(hands(halfTop, halfBottom.hands[0], halfBottom.knees[1]), halfBottom),
        pair(feet(at(low, 0.32, 0.59, -0.24, 1.22), [1.01, 0.12, -0.64], [0.16, 0.13, 0.37]), halfBottom),
        pair(tilt(at(across, -0.08, 0.46, -0.54, 2.7), [-0.64, 0.45, 0.61]), folded),
        farPin,
    ]),
    sequence("X 패스", [
        pass,
        pair(hands(passReady, guard.a.knees[1], torso(guard.a, 0.14, -0.1)), scissor),
        pair(
            feet(
                tilt(at(passReady, 0.26, 0.93, 0.4), [-0.59, 0.78, -0.14]),
                [1.09, 0.59, 0.48],
                [0.12, 0.09, 0.36],
            ),
            legPin,
        ),
        pair(at(belly, -0.11, 0.79, 0.42), flat),
    ]),
    sequence("하프가드 트라이포드 패스", [
        swap(half),
        pair(hands(halfTop, torso(halfBottom, 0.7, -0.17), torso(halfBottom, 0.42, 0.21)), halfBottom),
        pair(hands(stretch, torso(halfBottom, 0.66, -0.16), torso(halfBottom, 0.4, 0.18)), halfBottom),
        pair(feet(across, [0.73, 0.16, 0.49], [0.2, 0.12, 0.63]), legPin),
        pin,
    ]),
    sequence("스매시 패스", [
        swap(butterfly),
        pair(hands(at(low, 0.27, 0.6, -0.12), hook.knees[0], torso(hook, 0.14, 0.16)), hook),
        pair(tilt(at(top, 0.18, 0.54, -0.29), [-0.77, 0.49, 0.36]), folded),
        pair(feet(at(top, 0.04, 0.49, -0.48), [0.78, 0.12, -0.39], [0.67, 0.1, -0.72]), folded),
        farPin,
    ]),
];

// Positional work: enter, stabilize, then progress without allowing the hips to turn free.
const shield = feet(
    {
        ...halfBottom,
        knees: [
            [-0.07, 0.79, 0.29],
            [0.21, 0.28, -0.21],
        ],
    },
    [0.39, 0.66, -0.16],
    [0.64, 0.28, 0.25],
);
const seatbelt = hands(ride, torso(turtle, 0.57, -0.14), torso(turtle, 0.36, -0.14));
const wrap = hands(technical, turned.hands[0], torso(turned, 0.68, -0.18));
const trapped = hands(turned, torso(turned, 0.7, -0.2), turned.hands[1]);
const transition = [
    sequence("레그 퍼멀 가드 리텐션", [
        pair(legPin, pants),
        pair(feet(shrimp, [-0.12, 0.92, 0.38], [0.54, 0.18, -0.34]), across),
        pair(feet(scissor, torso(across, 0.45, 0.16), [0.25, 0.52, -0.15]), across),
        pair(hook, knees),
    ]),
    sequence("니 실드 회복", [
        half,
        pair(hands(shrimp, torso(halfTop, 0.5, 0.12), halfTop.h), halfTop),
        pair(
            feet(
                {
                    ...shrimp,
                    knees: [
                        [-0.12, 0.7, 0.26],
                        [0.09, 0.32, -0.23],
                    ],
                },
                [0.27, 0.45, 0.2],
                [0.57, 0.2, -0.19],
            ),
            halfTop,
        ),
        pair(hands(shield, halfTop.hands[0], torso(halfTop, 0.5, 0.15)), halfTop),
    ]),
    sequence("하프가드 언더훅 백테이크", [
        pair(shield, halfTop),
        pair(onElbow, halfTop),
        pair(underhook, halfTop),
        dogfight,
        pair(hands(at(dog, 0.54, 0.56, 0.38, -1.1), turtle.h, torso(turtle, 0.42, -0.18)), turtle),
        turtleRide,
    ]),
    sequence("터틀 시트벨트 백테이크", [
        turtleRide,
        pair(seatbelt, turtle),
        pair(
            feet(at(seatbelt, 0.27, 0.7, 0.39), [0.6, 0.18, 0.49], [0.26, 0.39, -0.04]),
            tilt(turtle, [-0.83, 0.43, -0.35]),
        ),
        pair(at(back.a, -0.2, 0.47, 0.12), back.b),
        back,
    ]),
    sequence("체어 싯 백테이크", [
        techMount,
        pair(wrap, trapped),
        pair(
            feet(at(wrap, -0.19, 0.38, 0.43, -0.55), [-0.18, 0.12, -0.32], [0.59, 0.15, 0.48]),
            tilt(turned, [-0.56, 0.74, 0.35]),
        ),
        pair(feet(back.a, [0.71, 0.28, 0.35], [0.55, 0.33, -0.26]), back.b),
    ]),
    sequence("기프트 랩", [
        mounted,
        pair(hands(mounted.a, flat.hands[0], flat.elbows[0]), flat),
        pair(hands(technical, torso(turned, 0.7, -0.19), turned.elbows[0]), trapped),
        pair(wrap, trapped),
    ]),
    sequence("사이드에서 노스사우스 전환", [
        pin,
        pair(hands(side, flat.elbows[0], torso(flat, 0.37, -0.15)), flat),
        pair(at(side, -0.64, 0.52, 0.4, 0.78), flat),
        northSouth,
    ]),
    sequence("테크니컬 마운트 전환", [
        mounted,
        pair(mounted.a, turned),
        pair(feet(at(mounted.a, 0.01, 0.75, 0.17, -0.54), [-0.32, 0.21, -0.26], [0.48, 0.12, 0.4]), turned),
        techMount,
    ]),
];

// Submissions start from the position that exposes the lock. Grips finish at a
// controlled hold; avoid exaggerating a neck bend or hyperextending a joint.
const posted = hands(knees, [0.14, 0.14, 0.41], knees.hands[1]);
const foldedArm = hands(posted, [0.53, 0.53, 0.37], posted.hands[1]);
const pinnedWrist: V = [-0.68, 0.15, 0.39];
const bentArm: Pose = {
    ...flat,
    hands: [pinnedWrist, flat.hands[1]],
    elbows: [[-0.34, 0.17, 0.47], flat.elbows[1]],
};
const headArm = hands(flat, torso(flat, 0.74, -0.16), flat.hands[1]);
const headlock = hands(at(seated, -0.35, 0.52, 0.09), torso(turtle, 0.65, 0.04), torso(turtle, 0.63, 0.12));
const ankleHold = hands(
    at(seated, 0.09, 0.37, 0.33, 2.5),
    lying.feet[1],
    offset(lying.feet[1], 0, 0.08, 0),
);
const brokenPosture = tilt(at(knees, 0.31, 0.53, 0), [-0.71, 0.7, 0]);
const lapels = hands(guard.a, torso(knees, 0.58, 0.16), torso(knees, 0.58, -0.16));
const submissions = [
    sequence("가드 키무라", [
        guard,
        pair(hands(seated, posted.hands[0], posted.elbows[0]), posted),
        pair(
            hands(
                tilt(at(seated, -0.09, 0.37, 0.38), [0.61, 0.75, -0.22]),
                posted.hands[0],
                offset(posted.hands[0], -0.05, 0.09, 0),
            ),
            posted,
        ),
        pair(
            hands(
                tilt(at(guard.a, -0.08, 0.34, 0.46), [-0.41, 0.56, -0.71]),
                foldedArm.hands[0],
                offset(foldedArm.hands[0], -0.07, 0.06, 0.02),
            ),
            foldedArm,
        ),
    ]),
    sequence("아메리카나", [
        mounted,
        pair(hands(mounted.a, flat.hands[0], flat.elbows[0]), flat),
        pair(hands(at(mounted.a, -0.14, 0.62, 0.14), pinnedWrist, bentArm.elbows[0]), bentArm),
        pair(
            hands(
                tilt(at(mounted.a, -0.2, 0.59, 0.22), [-0.71, 0.66, 0.17]),
                pinnedWrist,
                offset(pinnedWrist, 0.08, 0.04, 0),
            ),
            { ...bentArm, elbows: [[-0.37, 0.33, 0.44], bentArm.elbows[1]] },
        ),
    ]),
    sequence("길로틴", [
        collar,
        pair(hands(at(white, -0.32, 0.78, 0.17), torso(leaning, 0.65, 0.12), leaning.hands[1]), leaning),
        pair(headlock, turtle),
        pair(
            feet(tilt(headlock, [-0.37, 0.88, 0.24]), [0.47, 0.53, 0.3], [0.48, 0.54, -0.24]),
            tilt(knees, [-0.82, 0.51, 0.12]),
        ),
    ]),
    sequence("암 트라이앵글", [
        mounted,
        pair(hands(mounted.a, flat.elbows[0], torso(flat, 0.72, -0.17)), headArm),
        pair(
            hands(at(top, -0.13, 0.52, -0.21, 2.8), torso(headArm, 0.69, -0.17), headArm.elbows[0]),
            headArm,
        ),
        pair(
            hands(
                at(side, -0.38, 0.45, -0.53, Math.PI),
                torso(headArm, 0.65, 0.18),
                torso(headArm, 0.63, 0.13),
            ),
            headArm,
        ),
    ]),
    sequence("스트레이트 앵클락", [
        legX,
        pair(hands(legRide, oneLeg.feet[1], oneLeg.knees[1]), tipped),
        pair(feet(ankleHold, torso(lying, 0.04, 0.12), [0.5, 0.39, -0.17]), lying),
        pair(
            tilt(feet(ankleHold, torso(lying, 0.04, 0.12), [0.48, 0.38, -0.17]), [-0.53, 0.82, 0.19]),
            lying,
        ),
    ]),
    sequence("크로스 칼라 초크", [
        guard,
        pair(hands(guard.a, torso(knees, 0.57, 0.15), knees.hands[0]), knees),
        pair(lapels, knees),
        pair(
            hands(
                at(guard.a, -0.21, 0.32, 0.02),
                torso(brokenPosture, 0.54, 0.14),
                torso(brokenPosture, 0.54, -0.14),
            ),
            brokenPosture,
        ),
    ]),
    sequence("루프 초크", [
        pair(seated, knees),
        pair(hands(seated, torso(knees, 0.52, 0.12), knees.hands[0]), knees),
        pair(
            hands(at(seated, -0.23, 0.4, 0.21), torso(turtle, 0.56, 0.12), torso(turtle, 0.79, -0.13)),
            turtle,
        ),
        pair(
            hands(
                tilt(at(seated, -0.36, 0.34, 0.3), [-0.46, 0.81, -0.32]),
                torso(turtle, 0.58, 0.14),
                torso(turtle, 0.74, 0.02),
            ),
            turtle,
        ),
    ]),
    sequence("에제키엘 초크", [
        mounted,
        pair(hands(mounted.a, torso(flat, 0.72, -0.18), flat.hands[0]), flat),
        pair(
            hands(
                tilt(at(mounted.a, -0.29, 0.6, 0.06), [-0.69, 0.72, 0]),
                torso(flat, 0.7, -0.17),
                torso(flat, 0.7, 0.19),
            ),
            flat,
        ),
        pair(
            hands(at(top, -0.24, 0.48, 0.06, Math.PI), torso(flat, 0.68, 0.09), torso(flat, 0.66, -0.12)),
            flat,
        ),
    ]),
    sequence("베이스볼 배트 초크", [
        pair(belly, flat),
        pair(hands(belly, torso(flat, 0.59, -0.13), torso(flat, 0.59, 0.13)), flat),
        pair(
            hands(at(side, -0.65, 0.55, 0.43, 0.66), torso(flat, 0.64, -0.11), torso(flat, 0.64, 0.11)),
            flat,
        ),
        pair(hands(north, torso(flat, 0.66, -0.08), torso(flat, 0.67, 0.08)), flat),
    ]),
    sequence("다스 초크", [
        pair(ride, turtle),
        pair(hands(at(ride, -0.06, 0.59, 0.46), torso(turtle, 0.62, -0.16), turtle.elbows[0]), turtle),
        pair(
            hands(
                tilt(at(top, -0.13, 0.56, 0.3), [0.12, 0.4, -0.91]),
                torso(turtle, 0.7, -0.19),
                torso(turtle, 0.65, -0.26),
            ),
            turtle,
        ),
        pair(
            hands(at(side, -0.16, 0.43, 0.4), torso(turned, 0.65, -0.15), torso(turned, 0.64, -0.23)),
            turned,
        ),
    ]),
];

const trappedBack = swap(back);
const armbarFinish = at(seated, -0.58, 0.34, 0.35, 2.04);
const triangleLegs = feet(guard.a, [0.11, 0.91, -0.24], [0.2, 0.94, 0.25]);
const scarf = at(seated, -0.23, 0.43, 0.39, 2.52);
const escapes = [
    sequence("백 컨트롤 힙 이스케이프", [
        trappedBack,
        pair(hands(back.b, back.a.hands[0], back.a.hands[0]), back.a),
        pair(
            tilt(at(seated, 0.27, 0.33, -0.41), [-0.56, 0.6, -0.54]),
            feet(back.a, [0.67, 0.14, 0.39], [0.08, 0.2, -0.21]),
        ),
        pair(at(flat, 0.19, 0.27, -0.46, 1.2), at(seated, -0.27, 0.32, 0.16)),
        pair(halfBottom, halfTop),
    ]),
    sequence("암바 히치하이커 이스케이프", [
        pair(turned, feet(armbarFinish, [-0.7, 0.39, -0.18], [-0.23, 0.4, -0.23])),
        pair(
            hands(
                tilt(at(flat, 0.03, 0.34, 0.09), [-0.8, 0.22, 0.54]),
                [-0.59, 0.42, 0.33],
                [-0.51, 0.14, 0.44],
            ),
            armbarFinish,
        ),
        pair(
            hands(at(turtle, -0.21, 0.48, 0.58, -1.2), [-0.64, 0.19, 0.28], [-0.4, 0.15, 0.33]),
            at(armbarFinish, -0.6, 0.31, 0.05),
        ),
        pair(at(side, -0.3, 0.55, 0.52), flat),
    ]),
    sequence("트라이앵글 스택 이스케이프", [
        pair(tilt(knees, [-0.65, 0.75, 0]), triangleLegs),
        pair(
            hands(at(low, 0.2, 0.7, 0.1), torso(triangleLegs, 0.17, 0.13), triangleLegs.knees[0]),
            triangleLegs,
        ),
        pair(hands(stretch, torso(stacked, 0.31, 0.14), stacked.knees[0]), stacked),
        pair(at(across, -0.26, 0.52, -0.5, 2.2), folded),
        farPin,
    ]),
    sequence("길로틴 세이프사이드 탈출", [
        pair(turtle, headlock),
        pair(hands(at(low, 0.15, 0.63, 0.06), headlock.hands[0], torso(headlock, 0.54, -0.22)), headlock),
        pair(
            feet(at(top, -0.03, 0.62, -0.41), [0.69, 0.13, -0.69], [0.21, 0.13, -0.59]),
            at(seated, -0.35, 0.32, 0.01),
        ),
        pair(at(side, -0.24, 0.5, -0.47, Math.PI), turned),
    ]),
    sequence("케사 가타메 브리지 탈출", [
        pair(flat, scarf),
        pair(hands(planted, torso(scarf, 0.11, -0.17), torso(scarf, 0.12, -0.11)), scarf),
        pair(
            hands(arch, scarf.h, torso(scarf, 0.15, -0.1)),
            tilt(at(scarf, -0.12, 0.66, 0.1), [-0.68, 0.53, -0.47]),
        ),
        pair(
            tilt(at(dog, 0.06, 0.52, -0.12), [-0.27, 0.53, -0.8]),
            tilt(at(scarf, -0.2, 0.48, -0.22), [-0.63, 0.27, -0.72]),
        ),
        pair(at(top, -0.15, 0.52, -0.17), at(roll, -0.32, 0.35, -0.39)),
    ]),
    sequence("사이드 고스트 이스케이프", [
        swap(pin),
        pair(hands(turned, torso(side, 0.13, -0.12), side.elbows[0]), side),
        pair(
            hands(at(shrimp, -0.51, 0.27, 0.21, -1.09), [0.01, 0.37, 0.25], [-0.6, 0.13, 0.45]),
            tilt(side, [0.23, 0.52, -0.82]),
        ),
        pair(at(turtle, -0.65, 0.47, 0.45, -2.05), at(side, 0.07, 0.51, 0.03)),
    ]),
    sequence("프런트 헤드락 싯아웃", [
        pair(turtle, headlock),
        pair(hands(at(turtle, 0.15, 0.52, 0.16), [-0.21, 0.12, 0.32], headlock.elbows[0]), headlock),
        pair(
            feet(
                tilt(at(seated, -0.08, 0.31, 0.42, -1.17), [0.11, 0.76, 0.64]),
                [-0.59, 0.1, 0.49],
                [0.49, 0.1, 0.34],
            ),
            at(headlock, -0.28, 0.55, 0.01),
        ),
        pair(at(ride, -0.27, 0.56, 0.59, 1.3), at(turtle, -0.3, 0.49, 0.02, 1.8)),
    ]),
    sequence("엘보 푸시 이스케이프", [
        swap(pin),
        pair(hands(turned, side.elbows[0], side.hands[0]), side),
        pair(
            hands(at(seated, -0.54, 0.35, -0.14), side.elbows[0], [-0.87, 0.1, -0.24]),
            tilt(side, [0.45, 0.52, -0.72]),
        ),
        pair(
            feet(at(seated, -0.69, 0.32, -0.27), [-0.17, 0.33, 0.05], [-0.08, 0.17, -0.38]),
            at(low, 0.12, 0.55, 0.3),
        ),
        butterfly,
    ]),
];

export const coreClips = [
    ...standingClips,
    ...sweeps,
    ...passes,
    ...transition,
    ...submissions,
    ...escapes,
];
