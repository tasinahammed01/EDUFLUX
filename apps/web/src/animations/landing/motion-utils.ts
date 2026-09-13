import type gsap from "gsap";
export const motionEase={entrance:"power3.out",micro:"power2.out",rest:"power3.out"} as const;
export type MotionCleanup=()=>void;
export function select<T extends Element>(root:Element,selector:string){return root.querySelector<T>(selector)}
export function selectAll<T extends Element>(root:Element,selector:string){return [...root.querySelectorAll<T>(selector)]}
export function killAll(items:gsap.core.Animation[]){return()=>items.forEach(item=>item.kill())}
