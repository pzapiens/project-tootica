const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const workflow = JSON.parse(fs.readFileSync(path.join(__dirname,'tootica-whatsapp-booking.json'),'utf8'));
const source = fs.readFileSync(path.join(__dirname,'conversation.js'),'utf8').replace(/\r\n/g,'\n');
assert.equal(workflow.nodes.find(n=>n.name==='Conversation').parameters.jsCode,source);
for (const [name,c] of Object.entries(workflow.connections)) {
  assert(workflow.nodes.some(n=>n.name===name));
  for (const branch of c.main) for (const link of branch) assert(workflow.nodes.some(n=>n.name===link.node));
}
let db = {}, count = 0;
function send(value, options={}) {
  const message = {id:options.id || 'm'+(++count), from:options.from || '919123456789', ...(options.button ? {interactive:{button_reply:{id:value}}} : {text:{body:value}})};
  const event = {metadata:{phone_number_id: options.phoneId || 'YOUR_META_PHONE_NUMBER_ID'},messages:options.status ? undefined : [message]};
  const input = options.envelope ? {entry:[{changes:[{value:event}]}]} : event;
  return vm.runInNewContext('(function(){'+source+'})()',{$getWorkflowStaticData:()=>db,$input:{all:()=>[{json:input}]},Date,Intl});
}
let r = send('Hi',{envelope:true,id:'first'});
assert.match(r[0].json.payload.text.body,/full name/);
assert.equal(send('Hi',{id:'first'}).length,0);
assert.equal(send('x',{phoneId:'OTHER'}).length,0);
assert.equal(send('',{status:true}).length,0);
assert.match(send('A')[0].json.payload.text.body,/full name/);
r=send('Jane Doe'); assert.equal(r[0].json.payload.interactive.action.buttons.length,3);
r=send('PAIN',{button:true}); assert.match(r[0].json.payload.interactive.body.text,/emergency/);
r=send('invalid'); assert.match(r[0].json.payload.interactive.body.text,/emergency/);
r=send('NO',{button:true}); assert.equal(r[0].json.payload.interactive.type,'list');
assert.equal(send('Hi',{from:'919222222222'})[0].json.payload.type,'text');
r=send('MORE',{button:true}); assert.match(r[0].json.payload.text.body,/prefer/);
r=send('Next Monday at 2 PM'); assert.match(r[0].json.payload.interactive.body.text,/Jane Doe/);
r=send('CHANGE',{button:true}); assert.match(r[0].json.payload.interactive.body.text,/What do you need/);
send('CHECKUP',{button:true});send('NO',{button:true});send('MORE',{button:true});send('Next Monday at 2 PM');
r=send('CONFIRM',{button:true});assert.equal(r[0].json.submit,true);assert.equal(r[0].json.booking.name,'Jane Doe');
assert.equal(JSON.parse(r[0].json.booking.notes).preferredTime,'Next Monday at 2 PM');
assert.equal(r[0].json.booking.phone,'+919123456789');
assert.match(send('CANCEL')[0].json.payload.text.body,/has not been changed/);
assert.match(send('RESCHEDULE')[0].json.payload.text.body,/has not been changed/);
send('START');send('Jane Doe');send('PAIN',{button:true});
r=send('YES',{button:true});assert.equal(r[0].json.submit,true);assert.equal(JSON.parse(r[0].json.booking.notes).emergency,true);
send('START');send('Jane Doe');send('OTHER',{button:true});r=send('NO',{button:true});
const s=db.sessions['YOUR_META_PHONE_NUMBER_ID:919123456789'];
assert(s.options.length>=2);
for(const option of s.options) assert(new Date(option.at).getTime()>Date.now()-1000);
r=send(s.options[0].id,{button:true});assert.match(r[0].json.payload.interactive.body.text,/Confirm/);
s.slot = '2000-01-01T00:00:00.000Z';
r=send('CONFIRM',{button:true});assert.equal(r[0].json.submit,false);assert.equal(r[0].json.payload.interactive.type,'list');
s.updated=0;r=send('Hi');assert.match(r[0].json.payload.text.body,/full name/);
console.log('Passed: workflow links/source, envelopes, status filtering, phone routing, deduplication, input validation, sender isolation, normal booking, change, emergency, more options, commands, slot expiry and session expiry.');
