"use client";
import dynamic from "next/dynamic";
import { ProductPreview } from "./product-preview";
const HeroScene=dynamic(()=>import("./hero-scene").then(module=>module.HeroScene),{ssr:false,loading:()=> <div className="orb-fallback"/>});
export function HeroExperience(){return <div className="hero-experience" data-motion="hero-experience"><div className="scene-shell" data-motion="hero-scene" aria-hidden="true"><HeroScene/></div><ProductPreview/></div>}
