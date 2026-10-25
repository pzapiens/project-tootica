// Embedded into the workflow by build-workflow.py. No external modules.
const cfg = {
  backendUrl: 'https://YOUR-TOOTICA-BACKEND',
  clinic: 'YOUR CLINIC',
  staffPhone: '919999999999', // Replace with the staffed clinic number, digits only.
  phoneNumberId: 'YOUR_META_PHONE_NUMBER_ID',
  graphVersion: 'v23.0',
  timezone: 'Asia/Kolkata',
  utcOffset: '+05:30', // Keep aligned with timezone; this starter targets India.
};
const db = $getWorkflowStaticData('global');
db.sessions ??= {};
db.seen ??= {};
const now = Date.now();
for (const [k,v] of Object.entries(db.seen)) if (now - v > 86400000) delete db.seen[k];
for (const [k,v] of Object.entries(db.sessions)) if (now - v.updated > 86400000) delete db.sessions[k];
const events = $input.all().flatMap((i, index) => {
  const root = i.json.body ?? i.json;
  const values = root.entry ? root.entry.flatMap(e => (e.changes ?? []).map(c => c.value)) : [root];
  return values.map(value => ({...value, __inputIndex:index}));
});
const out = [];
for (const event of events) {
  if (event.metadata?.phone_number_id !== cfg.phoneNumberId) continue;
  for (const m of event.messages ?? []) {
    if (!m.id || db.seen[m.id]) continue;
    db.seen[m.id] = now;
    const key = cfg.phoneNumberId + ':' + m.from;
    const existed = !!db.sessions[key];
    const s = db.sessions[key] ??= { step: 'name', updated: now };
    s.updated = now;
    const value = (m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id ?? m.text?.body ?? '').trim();
    const cmd = value.toUpperCase();
    let submit = false, reply;
    const text = body => ({type:'text', text:{body}});
    const buttons = (body, choices) => ({type:'interactive', interactive:{type:'button', body:{text:body}, action:{buttons:choices.map(([id,title])=>({type:'reply',reply:{id,title}}))}}});
    const staff = `Please contact our clinic team: https://wa.me/${cfg.staffPhone}`;
    const service = () => buttons('What do you need?', [['CHECKUP','Checkup/Cleaning'],['PAIN','Tooth pain'],['OTHER','Other treatment']]);
    const urgency = () => buttons('Is it an emergency (severe pain, swelling, injury)?', [['YES','Yes'],['NO','No']]);
    const slots = () => {
      const day = new Intl.DateTimeFormat('en-CA', {timeZone:cfg.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
      const base = new Date(day+'T00:00:00'+cfg.utcOffset);
      s.options = [];
      for (const [delta,hour,title] of [[0,17,'Today 5 PM'],[1,10,'Tomorrow 10 AM'],[1,16,'Tomorrow 4 PM']]) {
        const at = new Date(base.getTime() + (delta*24+hour)*3600000);
        if (at.getTime() > now) s.options.push({id:'SLOT_'+at.getTime(),title,at:at.toISOString()});
      }
      s.step = 'slot';
      return {type:'interactive',interactive:{type:'list',body:{text:'Pick a preferred time (subject to clinic confirmation):'},action:{button:'Pick a time',sections:[{title:'Preferred times',rows:[...s.options.map(({id,title})=>({id,title})),{id:'MORE',title:'More options'}]}]}}};
    };
    if (cmd === 'CANCEL' || cmd === 'RESCHEDULE') {
      reply = text(`To ${cmd.toLowerCase()} your appointment, ${staff} Your booking has not been changed yet.`);
    } else if (cmd === 'START' || cmd === 'RESTART') {
      db.sessions[key] = {step:'name',updated:now};
      reply = text('Hi! What\'s your full name?');
    } else if (!existed) {
      reply = text('Hi! What\'s your full name?');
    } else if (s.step === 'name') {
      if (!m.text?.body || value.length < 2 || value.length > 100) reply = text('Please type your full name (2-100 characters).');
      else { s.name = value; s.step = 'service'; reply = service(); }
    } else if (s.step === 'service') {
      const names = {CHECKUP:'Checkup/Cleaning',PAIN:'Tooth pain',OTHER:'Other treatment'};
      if (!names[cmd]) reply = service();
      else { s.service = names[cmd]; s.step = 'urgency'; reply = urgency(); }
    } else if (s.step === 'urgency') {
      if (cmd === 'YES') { s.emergency = true; submit = true; }
      else if (cmd === 'NO') { s.emergency = false; reply = slots(); }
      else reply = urgency();
    } else if (s.step === 'slot') {
      const selected = s.options?.find(o=>o.id === value);
      if (cmd === 'MORE') { s.step = 'more'; reply = text('What date and time would you prefer? Our clinic team will check it.'); }
      else if (!selected || new Date(selected.at).getTime() <= now) reply = slots();
      else { s.slot = selected.at; s.slotLabel = selected.title; s.step = 'confirm'; }
    } else if (s.step === 'more') {
      if (!m.text?.body || !value || value.length > 200) reply = text('Please type your preferred date and time (up to 200 characters).');
      else { s.slot = null; s.slotLabel = value; s.step = 'confirm'; }
    } else if (s.step === 'confirm') {
      if (cmd === 'CHANGE') { s.step = 'service'; reply = service(); }
      else if (cmd === 'CONFIRM') {
        if (s.slot && new Date(s.slot).getTime() <= now) reply = slots();
        else submit = true;
      }
    } else {
      reply = text(`Your request is with our clinic team. ${staff} Reply START for a new request, RESCHEDULE or CANCEL for help.`);
    }
    if (!reply && !submit) reply = buttons(`Booking request for ${s.name}, ${s.service}, ${s.slotLabel} at ${cfg.clinic}. Confirm? (Subject to clinic approval.)`, [['CONFIRM','Confirm'],['CHANGE','Change']]);
    const booking = submit ? {
      phone: '+'+m.from, name:s.name, consultationType:s.service,
      notes:JSON.stringify({source:'n8n',messageId:m.id,emergency:!!s.emergency,preferredStart:s.slot??null,preferredTime:s.slotLabel??'Earliest / human triage',clinic:cfg.clinic}),
    } : null;
    out.push({pairedItem:{item:event.__inputIndex},json:{cfg,key,submit,booking,emergency:!!s.emergency,payload:reply ? {messaging_product:'whatsapp',to:m.from,...reply} : null,to:m.from}});
  }
}
return out;
