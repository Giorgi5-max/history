import assert from 'node:assert/strict';
import {Miniflare} from 'miniflare';
import {readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {course,chapters} from '../content/course.ts';
import {sampleVideo} from './fixtures/sample-mp4.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleFiles=(await readdir(path.join(root,'dist/server'),{recursive:true})).filter(f=>/\.m?js$/.test(f));moduleFiles.sort((a,b)=>a==='index.js'?-1:b==='index.js'?1:a.localeCompare(b));
const mf=new Miniflare({modules:moduleFiles.map(f=>({type:'ESModule',path:path.join(root,'dist/server',f)})),modulesRoot:path.join(root,'dist/server'),compatibilityDate:'2026-05-15',compatibilityFlags:['nodejs_compat'],d1Databases:['DB'],r2Buckets:['BUCKET'],bindings:{OWNER_EMAIL:'qa-owner@example.test'}});
let checks=0;const ok=(v,msg)=>{assert.ok(v,msg);checks++};
async function request(route,{cookie,method='GET',body,headers={},expected=200,raw=false}={}){const res=await mf.dispatchFetch('https://qa.test/api'+route,{method,headers:{...(cookie?{cookie}:{}),...(body&&!raw?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:raw?body:JSON.stringify(body)}:{})});if(res.status!==expected){console.error(route,res.status,await res.text());throw new Error('Unexpected HTTP status');}return res}
const decode=async(r)=>r.json();const cookie=(r)=>r.headers.get('set-cookie').split(';')[0];
try{
 const db=await mf.getD1Database('DB');for(const f of (await readdir(path.join(root,'drizzle'))).filter(n=>n.endsWith('.sql')).sort()){const sql=await readFile(path.join(root,'drizzle',f),'utf8');for(const statement of sql.split('--> statement-breakpoint').map(s=>s.trim()).filter(Boolean))await db.prepare(statement).run()}
 ok(course.length===25&&chapters.length===6,'catalog size');ok(JSON.stringify(chapters.map(c=>course.filter(l=>l.chapter===c.id).length))==='[2,3,4,5,5,6]','chapter order');ok(course.every(l=>l.questions.length>=5&&l.questions.length<=10&&l.questions.every(q=>q.options.length===4&&q.options[q.correct])),'questions');ok(course.every(l=>l.points.length>=4&&l.points.length<=5&&l.terms.length>0),'lesson structure');for(const l of course)await readFile(path.join(root,'public',l.image));checks++;

 let b=await decode(await request('/bootstrap'));ok(b.lessons.length===25&&!('correct' in b.lessons[0].questions[0]),'answers withheld');ok(b.lessons.every(l=>l.sections.length===0)&&b.mythStatements.length===0,'class material requires account');
 await request('/auth/setup',{method:'POST',body:{password:'qa-password-12345'},expected:403});checks++;
 const setup=await request('/auth/setup',{method:'POST',headers:{'oai-authenticated-user-email':'qa-owner@example.test'},body:{name:'სატესტო მასწავლებელი',password:'qa-password-12345'}});const teacher=cookie(setup);checks++;
 await request('/auth/setup',{method:'POST',headers:{'oai-authenticated-user-email':'qa-owner@example.test'},body:{password:'qa-password-12345'},expected:409});checks++;
 const created=await decode(await request('/teacher/students',{method:'POST',cookie:teacher,body:{names:['მოსწავლე პირველი','მოსწავლე მეორე']}}));ok(created.students.length===2,'create personal codes');
 const sign=await request('/auth/login',{method:'POST',body:{code:created.students[0].code,role:'student'}});const student=cookie(sign);
 const sign2=await request('/auth/login',{method:'POST',body:{code:created.students[1].code,role:'student'}});const other=cookie(sign2);
 await request('/teacher/settings',{method:'POST',cookie:student,body:{current:5},expected:403});checks++;
 await request('/teacher/lessons/1',{method:'PUT',cookie:other,body:{lesson:course[0]},expected:403});checks++;
 await request('/teacher/settings',{method:'POST',cookie:teacher,headers:{Origin:'https://other.test'},body:{current:5},expected:403});checks++;
 const opened=await decode(await request('/progress',{method:'POST',cookie:student,body:{lessonId:1,action:'open'}}));ok(!opened.progress.mastered,'opening is not mastery');
 await request('/teacher/settings',{method:'POST',cookie:teacher,body:{current:6,assignment:{lessonId:6,text:'სატესტო დავალება',due:'2026-11-19T16:00:00Z'}}});b=await decode(await request('/bootstrap',{cookie:other}));ok(b.current===6&&b.assignment.lessonId===6,'shared current and assignment');
 const edit={...course[0],intro:'სატესტო ახსნა'};await request('/teacher/lessons/1',{method:'PUT',cookie:teacher,body:{lesson:edit}});b=await decode(await request('/bootstrap',{cookie:student}));ok(b.lessons[0].intro==='სატესტო ახსნა','shared content');await request('/teacher/lessons/1',{method:'PUT',cookie:teacher,body:{lesson:course[0]}});
 const malformed={...course[0],questions:course[0].questions.slice(0,4)};await request('/teacher/lessons/1',{method:'PUT',cookie:teacher,body:{lesson:malformed},expected:400});checks++;
 async function quiz(perfect){const q=await decode(await request('/quiz/start',{method:'POST',cookie:student,body:{lessonId:1}}));ok(!('correct' in q.questions[0]),'quiz answers not returned');for(let i=0;i<q.questions.length;i++){const correct=course[0].questions[i].correct;const answer=perfect||i<2?correct:(correct+1)%4;const fb=await decode(await request('/quiz/answer',{method:'POST',cookie:student,body:{attemptId:q.attemptId,index:i,answer}}));ok(typeof fb.explanation==='string','explanation after answer');if(i===0){await request('/quiz/answer',{method:'POST',cookie:student,body:{attemptId:q.attemptId,index:i,answer},expected:409});checks++}}return decode(await request('/quiz/finish',{method:'POST',cookie:student,body:{attemptId:q.attemptId}}))}
 const first=await quiz(false);ok(first.percent===40&&!first.progress.mastered&&first.missed.length===3,'mistakes and threshold');
 const second=await quiz(true);ok(second.percent===100&&second.progress.mastered&&second.progress.missed.length===0,'mastery and retry');
 const again=await request('/auth/login',{method:'POST',body:{code:created.students[0].code,role:'student'}});const anotherDevice=cookie(again);b=await decode(await request('/bootstrap',{cookie:anotherDevice}));ok(b.progress[0].mastered&&b.progress[0].best===100,'progress restored on another session');b=await decode(await request('/bootstrap',{cookie:other}));ok(b.progress.length===0,'progress isolated');
 const incomplete=await decode(await request('/quiz/start',{method:'POST',cookie:student,body:{lessonId:2}}));await request('/quiz/finish',{method:'POST',cookie:student,body:{attemptId:incomplete.attemptId},expected:400});checks++;
 await request('/teacher/videos/1',{method:'POST',cookie:teacher,body:{title:'სატესტო ვიდეო',description:'აღწერა',url:'https://www.youtube.com/watch?v=dQw4w9WgXcQ'}});b=await decode(await request('/videos/1',{cookie:other}));ok(b.video.type==='youtube'&&b.video.url.endsWith('dQw4w9WgXcQ'),'youtube shared');
 await request('/teacher/videos/1',{method:'POST',cookie:teacher,body:{title:'არასწორი',url:'https://example.com/watch?v=dQw4w9WgXcQ'},expected:400});checks++;
 const bytes=Buffer.from(sampleVideo,'base64');await request('/teacher/videos/1?title='+encodeURIComponent('MP4 სატესტო')+'&description='+encodeURIComponent('მოკლე აღწერა'),{method:'PUT',cookie:teacher,headers:{'Content-Type':'video/mp4','Content-Length':String(bytes.length)},body:bytes,raw:true});
 b=await decode(await request('/videos/1',{cookie:anotherDevice}));ok(b.video.type==='file'&&b.video.title==='MP4 სატესტო','mp4 shared');
 const media=await request(b.video.url.replace('/api',''),{cookie:other,headers:{Range:'bytes=0-127'},expected:206});ok((await media.arrayBuffer()).byteLength===128&&media.headers.get('content-range').startsWith('bytes 0-127/'),'range seeking');
 await request(b.video.url.replace('/api',''),{expected:401});checks++;
 await request('/teacher/videos/1',{method:'PATCH',cookie:teacher,body:{title:'შეცვლილი სათაური',description:'შეცვლილი აღწერა'}});b=await decode(await request('/videos/1',{cookie:student}));ok(b.video.title==='შეცვლილი სათაური','file metadata edit');
 await request('/teacher/videos/1',{method:'DELETE',cookie:teacher});b=await decode(await request('/videos/1',{cookie:student}));ok(b.video===null,'video delete');
 const overview=await decode(await request('/teacher/overview',{cookie:teacher}));ok(overview.students.find(s=>s.id===created.students[0].id).attempts.length===2,'teacher sees results');
 await request('/teacher/students/'+created.students[1].id,{method:'PATCH',cookie:teacher,body:{active:false}});await request('/bootstrap',{cookie:other});await request('/progress',{method:'POST',cookie:other,body:{lessonId:1,action:'read'},expected:401});checks++;
 await request('/auth/logout',{method:'POST',cookie:student});await request('/progress',{method:'POST',cookie:student,body:{lessonId:1,action:'read'},expected:401});checks++;
 console.log(JSON.stringify({passed:checks,lessons:course.length,questions:course.reduce((n,l)=>n+l.questions.length,0),verified:['authorization','account-isolation','progress-restoration','quiz-scoring','teacher-sync','mp4-upload','youtube-link','video-range-requests','video-edit-delete']}));
}finally{await mf.dispose()}
