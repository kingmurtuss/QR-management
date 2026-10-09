import test from 'node:test';
import assert from 'node:assert/strict';
import { copyAndContinue } from '../site/review-handoff.mjs';
test('review is copied before automatically redirecting to Google', async () => {
  const events=[];
  const copied=await copyAndContinue({review:'Review text',url:'https://g.page/r/test/review',clipboard:{async writeText(text){events.push(['copy',text]);}},redirect:url=>events.push(['redirect',url])});
  assert.equal(copied,true); assert.deepEqual(events,[['copy','Review text'],['redirect','https://g.page/r/test/review']]);
});
test('clipboard denial keeps the customer on the page to copy manually', async () => {
  let redirected=false;
  const copied=await copyAndContinue({review:'Review text',url:'https://g.page/r/test/review',clipboard:{async writeText(){throw new Error('denied');}},redirect:()=>{redirected=true;}});
  assert.equal(copied,false); assert.equal(redirected,false);
});
test('sample preview copies text without opening a real business', async () => {
  let copiedText='',redirected=false;
  assert.equal(await copyAndContinue({review:'Sample',url:null,clipboard:{async writeText(text){copiedText=text;}},redirect:()=>{redirected=true;}}),true);
  assert.equal(copiedText,'Sample'); assert.equal(redirected,false);
});
