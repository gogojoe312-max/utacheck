'use strict';
const installed=new WeakSet();
// Keep original date-bearing fixtures intact. Run their intended same-day checks
// at that Tokyo day, then restore the running clock rather than editing names.
async function withBrowserDate(page,time){
 if(!installed.has(page)){await page.clock.install();installed.add(page);}
 const before=await page.evaluate(()=>Date.now()),at=Date.now();
 await page.clock.setSystemTime(new Date(time));
 return async()=>page.clock.setSystemTime(new Date(before+Date.now()-at));
}
module.exports={withBrowserDate};
