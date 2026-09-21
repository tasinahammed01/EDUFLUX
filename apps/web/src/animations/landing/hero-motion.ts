import gsap from "gsap";
import { heroScrollState } from "@/sections/landing/hero/hero-scene";
import { motionEase, select } from "./motion-utils";

export function createHeroMotion(root: HTMLElement, intensity = 1) {
  const hero = select<HTMLElement>(root, ".hero");
  if (!hero) return;
  const product = select<HTMLElement>(root, ".product-stage");
  const intro = gsap
    .timeline({ defaults: { ease: "power4.out" } })
    .from(
      select(root, ".hero-kicker"),
      { y: 14, opacity: 0, duration: 0.35 },
      0,
    )
    .from(
      selectAll(root, ".hero-line > span"),
      { yPercent: 108, rotation: 1.25, duration: 0.82, stagger: 0.1 },
      0.12,
    )
    .from(
      selectAll(root, ".hero-lead,.hero-actions,.hero-proof"),
      { y: 18, opacity: 0, duration: 0.62, stagger: 0.08 },
      0.46,
    )
    .from(
      select(root, ".product-stage"),
      {
        y: 92,
        scale: 0.94,
        rotateX: 5,
        rotateY: -6,
        opacity: 0,
        duration: 1.18,
      },
      0.16,
    )
    .from(
      select(root, ".scene-shell"),
      { opacity: 0, scale: 0.82, duration: 1.08 },
      0.2,
    )
    .from(
      selectAll(root, ".float-card"),
      { y: 20, opacity: 0, stagger: 0.1, duration: 0.52 },
      0.72,
    );
  const scroll = gsap
    .timeline({
      scrollTrigger: {
        trigger: hero,
        start: "top top",
        end: "bottom top",
        scrub: 1,
        onUpdate: (self) => {
          heroScrollState.current = self.progress;
        },
      },
    })
    .to(
      select(root, ".hero-copy"),
      { y: -38 * intensity, scale: 1 - 0.025 * intensity, opacity: 0.48 },
      0,
    )
    .to(
      select(root, ".product-stage"),
      {
        scale: 1 + 0.05 * intensity,
        rotateX: 0,
        rotateY: 0,
        y: 32 * intensity,
      },
      0,
    )
    .to(
      select(root, ".scene-shell"),
      { scale: 1 + 0.18 * intensity, y: 42 * intensity, opacity: 0.28 },
      0,
    )
    .to(
      selectAll(root, ".float-card"),
      { scale: 1 - 0.15 * intensity, opacity: 0.15, y: 12 * intensity },
      0,
    );
  const rotateX = product
    ? gsap.quickTo(product, "rotationX", {
        duration: 0.4,
        ease: motionEase.rest,
      })
    : undefined;
  const rotateY = product
    ? gsap.quickTo(product, "rotationY", {
        duration: 0.4,
        ease: motionEase.rest,
      })
    : undefined;
  let bounds: DOMRect | null = null;
  const enter = () => {
    bounds = hero.getBoundingClientRect();
  };
  const move = (event: PointerEvent) => {
    bounds ??= hero.getBoundingClientRect();
    const px = (event.clientX - bounds.left) / bounds.width,
      py = (event.clientY - bounds.top) / bounds.height;
    rotateX?.((0.5 - py) * 4);
    rotateY?.((px - 0.5) * 4);
    hero.style.setProperty("--pointer-x", `${px * 100}%`);
    hero.style.setProperty("--pointer-y", `${py * 100}%`);
  };
  const leave = () => {
    bounds = null;
    rotateX?.(0);
    rotateY?.(0);
  };
  hero.addEventListener("pointerenter", enter);
  hero.addEventListener("pointermove", move);
  hero.addEventListener("pointerleave", leave);
  return () => {
    intro.kill();
    scroll.kill();
    hero.removeEventListener("pointerenter", enter);
    hero.removeEventListener("pointermove", move);
    hero.removeEventListener("pointerleave", leave);
    heroScrollState.current = 0;
  };
}
function selectAll(root: Element, selector: string) {
  return [...root.querySelectorAll(selector)];
}
