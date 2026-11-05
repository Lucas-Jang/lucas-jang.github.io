import {
    clips,
    standing,
    shift,
    sampleClip,
    type Clip,
} from "./pixel-dojo-clips";
import type { Pose } from "./bjj-poses";

import { chooseView, makePainter, walkView } from "./pixel-dojo-painter";

export function startDojo() {
    const box = document.querySelector<HTMLElement>(".mat-pair")!,
        controls = document.querySelector<HTMLElement>(".mat-controls")!;
    const ctx = box.querySelector("canvas")!.getContext("2d");
    if (!ctx) return;
    const label = box.querySelector("span")!,
        button = controls.querySelector("button")!,
        state = button.querySelector("span")!;
    const paint = makePainter(ctx);
    let view = walkView;
    const reduced = matchMedia("(prefers-reduced-motion: reduce)");
    let enabled = !reduced.matches,
        timer = 0,
        time = 0,
        last = 0,
        walk = true,
        bag: Clip[] = [],
        clip: Clip | undefined;
    let x = 0.72,
        y = 0.75,
        toX = 0.56,
        toY = 0.69;
    function next() {
        if (!bag.length) {
            bag = [...clips];
            for (let i = bag.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [bag[i], bag[j]] = [bag[j], bag[i]];
            }
            if (bag.at(-1) === clip)
                [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
        }
        return bag.pop()!;
    }
    function draw(now: number) {
        time += last ? Math.min(now - last, 160) : 0;
        last = now;
        const duration = walk ? 3600 : 6000;
        const t = Math.min(time / duration, 1),
            ease = t * t * (3 - 2 * t);
        const px =
            (walk ? x + (toX - x) * ease : x) *
            Math.max(0, innerWidth - box.offsetWidth);
        const py =
            (walk ? y + (toY - y) * ease : y) *
            Math.max(0, innerHeight - box.offsetHeight - 8);
        box.style.transform =
            "translate(" + Math.round(px) + "px," + Math.round(py) + "px)";
        let a: Pose, b: Pose;
        if (walk) {
            label.textContent = "도장 산책 중";
            const step = Math.sin(time / 125);
            const stride = (p: Pose, s: number) => {
                const q = shift(p, 0, Math.abs(s) * 0.045);
                q.feet.forEach((v, i) => {
                    v[0] += s * (i ? 1 : -1) * 0.13;
                    v[1] += Math.max(0, s * (i ? 1 : -1)) * 0.1;
                });
                return q;
            };
            a = stride(standing.a, step);
            b = stride(standing.b, -step);
        } else {
            label.textContent = clip!.korean;
            ({ a, b } = sampleClip(
                clip!,
                Math.max(0, Math.min(1, (t - 0.07) / 0.75)),
            ));
        }
        // Fade at the cut between walking and mat work; interpolating through a
        // standing reset made floor techniques look like levitation.
        const fade = Math.min(1, t / 0.055, (1 - t) / 0.055);
        box.style.opacity = String(Math.max(0, fade));
        paint({ a, b }, walk ? walkView : view, time);
        if (t === 1) {
            time = 0;
            if (walk) {
                x = toX;
                y = toY;
                clip = next();
                view = chooseView(clip);
            } else {
                toX =
                    x > 0.5
                        ? 0.02 + Math.random() * 0.32
                        : 0.64 + Math.random() * 0.32;
                toY = 0.35 + Math.random() * 0.55;
            }
            walk = !walk;
        }
        timer = window.setTimeout(() => draw(performance.now()), 65);
    }
    function refresh() {
        clearTimeout(timer);
        last = 0;
        box.hidden = !enabled;
        state.textContent = enabled ? "켜짐" : "꺼짐";
        button.setAttribute("aria-pressed", String(enabled));
        if (enabled && !document.hidden) draw(performance.now());
    }
    button.onclick = () => {
        enabled = !enabled;
        refresh();
    };
    reduced.addEventListener("change", () => {
        enabled = !reduced.matches;
        refresh();
    });
    document.addEventListener("visibilitychange", refresh);
    controls.hidden = false;
    refresh();
}
