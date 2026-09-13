"use client";
import { Canvas,useFrame } from "@react-three/fiber";
import { Sparkles } from "@react-three/drei";
import { useEffect,useRef,useState } from "react";
import type { Group } from "three";
export const heroScrollState={current:0};

function IntelligenceCore({compact}:{compact:boolean}){
 const root=useRef<Group>(null),nodes=useRef<Group>(null);
 useFrame((state,delta)=>{const progress=heroScrollState.current;if(root.current){root.current.rotation.y+=delta*(.07+progress*.05);root.current.rotation.x=Math.sin(state.clock.elapsedTime*.25)*.045+progress*.18;root.current.scale.setScalar(1-progress*.16)}if(nodes.current){nodes.current.rotation.z+=delta*.12;nodes.current.rotation.y-=delta*.08}});
 const nodeCount=compact?4:7;
 return <group ref={root} rotation={[.14,0,-.12]}>
  <mesh><sphereGeometry args={[1.82,compact?20:36,compact?14:24]}/><meshStandardMaterial color="#081521" roughness={.24} metalness={.65} emissive="#173348" emissiveIntensity={.48}/></mesh>
  <mesh scale={1.08}><icosahedronGeometry args={[1.9,compact?2:4]}/><meshBasicMaterial color="#8fffc7" transparent opacity={.22} wireframe/></mesh>
  <mesh scale={1.23}><sphereGeometry args={[1.9,compact?16:28,compact?10:18]}/><meshBasicMaterial color="#5f7cff" transparent opacity={.1} wireframe/></mesh>
  {[2.5,2.9,3.28].map((radius,index)=><mesh key={radius} rotation={[Math.PI/(index+2.4),index*.68,index*.22]}><torusGeometry args={[radius,.009,5,compact?70:130]}/><meshBasicMaterial color={index===1?"#f1d59a":"#8fffc7"} transparent opacity={.52-index*.08}/></mesh>)}
  <group ref={nodes}>{Array.from({length:nodeCount},(_,index)=>{const angle=index/nodeCount*Math.PI*2;return <mesh key={index} position={[Math.cos(angle)*2.5,Math.sin(angle)*1.15,Math.sin(angle)*2]}><sphereGeometry args={[index%3===0?.07:.045,8,8]}/><meshBasicMaterial color={index%3===0?"#f1d59a":"#8fffc7"}/></mesh>})}</group>
 </group>
}

export function HeroScene(){
 const host=useRef<HTMLDivElement>(null);const [compact,setCompact]=useState(true);const [inView,setInView]=useState(true);const [pageVisible,setPageVisible]=useState(true);
 useEffect(()=>{const media=window.matchMedia("(min-width: 768px)"),update=()=>setCompact(!media.matches);update();media.addEventListener("change",update);const visibility=()=>setPageVisible(!document.hidden);document.addEventListener("visibilitychange",visibility);const observer=new IntersectionObserver(([entry])=>setInView(Boolean(entry?.isIntersecting)),{rootMargin:"15% 0px",threshold:.01});if(host.current)observer.observe(host.current);return()=>{media.removeEventListener("change",update);document.removeEventListener("visibilitychange",visibility);observer.disconnect()}},[]);
 const reduced=typeof window!=="undefined"&&window.matchMedia("(prefers-reduced-motion: reduce)").matches;if(reduced)return <div className="orb-fallback"/>;
 return <div ref={host} className="hero-canvas-host"><Canvas frameloop={inView&&pageVisible?"always":"never"} dpr={compact?[.7,1]:[1,1.5]} camera={{position:[0,0,7.8],fov:44}} gl={{antialias:!compact,alpha:true,powerPreference:"high-performance"}}><fog attach="fog" args={["#05070d",7,14]}/><ambientLight intensity={.45}/><pointLight position={[4,3,5]} intensity={28} color="#8fffc7"/><pointLight position={[-4,-2,2]} intensity={20} color="#5f7cff"/><IntelligenceCore compact={compact}/><Sparkles count={compact?16:52} scale={9} size={compact?.8:1.25} speed={.13} color="#c7fff0" opacity={.46}/></Canvas></div>
}
