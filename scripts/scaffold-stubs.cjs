#!/usr/bin/env node
const fs=require("fs"); const path=require("path");
const ROOT=process.cwd(); const PUB=path.join(ROOT,"public"); const APP=path.join(ROOT,"src","app");
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function routeFromHtml(file){
  const rel=path.relative(PUB,file).replace(/\\/g,"/");
  if(rel==="index.html") return "/";
  if(rel.endsWith("/index.html")) return "/"+rel.slice(0,-"index.html".length);
  return "/"+rel.replace(/\\.html$/,"");
}
function targetDirFromRoute(route){
  return path.join(APP, route.replace(/^\\/+|\\/+$/g,"/"));
}
function writePage(dir, title){
  ensureDir(dir); const f=path.join(dir,"page.tsx");
  if(fs.existsSync(f)) return;
  const s=`export const metadata = { title: ${JSON.stringify(title)} };\n
export default function Page(){return (<main style={{padding:24}}><h1>${title}</h1><p>Stub page — replace with real content.</p></main>);} \n`;
  fs.writeFileSync(f,s);
}
function main(){
  const htmls=[];
  (function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
    const p=path.join(d,e.name); if(e.isDirectory()) walk(p); else if(/\\.html$/i.test(e.name)) htmls.push(p); }})(PUB);
  for(const file of htmls){ const r=routeFromHtml(file); const dir=targetDirFromRoute(r); writePage(dir, r==="/" ? "Home" : r); }
  console.log("Scaffolded", htmls.length, "routes with stub pages.");
}
main();
