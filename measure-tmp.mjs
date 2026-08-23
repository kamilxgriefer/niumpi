import { chromium } from "@playwright/test";
const SAVE_KEY="niumpi-save-v5";
const LEGACY=["niumpi-save-v4","niumpi-memory-v3","niumpi-memory-v2","niumpi-memory-v1"];
const now=1787000000000;
const fixture={version:4,
 profile:{id:"audit",createdAt:now,lastSeenAt:now,settings:{sound:false,music:false,effects:true,reducedMotion:"on",lowPower:false,seedQuestions:true,shareProfile:false}},
 niumpi:{name:"Mango",createdAt:now,hatchedAt:now,seedProgress:1,stage:3,stageStartedAt:now,careMoments:180,bond:62,lastInteractionAt:now},
 stats:{fullness:71,energy:80,joy:75,comfort:60,curiosity:50,wellbeing:70,variety:40,trust:30},
 inventory:{ingredients:{moonberry:6,cloudpuff:5,dewdrop:8,sunseed:3},items:["moon-lamp","cloud-sofa","garden-pot","cozy-cushion"],currencies:{dewdrops:480,starFragments:12}},
 unlocks:["seeds","room","games","garden","cooking","dreams","friends","shop","evolution"]};
const b=await chromium.launch();
for(const [w,h] of [[1440,1000],[375,812]]){
 const p=await b.newPage({viewport:{width:w,height:h}});
 await p.goto("http://localhost:3000/",{waitUntil:"domcontentloaded"});
 await p.evaluate(([k,l,s])=>{for(const x of l)localStorage.removeItem(x);localStorage.setItem(k,JSON.stringify(s));},[SAVE_KEY,LEGACY,fixture]);
 await p.goto("http://localhost:3000/?scene=home",{waitUntil:"domcontentloaded"});
 await p.waitForSelector(".hero-panel",{timeout:30000}); await p.waitForTimeout(1800);
 const r=await p.evaluate(()=>{
  const g=s=>{const e=document.querySelector(s);return e?Math.round(e.getBoundingClientRect().height):null;};
  const pan=document.querySelector(".hero-panel");
  return {vh:innerHeight, panel:g(".hero-panel"), stage:g(".hero-stage"), snack:g(".snack-bar"),
   strip:g(".status-strip"), action:g(".action-bar"), head:g(".hero-head"),
   panelBottom:Math.round(pan.getBoundingClientRect().bottom),
   kids:[...pan.children].map(c=>({c:c.className,h:Math.round(c.getBoundingClientRect().height)}))};
 });
 console.log(`\n=== ${w}x${h} ===\n`+JSON.stringify(r,null,1));
 await p.close();
}
await b.close();
