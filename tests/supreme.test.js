import test from 'node:test';
import assert from 'node:assert/strict';
import { normaliseAwardEvidence } from '../lib/match-awards.js';
import { normalisePracticeDraft, officialMatchFromDraft } from '../api/submissions.js';
import { normalisePayload } from '../api/sync.js';
import { extractionProblems, reconcileRecheck } from '../lib/ocr-recheck.js';
const evidence={afk:false,highlightNotes:['shield icon','flame icon'],highlightOverflow:3};
const roster={players:[{id:'p1',name:'Player',active:true}],heroes:[{id:1,name:'Miya'}]};
const stat={heroUsed:'Miya',rolePlayed:'Gold Laner',kills:3,deaths:1,assists:4,inGameScore:10.1,medal:'supreme_mvp',...evidence};
test('Supreme and observed highlights survive submission, approval and sync',()=>{
 const draft=normalisePracticeDraft({entryMode:'full',date:'2026-09-26',matchType:'ranked',result:'win',claimedPlayerId:'admin',sourceBattleId:'965440291231675802',playerStats:[{...stat,playerId:'p1'}],guestStats:[{...stat,medal:'supreme',guestId:'g1',name:'Guest'}]},roster,{adminAuthor:true});
 const match=officialMatchFromDraft(draft,roster,{id:'award-match',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()});
 const payload=normalisePayload({...roster,matches:[match]});
 assert.equal(payload.matches[0].playerStats[0].medal,'supreme_mvp');
 assert.equal(payload.matches[0].guestStats[0].medal,'supreme');
 assert.deepEqual(normaliseAwardEvidence(payload.matches[0].playerStats[0]),evidence);
 assert.deepEqual(normaliseAwardEvidence(payload.matches[0].guestStats[0]),evidence);
 assert.equal(payload.matches[0].dataSource,'submission');
 assert.equal(payload.matches[0].sourceBattleId,'965440291231675802');
});
test('unknown highlights remain observations and missing old evidence is not fabricated',()=>{
 assert.deepEqual(normaliseAwardEvidence({}),{});
 assert.deepEqual(normaliseAwardEvidence({highlightNotes:['+5','+5',42,'<shield>'],highlightOverflow:99,afk:'false'}),{highlightNotes:['+5','shield']});
 assert.equal(normaliseAwardEvidence({highlightNotes:['+5']}).savage,undefined);
});
test('guest lane may remain unknown rather than inventing a played role',()=>{
 const draft=normalisePracticeDraft({entryMode:'full',date:'2026-09-26',matchType:'ranked',result:'win',claimedPlayerId:'admin',playerStats:[{...stat,playerId:'p1'}],guestStats:[{...stat,medal:'gold',guestId:'g1',name:'Guest',rolePlayed:''}]},roster,{adminAuthor:true});
 assert.equal(draft.guestStats[0].rolePlayed,'');assert.equal(draft.guestStats[0].roleSource,'unknown');
});
test('Supreme MVP counts as MVP; AFK badge does not trigger a guessed medal',()=>{
 const p={sourceRow:1,detectedName:'Player',kills:1,deaths:1,assists:1,medal:'supreme_mvp'};
 assert.deepEqual(extractionProblems({result:'win',players:[p]}),[]);
 assert.ok(extractionProblems({result:'win',players:[p,{...p,sourceRow:2,detectedName:'Other',medal:'mvp'}]}).includes('duplicate_mvp'));
 const original={result:null,players:[{...p,afk:true,medal:null}]};
 const merged=reconcileRecheck(original,{result:'win',players:[{...p,medal:'silver'}]});
 assert.equal(merged.result,'win');assert.equal(merged.players[0].medal,null);
 assert.deepEqual(extractionProblems(merged),[]);
});
