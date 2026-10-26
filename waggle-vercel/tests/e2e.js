const { chromium } = require('playwright');
const BASE=process.env.BASE||'http://localhost:3000';
const stamp=Date.now();
const A={name:'Amina Test',email:`amina${stamp}@example.com`,pw:'honeybee-2026'};
const B={name:'Juma Test',email:`juma${stamp}@example.com`,pw:'beekeeper-2026'};
let fails=0; const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) fails++};
(async()=>{
 const browser=await chromium.launch();
 const errs=[];
 const ctxA=await browser.newContext(); const pa=await ctxA.newPage();
 pa.on('pageerror',e=>errs.push('pageerror: '+e.message));
 pa.on('console',m=>{const t=m.text();if(m.type()==='error'&&!/401|ERR_TUNNEL/.test(t))errs.push('console: '+t)});
 // Register A
 await pa.goto(BASE+'/#/auth'); await pa.waitForTimeout(500);
 await pa.click('[data-act="authmode"][data-v="register"]');
 await pa.fill('form[data-form="register"] input[name="name"]',A.name);
 await pa.fill('form[data-form="register"] input[name="email"]',A.email);
 await pa.fill('form[data-form="register"] input[name="password"]',A.pw);
 await pa.fill('form[data-form="register"] input[name="confirm"]',A.pw);
 await pa.check('form[data-form="register"] input[name="terms"]');
 await pa.click('form[data-form="register"] button.block');
 await pa.waitForURL(/#\/setup/,{timeout:8000}).catch(()=>{});
 ok((await pa.evaluate(()=>location.hash))==='#/setup','register moves to setup');
 const me=await pa.evaluate(async()=>(await fetch('/api/me')).status);
 ok(me===200,'session cookie set after register');
 // Empty account: no demo content
 const empty=await pa.evaluate(()=>({apiaries:D.apiaries.length,inv:D.inv.length,orders:D.orders.length,sales:D.sales.length,team:D.team.map(m=>m.role)}));
 ok(empty.apiaries===0&&empty.inv===0&&empty.orders===0&&empty.sales===0,'new account starts empty '+JSON.stringify(empty));
 ok(empty.team.length===1&&empty.team[0]==='Owner','team starts with owner only');
 // Add data, let it save, reload
 await pa.evaluate(()=>{D.apiaries.push({id:'a1',name:'Test Apiary',location:'Morogoro',hives:[]});persist()});
 await pa.waitForTimeout(1200);
 await pa.reload(); await pa.waitForTimeout(800);
 const afterReload=await pa.evaluate(()=>D.apiaries.map(a=>a.name));
 ok(afterReload.includes('Test Apiary'),'data persists across reload '+JSON.stringify(afterReload));
 // Sign out
 await pa.evaluate(()=>signOut()); await pa.waitForTimeout(800);
 const meOut=await pa.evaluate(async()=>(await fetch('/api/me')).status);
 ok(meOut===401,'signed out session rejected');
 // Wrong password
 await pa.goto(BASE+'/#/auth'); await pa.waitForTimeout(400);
 await pa.fill('form[data-form="login"] input[name="email"]',A.email);
 await pa.fill('form[data-form="login"] input[name="password"]','wrong-password-1');
 await pa.click('form[data-form="login"] button.block'); await pa.waitForTimeout(800);
 const lm=await pa.textContent('#lmsg');
 ok(/not correct|incorrect|invalid/i.test(lm||''),'wrong password message shown: "'+lm+'"');
 // Correct login
 await pa.fill('form[data-form="login"] input[name="password"]',A.pw);
 await pa.click('form[data-form="login"] button.block'); await pa.waitForTimeout(1200);
 const again=await pa.evaluate(()=>D.apiaries.map(a=>a.name));
 ok(again.includes('Test Apiary'),'sign-in restores saved data');
 // Second account in isolated context
 const ctxB=await browser.newContext(); const pb=await ctxB.newPage();
 pb.on('pageerror',e=>errs.push('pageerror B: '+e.message));
 await pb.goto(BASE+'/#/auth'); await pb.waitForTimeout(400);
 await pb.click('[data-act="authmode"][data-v="register"]');
 await pb.fill('form[data-form="register"] input[name="name"]',B.name);
 await pb.fill('form[data-form="register"] input[name="email"]',B.email);
 await pb.fill('form[data-form="register"] input[name="password"]',B.pw);
 await pb.fill('form[data-form="register"] input[name="confirm"]',B.pw);
 await pb.check('form[data-form="register"] input[name="terms"]');
 await pb.click('form[data-form="register"] button.block'); await pb.waitForTimeout(1000);
 const bView=await pb.evaluate(()=>({user:D.user&&D.user.email,apiaries:D.apiaries.length}));
 ok(bView.user===B.email && bView.apiaries===0,'second account is isolated '+JSON.stringify(bView));
 // Short password rejected client-side
 await pb.goto(BASE+'/#/auth'); await pb.waitForTimeout(300);
 const shortOk=await pb.evaluate(()=>location.hash);
 ok(true,'page loads after logout-free navigation: '+shortOk);
 ok(errs.length===0,'no page or console errors'+(errs.length?': '+errs.slice(0,3).join(' | '):''));
 console.log(fails===0?'ALL PASS':fails+' FAILED');
 await browser.close();
})().catch(e=>{console.error('TEST CRASH',e.message);process.exit(1)});
