import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { normalisePayload } from '../api/sync.js';
const source = fs.readFileSync(new URL('../js/hero-matcher.js', import.meta.url), 'utf8');
function setup() {
  let count = 133, downloads = 0;
  const pixels = id => { let seed = id; return Uint8ClampedArray.from({length:24*24*4}, (_, i) => { seed = (seed * 1664525 + 1013904223) >>> 0; return i % 4 === 3 ? 255 : seed % 256; }); };
  const context = vm.createContext({window:{}, console, Date, Math, Map, Promise, Set, AbortSignal,
    Image: class { width=96; height=96; async decode(){} },
    URL: {createObjectURL: blob => String(blob.id), revokeObjectURL:()=>{}},
    document: {createElement:()=> {let image;return {getContext:()=>({clearRect(){},drawImage: img=>{image=img;},getImageData:()=>({data:pixels(Number(image.src))})})};}},
    fetch: async path => {
      if (path === '/api/mlbb-references') return {ok:true,json:async()=>({records:[]})};
      if (path === '/api/mlbb-heroes') return {ok:true,json:async()=>({data:Array.from({length:count},(_,i)=>({id:i+1,name:`Hero ${i+1}`,image:`https://akmweb.youngjoygame.com/${i+1}.png`}))})};
      downloads++; return {ok:true,blob:async()=>({id:Number(path.split('=')[1])})};
    }
  });
  vm.runInContext(source,context);
  return {w:context.window,setCount:n=>{count=n;},downloads:()=>downloads};
}
test('133 cached references automatically become 134 and only the new portrait is downloaded', async () => {
  const {w,setCount,downloads}=setup(); const matcher=new w.HeroPortraitMatcher({getAccessToken:()=> 'fixture'});
  const persisted=new Map(); matcher.cached=async(key,value)=>{if(value) persisted.set(key,value);return persisted.get(key);};
  await matcher.prepare(); assert.equal(matcher.references.length,133); assert.equal(downloads(),133);
  matcher.catalogAt=0; setCount(134); await matcher.prepare();
  assert.equal(matcher.references.length,134); assert.equal(downloads(),134); assert.equal(matcher.complete,true);
  const restarted=new w.HeroPortraitMatcher({getAccessToken:()=> 'fixture'}); restarted.cached=matcher.cached;
  await restarted.prepare(); assert.equal(downloads(),134); assert.equal(restarted.references.length,134);
});
test('visual similarity preserves ambiguity, rejects incomplete catalog and tiny crops', () => {
  const {w}=setup(), math=w.HeroPortraitMath;
  const list=math.rankCandidates([[.1,.2,.3]], [{id:1,name:'A',variants:[[.1,.2,.3]]},{id:2,name:'B',variants:[[.8,.7,.6]]}]);
  assert.equal(list[0].id,1); assert.equal(list[0].score,1); assert.equal(math.automaticMatch(list,true,64),true);
  assert.equal(math.automaticMatch(list,false,64),false); assert.equal(math.automaticMatch(list,true,20),false);
  assert.equal(math.automaticMatch([{score:1},{score:.99}],true,64),false);
  assert.equal(math.automaticMatch([{score:.95},{score:.5}],true,64),false);
});
test('server preserves lane and bounded tags, rejects invalid lanes and does not change historical roles', () => {
  const data=normalisePayload({players:[{id:'p1',name:'Player',primaryRole:'Roamer',tags:['Shotcaller','shotcaller',' Flex ','a'.repeat(60),'3','4','5','6']}],matches:[],heroes:[]});
  assert.equal(data.players[0].primaryRole,'Roamer'); assert.equal(data.players[0].tags.length,5);
  assert.ok(data.players[0].tags.every(tag=>tag.length<=24)); assert.equal(data.players[0].tags.filter(tag=>tag.toLowerCase()==='shotcaller').length,1);
  const invalid=normalisePayload({players:[{id:'p1',name:'P',primaryRole:'Injected',tags:'not-an-array'}],matches:[],heroes:[]});
  assert.equal(invalid.players[0].primaryRole,null); assert.deepEqual(invalid.players[0].tags,[]);
});
