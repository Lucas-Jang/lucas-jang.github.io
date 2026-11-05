import type { Pose, V } from "./bjj-poses";
import type { Clip, Pair } from "./pixel-dojo-clips";

const width = 112,
    height = 76;
const add = (a: V, b: V, k = 1): V => [
    a[0] + k * b[0],
    a[1] + k * b[1],
    a[2] + k * b[2],
];
const unit = (v: V): V => {
    const n = Math.hypot(...v) || 1;
    return [v[0] / n, v[1] / n, v[2] / n];
};
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V, b: V): V => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
];
const headOf = (p: Pose) => add(p.h, unit(p.u), 0.87);

function camera(yaw: number, pitch: number) {
    const s = Math.sin(yaw),
        c = Math.cos(yaw),
        up = Math.sin(pitch),
        forward = Math.cos(pitch);
    return ([x, y, z]: V): V => {
        const across = x * s + z * c;
        return [
            55 + 24 * (x * c - z * s),
            57 + 24 * (across * up - y * forward),
            across * forward + y * up,
        ];
    };
}
export const walkView = camera(0.34, 0.32);
// One fixed view per technique: keep both faces readable in the setup and finish.
// Keeping the view fixed during the clip also keeps direction of travel consistent.
export function chooseView(clip: Clip) {
    let best = walkView,
        bestScore = -Infinity;
    for (const yaw of [0.34, -0.4, 0.85, -0.9, 1.32, -1.38]) {
        for (const pitch of [0.34, 0.61]) {
            const view = camera(yaw, pitch);
            let score =
                -clip.frames.length * (2.4 * Math.abs(yaw) + 1.8 * pitch);
            for (const { a, b } of clip.frames) {
                const h1 = view(headOf(a)),
                    h2 = view(headOf(b));
                const gap = Math.hypot(h1[0] - h2[0], h1[1] - h2[1]);
                score +=
                    0.22 * Math.min(22, Math.abs(h1[0] - h2[0])) +
                    Math.min(19, gap) -
                    2 * Math.max(0, 12 - gap);
                for (const p of [a, b]) {
                    const left = view(p.feet[0]),
                        right = view(p.feet[1]);
                    score +=
                        0.19 *
                        Math.min(
                            12,
                            Math.hypot(left[0] - right[0], left[1] - right[1]),
                        );
                }
            }
            if (score > bestScore) {
                best = view;
                bestScore = score;
            }
        }
    }
    return best;
}

// The reference poses supply end targets and bend directions. Reconstruct two
// segments from those instead of drawing the pole itself as a knee or elbow.
function limb(start: V, target: V, pole: V, leg: boolean): [V, V] {
    const delta = add(target, start, -1),
        axis = unit(delta);
    const length = leg ? 0.51 : 0.4;
    const distance = Math.min(
        2 * length - 0.001,
        Math.max(0.08, Math.hypot(...delta)),
    );
    const end = add(start, axis, distance),
        center = add(start, axis, distance / 2);
    const offset = add(pole, center, -1);
    let bend = add(offset, axis, -dot(offset, axis));
    if (Math.hypot(...bend) < 0.001)
        bend = cross(axis, Math.abs(axis[1]) < 0.8 ? [0, 1, 0] : [1, 0, 0]);
    const joint = add(
        center,
        unit(bend),
        Math.sqrt(length * length - (distance * distance) / 4),
    );
    joint[1] = Math.max(0.09, joint[1]);
    end[1] = Math.max(0.08, end[1]);
    return [joint, end];
}
const palette = [
    "000000",
    "393044",
    "fff7df",
    "d6c9ab",
    "ffe5be",
    "9a76ab",
    "659bd9",
    "4977ab",
    "e8a161",
    "ffe29c",
    "ecaaa3",
    "ae664a",
    "db9287",
];
const colors = palette.map((hex) =>
    [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)),
);
// Each row is a one-pixel strip. Eyes and nose are placed separately so the
// partners can look towards the grip and blink without changing their outline.
const face = [
    "...##........##...",
    "..#ff#......#ff#..",
    "..#fpp######ppf#..",
    "..#pfffffffffpf#..",
    ".#ffffffffffffff#.",
    ".#ffffffffffffff#.",
    "#ffffffffffffffff#",
    "#ffffffffffffffff#",
    "#ffffffffffffffff#",
    "#ffffffffffffffff#",
    ".#ffffffffffffff#.",
    ".#ffffffffffffff#.",
    "..##ffffffffff##..",
    "....##########....",
];
export function makePainter(ctx: CanvasRenderingContext2D) {
    const frame = ctx.createImageData(width, height),
        depth = new Float32Array(width * height);
    function pixel(x: number, y: number, z: number, color: number) {
        if (x < 0 || x >= width || y < 0 || y >= height) return;
        const i = y * width + x;
        if (depth[i] > z + 0.00001) return;
        depth[i] = z;
        const k = i * 4,
            rgb = colors[color];
        frame.data[k] = rgb[0];
        frame.data[k + 1] = rgb[1];
        frame.data[k + 2] = rgb[2];
        frame.data[k + 3] = 255;
    }
    function bone(a: V, b: V, size: number, color: number) {
        const steps = Math.max(
            1,
            Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1])),
        );
        for (let i = 0; i <= steps; i++) {
            const t = i / steps,
                x = Math.round(a[0] + (b[0] - a[0]) * t),
                y = Math.round(a[1] + (b[1] - a[1]) * t);
            const z = a[2] + (b[2] - a[2]) * t;
            for (let dx = -size; dx <= size; dx++)
                for (let dy = -size; dy <= size; dy++) {
                    if (Math.abs(dx) + Math.abs(dy) > size * 1.65) continue;
                    const border =
                        Math.max(Math.abs(dx), Math.abs(dy)) === size;
                    pixel(
                        x + dx,
                        y + dy,
                        z + (border ? 0 : 0.034),
                        border ? 1 : color,
                    );
                }
        }
    }
    function cat(
        p: Pose,
        blue: boolean,
        blink: boolean,
        view: typeof walkView,
    ) {
        const up = unit(p.u),
            side = unit(cross(unit(p.f), up));
        const chest = add(p.h, up, 0.48),
            head = view(headOf(p)),
            hip = view(p.h);
        const coat = blue ? 6 : 2,
            shade = blue ? 7 : 3,
            fur = blue ? 8 : 4;
        for (const i of [0, 1] as const) {
            const sign = i ? 1 : -1;
            for (const leg of [true, false]) {
                const target = (leg ? p.feet : p.hands)[i];
                // Match the side of the stored limb target near its proximal joint.
                const pole = (leg ? p.knees : p.elbows)[i];
                const base = leg ? p.h : chest;
                const lateral = dot(add(pole, base, -1), side);
                const start = add(
                    base,
                    side,
                    (Math.abs(lateral) < 0.015 ? sign : Math.sign(lateral)) *
                        (leg ? 0.11 : 0.16),
                );
                const [joint, end] = limb(start, target, pole, leg);
                bone(view(start), view(joint), leg ? 3 : 2, shade);
                bone(view(joint), view(end), 2, coat);
                bone(view(end), view(end), 2, fur);
            }
        }
        bone(hip, view(chest), 5, coat);
        bone(view(chest), view(add(p.h, up, 0.76)), 3, coat);
        const collar = add(chest, unit(p.f), 0.15);
        bone(
            view(add(collar, side, -0.1)),
            view(add(add(collar, up, -0.22), side, 0.04)),
            1,
            shade,
        );
        const belt = view(add(p.h, up, 0.08));
        const shoulderPixel = view(chest);
        const dx = shoulderPixel[0] - hip[0],
            dy = shoulderPixel[1] - hip[1];
        const length = Math.hypot(dx, dy) || 1;
        const left: V = [
            belt[0] + (4 * dy) / length,
            belt[1] - (4 * dx) / length,
            belt[2] + 0.2,
        ];
        const right: V = [
            belt[0] - (4 * dy) / length,
            belt[1] + (4 * dx) / length,
            belt[2] + 0.2,
        ];
        bone(left, right, 1, blue ? 9 : 5);
        // Rotate the pixel face partway towards the projected spine in ground poses.
        const shoulder = view(chest);
        const angle = Math.max(
            -1.05,
            Math.min(
                1.05,
                Math.atan2(head[0] - shoulder[0], shoulder[1] - head[1]),
            ),
        );
        const cos = Math.cos(angle),
            sin = Math.sin(angle);
        const nose = view(add(headOf(p), p.f, 0.3))[0] >= head[0] ? 1 : -1;
        for (let dy = -12; dy <= 12; dy++)
            for (let dx = -12; dx <= 12; dx++) {
                const x = Math.round(dx * cos + dy * sin),
                    y = Math.round(-dx * sin + dy * cos),
                    cell = face[y + 8]?.[x + 9];
                if (!cell || cell === ".") continue;
                let color = fur;
                if (cell === "#") color = 1;
                else if (cell === "p") color = 10;
                else {
                    if (blue && y <= -3 && (x === -2 || x === 1)) color = 11;
                    if (
                        (x === nose - 4 || x === nose + 2) &&
                        (y === -1 || (!blink && y === 0))
                    )
                        color = 1;
                    if (y === 2 && x === nose) color = 1;
                    if (y === 1 && (x === nose - 5 || x === nose + 4))
                        color = 12;
                }
                if (color)
                    pixel(
                        Math.round(head[0]) + dx,
                        Math.round(head[1]) + dy,
                        head[2] + 0.14,
                        color,
                    );
            }
    }
    return (pair: Pair, view: typeof walkView, clock: number) => {
        frame.data.fill(0);
        depth.fill(-Infinity);
        cat(pair.b, true, clock % 3400 < 120, view);
        cat(pair.a, false, (clock + 400) % 3000 < 120, view);
        ctx.putImageData(frame, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = "destination-over";
        ctx.fillStyle = "#45415324";

        for (const p of [pair.a, pair.b]) {
            const [x, y] = view([p.h[0], 0, p.h[2]]);
            ctx.fillRect(Math.round(x) - 11, Math.round(y), 22, 2);
        }
        ctx.restore();
    };
}
